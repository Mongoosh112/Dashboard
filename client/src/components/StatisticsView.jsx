import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart3, 
  CheckCircle2, 
  HelpCircle, 
  ThumbsUp, 
  ThumbsDown, 
  ArrowUpDown,
  Clock, 
  Sparkles, 
  BookmarkCheck, 
  ArrowRight, 
  RefreshCw, 
  User, 
  Users, 
  Award, 
  TrendingUp, 
  Star, 
  MessageSquare, 
  FileText, 
  Eye, 
  ChevronRight, 
  ChevronDown, 
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  LayoutDashboard,
  Check,
  Search
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { formatRelativeTime } from '../utils/helpers';

// Helper to determine if an employee's answer matches the question's answer key
function checkIsAnswerCorrect(q, answeredVal) {
  if (!q || q.correctAnswer === undefined || q.correctAnswer === null || q.correctAnswer === '') return false;
  if (answeredVal === undefined || answeredVal === null || answeredVal === '') return false;

  const normKey = String(q.correctAnswer).trim().toLowerCase();
  const normVal = String(answeredVal).trim().toLowerCase();

  // 1. Verdict questions (e.g. Good/Bad, Up/Down, Approve/Reject)
  if (q.type === 'verdict') {
    const opt1 = String(q.options?.[0] || 'Good').trim().toLowerCase();
    const opt2 = String(q.options?.[1] || 'Bad').trim().toLowerCase();
    const isKeyOpt1 = normKey === 'good' || normKey === 'up' || normKey === opt1;
    const isKeyOpt2 = normKey === 'bad' || normKey === 'down' || normKey === opt2;
    const isAnsOpt1 = normVal === 'good' || normVal === 'up' || normVal === opt1;
    const isAnsOpt2 = normVal === 'bad' || normVal === 'down' || normVal === opt2;

    if (isKeyOpt1 && isAnsOpt1) return true;
    if (isKeyOpt2 && isAnsOpt2) return true;
    return normVal === normKey;
  }

  // 2. Boolean / Yes-No questions
  if (q.type === 'boolean' || q.type === 'yes_no') {
    const isKeyYes = normKey === 'yes' || normKey === 'true';
    const isKeyNo = normKey === 'no' || normKey === 'false';
    const isValYes = normVal === 'yes' || answeredVal === true;
    const isValNo = normVal === 'no' || answeredVal === false;

    if (isKeyYes && isValYes) return true;
    if (isKeyNo && isValNo) return true;
    return normVal === normKey;
  }

  // 3. Two Options / Contrast checks / Choice
  if (q.type === 'two_options' || q.type === 'choice') {
    const opt1 = String(q.options?.[0] || '').trim().toLowerCase();
    const opt2 = String(q.options?.[1] || '').trim().toLowerCase();
    if (normKey === opt1 && normVal === opt1) return true;
    if (normKey === opt2 && normVal === opt2) return true;
    return normVal === normKey;
  }

  // 4. Multi-choice array
  if (Array.isArray(answeredVal)) {
    return answeredVal.some(v => String(v).trim().toLowerCase() === normKey);
  }

  // 5. Rating scale (1-5)
  if (q.type === 'rating') {
    return Number(normVal) === Number(normKey);
  }

  return normVal === normKey;
}

export default function StatisticsView({ onNavigateToDashboard, onNavigateToChat }) {
  const { user, token } = useAuth();
  const { socket } = useSocket();

  const [items, setItems] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = user?.isAdmin;

  // Admin filter: 'my' | 'team' (Admins default to 'team' to view team-wide response history and analytics)
  const [adminScope, setAdminScope] = useState(() => (user?.isAdmin ? 'team' : 'my'));
  // Selected employee ID for drill-down (defaults to 'all' in team view)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(user?.isAdmin ? null : user?.id);
  // Search query in answer history
  const [historySearch, setHistorySearch] = useState('');
  // Expanded item history cards
  const [expandedItemId, setExpandedItemId] = useState(null);
  // Image lightbox preview
  const [previewImage, setPreviewImage] = useState(null);
  // Ref for smooth scroll to top on inspection
  const scrollRef = useRef(null);

  // Custom dropdown state for Inspect User
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const userDropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setIsUserDropdownOpen(false);
      }
    };
    if (isUserDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserDropdownOpen]);

  // Fetch all dashboard review items (including archived items to preserve all historical stats and response audits)
  const fetchItems = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/dashboard/items?includeArchived=true', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch items for statistics:', err);
    }
  };

  // Fetch important instructions (including archived directives)
  const fetchInstructions = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/dashboard/instructions?includeArchived=true', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInstructions(data.instructions || []);
      }
    } catch (err) {
      console.error('Failed to fetch instructions for statistics:', err);
    }
  };

  // Fetch employees list (if admin)
  const fetchEmployees = async () => {
    if (!token || !isAdmin) return;
    try {
      const res = await fetch('/api/admin/employees', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees || []);
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchItems(),
      fetchInstructions(),
      isAdmin ? fetchEmployees() : Promise.resolve()
    ]);
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchItems(),
      fetchInstructions(),
      isAdmin ? fetchEmployees() : Promise.resolve()
    ]);
    setTimeout(() => setRefreshing(false), 400);
  };

  useEffect(() => {
    loadAllData();
  }, [token, isAdmin]);

  // Real-time socket updates
  useEffect(() => {
    if (!socket) return;

    const handleItemUpdated = (updatedItem) => {
      setItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
    };

    const handleItemAdded = (newItem) => {
      if (!isAdmin && Array.isArray(newItem.targetUserIds) && newItem.targetUserIds.length > 0 && !newItem.targetUserIds.includes(user?.id)) {
        return;
      }
      setItems(prev => [newItem, ...prev.filter(item => item.id !== newItem.id)]);
    };

    const handleItemDeleted = ({ itemId }) => {
      setItems(prev => prev.filter(item => item.id !== itemId));
    };

    const handleInstructionAdded = (newInst) => {
      if (!isAdmin && Array.isArray(newInst.targetUserIds) && newInst.targetUserIds.length > 0 && !newInst.targetUserIds.includes(user?.id)) {
        return;
      }
      setInstructions(prev => [newInst, ...prev.filter(i => i.id !== newInst.id)]);
    };

    const handleInstructionUpdated = (updatedInst) => {
      setInstructions(prev => prev.map(inst => inst.id === updatedInst.id ? updatedInst : inst));
    };

    const handleInstructionDeleted = ({ instructionId }) => {
      setInstructions(prev => prev.filter(inst => inst.id !== instructionId));
    };

    const handleMonthEndReset = () => {
      fetchItems();
      fetchInstructions();
    };

    socket.on('review_vote_updated', handleItemUpdated);
    socket.on('new_review_item', handleItemAdded);
    socket.on('review_item_deleted', handleItemDeleted);
    socket.on('new_instruction', handleInstructionAdded);
    socket.on('instruction_updated', handleInstructionUpdated);
    socket.on('instruction_deleted', handleInstructionDeleted);
    socket.on('month_end_reset', handleMonthEndReset);

    return () => {
      socket.off('review_vote_updated', handleItemUpdated);
      socket.off('new_review_item', handleItemAdded);
      socket.off('review_item_deleted', handleItemDeleted);
      socket.off('new_instruction', handleInstructionAdded);
      socket.off('instruction_updated', handleInstructionUpdated);
      socket.off('instruction_deleted', handleInstructionDeleted);
      socket.off('month_end_reset', handleMonthEndReset);
    };
  }, [socket, isAdmin, user?.id]);

  // Determine current active target user for statistics
  const targetUserId = useMemo(() => {
    if (!isAdmin) {
      return user?.id;
    }
    // For admin, use selectedEmployeeId if specified, otherwise default to current admin
    return selectedEmployeeId || user?.id;
  }, [isAdmin, user?.id, selectedEmployeeId]);

  const targetUserInfo = useMemo(() => {
    if (targetUserId === user?.id) return user;
    const foundEmp = employees.find(e => e.id === targetUserId);
    if (foundEmp) return foundEmp;

    // Fallback: search within items votes for saved user details
    for (const item of items) {
      const v = item.votes?.[targetUserId];
      if (v && v.userName) {
        return {
          id: targetUserId,
          displayName: v.userName,
          username: v.userName.toLowerCase().replace(/\s+/g, ''),
          avatar: v.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          role: 'Reviewer'
        };
      }
    }

    return {
      displayName: 'Employee',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      role: 'Reviewer'
    };
  }, [targetUserId, user, employees, items]);

  // Calculate individual user statistics
  const userStats = useMemo(() => {
    if (!targetUserId) {
      return {
        totalEvaluated: 0,
        totalItemsCount: 0,
        pendingEvaluations: 0,
        completionRate: 0,
        goodVotes: 0,
        badVotes: 0,
        goodPercentage: 0,
        badPercentage: 0,
        totalQuestionsAnswered: 0,
        totalQuestionsAvailable: 0,
        questionTypesCount: { verdict: 0, two_options: 0, choice: 0, rating: 0, text: 0, yes_no: 0 },
        averageRating: 0,
        commentsCount: 0,
        quizAnsweredCount: 0,
        quizCorrectCount: 0,
        quizWrongCount: 0,
        quizAccuracyPercentage: null,
        verdictQuizAnsweredCount: 0,
        verdictQuizCorrectCount: 0,
        verdictQuizWrongCount: 0,
        verdictAccuracyPercentage: null,
        acknowledgedInstructions: 0,
        totalInstructionsCount: 0,
        instructionRate: 0,
        evaluatedItemsList: []
      };
    }

    let goodVotes = 0;
    let badVotes = 0;
    let totalQuestionsAnswered = 0;
    let totalQuestionsAvailable = 0;
    let commentsCount = 0;
    let ratingsSum = 0;
    let ratingsCount = 0;
    let quizAnsweredCount = 0;
    let quizCorrectCount = 0;
    let quizWrongCount = 0;
    let verdictQuizAnsweredCount = 0;
    let verdictQuizCorrectCount = 0;
    let verdictQuizWrongCount = 0;

    const questionTypesCount = {
      verdict: 0,
      two_options: 0,
      choice: 0,
      rating: 0,
      text: 0,
      yes_no: 0
    };

    const evaluatedItemsList = [];

    items.forEach(item => {
      const itemQuestions = item.questions || [];
      const hasVerdict = !itemQuestions.length || itemQuestions.some(q => q.type === 'verdict');
      totalQuestionsAvailable += itemQuestions.length || 1;

      const userVote = item.votes?.[targetUserId];
      if (userVote) {
        const userAnswers = userVote.answers || {};
        let itemAnsweredCount = 0;
        const answersDetail = [];

        // ONLY count goodVotes / badVotes if this item has an Up/Down verdict format
        if (hasVerdict) {
          const verdictQ = itemQuestions.find(q => q.type === 'verdict');
          const v = (userVote.vote || (verdictQ && userAnswers[verdictQ.id]) || userAnswers['q_verdict'] || '').toLowerCase();
          if (v === 'good' || v === 'up') goodVotes++;
          else if (v === 'bad' || v === 'down') badVotes++;

          if (!itemQuestions.length && userVote.vote) {
            questionTypesCount.verdict++;
            totalQuestionsAnswered++;
            itemAnsweredCount++;
            answersDetail.push({
              questionId: 'q_verdict',
              questionText: 'Verdict: Good or Bad?',
              type: 'verdict',
              options: ['Good', 'Bad'],
              value: userVote.vote === 'good' ? 'Good' : 'Bad',
              hasKey: false,
              correctAnswer: null,
              isCorrect: false
            });
          }
        }

        itemQuestions.forEach(q => {
          let answeredVal = userAnswers[q.id];
          if (answeredVal === undefined && q.type === 'verdict') {
            answeredVal = userAnswers['q_verdict'] || userVote.vote;
          }

          if (answeredVal !== undefined && answeredVal !== null && answeredVal !== '') {
            totalQuestionsAnswered++;
            itemAnsweredCount++;

            if (questionTypesCount[q.type] !== undefined) {
              questionTypesCount[q.type]++;
            } else if (q.type === 'boolean') {
              questionTypesCount.two_options++;
            } else if (q.type === 'multi_choice') {
              questionTypesCount.choice++;
            } else if (q.type === 'type_answer') {
              questionTypesCount.text++;
            }

            if (q.type === 'rating') {
              const r = Number(answeredVal);
              if (!isNaN(r) && r > 0) {
                ratingsSum += r;
                ratingsCount++;
              }
            }

            if (q.type === 'text' || q.type === 'type_answer' || q.id === 'q_feedback') {
              commentsCount++;
            }

            const hasKey = !!q.correctAnswer;
            const isCorrect = checkIsAnswerCorrect(q, answeredVal);
            if (hasKey) {
              quizAnsweredCount++;
              if (isCorrect) {
                quizCorrectCount++;
              } else {
                quizWrongCount++;
              }

              // Up or Down (verdict) specific quiz accuracy
              const isVerdictQuestion = q.type === 'verdict' || 
                (Array.isArray(q.options) && q.options.some(o => /^(up|down)$/i.test(String(o).trim())));
              if (isVerdictQuestion) {
                verdictQuizAnsweredCount++;
                if (isCorrect) {
                  verdictQuizCorrectCount++;
                } else {
                  verdictQuizWrongCount++;
                }
              }
            }

            answersDetail.push({
              questionId: q.id,
              questionText: q.text,
              type: q.type,
              options: q.options,
              value: answeredVal,
              hasKey,
              correctAnswer: q.correctAnswer,
              isCorrect
            });
          }
        });

        if (userVote.comment && !answersDetail.some(a => a.questionId === 'q_feedback' || a.type === 'text' || a.type === 'type_answer')) {
          commentsCount++;
          answersDetail.push({
            questionId: 'q_feedback',
            questionText: 'Written Feedback / Comment',
            type: 'type_answer',
            options: [],
            value: userVote.comment,
            hasKey: false,
            correctAnswer: null,
            isCorrect: false
          });
        }

        evaluatedItemsList.push({
          item,
          vote: hasVerdict ? userVote.vote : null,
          timestamp: userVote.timestamp,
          comment: userVote.comment,
          answeredCount: itemAnsweredCount,
          totalQuestions: Math.max(itemQuestions.length || 1, answersDetail.length),
          answersDetail,
          reviewer: targetUserInfo,
          reviewerId: targetUserId
        });
      }
    });

    // Sort evaluated items by newest first
    evaluatedItemsList.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    // Filter items applicable to this target employee (exclude archived items unless employee evaluated them)
    const applicableItems = items.filter(item => {
      const userVote = item.votes?.[targetUserId];
      if (userVote) return true;
      if (item.isArchived) return false;
      if (Array.isArray(item.targetUserIds) && item.targetUserIds.length > 0) {
        return item.targetUserIds.includes(targetUserId);
      }
      return true;
    });

    // Filter directives applicable to this target employee (exclude archived directives unless acknowledged)
    const applicableInstructions = instructions.filter(inst => {
      const isAck = (inst.acknowledgedBy || []).includes(targetUserId);
      if (isAck) return true;
      if (inst.isArchived) return false;
      if (Array.isArray(inst.targetUserIds) && inst.targetUserIds.length > 0) {
        return inst.targetUserIds.includes(targetUserId);
      }
      return true;
    });

    const totalEvaluated = evaluatedItemsList.length;
    const totalItemsCount = applicableItems.length;
    const pendingEvaluations = Math.max(0, totalItemsCount - totalEvaluated);
    const completionRate = totalItemsCount > 0 ? Math.round((totalEvaluated / totalItemsCount) * 100) : 0;

    const totalVotes = goodVotes + badVotes;
    const goodPercentage = totalVotes > 0 ? Math.round((goodVotes / totalVotes) * 100) : 0;
    const badPercentage = totalVotes > 0 ? (100 - goodPercentage) : 0;
    const averageRating = ratingsCount > 0 ? (ratingsSum / ratingsCount).toFixed(1) : '—';
    const quizAccuracyPercentage = quizAnsweredCount > 0 ? Math.round((quizCorrectCount / quizAnsweredCount) * 100) : null;
    const verdictAccuracyPercentage = verdictQuizAnsweredCount > 0 ? Math.round((verdictQuizCorrectCount / verdictQuizAnsweredCount) * 100) : null;

    // Acknowledged directives
    const acknowledgedInstructions = applicableInstructions.filter(i => (i.acknowledgedBy || []).includes(targetUserId)).length;
    const totalInstructionsCount = applicableInstructions.length;
    const instructionRate = totalInstructionsCount > 0 ? Math.round((acknowledgedInstructions / totalInstructionsCount) * 100) : 0;

    return {
      totalEvaluated,
      totalItemsCount,
      pendingEvaluations,
      completionRate,
      goodVotes,
      badVotes,
      goodPercentage,
      badPercentage,
      totalQuestionsAnswered,
      totalQuestionsAvailable,
      questionTypesCount,
      averageRating,
      commentsCount,
      quizAnsweredCount,
      quizCorrectCount,
      quizWrongCount,
      quizAccuracyPercentage,
      verdictQuizAnsweredCount,
      verdictQuizCorrectCount,
      verdictQuizWrongCount,
      verdictAccuracyPercentage,
      acknowledgedInstructions,
      totalInstructionsCount,
      instructionRate,
      evaluatedItemsList
    };
  }, [items, instructions, targetUserId]);

  // Team aggregate statistics (when Admin selects 'team' scope)
  const teamStats = useMemo(() => {
    if (!isAdmin) return null;

    let totalTeamVotes = 0;
    let totalTeamGood = 0;
    let totalTeamBad = 0;
    let totalTeamQuestionsAnswered = 0;

    items.forEach(item => {
      totalTeamVotes += (item.totalVotes || 0);
      totalTeamGood += (item.goodCount || 0);
      totalTeamBad += (item.badCount || 0);

      (item.questionStats || []).forEach(qs => {
        totalTeamQuestionsAnswered += (qs.total || 0);
      });
    });

    // Leaderboard across employees
    const leaderboard = employees.map(emp => {
      let empGood = 0;
      let empBad = 0;
      let empQuestionsAnswered = 0;
      let empEvaluatedItems = 0;

      items.forEach(item => {
        const v = item.votes?.[emp.id];
        if (v) {
          empEvaluatedItems++;
          const itemQuestions = item.questions || [];
          const hasVerdict = !itemQuestions.length || itemQuestions.some(q => q.type === 'verdict');
          if (hasVerdict) {
            const verdictQ = itemQuestions.find(q => q.type === 'verdict');
            const vVal = (v.vote || (verdictQ && v.answers?.[verdictQ.id]) || v.answers?.['q_verdict'] || '').toLowerCase();
            if (vVal === 'good' || vVal === 'up') empGood++;
            else if (vVal === 'bad' || vVal === 'down') empBad++;
          }

          const ans = v.answers || {};
          const ansKeys = Object.keys(ans).filter(k => ans[k] !== undefined && ans[k] !== '' && k !== 'q_verdict');
          empQuestionsAnswered += ansKeys.length;
          if (hasVerdict && !itemQuestions.length && v.vote) {
            empQuestionsAnswered += 1;
          }
        }
      });

      // Filter items applicable to this employee
      const empApplicableItems = items.filter(item => {
        const hasVoted = Boolean(item.votes?.[emp.id]);
        if (hasVoted) return true;
        if (item.isArchived) return false;
        if (Array.isArray(item.targetUserIds) && item.targetUserIds.length > 0) {
          return item.targetUserIds.includes(emp.id);
        }
        return true;
      });

      const empApplicableInsts = instructions.filter(inst => {
        const hasAck = (inst.acknowledgedBy || []).includes(emp.id);
        if (hasAck) return true;
        if (inst.isArchived) return false;
        if (Array.isArray(inst.targetUserIds) && inst.targetUserIds.length > 0) {
          return inst.targetUserIds.includes(emp.id);
        }
        return true;
      });

      const empTotalItemsCount = empApplicableItems.length;
      const empTotalInstsCount = empApplicableInsts.length;
      const empAckCount = empApplicableInsts.filter(i => (i.acknowledgedBy || []).includes(emp.id)).length;
      const empTotalVotes = empGood + empBad;
      const empGoodPct = empTotalVotes > 0 ? Math.round((empGood / empTotalVotes) * 100) : 0;
      const completionRate = empTotalItemsCount > 0 ? Math.round((empEvaluatedItems / empTotalItemsCount) * 100) : 0;

      return {
        ...emp,
        evaluatedCount: empEvaluatedItems,
        totalItemsCount: empTotalItemsCount,
        questionsAnswered: empQuestionsAnswered,
        goodCount: empGood,
        badCount: empBad,
        goodPercentage: empGoodPct,
        completionRate,
        acknowledgedCount: empAckCount,
        totalInstructionsCount: empTotalInstsCount
      };
    });

    // Sort by evaluated items descending, then questions answered
    leaderboard.sort((a, b) => b.evaluatedCount - a.evaluatedCount || b.questionsAnswered - a.questionsAnswered);

    // Collect all team evaluations for team response history
    const allTeamEvaluations = [];
    items.forEach(item => {
      const votes = item.votes || {};
      Object.entries(votes).forEach(([vUserId, vData]) => {
        const itemQuestions = item.questions || [];
        const userAnswers = vData.answers || {};
        let itemAnsweredCount = 0;
        const answersDetail = [];

        itemQuestions.forEach(q => {
          let answeredVal = userAnswers[q.id];
          if (answeredVal === undefined && q.type === 'verdict') {
            answeredVal = userAnswers['q_verdict'] || vData.vote;
          }
          if (answeredVal !== undefined && answeredVal !== null && answeredVal !== '') {
            itemAnsweredCount++;
            const hasKey = !!q.correctAnswer;
            const isCorrect = checkIsAnswerCorrect(q, answeredVal);
            answersDetail.push({
              questionId: q.id,
              questionText: q.text,
              type: q.type,
              options: q.options,
              value: answeredVal,
              hasKey,
              correctAnswer: q.correctAnswer,
              isCorrect
            });
          }
        });

        if (vData.comment && !answersDetail.some(a => a.questionId === 'q_feedback' || a.type === 'text' || a.type === 'type_answer')) {
          answersDetail.push({
            questionId: 'q_feedback',
            questionText: 'Written Feedback / Comment',
            type: 'type_answer',
            options: [],
            value: vData.comment,
            hasKey: false,
            correctAnswer: null,
            isCorrect: false
          });
        }

        const reviewer = employees.find(e => e.id === vUserId) || {
          displayName: vData.userName || 'Employee',
          username: vData.userName ? vData.userName.toLowerCase().replace(/\s+/g, '') : 'reviewer',
          avatar: vData.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
        };

        allTeamEvaluations.push({
          item,
          vote: vData.vote,
          timestamp: vData.timestamp,
          comment: vData.comment,
          answeredCount: itemAnsweredCount,
          totalQuestions: Math.max(itemQuestions.length, answersDetail.length),
          answersDetail,
          reviewer,
          reviewerId: vUserId
        });
      });
    });
    allTeamEvaluations.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    return {
      totalTeamVotes,
      totalTeamGood,
      totalTeamBad,
      totalTeamQuestionsAnswered,
      leaderboard,
      allTeamEvaluations
    };
  }, [isAdmin, items, instructions, employees]);

  // Determine which response history to show (team-wide in team view, individual otherwise)
  const historyList = useMemo(() => {
    if (isAdmin && adminScope === 'team' && teamStats) {
      return teamStats.allTeamEvaluations || [];
    }
    return userStats.evaluatedItemsList || [];
  }, [isAdmin, adminScope, teamStats, userStats.evaluatedItemsList]);

  // Filtered item history
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return historyList;
    const q = historySearch.toLowerCase();
    return historyList.filter(entry => {
      const matchTitle = (entry.item?.title || '').toLowerCase().includes(q);
      const matchDesc = (entry.item?.description || '').toLowerCase().includes(q);
      const matchComment = (entry.comment || '').toLowerCase().includes(q);
      const matchReviewer = (entry.reviewer?.displayName || '').toLowerCase().includes(q);
      const matchAnswers = (entry.answersDetail || []).some(a => 
        String(a.questionText || '').toLowerCase().includes(q) ||
        String(a.value || '').toLowerCase().includes(q)
      );
      return matchTitle || matchDesc || matchComment || matchReviewer || matchAnswers;
    });
  }, [historyList, historySearch]);

  if (loading) {
    return (
      <div 
        className="review-dashboard-wrapper" 
        style={{ 
          flex: 1, 
          height: '100%', 
          minHeight: '60vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center' 
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div className="circular-loader-ring lg" style={{ margin: '0 auto 16px auto' }} />
          <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: 0, fontWeight: 600 }}>Loading...</h3>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={scrollRef}
      className="review-dashboard-wrapper" 
      style={{ 
        flex: 1, 
        height: '100%', 
        minHeight: 0, 
        overflowY: 'auto', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 24 
      }}
    >
      {/* Top Banner & Context Header */}
      <div style={{
        background: 'radial-gradient(circle at 85% 20%, rgba(99, 102, 241, 0.18) 0%, rgba(139, 92, 246, 0.1) 40%, rgba(15, 23, 42, 0.75) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 20,
        padding: '24px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 18,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
        position: 'relative',
        flexShrink: 0,
        minHeight: 'fit-content'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(99, 102, 241, 0.45)',
            flexShrink: 0
          }}>
            <BarChart3 size={28} color="#fff" />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>
                Review Statistics & Analytics
              </h1>
              <span style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 99,
                background: 'rgba(99, 102, 241, 0.25)',
                color: '#c7d2fe',
                border: '1px solid rgba(99, 102, 241, 0.45)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}>
                <Sparkles size={12} /> Live Metrics
              </span>
            </div>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Personal questions answered, accuracy breakdown, and overall evaluation progress
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleRefresh}
            className="tab-btn"
            disabled={refreshing}
            style={{
              padding: '9px 16px',
              fontSize: '0.82rem',
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7
            }}
            title="Refresh statistics"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToDashboard}
            className="auth-submit-btn"
            style={{
              width: 'auto',
              padding: '9px 18px',
              fontSize: '0.82rem',
              margin: 0,
              borderRadius: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7
            }}
          >
            <LayoutDashboard size={15} />
            <span>Go to Dashboard</span>
          </button>
        </div>
      </div>

      {/* Admin Scope Switcher (My Stats vs Team Leaderboard) */}
      {isAdmin && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
          background: 'rgba(14, 20, 36, 0.75)',
          padding: '12px 18px',
          borderRadius: 14,
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Admin View Mode:
            </span>
            <button
              type="button"
              className={`instruction-filter-btn ${adminScope === 'my' ? 'active' : ''}`}
              onClick={() => {
                setAdminScope('my');
                setSelectedEmployeeId(user?.id);
                if (scrollRef.current) {
                  scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              style={{
                background: adminScope === 'my' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                borderColor: adminScope === 'my' ? 'rgba(99, 102, 241, 0.55)' : 'rgba(255, 255, 255, 0.08)',
                color: adminScope === 'my' ? '#ffffff' : 'var(--text-muted)'
              }}
            >
              <User size={15} /> {targetUserId !== user?.id && adminScope === 'my' ? 'Individual Activity' : 'My Activity'}
            </button>

            <button
              type="button"
              className={`instruction-filter-btn ${adminScope === 'team' ? 'active' : ''}`}
              onClick={() => setAdminScope('team')}
              style={{
                background: adminScope === 'team' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                borderColor: adminScope === 'team' ? 'rgba(245, 158, 11, 0.55)' : 'rgba(255, 255, 255, 0.08)',
                color: adminScope === 'team' ? '#fbbf24' : 'var(--text-muted)'
              }}
            >
              <Users size={15} /> Team Overview & Leaderboard
            </button>
          </div>

          {/* Drill-down Employee Selector */}
          {employees.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }} ref={userDropdownRef}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Inspect User:</span>
              
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setIsUserDropdownOpen(prev => !prev)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    background: selectedEmployeeId && selectedEmployeeId !== user?.id ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${selectedEmployeeId && selectedEmployeeId !== user?.id ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                    borderRadius: 8,
                    padding: '6px 12px',
                    height: 36,
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    minWidth: 200,
                    maxWidth: 280,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden' }}>
                    {selectedEmployeeId && selectedEmployeeId !== user?.id ? (
                      (() => {
                        const curEmp = employees.find(e => e.id === selectedEmployeeId);
                        return (
                          <>
                            {curEmp?.avatar ? (
                              <img src={curEmp.avatar} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <span style={{ fontSize: '0.88rem', flexShrink: 0 }}>👤</span>
                            )}
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {curEmp?.displayName || curEmp?.username || 'User'}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                              (@{curEmp?.username})
                            </span>
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <span style={{ fontSize: '0.88rem', flexShrink: 0 }}>⭐</span>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Me (Admin: {user?.displayName || user?.username})
                        </span>
                      </>
                    )}
                  </div>
                  <ChevronDown
                    size={14}
                    style={{
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      transition: 'transform 0.2s ease',
                      transform: isUserDropdownOpen ? 'rotate(180deg)' : 'none'
                    }}
                  />
                </button>

                {/* Custom Dark Popover Menu */}
                {isUserDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      width: 290,
                      maxHeight: 320,
                      background: '#0d1322',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      borderRadius: 10,
                      boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(99, 102, 241, 0.2)',
                      zIndex: 100,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Search if more than 4 employees */}
                    {employees.length > 4 && (
                      <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <div style={{ position: 'relative' }}>
                          <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                          <input
                            type="text"
                            placeholder="Filter user..."
                            value={userSearchQuery}
                            onChange={(e) => setUserSearchQuery(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '5px 8px 5px 26px',
                              fontSize: '0.78rem',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: 6,
                              color: '#ffffff',
                              outline: 'none'
                            }}
                            autoFocus
                          />
                        </div>
                      </div>
                    )}

                    <div style={{ overflowY: 'auto', padding: '5px' }}>
                      {/* Admin Self Option */}
                      {(!userSearchQuery || 'me admin'.includes(userSearchQuery.toLowerCase()) || (user?.displayName || '').toLowerCase().includes(userSearchQuery.toLowerCase()) || (user?.username || '').toLowerCase().includes(userSearchQuery.toLowerCase())) && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedEmployeeId(user?.id);
                            setAdminScope('my');
                            setIsUserDropdownOpen(false);
                            setUserSearchQuery('');
                            if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: (!selectedEmployeeId || selectedEmployeeId === user?.id) ? 'rgba(99, 102, 241, 0.22)' : 'transparent',
                            color: (!selectedEmployeeId || selectedEmployeeId === user?.id) ? '#ffffff' : 'var(--text-muted)',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (selectedEmployeeId && selectedEmployeeId !== user?.id) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          }}
                          onMouseLeave={(e) => {
                            if (selectedEmployeeId && selectedEmployeeId !== user?.id) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.9rem' }}>⭐</span>
                            <div>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc' }}>
                                Me (Admin)
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                @{user?.username}
                              </div>
                            </div>
                          </div>
                          {(!selectedEmployeeId || selectedEmployeeId === user?.id) && (
                            <Check size={14} style={{ color: 'var(--accent-cyan)' }} />
                          )}
                        </div>
                      )}

                      {/* Employees List */}
                      {employees
                        .filter(emp => {
                          if (!userSearchQuery) return true;
                          const q = userSearchQuery.toLowerCase();
                          return (emp.displayName || '').toLowerCase().includes(q) || (emp.username || '').toLowerCase().includes(q);
                        })
                        .map(emp => {
                          const isSelected = selectedEmployeeId === emp.id;
                          return (
                            <div
                              key={emp.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setSelectedEmployeeId(emp.id);
                                setAdminScope('my');
                                setIsUserDropdownOpen(false);
                                setUserSearchQuery('');
                                if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 10px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                background: isSelected ? 'rgba(99, 102, 241, 0.22)' : 'transparent',
                                color: isSelected ? '#ffffff' : 'var(--text-muted)',
                                transition: 'background 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                {emp.avatar ? (
                                  <img src={emp.avatar} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                ) : (
                                  <div style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: '50%',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.72rem',
                                    flexShrink: 0
                                  }}>
                                    👤
                                  </div>
                                )}
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {emp.displayName || emp.username}
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                    @{emp.username}
                                  </div>
                                </div>
                              </div>
                              {isSelected && (
                                <Check size={14} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Target User Banner (if inspecting an employee) */}
      {isAdmin && adminScope === 'my' && targetUserId !== user?.id && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.35)',
          borderRadius: 14,
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src={targetUserInfo?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
              alt={targetUserInfo?.displayName}
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #60a5fa' }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.94rem', fontWeight: 700, color: '#ffffff' }}>
                  {targetUserInfo?.displayName}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.15)', padding: '2px 7px', borderRadius: 4, fontWeight: 600 }}>
                  @{targetUserInfo?.username}
                </span>
              </div>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Role: {targetUserInfo?.role || 'Employee'} • Viewing individual survey & evaluation statistics
              </span>
            </div>
          </div>

          <button
            type="button"
            className="tab-btn"
            onClick={() => {
              setSelectedEmployeeId(user?.id);
              if (scrollRef.current) {
                scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            style={{ fontSize: '0.78rem', padding: '6px 14px', borderRadius: 8, background: 'rgba(255, 255, 255, 0.08)' }}
          >
            Reset to My Stats
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 1: KEY STAT METRIC CARDS                        */}
      {/* ======================================================== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 14,
        flexShrink: 0
      }}>
        {/* Total Questions Answered Card */}
        <div style={{
          background: 'rgba(18, 24, 42, 0.8)',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          borderRadius: 16,
          padding: '16px 18px',
          boxShadow: '0 4px 20px rgba(99, 102, 241, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 124
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)'
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c7d2fe', textTransform: 'uppercase', letterSpacing: 0.35, lineHeight: 1.2 }}>
              Questions Answered
            </span>
            <div style={{
              width: 30,
              height: 30,
              minWidth: 30,
              borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a5b4fc',
              flexShrink: 0
            }}>
              <HelpCircle size={16} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>
              {userStats.totalQuestionsAnswered}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 5 }}>
              Across {userStats.totalEvaluated} evaluated {userStats.totalEvaluated === 1 ? 'item' : 'items'}
            </div>
          </div>
        </div>

        {/* Right vs Wrong Quiz Accuracy Card */}
        <div style={{
          background: 'rgba(18, 24, 42, 0.8)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: 16,
          padding: '16px 18px',
          boxShadow: '0 4px 20px rgba(16, 185, 129, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 124
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'linear-gradient(90deg, #10b981 0%, #06b6d4 100%)'
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: 0.35, lineHeight: 1.2 }}>
              Accuracy
            </span>
            <div style={{
              width: 30,
              height: 30,
              minWidth: 30,
              borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#34d399',
              flexShrink: 0
            }}>
              <CheckCircle2 size={16} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#34d399', lineHeight: 1.1 }}>
              {userStats.quizAccuracyPercentage !== null ? `${userStats.quizAccuracyPercentage}%` : '—'}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 5 }}>
              {userStats.quizAnsweredCount > 0 
                ? `${userStats.quizCorrectCount} Right • ${userStats.quizWrongCount} Wrong` 
                : 'No scored quiz questions yet'}
            </div>
          </div>
        </div>

        {/* Up/Down Specific Quiz Accuracy Card */}
        <div style={{
          background: 'rgba(18, 24, 42, 0.8)',
          border: '1px solid rgba(168, 85, 247, 0.35)',
          borderRadius: 16,
          padding: '16px 18px',
          boxShadow: '0 4px 20px rgba(168, 85, 247, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 124
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'linear-gradient(90deg, #8b5cf6 0%, #d946ef 100%)'
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#d8b4fe', textTransform: 'uppercase', letterSpacing: 0.35, lineHeight: 1.2 }}>
              Up/Down Accuracy
            </span>
            <div style={{
              width: 30,
              height: 30,
              minWidth: 30,
              borderRadius: 8,
              background: 'rgba(168, 85, 247, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c084fc',
              flexShrink: 0
            }}>
              <ArrowUpDown size={16} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#c084fc', lineHeight: 1.1 }}>
              {userStats.verdictAccuracyPercentage !== null ? `${userStats.verdictAccuracyPercentage}%` : '—'}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 5 }}>
              {userStats.verdictQuizAnsweredCount > 0 
                ? `${userStats.verdictQuizCorrectCount} Right • ${userStats.verdictQuizWrongCount} Wrong` 
                : 'No scored Up/Down questions yet'}
            </div>
          </div>
        </div>

        {/* Total Evaluated Items Card */}
        <div style={{
          background: 'rgba(18, 24, 42, 0.8)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: 16,
          padding: '16px 18px',
          boxShadow: '0 4px 20px rgba(245, 158, 11, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 124
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)'
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fde68a', textTransform: 'uppercase', letterSpacing: 0.35, lineHeight: 1.2 }}>
              Evaluations Completed
            </span>
            <div style={{
              width: 30,
              height: 30,
              minWidth: 30,
              borderRadius: 8,
              background: 'rgba(245, 158, 11, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fbbf24',
              flexShrink: 0
            }}>
              <CheckCircle2 size={16} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>
              {userStats.totalEvaluated} <span style={{ fontSize: '0.95rem', color: 'var(--text-dim)', fontWeight: 600 }}>/ {userStats.totalItemsCount}</span>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 5 }}>
              {userStats.completionRate}% completion rate ({userStats.pendingEvaluations} pending)
            </div>
          </div>
        </div>

        {/* Directives Acknowledged Card */}
        <div style={{
          background: 'rgba(18, 24, 42, 0.8)',
          border: '1px solid rgba(6, 182, 212, 0.35)',
          borderRadius: 16,
          padding: '16px 18px',
          boxShadow: '0 4px 20px rgba(6, 182, 212, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 124
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'linear-gradient(90deg, #06b6d4 0%, #38bdf8 100%)'
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a5f3fc', textTransform: 'uppercase', letterSpacing: 0.35, lineHeight: 1.2 }}>
              Directives Read
            </span>
            <div style={{
              width: 30,
              height: 30,
              minWidth: 30,
              borderRadius: 8,
              background: 'rgba(6, 182, 212, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22d3ee',
              flexShrink: 0
            }}>
              <BookmarkCheck size={16} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>
              {userStats.acknowledgedInstructions} <span style={{ fontSize: '0.95rem', color: 'var(--text-dim)', fontWeight: 600 }}>/ {userStats.totalInstructionsCount}</span>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 5 }}>
              {userStats.instructionRate}% company directives acknowledged
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECTION 2: VERDICT RATIO COMPARISON & QUESTION TYPES     */}
      {/* ======================================================== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 20,
        flexShrink: 0
      }}>
        {/* Questions Answered by Question Type */}
        <div style={{
          background: 'rgba(15, 20, 36, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 18,
          padding: '22px 24px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)'
        }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', margin: 0, marginBottom: 16 }}>
            Question Responses by Format
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Up and Down */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1rem' }}>👍</span>
                <div>
                  <span style={{ fontSize: '0.84rem', color: '#e2e8f0', fontWeight: 600 }}>Up and Down</span>
                  {(userStats.goodVotes > 0 || userStats.badVotes > 0) && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginLeft: 8 }}>
                      (▲ {userStats.goodVotes} Up • ▼ {userStats.badVotes} Down)
                    </span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#34d399' }}>
                {userStats.questionTypesCount.verdict || (userStats.goodVotes + userStats.badVotes) || 0}
              </span>
            </div>

            {/* Yes / No Quiz Questions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1rem' }}>❓</span>
                <span style={{ fontSize: '0.84rem', color: '#e2e8f0', fontWeight: 600 }}>Yes / No Quiz Questions</span>
              </div>
              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#a78bfa' }}>
                {userStats.questionTypesCount.yes_no || 0}
              </span>
            </div>

            {/* Two Options / Boolean */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1rem' }}>🔀</span>
                <span style={{ fontSize: '0.84rem', color: '#e2e8f0', fontWeight: 600 }}>Two-Options / Contrast Checks</span>
              </div>
              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#38bdf8' }}>
                {userStats.questionTypesCount.two_options}
              </span>
            </div>

            {/* Multiple Choice */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1rem' }}>📋</span>
                <span style={{ fontSize: '0.84rem', color: '#e2e8f0', fontWeight: 600 }}>Multiple Choice Selections</span>
              </div>
              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#c084fc' }}>
                {userStats.questionTypesCount.choice}
              </span>
            </div>

            {/* Star & Numerical Rating */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1rem' }}>⭐</span>
                <span style={{ fontSize: '0.84rem', color: '#e2e8f0', fontWeight: 600 }}>Quality Ratings (Avg: {userStats.averageRating}★)</span>
              </div>
              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fbbf24' }}>
                {userStats.questionTypesCount.rating}
              </span>
            </div>

            {/* Written Comments */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1rem' }}>💬</span>
                <span style={{ fontSize: '0.84rem', color: '#e2e8f0', fontWeight: 600 }}>Feedback Comments Written</span>
              </div>
              <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#34d399' }}>
                {userStats.commentsCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SECTION 3: ADMIN TEAM LEADERBOARD (IF TEAM SCOPE)       */}
      {/* ======================================================== */}
      {isAdmin && adminScope === 'team' && teamStats && (
        <div style={{
          background: 'rgba(15, 20, 36, 0.75)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 18,
          padding: '24px',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)'
              }}>
                <Award size={22} color="#fff" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                  Employee Review Leaderboard & Activity
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                  Comparing participation, total questions answered, and voting trends across team members
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '4px 12px',
                borderRadius: 99,
                background: 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.3)'
              }}>
                {teamStats.totalTeamQuestionsAnswered} Total Team Answers
              </span>
            </div>
          </div>

          {/* Leaderboard Table */}
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-dim)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Rank & Employee</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Evaluated Items</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Questions Answered</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>Directives Read</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teamStats.leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No employees registered in the system yet.
                    </td>
                  </tr>
                ) : (
                  teamStats.leaderboard.map((emp, index) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const medal = index < 3 ? medals[index] : `#${index + 1}`;

                    return (
                      <tr 
                        key={emp.id}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          background: index % 2 === 0 ? 'rgba(0, 0, 0, 0.15)' : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        {/* Employee Name */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: 700, minWidth: 24 }}>{medal}</span>
                            <img
                              src={emp.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                              alt={emp.displayName}
                              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                            />
                            <div>
                              <div style={{ fontWeight: 700, color: '#ffffff' }}>{emp.displayName}</div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>@{emp.username}</div>
                            </div>
                          </div>
                        </td>

                        {/* Evaluated Count & Completion */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700, color: '#ffffff' }}>
                            {emp.evaluatedCount} / {emp.totalItemsCount}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {emp.completionRate}% complete
                          </div>
                        </td>

                        {/* Questions Answered */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'rgba(99, 102, 241, 0.18)',
                            color: '#c7d2fe',
                            fontWeight: 700,
                            fontSize: '0.8rem'
                          }}>
                            {emp.questionsAnswered} answered
                          </span>
                        </td>

                        {/* Instructions Read */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ color: emp.acknowledgedCount === emp.totalInstructionsCount ? '#34d399' : '#fbbf24', fontWeight: 600 }}>
                            {emp.acknowledgedCount} / {emp.totalInstructionsCount}
                          </span>
                        </td>

                        {/* Action Inspect Button */}
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="tab-btn"
                            onClick={() => {
                              setSelectedEmployeeId(emp.id);
                              setAdminScope('my');
                              if (scrollRef.current) {
                                scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                              }
                            }}
                            style={{
                              fontSize: '0.76rem',
                              padding: '5px 12px',
                              borderRadius: 6,
                              background: 'rgba(99, 102, 241, 0.2)',
                              border: '1px solid rgba(99, 102, 241, 0.4)',
                              color: '#c7d2fe',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5
                            }}
                          >
                            <span>Inspect Stats</span>
                            <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION 4: ANSWER AUDIT LOG & QUESTIONNAIRE HISTORY      */}
      {/* ======================================================== */}
      <div style={{
        background: 'rgba(15, 20, 36, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 18,
        padding: '24px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        flexShrink: 0
      }}>
        {/* Header, Scope Switcher, and Search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.12rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                {adminScope === 'team'
                  ? `Team Questionnaire Response History (${filteredHistory.length})`
                  : targetUserId !== user?.id
                    ? `${targetUserInfo?.displayName}'s Response History (${filteredHistory.length})`
                    : `Questionnaire Response History (${filteredHistory.length})`}
              </h3>

              {isAdmin && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 8,
                  padding: 3,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  gap: 3
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminScope('team');
                      setSelectedEmployeeId(null);
                    }}
                    style={{
                      border: 'none',
                      background: adminScope === 'team' ? 'rgba(99, 102, 241, 0.35)' : 'transparent',
                      color: adminScope === 'team' ? '#ffffff' : 'var(--text-muted)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="View responses from all employees across the team"
                  >
                    👥 Team ({teamStats?.allTeamEvaluations?.length || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAdminScope('my');
                      setSelectedEmployeeId(user?.id);
                    }}
                    style={{
                      border: 'none',
                      background: adminScope === 'my' && targetUserId === user?.id ? 'rgba(99, 102, 241, 0.35)' : 'transparent',
                      color: adminScope === 'my' && targetUserId === user?.id ? '#ffffff' : 'var(--text-muted)',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="View only your own personal questionnaire responses"
                  >
                    ⭐ Admin ({userStats?.evaluatedItemsList?.length || 0})
                  </button>
                </div>
              )}
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              {adminScope === 'team'
                ? 'Detailed audit trail of questionnaire questions answered and written employee responses across all team members'
                : targetUserId !== user?.id
                  ? `Detailed audit trail of questionnaire questions answered and written responses by ${targetUserInfo?.displayName}`
                  : 'Detailed audit trail of questionnaire questions answered and written responses for each item'}
            </p>
          </div>

          <div style={{ position: 'relative', width: 280 }}>
            <input
              type="text"
              className="form-input"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder={adminScope === 'team' ? "Search answers, items or employees..." : "Search answers or items..."}
              style={{ fontSize: '0.8rem', padding: '6px 12px', height: 36, borderRadius: 8, width: '100%' }}
            />
          </div>
        </div>

        {/* List of Answered Review Items */}
        {filteredHistory.length === 0 ? (
          <div className="empty-list" style={{ padding: '40px 20px', textAlign: 'center' }}>
            <Sparkles size={32} color="#6366f1" />
            <h4 style={{ color: '#fff', fontSize: '1rem', marginTop: 10 }}>No evaluated items found</h4>
            <p style={{ color: 'var(--text-muted)' }}>
              {historySearch
                ? `No answers match "${historySearch}"`
                : adminScope === 'team'
                  ? "No team survey evaluations recorded yet."
                  : targetUserId !== user?.id
                    ? `${targetUserInfo?.displayName} hasn't completed any evaluations yet.`
                    : "No survey evaluations completed yet. Head to the Dashboard to answer questions!"}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredHistory.map(({ item, vote, timestamp, comment, answeredCount, totalQuestions, answersDetail, reviewer, reviewerId }, index) => {
              const itemKey = `${item.id}-${reviewerId || index}`;
              const isExpanded = expandedItemId === itemKey;
              const isGood = vote === 'good';

              return (
                <div
                  key={itemKey}
                  style={{
                    background: 'rgba(18, 24, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 14,
                    padding: '16px 18px',
                    transition: 'all 0.2s ease',
                    boxShadow: isExpanded ? '0 6px 20px rgba(0, 0, 0, 0.3)' : 'none'
                  }}
                >
                  {/* Summary Bar */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* Thumbnail with Lightbox click */}
                      {item.imageUrl && (
                        <div
                          onClick={() => setPreviewImage(item.imageUrl)}
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 10,
                            overflow: 'hidden',
                            position: 'relative',
                            cursor: 'pointer',
                            flexShrink: 0,
                            border: '1px solid rgba(255, 255, 255, 0.12)'
                          }}
                          title="Click to view image"
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(0, 0, 0, 0.35)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0,
                            transition: 'opacity 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                          >
                            <Eye size={16} color="#fff" />
                          </div>
                        </div>
                      )}

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.94rem', fontWeight: 700, color: '#ffffff' }}>
                            {item.title}
                          </span>

                          {/* Reviewer indicator */}
                          {(adminScope === 'team' || targetUserId !== user?.id) && reviewer && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '2px 9px',
                              borderRadius: 99,
                              background: 'rgba(99, 102, 241, 0.15)',
                              border: '1px solid rgba(99, 102, 241, 0.3)',
                              fontSize: '0.74rem',
                              color: '#c7d2fe',
                              fontWeight: 600
                            }}>
                              <img 
                                src={reviewer.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'} 
                                alt={reviewer.displayName}
                                style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }}
                              />
                              <span>{reviewer.displayName}</span>
                            </span>
                          )}

                          {/* Verdict or Survey Badge */}
                          {vote ? (
                            <span className={`eval-badge ${isGood ? 'good' : 'bad'}`} style={{ fontSize: '0.7rem', padding: '1px 8px' }}>
                              {isGood ? '👍 Up' : '👎 Down'}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'rgba(99, 102, 241, 0.15)',
                              color: '#a5b4fc',
                              border: '1px solid rgba(99, 102, 241, 0.3)'
                            }}>
                              📝 Survey Answered
                            </span>
                          )}



                          {/* Questions answered count */}
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'rgba(99, 102, 241, 0.14)',
                            color: '#c7d2fe',
                            border: '1px solid rgba(99, 102, 241, 0.3)'
                          }}>
                            {answeredCount} / {totalQuestions} questions answered
                          </span>
                        </div>

                        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Clock size={12} /> Evaluated {formatRelativeTime(timestamp)}
                        </div>
                      </div>
                    </div>

                    {/* Expand/Collapse Answers Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setExpandedItemId(isExpanded ? null : itemKey)}
                        className="tab-btn"
                        style={{
                          fontSize: '0.76rem',
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: isExpanded ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#ffffff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <span>{isExpanded ? 'Hide Responses' : 'View Responses'}</span>
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Written Answer / Feedback Comment Preview when collapsed */}
                  {!isExpanded && (() => {
                    const textAnswer = answersDetail.find(a => (a.type === 'text' || a.type === 'type_answer' || a.questionId === 'q_feedback') && a.value);
                    const previewText = textAnswer?.value || comment;
                    if (!previewText) return null;
                    return (
                      <div style={{
                        fontSize: '0.8rem',
                        color: '#e2e8f0',
                        marginTop: 10,
                        padding: '9px 13px',
                        background: 'rgba(99, 102, 241, 0.08)',
                        borderRadius: 8,
                        borderLeft: '3px solid #6366f1',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 7
                      }}>
                        <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--accent-cyan)', flexShrink: 0 }}>
                          ✍️ Response:
                        </span>
                        <span style={{ fontStyle: 'italic', color: '#f8fafc' }}>
                          "{previewText}"
                        </span>
                      </div>
                    );
                  })()}

                  {/* Expanded Questionnaire Responses Detail */}
                  {isExpanded && (
                    <div style={{
                      marginTop: 14,
                      paddingTop: 14,
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10
                    }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                        Questions & Chosen Answers:
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {answersDetail.length === 0 ? (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {(() => {
                              const vQ = (item.questions || []).find(q => q.type === 'verdict');
                              const vLabel = vote === 'good' ? (vQ?.options?.[0] || 'Good') : vote === 'bad' ? (vQ?.options?.[1] || 'Bad') : vote;
                              return `No individual questionnaire responses stored (verdict only: ${vLabel}).`;
                            })()}
                          </div>
                        ) : (
                          answersDetail.map(ans => {
                            if (ans.type === 'text' || ans.type === 'type_answer' || ans.questionId === 'q_feedback') {
                              return (
                                <div
                                  key={ans.questionId}
                                  style={{
                                    background: 'rgba(99, 102, 241, 0.08)',
                                    border: '1px solid rgba(99, 102, 241, 0.22)',
                                    borderRadius: 10,
                                    padding: '12px 14px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600, color: '#c7d2fe' }}>
                                      <span>✍️</span>
                                      <span>{ans.questionText}</span>
                                    </div>
                                    <span style={{
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      background: 'rgba(99, 102, 241, 0.25)',
                                      color: '#a5b4fc',
                                      border: '1px solid rgba(99, 102, 241, 0.4)'
                                    }}>
                                      Written Response
                                    </span>
                                  </div>
                                  <div style={{
                                    fontSize: '0.86rem',
                                    color: '#f8fafc',
                                    background: 'rgba(0, 0, 0, 0.35)',
                                    borderRadius: 8,
                                    padding: '10px 12px',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: 1.5,
                                    borderLeft: '3px solid #6366f1'
                                  }}>
                                    "{ans.value}"
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={ans.questionId}
                                style={{
                                  background: 'rgba(0, 0, 0, 0.2)',
                                  border: '1px solid rgba(255, 255, 255, 0.05)',
                                  borderRadius: 8,
                                  padding: '8px 12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  flexWrap: 'wrap',
                                  gap: 8
                                }}
                              >
                                <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                                  {ans.questionText}
                                </span>
                                {(() => {
                                  const formattedVal = ans.type === 'verdict'
                                    ? ((String(ans.value).toLowerCase() === 'good' || String(ans.value).toLowerCase() === 'up')
                                        ? `👍 ${ans.options?.[0] || 'Up'}`
                                        : (String(ans.value).toLowerCase() === 'bad' || String(ans.value).toLowerCase() === 'down')
                                          ? `👎 ${ans.options?.[1] || 'Down'}`
                                          : String(ans.value))
                                    : (Array.isArray(ans.value) ? ans.value.join(', ') : String(ans.value));

                                  const displayCorrectKey = (() => {
                                    if (!ans.correctAnswer) return '';
                                    if (ans.type === 'verdict') {
                                      const lower = String(ans.correctAnswer).trim().toLowerCase();
                                      if (lower === 'good' || lower === 'up') return `👍 ${ans.options?.[0] || 'Up'}`;
                                      if (lower === 'bad' || lower === 'down') return `👎 ${ans.options?.[1] || 'Down'}`;
                                      if (ans.options?.[0] && lower === ans.options[0].trim().toLowerCase()) return `👍 ${ans.options[0]}`;
                                      if (ans.options?.[1] && lower === ans.options[1].trim().toLowerCase()) return `👎 ${ans.options[1]}`;
                                    }
                                    return ans.correctAnswer;
                                  })();

                                  return ans.hasKey ? (
                                    <span style={{
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      background: ans.isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                      color: ans.isCorrect ? '#34d399' : '#f87171',
                                      border: `1px solid ${ans.isCorrect ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                                    }}>
                                      {ans.isCorrect ? '✅' : '❌'} {formattedVal} {ans.isCorrect ? '(Right Answer)' : `(Wrong - Right Answer was: ${displayCorrectKey})`}
                                    </span>
                                  ) : (
                                    <span style={{
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      background: 'rgba(99, 102, 241, 0.2)',
                                      color: '#a5b4fc',
                                      border: '1px solid rgba(99, 102, 241, 0.35)'
                                    }}>
                                      {formattedVal}
                                    </span>
                                  );
                                })()}
                              </div>
                            );
                          })
                        )}

                        {comment && (
                          <div style={{
                            background: 'rgba(0, 0, 0, 0.25)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            borderRadius: 8,
                            padding: '10px 12px',
                            marginTop: 4
                          }}>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 700 }}>
                              Optional Feedback Written:
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#e2e8f0', marginTop: 2 }}>
                              {comment}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox Modal Preview */}
      {previewImage && (
        <div
          className="modal-overlay"
          onClick={() => setPreviewImage(null)}
          style={{ zIndex: 120, cursor: 'zoom-out' }}
        >
          <div
            style={{
              maxWidth: '90vw',
              maxHeight: '85vh',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage}
              alt="Preview"
              style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', display: 'block' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
