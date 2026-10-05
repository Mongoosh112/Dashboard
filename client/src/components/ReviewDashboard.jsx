import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { 
  ThumbsUp, 
  ThumbsDown, 
  Upload, 
  Trash2, 
  Sparkles, 
  Maximize2, 
  Clock, 
  XCircle,
  BookOpen,
  Users,
  Search,
  ChevronDown,
  Check,
  X,
  ClipboardList,
  BarChart2,
  Settings2,
  HelpCircle,
  CheckCircle2,
  Sliders,
  Lock,
  RotateCcw
} from 'lucide-react';
import { formatRelativeTime } from '../utils/helpers';
import ImportantInstructionsView from './ImportantInstructionsView';

// Code-split heavy modals to significantly shrink the bundle size
const UploadReviewModal = lazy(() => import('./UploadReviewModal'));
const QuestionnaireModal = lazy(() => import('./QuestionnaireModal'));
const ReviewStatsModal = lazy(() => import('./ReviewStatsModal'));
const EditQuestionnaireModal = lazy(() => import('./EditQuestionnaireModal'));
const KnowledgeBaseDrawer = lazy(() => import('./KnowledgeBaseDrawer'));
const InstructionModal = lazy(() => import('./InstructionModal'));
const DataMixerModal = lazy(() => import('./DataMixerModal'));
const MonthEndResetModal = lazy(() => import('./MonthEndResetModal'));

export default function ReviewDashboard({ onOpenChat, onOpenEmployeeManagement, onInstructionsChange, onItemsChange }) {
  const { user, token } = useAuth();
  const { socket, reconnectCount } = useSocket();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'pending' | 'good' | 'bad' | 'important'
  
  // Important instructions state
  const [instructions, setInstructions] = useState([]);
  const [instructionsLoading, setInstructionsLoading] = useState(false);
  const [isInstructionModalOpen, setIsInstructionModalOpen] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState(null);
  const [justSentDirective, setJustSentDirective] = useState(false);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isMonthEndResetOpen, setIsMonthEndResetOpen] = useState(false);
  const [activeImagePreview, setActiveImagePreview] = useState(null);
  const [activeQuestionnaireItem, setActiveQuestionnaireItem] = useState(null);
  const [activeStatsItem, setActiveStatsItem] = useState(null);
  const [activeKnowledgeItem, setActiveKnowledgeItem] = useState(null);
  const [activeEditQuestionnaireItem, setActiveEditQuestionnaireItem] = useState(null);
  const [activeMixerItem, setActiveMixerItem] = useState(null);
  const [votingId, setVotingId] = useState(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('all');
  const [employeeUsers, setEmployeeUsers] = useState([]);
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [adminDataFilter, setAdminDataFilter] = useState('all'); // 'all' | 'real' | 'mixer'
  const employeeDropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const isAdmin = user?.isAdmin;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(event.target)) {
        setIsEmployeeDropdownOpen(false);
      }
    }
    if (isEmployeeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 40);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEmployeeDropdownOpen]);

  // Fetch review items
  const fetchItems = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/dashboard/items', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch review items:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch important instructions
  const fetchInstructions = async () => {
    if (!token) return;
    try {
      setInstructionsLoading(true);
      const res = await fetch('/api/dashboard/instructions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInstructions(data.instructions || []);
      }
    } catch (err) {
      console.error('Failed to fetch instructions:', err);
    } finally {
      setInstructionsLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    fetchInstructions();
  }, [token, user?.id]);

  const lastHandledReconnectRef = React.useRef(0);
  // Network Reconnection Sync: automatically refresh review queue when connection restores
  useEffect(() => {
    if (reconnectCount > 0 && reconnectCount > lastHandledReconnectRef.current && token) {
      lastHandledReconnectRef.current = reconnectCount;
      console.log('[ReviewDashboard] Network restored. Re-syncing review queue & directives...');
      fetchItems();
      fetchInstructions();
    }
  }, [reconnectCount, token]);

  // Fetch all employee contacts for Admin to allow inspecting individual employees
  useEffect(() => {
    if (isAdmin && token) {
      fetch('/api/contacts', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.contacts) {
            setEmployeeUsers(data.contacts.filter(c => !c.isAdmin));
          }
        })
        .catch(err => console.error('Failed to fetch employee contacts:', err));
    }
  }, [isAdmin, token]);

  // Merge registered contacts with voters found in items
  const allEmployees = React.useMemo(() => {
    const map = new Map();
    employeeUsers.forEach(u => map.set(u.id, { id: u.id, name: u.displayName || u.username, avatar: u.avatar }));
    items.forEach(item => {
      (item.voteList || []).forEach(v => {
        if (!map.has(v.userId)) {
          map.set(v.userId, { id: v.userId, name: v.userName || v.userId, avatar: v.userAvatar });
        }
      });
    });
    return Array.from(map.values());
  }, [employeeUsers, items]);

  // Real-time socket subscriptions
  useEffect(() => {
    if (!socket) return;

    const handleNewItem = (newItem) => {
      // If non-admin employee, only show if targeted to them or broadcast to all
      if (!isAdmin && newItem.targetUserIds && newItem.targetUserIds.length > 0) {
        if (!user?.id || !newItem.targetUserIds.includes(user.id)) {
          return;
        }
      }
      setItems(prev => {
        if (prev.some(item => item.id === newItem.id)) {
          return prev.map(item => item.id === newItem.id ? newItem : item);
        }
        return [newItem, ...prev];
      });
    };

    const handleVoteUpdated = (updatedItem) => {
      setItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
      // Update opened modals using functional state updaters to prevent stale closures
      setActiveQuestionnaireItem(prev => prev?.id === updatedItem.id ? updatedItem : prev);
      setActiveStatsItem(prev => prev?.id === updatedItem.id ? updatedItem : prev);
      setActiveKnowledgeItem(prev => prev?.id === updatedItem.id ? updatedItem : prev);
      setActiveMixerItem(prev => prev?.id === updatedItem.id ? updatedItem : prev);
    };

    const handleItemDeleted = ({ itemId }) => {
      setItems(prev => prev.filter(item => item.id !== itemId));
      setActiveQuestionnaireItem(prev => prev?.id === itemId ? null : prev);
      setActiveStatsItem(prev => prev?.id === itemId ? null : prev);
      setActiveKnowledgeItem(prev => prev?.id === itemId ? null : prev);
      setActiveMixerItem(prev => prev?.id === itemId ? null : prev);
    };

    const handleNewInstruction = (newInst) => {
      if (!isAdmin && Array.isArray(newInst.targetUserIds) && newInst.targetUserIds.length > 0 && !newInst.targetUserIds.includes(user?.id)) {
        return;
      }
      setInstructions(prev => {
        if (prev.some(i => i.id === newInst.id)) {
          return prev.map(i => i.id === newInst.id ? newInst : i);
        }
        return [newInst, ...prev];
      });
      setJustSentDirective(true);
      setTimeout(() => setJustSentDirective(false), 20000);
    };

    const handleInstructionUpdated = (updatedInst) => {
      setInstructions(prev => prev.map(i => i.id === updatedInst.id ? updatedInst : i));
    };

    const handleInstructionDeleted = ({ instructionId }) => {
      setInstructions(prev => prev.filter(i => i.id !== instructionId));
    };

    const handleMonthEndReset = () => {
      fetchItems();
      fetchInstructions();
      if (onItemsChange) onItemsChange();
      if (onInstructionsChange) onInstructionsChange();
    };

    socket.on('new_review_item', handleNewItem);
    socket.on('review_vote_updated', handleVoteUpdated);
    socket.on('review_item_deleted', handleItemDeleted);
    socket.on('new_instruction', handleNewInstruction);
    socket.on('instruction_updated', handleInstructionUpdated);
    socket.on('instruction_deleted', handleInstructionDeleted);
    socket.on('month_end_reset', handleMonthEndReset);

    return () => {
      socket.off('new_review_item', handleNewItem);
      socket.off('review_vote_updated', handleVoteUpdated);
      socket.off('review_item_deleted', handleItemDeleted);
      socket.off('new_instruction', handleNewInstruction);
      socket.off('instruction_updated', handleInstructionUpdated);
      socket.off('instruction_deleted', handleInstructionDeleted);
      socket.off('month_end_reset', handleMonthEndReset);
    };
  }, [socket, isAdmin, user?.id]);

  // Quick 1-click Good / Bad voting on the card with instant optimistic UI update
  const handleQuickVote = async (itemId, vote) => {
    const item = items.find(i => i.id === itemId);
    const currentVoteData = item?.votes?.[user?.id];
    // Once an employee votes, they cannot change it
    if (currentVoteData && !isAdmin) {
      return;
    }

    const previousItems = items;
    const existingAnswers = currentVoteData?.answers || {};
    const itemQuestions = item?.questions || [];
    const verdictQ = itemQuestions.find(q => q.type === 'verdict');
    const opt1Label = verdictQ?.options?.[0] || 'Good';
    const opt2Label = verdictQ?.options?.[1] || 'Bad';
    const chosenLabel = vote === 'good' ? opt1Label : opt2Label;

    const newAnswers = { ...existingAnswers, q_verdict: vote };
    if (verdictQ) {
      newAnswers[verdictQ.id] = chosenLabel;
    }

    // ⚡ Instant Optimistic Update: Reflect choice immediately with 0ms visual latency
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const votes = { ...(i.votes || {}) };
      votes[user?.id] = {
        userId: user?.id,
        vote,
        answers: newAnswers,
        comment: currentVoteData?.comment || '',
        userName: user?.displayName || user?.username,
        userAvatar: user?.avatar,
        timestamp: new Date().toISOString()
      };
      const isGood = vote === 'good';
      const newGood = (i.goodCount || 0) + (isGood ? 1 : 0);
      const newBad = (i.badCount || 0) + (!isGood ? 1 : 0);
      const newTotal = newGood + newBad;
      return {
        ...i,
        votes,
        goodCount: newGood,
        badCount: newBad,
        totalVotes: newTotal,
        goodPercentage: newTotal > 0 ? Math.round((newGood / newTotal) * 100) : 0
      };
    }));

    setVotingId(itemId);

    try {
      const res = await fetch(`/api/dashboard/items/${itemId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          vote,
          answers: newAnswers,
          comment: currentVoteData?.comment || ''
        })
      });

      if (res.ok) {
        const data = await res.json();
        setItems(prev => prev.map(i => i.id === itemId ? data.item : i));
        if (activeKnowledgeItem?.id === itemId) {
          setActiveKnowledgeItem(data.item);
        }
        if (onItemsChange) onItemsChange();
      } else {
        setItems(previousItems);
      }
    } catch (err) {
      console.error('Failed to vote:', err);
      setItems(previousItems);
    } finally {
      setVotingId(null);
    }
  };

  // Quick 1-click Yes / No response on the card with instant optimistic UI update
  const handleQuickYesNo = async (itemId, questionId, answerValue) => {
    const item = items.find(i => i.id === itemId);
    const currentVoteData = item?.votes?.[user?.id];
    // Once an employee answers, they cannot change it
    if (currentVoteData?.answers?.[questionId] && !isAdmin) {
      return;
    }

    const previousItems = items;
    const existingAnswers = currentVoteData?.answers || {};
    const newAnswers = { ...existingAnswers, [questionId]: answerValue };
    // Yes/No is a distinct question type from Up/Down; do not fabricate a 'good' or 'bad' verdict vote
    const effectiveVote = currentVoteData?.vote || null;

    // ⚡ Instant Optimistic Update: Immediately highlight button, dim opposite, show result banner and update counts
    setItems(prev => prev.map(i => {
      if (i.id !== itemId) return i;
      const votes = { ...(i.votes || {}) };
      votes[user?.id] = {
        userId: user?.id,
        vote: effectiveVote,
        answers: newAnswers,
        comment: currentVoteData?.comment || '',
        userName: user?.displayName || user?.username,
        userAvatar: user?.avatar,
        timestamp: new Date().toISOString()
      };

      let updatedStats = i.questionStats;
      if (Array.isArray(i.questionStats)) {
        updatedStats = i.questionStats.map(stat => {
          if (stat.id !== questionId) return stat;
          const isYes = String(answerValue).toLowerCase() === 'yes';
          const newOpt1 = (stat.opt1Count || stat.yesCount || 0) + (isYes ? 1 : 0);
          const newOpt2 = (stat.opt2Count || stat.noCount || 0) + (!isYes ? 1 : 0);
          const newTotal = newOpt1 + newOpt2;
          return {
            ...stat,
            opt1Count: newOpt1,
            opt2Count: newOpt2,
            totalVotes: newTotal,
            opt1Percentage: newTotal > 0 ? Math.round((newOpt1 / newTotal) * 100) : 0,
            opt2Percentage: newTotal > 0 ? 100 - Math.round((newOpt1 / newTotal) * 100) : 0
          };
        });
      }

      return {
        ...i,
        votes,
        questionStats: updatedStats
      };
    }));

    setVotingId(itemId);

    try {
      const res = await fetch(`/api/dashboard/items/${itemId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          vote: effectiveVote,
          answers: newAnswers,
          comment: currentVoteData?.comment || ''
        })
      });

      if (res.ok) {
        const data = await res.json();
        setItems(prev => prev.map(i => i.id === itemId ? data.item : i));
        if (activeKnowledgeItem?.id === itemId) {
          setActiveKnowledgeItem(data.item);
        }
        if (onItemsChange) onItemsChange();
      } else {
        setItems(previousItems);
      }
    } catch (err) {
      console.error('Failed to submit Yes/No answer:', err);
      setItems(previousItems);
    } finally {
      setVotingId(null);
    }
  };

  // Delete item (Admin only)
  const handleDelete = async (itemId) => {
    if (!confirm('Are you sure you want to delete this review item?')) return;
    try {
      const res = await fetch(`/api/dashboard/items/${itemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== itemId));
      }
    } catch (err) {
      console.error('Failed to delete review item:', err);
    }
  };

  // Instructions action handlers
  const handleAcknowledgeInstruction = async (id) => {
    try {
      const res = await fetch(`/api/dashboard/instructions/${id}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setInstructions(prev => prev.map(i => i.id === id ? data.instruction : i));
        if (onInstructionsChange) onInstructionsChange();
      }
    } catch (err) {
      console.error('Failed to acknowledge instruction:', err);
    }
  };

  const handleDeleteInstruction = async (id) => {
    if (!confirm('Are you sure you want to delete this instruction?')) return;
    try {
      const res = await fetch(`/api/dashboard/instructions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setInstructions(prev => prev.filter(i => i.id !== id));
        if (onInstructionsChange) onInstructionsChange();
      }
    } catch (err) {
      console.error('Failed to delete instruction:', err);
    }
  };

  const handleOpenCreateInstruction = () => {
    setEditingInstruction(null);
    setIsInstructionModalOpen(true);
  };

  const handleOpenEditInstruction = (inst) => {
    setEditingInstruction(inst);
    setIsInstructionModalOpen(true);
  };

  const unreadInstructionsCount = useMemo(() => {
    if (!user?.id || isAdmin) return 0;
    return instructions.filter(i => !(i.acknowledgedBy || []).includes(user.id)).length;
  }, [instructions, user?.id, isAdmin]);

  // Deduplicate items by ID to guarantee an item never displays twice
  const uniqueItems = useMemo(() => {
    const seen = new Set();
    return items.filter(item => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [items]);

  // Target employee for individual metrics:
  // For regular employee: ALWAYS strictly their own individual evaluations
  // For admin: allows selecting a specific employee or viewing team total
  const targetUserId = !isAdmin ? user?.id : (selectedEmployeeId !== 'all' ? selectedEmployeeId : null);
  const targetEmployee = targetUserId ? allEmployees.find(e => e.id === targetUserId) || (targetUserId === user?.id ? user : null) : null;

  // Filter items
  const effectiveUserId = targetUserId || user?.id;
  const filteredItems = uniqueItems.filter(item => {
    const myVote = item.votes?.[effectiveUserId];
    const isCompleted = Boolean(myVote && (myVote.vote || (myVote.answers && Object.keys(myVote.answers).length > 0)));
    if (filter === 'pending') return !isCompleted;
    if (filter === 'completed') return isCompleted;
    if (filter === 'good') {
      return !isAdmin ? myVote?.vote === 'good' : item.goodCount > item.badCount;
    }
    if (filter === 'bad') {
      return !isAdmin ? myVote?.vote === 'bad' : item.badCount >= item.goodCount && item.totalVotes > 0;
    }
    return true;
  });

  // Sort items: for employees, prioritize new / pending surveys first so they immediately notice them
  const displayItems = useMemo(() => {
    if (!isAdmin) {
      return [...filteredItems].sort((a, b) => {
        const aCompleted = Boolean(a.votes?.[user?.id] && (a.votes[user.id].vote || (a.votes[user.id].answers && Object.keys(a.votes[user.id].answers).length > 0)));
        const bCompleted = Boolean(b.votes?.[user?.id] && (b.votes[user.id].vote || (b.votes[user.id].answers && Object.keys(b.votes[user.id].answers).length > 0)));
        if (!aCompleted && bCompleted) return -1;
        if (aCompleted && !bCompleted) return 1;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
    }
    return filteredItems;
  }, [filteredItems, isAdmin, user?.id]);

  // Calculate totals
  const totalItems = uniqueItems.length;
  let responsesCount = 0;
  let responsesSubtitle = '';
  let employeeCardLabel = 'Employee Submissions';
  let approvalCardLabel = 'Overall Approval Ratio';
  let goodCount = 0;
  let badCount = 0;

  // Real vs Mixer calculations across all uniqueItems
  const realTotalEvaluations = uniqueItems.reduce((acc, curr) => {
    const rVotes = curr.realStats?.totalVotes ?? Object.keys(curr.votes || {}).length;
    return acc + rVotes;
  }, 0);
  const realGoodTotal = uniqueItems.reduce((acc, curr) => {
    const rGood = curr.realStats?.goodCount ?? Object.values(curr.votes || {}).filter(v => (v.vote || '').toLowerCase() === 'good').length;
    return acc + rGood;
  }, 0);
  const realBadTotal = uniqueItems.reduce((acc, curr) => {
    const rBad = curr.realStats?.badCount ?? Object.values(curr.votes || {}).filter(v => (v.vote || '').toLowerCase() === 'bad').length;
    return acc + rBad;
  }, 0);

  const mixerTotalEvaluations = Math.max(0, uniqueItems.reduce((acc, curr) => {
    const mTotal = curr.realStats?.simTotal ?? (curr.dataMixer?.enabled ? ((Number(curr.dataMixer.goodCount) || 0) + (Number(curr.dataMixer.badCount) || 0)) : 0);
    return acc + mTotal;
  }, 0));
  const mixerGoodTotal = Math.max(0, uniqueItems.reduce((acc, curr) => {
    const mGood = curr.realStats?.simGood ?? (curr.dataMixer?.enabled ? (Number(curr.dataMixer.goodCount) || 0) : 0);
    return acc + mGood;
  }, 0));
  const mixerBadTotal = Math.max(0, uniqueItems.reduce((acc, curr) => {
    const mBad = curr.realStats?.simBad ?? (curr.dataMixer?.enabled ? (Number(curr.dataMixer.badCount) || 0) : 0);
    return acc + mBad;
  }, 0));

  const combinedTotal = uniqueItems.reduce((acc, curr) => acc + (curr.totalVotes || 0), 0);
  const combinedGood = uniqueItems.reduce((acc, curr) => acc + (curr.goodCount || 0), 0);
  const combinedBad = uniqueItems.reduce((acc, curr) => acc + (curr.badCount || 0), 0);

  if (targetUserId) {
    // Individual Employee Metrics (Always real)
    const userSubmissions = uniqueItems.filter(item => !!item.votes?.[targetUserId]);
    responsesCount = userSubmissions.length;
    const userGood = userSubmissions.filter(item => (item.votes?.[targetUserId]?.vote || '').toLowerCase() === 'good').length;
    const userBad = userSubmissions.filter(item => (item.votes?.[targetUserId]?.vote || '').toLowerCase() === 'bad').length;

    // Filter items applicable to this employee (only active items targeted to them or broadcast, plus any they actually evaluated)
    const applicableItemsForTarget = uniqueItems.filter(item => {
      if (item.votes?.[targetUserId]) return true;
      if (item.isArchived) return false;
      if (Array.isArray(item.targetUserIds) && item.targetUserIds.length > 0) {
        return item.targetUserIds.includes(targetUserId);
      }
      return true;
    });
    const targetTotalItems = applicableItemsForTarget.length;
    const pendingCount = Math.max(0, targetTotalItems - responsesCount);

    const isCurrentUser = targetUserId === user?.id;
    const employeeDisplayName = isCurrentUser ? 'you' : (targetEmployee?.name || 'this employee');

    employeeCardLabel = isCurrentUser ? 'My Submissions' : `${targetEmployee?.name || 'Employee'}'s Submissions`;
    responsesSubtitle = isCurrentUser
      ? `Total reviews by you (${responsesCount} of ${targetTotalItems}${pendingCount > 0 ? ` • ${pendingCount} pending` : ''})`
      : `Total reviews by ${employeeDisplayName} (${responsesCount} of ${targetTotalItems}${pendingCount > 0 ? ` • ${pendingCount} pending` : ''})`;

    approvalCardLabel = isCurrentUser ? 'My Approval Ratio' : `${targetEmployee?.name || 'Employee'}'s Approval Ratio`;
    goodCount = userGood;
    badCount = userBad;
  } else {
    // Admin: Team Aggregate based on active data view filter
    if (adminDataFilter === 'real') {
      responsesCount = realTotalEvaluations;
      responsesSubtitle = `Exclusively from real employees and users`;
      employeeCardLabel = 'Real Employee Submissions';
      approvalCardLabel = 'Real Approval Ratio';
      goodCount = realGoodTotal;
      badCount = realBadTotal;
    } else if (adminDataFilter === 'mixer') {
      responsesCount = mixerTotalEvaluations;
      responsesSubtitle = `Simulated via Data Mixer & Live Streamer`;
      employeeCardLabel = 'Mixer Submissions';
      approvalCardLabel = 'Mixer Approval Ratio';
      goodCount = mixerGoodTotal;
      badCount = mixerBadTotal;
    } else {
      responsesCount = combinedTotal;
      responsesSubtitle = mixerTotalEvaluations > 0 
        ? `Total submissions across employees & mixer`
        : `Total submissions across all employees`;
      employeeCardLabel = 'Employee Submissions';
      approvalCardLabel = 'Overall Approval Ratio';
      goodCount = combinedGood;
      badCount = combinedBad;
    }
  }

  return (
    <div className="review-dashboard-wrapper">
      {/* Dashboard Top Header */}
      <div className="review-dashboard-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="review-title">Review & Evaluation Dashboard</h1>
            {isAdmin ? (
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: 99,
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.4)'
              }}>
                ADMIN
              </span>
            ) : (
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 99,
                background: 'rgba(99, 102, 241, 0.2)',
                color: 'var(--accent-cyan)',
                border: '1px solid rgba(99, 102, 241, 0.4)'
              }}>
                {user?.displayName || user?.username}
              </span>
            )}
          </div>
          <p className="review-subtitle">
            {isAdmin 
              ? "Share posts and surveys with your team and track employee evaluations, decision guides, and survey responses."
              : "Review posts and surveys shared by Admin, vote Good or Bad, and consult the Knowledge Base guidelines."
            }
          </p>
        </div>

        {/* ONLY ADMIN CAN POST QUESTIONNAIRES & MANAGE EMPLOYEES */}
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button 
              type="button" 
              onClick={() => setIsMonthEndResetOpen(true)}
              style={{
                padding: '9px 15px',
                fontSize: '0.84rem',
                fontWeight: 700,
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.28)',
                color: '#fca5a5',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.28)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              title="End-of-Month Cleanup: Archive completed queue items & clear unpinned directives"
            >
              <RotateCcw size={15} />
              <span>End-of-Month Reset</span>
            </button>

            <button 
              type="button" 
              className="add-employee-trigger-btn" 
              onClick={() => onOpenEmployeeManagement && onOpenEmployeeManagement('create')}
              style={{ padding: '9px 16px', fontSize: '0.84rem' }}
            >
              <Users size={16} />
              <span>+ Add Employee</span>
            </button>

            <button 
              type="button" 
              className="welcome-cta-btn" 
              onClick={() => setIsUploadOpen(true)}
              style={{ padding: '9px 20px', fontSize: '0.86rem' }}
            >
              <Upload size={16} />
              <span>+ Create New Post</span>
            </button>
          </div>
        )}
      </div>

      {/* Admin: Inspect Individual Employee Searchable Dropdown */}
      {isAdmin && allEmployees.length > 0 && (
        <div className="review-employee-bar" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 12,
          padding: '10px 16px',
          position: 'relative',
          zIndex: 40
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.8rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            flexShrink: 0
          }}>
            <Users size={14} style={{ color: 'var(--accent-purple)' }} />
            <span>Inspect Employee:</span>
          </div>

          <div ref={employeeDropdownRef} style={{ position: 'relative', width: 340, maxWidth: '100%' }}>
            {/* Dropdown Button */}
            <button
              type="button"
              onClick={() => {
                setIsEmployeeDropdownOpen(prev => !prev);
                setEmployeeSearchQuery('');
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '7px 12px',
                borderRadius: 8,
                background: selectedEmployeeId === 'all' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(139, 92, 246, 0.14)',
                border: `1px solid ${selectedEmployeeId === 'all' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(139, 92, 246, 0.38)'}`,
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                {selectedEmployeeId === 'all' ? (
                  <div style={{
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    background: 'rgba(99, 102, 241, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    flexShrink: 0
                  }}>
                    👥
                  </div>
                ) : (
                  <img
                    src={targetEmployee?.avatar}
                    alt={targetEmployee?.name}
                    style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                )}
                <span style={{ 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis',
                  color: selectedEmployeeId === 'all' ? '#ffffff' : '#e0e7ff'
                }}>
                  {selectedEmployeeId === 'all' ? 'All Employees' : targetEmployee?.name}
                </span>
                <span style={{
                  fontSize: '0.74rem',
                  color: 'var(--text-dim)',
                  fontWeight: 500,
                  flexShrink: 0
                }}>
                  {selectedEmployeeId === 'all' 
                    ? `(${items.reduce((acc, curr) => acc + (curr.totalVotes || 0), 0)} submissions)` 
                    : `(${items.filter(i => !!i.votes?.[selectedEmployeeId]).length}/${totalItems})`}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {selectedEmployeeId !== 'all' && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEmployeeId('all');
                    }}
                    title="Reset to All Employees"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.12)',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <X size={11} />
                  </span>
                )}
                <ChevronDown 
                  size={14} 
                  style={{ 
                    color: 'var(--text-muted)', 
                    transition: 'transform 0.2s ease', 
                    transform: isEmployeeDropdownOpen ? 'rotate(180deg)' : 'none' 
                  }} 
                />
              </div>
            </button>

            {/* Dropdown Popover */}
            {isEmployeeDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                width: '100%',
                minWidth: 320,
                background: '#161922',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 10,
                boxShadow: '0 16px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06)',
                padding: '8px',
                zIndex: 100,
                backdropFilter: 'blur(20px)'
              }}>
                {/* Search Bar */}
                <div style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 6
                }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, color: 'var(--text-dim)', pointerEvents: 'none' }} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={employeeSearchQuery}
                    onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                    placeholder="Search employees..."
                    style={{
                      width: '100%',
                      padding: '6px 28px 6px 30px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 6,
                      color: '#ffffff',
                      fontSize: '0.78rem',
                      outline: 'none'
                    }}
                  />
                  {employeeSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setEmployeeSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: 8,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        padding: 2
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Items List */}
                <div style={{
                  maxHeight: 220,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}>
                  {/* Option: All Employees */}
                  {(!employeeSearchQuery.trim() || 'all employees'.includes(employeeSearchQuery.toLowerCase())) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmployeeId('all');
                        setIsEmployeeDropdownOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 9px',
                        borderRadius: 6,
                        background: selectedEmployeeId === 'all' ? 'rgba(99, 102, 241, 0.16)' : 'transparent',
                        border: 'none',
                        color: selectedEmployeeId === 'all' ? '#ffffff' : 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '0.8rem',
                        transition: 'background 0.12s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedEmployeeId !== 'all') e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        if (selectedEmployeeId !== 'all') e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.85rem' }}>👥</span>
                        <span style={{ fontWeight: 600 }}>All Employees</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                          {items.reduce((acc, curr) => acc + (curr.totalVotes || 0), 0)} submissions
                        </span>
                        {selectedEmployeeId === 'all' && <Check size={13} style={{ color: 'var(--accent-cyan)' }} />}
                      </div>
                    </button>
                  )}

                  {allEmployees
                    .filter(emp => !employeeSearchQuery.trim() || (emp.name || '').toLowerCase().includes(employeeSearchQuery.toLowerCase().trim()))
                    .map(emp => {
                      const empCount = items.filter(i => !!i.votes?.[emp.id]).length;
                      const isSelected = selectedEmployeeId === emp.id;
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                            setSelectedEmployeeId(emp.id);
                            setIsEmployeeDropdownOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '7px 9px',
                            borderRadius: 6,
                            background: isSelected ? 'rgba(139, 92, 246, 0.16)' : 'transparent',
                            border: 'none',
                            color: isSelected ? '#ffffff' : 'var(--text-primary)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.8rem',
                            transition: 'background 0.12s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <img
                              src={emp.avatar}
                              alt={emp.name}
                              style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                            />
                            <span style={{ 
                              fontWeight: isSelected ? 600 : 500,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {emp.name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <span style={{ 
                              fontSize: '0.72rem', 
                              color: empCount === totalItems && totalItems > 0 ? 'var(--accent-emerald)' : 'var(--text-dim)',
                              fontWeight: 500
                            }}>
                              {empCount}/{totalItems}
                            </span>
                            {isSelected && <Check size={13} style={{ color: 'var(--accent-purple)' }} />}
                          </div>
                        </button>
                      );
                    })}

                  {allEmployees.filter(emp => !employeeSearchQuery.trim() || (emp.name || '').toLowerCase().includes(employeeSearchQuery.toLowerCase().trim())).length === 0 && employeeSearchQuery && (
                    <div style={{ padding: '12px 10px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.76rem' }}>
                      No employees found matching "{employeeSearchQuery}"
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overview Metric Cards (Clean & Compact) */}
      <div className="review-metrics-grid">
        <div className="metric-glass-card">
          <div className="metric-label">Published Posts</div>
          <div className="metric-value">{totalItems}</div>
          <div className="metric-sub">Active review & survey posts</div>
        </div>

        <div className="metric-glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <div className="metric-label">{employeeCardLabel}</div>
            {isAdmin && !targetUserId && mixerTotalEvaluations > 0 && (
              <div style={{
                display: 'inline-flex',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 7,
                padding: '2px',
                gap: 2
              }}>
                <button
                  type="button"
                  onClick={() => setAdminDataFilter('all')}
                  style={{
                    background: adminDataFilter === 'all' ? 'rgba(99, 102, 241, 0.4)' : 'transparent',
                    color: adminDataFilter === 'all' ? '#fff' : 'var(--text-dim)',
                    border: 'none',
                    borderRadius: 5,
                    padding: '2px 7px',
                    fontSize: '0.67rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="View combined submissions (Real + Mixer)"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setAdminDataFilter('real')}
                  style={{
                    background: adminDataFilter === 'real' ? 'rgba(16, 185, 129, 0.35)' : 'transparent',
                    color: adminDataFilter === 'real' ? '#34d399' : 'var(--text-dim)',
                    border: 'none',
                    borderRadius: 5,
                    padding: '2px 7px',
                    fontSize: '0.67rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="View only submissions from real people"
                >
                  👤 Real
                </button>
                <button
                  type="button"
                  onClick={() => setAdminDataFilter('mixer')}
                  style={{
                    background: adminDataFilter === 'mixer' ? 'rgba(139, 92, 246, 0.35)' : 'transparent',
                    color: adminDataFilter === 'mixer' ? '#c084fc' : 'var(--text-dim)',
                    border: 'none',
                    borderRadius: 5,
                    padding: '2px 7px',
                    fontSize: '0.67rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="View only mixer simulated submissions"
                >
                  ⚡ Mixer
                </button>
              </div>
            )}
          </div>
          <div className="metric-value">{responsesCount}</div>
          <div className="metric-sub">{responsesSubtitle}</div>

          {/* Real vs Mixer pill breakdown */}
          {isAdmin && !targetUserId && mixerTotalEvaluations > 0 && adminDataFilter === 'all' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                👤 <strong>{realTotalEvaluations}</strong> from Real People
              </span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>•</span>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#c084fc',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                ⚡ <strong>{mixerTotalEvaluations}</strong> from Mixer
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Filter Tabs */}
      <div className="review-filters-bar">
        <div className="review-filters-track">
          <button
            type="button"
            className={`tab-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            <span>All Items</span>
            <span className="tab-badge">{uniqueItems.length}</span>
          </button>
          
          {!isAdmin ? (
            <React.Fragment key="emp-tabs">
              <button
                type="button"
                className={`tab-btn ${filter === 'pending' ? 'active' : ''}`}
                onClick={() => setFilter('pending')}
                style={{ position: 'relative' }}
              >
                <span>🔔 Action Needed</span>
                <span 
                  className="tab-badge"
                  style={{
                    background: uniqueItems.filter(i => {
                      const v = i.votes?.[user?.id];
                      return !v || (!v.vote && (!v.answers || Object.keys(v.answers).length === 0));
                    }).length > 0 ? 'rgba(99, 102, 241, 0.4)' : undefined,
                    color: uniqueItems.filter(i => {
                      const v = i.votes?.[user?.id];
                      return !v || (!v.vote && (!v.answers || Object.keys(v.answers).length === 0));
                    }).length > 0 ? '#a5b4fc' : undefined
                  }}
                >
                  {uniqueItems.filter(i => {
                    const v = i.votes?.[user?.id];
                    return !v || (!v.vote && (!v.answers || Object.keys(v.answers).length === 0));
                  }).length}
                </span>
                {uniqueItems.filter(i => {
                  const v = i.votes?.[user?.id];
                  return !v || (!v.vote && (!v.answers || Object.keys(v.answers).length === 0));
                }).length > 0 && (
                  <span className="survey-pulse-dot" style={{ position: 'absolute', top: 5, right: 5 }} />
                )}
              </button>

              <button
                type="button"
                className={`tab-btn ${filter === 'completed' ? 'active' : ''}`}
                onClick={() => setFilter('completed')}
              >
                <span>✓ Completed</span>
                <span className="tab-badge">
                  {uniqueItems.filter(i => {
                    const v = i.votes?.[user?.id];
                    return Boolean(v && (v.vote || (v.answers && Object.keys(v.answers).length > 0)));
                  }).length}
                </span>
              </button>
            </React.Fragment>
          ) : (
            <React.Fragment key="admin-tabs">
              <button
                type="button"
                className={`tab-btn ${filter === 'good' ? 'active' : ''}`}
                onClick={() => setFilter('good')}
              >
                <span>👍 Approved</span>
                <span className="tab-badge">{uniqueItems.filter(i => i.goodCount > i.badCount).length}</span>
              </button>
            </React.Fragment>
          )}

          {/* Important Tab: for employees and admin to view & manage critical instructions */}
          {(() => {
            const directiveCount = isAdmin ? instructions.length : unreadInstructionsCount;
            const hasDirectives = directiveCount > 0;

            return (
              <button
                type="button"
                className={`tab-btn ${filter === 'important' ? 'active' : ''}`}
                onClick={() => setFilter('important')}
                style={{
                  background: filter === 'important' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : undefined,
                  color: filter === 'important' ? '#ffffff' : undefined,
                  borderColor: filter === 'important' ? 'rgba(245, 158, 11, 0.6)' : undefined,
                  boxShadow: filter === 'important' ? '0 2px 10px rgba(245, 158, 11, 0.35)' : undefined
                }}
              >
                <span>📌 Important</span>
                {hasDirectives && (
                  <span className="tab-badge glowing-directive-badge">
                    {directiveCount}
                  </span>
                )}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Content Stream (Important Instructions OR Review Items Grid) */}
      {filter === 'important' ? (
        <ImportantInstructionsView
          instructions={instructions}
          loading={instructionsLoading}
          onAcknowledge={handleAcknowledgeInstruction}
          onEdit={handleOpenEditInstruction}
          onDelete={handleDeleteInstruction}
          onOpenCreate={handleOpenCreateInstruction}
          isAdmin={isAdmin}
          currentUserId={user?.id}
          allEmployeesCount={allEmployees.length}
        />
      ) : (
        <div className="review-items-container">
        {loading ? (
          <div className="empty-list" style={{ padding: '70px 20px', textAlign: 'center' }}>
            <div className="circular-loader-ring" style={{ margin: '0 auto 16px auto' }} />
            <h3 style={{ color: '#fff', fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Loading...</h3>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-list" style={{ padding: '60px 20px' }}>
            <Sparkles size={36} color="#8b5cf6" />
            <h3 style={{ color: '#fff', fontSize: '1.15rem', marginTop: 10 }}>No items</h3>
          </div>
        ) : (
          <div className="review-cards-grid">
            {displayItems.map(item => {
              const isEmployeePerspective = !isAdmin || Boolean(targetUserId && targetUserId !== user?.id);
              const effectiveReviewerId = targetUserId || user?.id;
              const myVoteData = item.votes?.[effectiveReviewerId];
              const myVote = myVoteData?.vote;
              const hasAnsweredQuestionnaire = Boolean(myVoteData?.answers && Object.keys(myVoteData.answers).length > 0);
              const isCompleted = Boolean(myVoteData && (myVoteData.vote || hasAnsweredQuestionnaire));
              const isNewSurvey = isEmployeePerspective && !isCompleted;
              const isCompletedSurvey = isEmployeePerspective && isCompleted;
              const questions = item.questions || [];
              const questionCount = questions.length;
              const hasVerdictQuestion = questions.some(q => q.type === 'verdict');
              const singleYesNoQ = questionCount === 1 && (questions[0].type === 'yes_no' || questions[0].type === 'two_options' || questions[0].type === 'boolean') ? questions[0] : null;
              const hasYesNoQuestion = questions.some(q => q.type === 'yes_no' || q.type === 'two_options' || q.type === 'boolean');
              const isPureVerdict = !questionCount || hasVerdictQuestion;

              // Dynamic Verdict Option Labels (defaults to Good / Bad if unconfigured or legacy, or Up / Down / custom)
              const verdictQ = questions.find(q => q.type === 'verdict');
              const verdictOpt1 = verdictQ?.options?.[0] || 'Good';
              const verdictOpt2 = verdictQ?.options?.[1] || 'Bad';

              // If it's a Yes/No question, get its stats and the current user's answer
              const primaryQ = singleYesNoQ || questions.find(q => q.type === 'yes_no' || q.type === 'two_options' || q.type === 'boolean') || (questionCount > 0 ? questions[0] : null);
              const qStat = primaryQ ? item.questionStats?.find(s => s.id === primaryQ.id) : null;
              const opt1Count = qStat?.opt1Count || qStat?.yesCount || 0;
              const opt2Count = qStat?.opt2Count || qStat?.noCount || 0;
              const totalAnswers = opt1Count + opt2Count;
              const opt1Pct = totalAnswers > 0 ? Math.round((opt1Count / totalAnswers) * 100) : 0;
              const opt2Pct = totalAnswers > 0 ? 100 - opt1Pct : 0;
              const opt1Label = primaryQ?.options?.[0] || 'Yes';
              const opt2Label = primaryQ?.options?.[1] || 'No';
              const hasAnswerKey = !!qStat?.correctAnswer;
              const myAnswerToPrimary = primaryQ ? myVoteData?.answers?.[primaryQ.id] : null;
              const isYesSelected = myAnswerToPrimary === 'Yes' || myAnswerToPrimary === 'yes' || myAnswerToPrimary === true || myAnswerToPrimary === opt1Label;
              const isNoSelected = myAnswerToPrimary === 'No' || myAnswerToPrimary === 'no' || myAnswerToPrimary === false || myAnswerToPrimary === opt2Label;
              const isActualYesNoPrimary = (singleYesNoQ || primaryQ)?.type === 'yes_no' || 
                (opt1Label.toLowerCase() === 'yes' && opt2Label.toLowerCase() === 'no');

              const inspectedEmployeeVote = (isAdmin && targetUserId && targetUserId !== user?.id)
                ? (item.votes?.[targetUserId] || false)
                : null;

              const realVotesCount = item.realStats?.totalVotes ?? Object.keys(item.votes || {}).length;
              const realGoodCount = item.realStats?.goodCount ?? Object.values(item.votes || {}).filter(v => (v.vote || '').toLowerCase() === 'good').length;
              const realBadCount = item.realStats?.badCount ?? Object.values(item.votes || {}).filter(v => (v.vote || '').toLowerCase() === 'bad').length;
              const mixerTotal = item.realStats?.simTotal ?? (item.dataMixer?.enabled ? ((Number(item.dataMixer.goodCount) || 0) + (Number(item.dataMixer.badCount) || 0)) : 0);
              const mixerGood = item.realStats?.simGood ?? (item.dataMixer?.enabled ? (Number(item.dataMixer.goodCount) || 0) : 0);
              const mixerBad = item.realStats?.simBad ?? (item.dataMixer?.enabled ? (Number(item.dataMixer.badCount) || 0) : 0);
              const isMixerActive = Boolean(item.dataMixer?.enabled || mixerTotal > 0);

              let displayGood = item.goodCount;
              let displayBad = item.badCount;
              let displayTotal = item.totalVotes;
              let displayGoodPct = item.goodPercentage;

              if (isAdmin && !targetUserId) {
                if (adminDataFilter === 'real') {
                  displayGood = realGoodCount;
                  displayBad = realBadCount;
                  displayTotal = realVotesCount;
                  displayGoodPct = displayTotal > 0 ? Math.round((displayGood / displayTotal) * 100) : 0;
                } else if (adminDataFilter === 'mixer') {
                  displayGood = mixerGood;
                  displayBad = mixerBad;
                  displayTotal = mixerTotal;
                  displayGoodPct = displayTotal > 0 ? Math.round((displayGood / displayTotal) * 100) : 0;
                }
              }

              return (
                <div key={item.id} className={`review-card ${isNewSurvey ? 'is-new-survey' : (isCompletedSurvey ? 'is-completed' : '')}`}>
                  {/* Card Banner (Image or Questionnaire Survey Banner) */}
                  {item.imageUrl ? (
                    <div className="review-image-wrapper">
                      <img 
                        src={item.imageUrl} 
                        alt={item.title} 
                        className="review-main-image"
                        onClick={() => setActiveImagePreview({ url: item.imageUrl, title: item.title })}
                      />
                      <button
                        type="button"
                        className="review-expand-btn"
                        onClick={() => setActiveImagePreview({ url: item.imageUrl, title: item.title })}
                        title="Inspect Full Size"
                      >
                        <Maximize2 size={15} />
                      </button>

                      {/* Overall Status Badge */}
                      <div className="review-status-tag">
                        {!isPureVerdict && (singleYesNoQ || hasYesNoQuestion) ? (
                          totalAnswers === 0 ? (
                            <span className="tag-pill pending">⏳ 0 Votes</span>
                          ) : (
                            <span className="tag-pill" style={{
                              background: isActualYesNoPrimary ? 'rgba(16, 185, 129, 0.14)' : 'rgba(99, 102, 241, 0.14)',
                              border: `1px solid ${isActualYesNoPrimary ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
                              color: isActualYesNoPrimary ? '#34d399' : '#c7d2fe',
                              fontWeight: 700,
                              fontSize: '0.74rem'
                            }}>
                              {isActualYesNoPrimary ? (
                                <>✓ {opt1Count} {opt1Label} • <span style={{ color: '#f87171' }}>✕ {opt2Count} {opt2Label}</span></>
                              ) : (
                                <>{opt1Count} {opt1Label} • <span style={{ color: 'var(--accent-cyan)' }}>{opt2Count} {opt2Label}</span></>
                              )}
                            </span>
                          )
                        ) : displayTotal === 0 ? (
                          <span className="tag-pill pending">⏳ 0 Votes</span>
                        ) : displayGoodPct >= 60 ? (
                          <span className="tag-pill good">👍 {displayGoodPct}% {verdictOpt1}</span>
                        ) : (
                          <span className="tag-pill bad">👎 {100 - displayGoodPct}% {verdictOpt2}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      height: 100,
                      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.22) 0%, rgba(168, 85, 247, 0.16) 100%)',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      position: 'relative'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: 'rgba(99, 102, 241, 0.25)',
                          border: '1px solid rgba(99, 102, 241, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <ClipboardList size={20} color="#60a5fa" />
                        </div>
                        <div>
                          <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: 0.5, color: '#93c5fd', fontWeight: 700 }}>
                            {!isPureVerdict && (singleYesNoQ || hasYesNoQuestion)
                              ? (hasAnswerKey ? '🎯 Yes / No Quiz' : '❓ Yes / No Survey')
                              : 'Text-Based Survey'}
                          </span>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {singleYesNoQ 
                              ? '1 Yes / No Question' 
                              : questionCount > 0 
                                ? `${questionCount} Questionnaire Questions` 
                                : 'General Evaluation Poll'}
                          </div>
                        </div>
                      </div>

                      <div className="review-status-tag" style={{ position: 'static' }}>
                        {!isPureVerdict && (singleYesNoQ || hasYesNoQuestion) ? (
                          totalAnswers === 0 ? (
                            <span className="tag-pill pending">⏳ 0 Votes</span>
                          ) : (
                            <span className="tag-pill" style={{
                              background: isActualYesNoPrimary ? 'rgba(16, 185, 129, 0.14)' : 'rgba(99, 102, 241, 0.14)',
                              border: `1px solid ${isActualYesNoPrimary ? 'rgba(16, 185, 129, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
                              color: isActualYesNoPrimary ? '#34d399' : '#c7d2fe',
                              fontWeight: 700,
                              fontSize: '0.74rem'
                            }}>
                              {isActualYesNoPrimary ? (
                                <>✓ {opt1Count} {opt1Label} • <span style={{ color: '#f87171' }}>✕ {opt2Count} {opt2Label}</span></>
                              ) : (
                                <>{opt1Count} {opt1Label} • <span style={{ color: 'var(--accent-cyan)' }}>{opt2Count} {opt2Label}</span></>
                              )}
                            </span>
                          )
                        ) : !isPureVerdict ? (
                          (() => {
                            const textQ = questions.find(q => q.type === 'text' || q.type === 'type_answer');
                            const typedCount = textQ ? (item.questionStats?.find(s => s.id === textQ.id)?.responses?.length || Object.values(item.votes || {}).filter(v => v.answers?.[textQ.id]).length) : Object.keys(item.votes || {}).length;
                            return typedCount === 0 ? (
                              <span className="tag-pill pending">⏳ 0 Responses</span>
                            ) : (
                              <span className="tag-pill" style={{ background: 'rgba(99, 102, 241, 0.18)', color: '#c7d2fe', border: '1px solid rgba(99, 102, 241, 0.35)' }}>
                                ✍️ {typedCount} {typedCount === 1 ? 'Response' : 'Responses'}
                              </span>
                            );
                          })()
                        ) : displayTotal === 0 ? (
                          <span className="tag-pill pending">⏳ 0 Votes</span>
                        ) : displayGoodPct >= 60 ? (
                          <span className="tag-pill good">👍 {displayGoodPct}% {verdictOpt1}</span>
                        ) : (
                          <span className="tag-pill bad">👎 {100 - displayGoodPct}% {verdictOpt2}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Card Details */}
                  <div className="review-card-body">
                    {/* Top Row: Meta + Delete */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Clock size={12} />
                          <span>Shared {formatRelativeTime(item.createdAt)}</span>
                        </div>

                        {/* Employee-only New Survey badge */}
                        {isNewSurvey && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: 'rgba(99, 102, 241, 0.22)',
                            border: '1px solid rgba(99, 102, 241, 0.5)',
                            color: '#c7d2fe',
                            fontSize: '0.68rem',
                            fontWeight: 700
                          }}>
                            <span className="survey-pulse-dot" style={{ width: 5, height: 5 }} />
                            New Survey
                          </span>
                        )}

                        {/* Employee-only Completed badge */}
                        {isCompletedSurvey && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: 'rgba(16, 185, 129, 0.12)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            color: '#34d399',
                            fontSize: '0.68rem',
                            fontWeight: 600
                          }}>
                            <CheckCircle2 size={11} color="#34d399" />
                            Completed
                          </span>
                        )}

                        {Array.isArray(item.targetUserIds) && item.targetUserIds.length > 0 ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              color: '#818cf8',
                              background: 'rgba(99, 102, 241, 0.12)',
                              border: '1px solid rgba(99, 102, 241, 0.28)',
                              padding: '2px 7px',
                              borderRadius: '10px'
                            }}
                            title={
                              item.targetRecipients && item.targetRecipients.length > 0
                                ? `Targeted to: ${item.targetRecipients.map(r => r.displayName || r.username).join(', ')}`
                                : `Targeted to ${item.targetUserIds.length} person(s)`
                            }
                          >
                            🎯 Targeted ({item.targetRecipients?.length || item.targetUserIds.length})
                          </span>
                        ) : (
                          isAdmin && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.7rem',
                                color: 'var(--text-dim)',
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                padding: '2px 7px',
                                borderRadius: '10px'
                              }}
                              title="Broadcasted to all employees"
                            >
                              👥 All
                            </span>
                          )
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {inspectedEmployeeVote !== null && (
                          inspectedEmployeeVote ? (
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: (!isPureVerdict && myAnswerToPrimary) 
                                ? '#34d399' 
                                : (inspectedEmployeeVote.vote === 'good' ? 'var(--accent-emerald)' : '#f87171'),
                              background: (!isPureVerdict && myAnswerToPrimary) 
                                ? 'rgba(16, 185, 129, 0.12)' 
                                : (inspectedEmployeeVote.vote === 'good' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'),
                              padding: '2px 8px',
                              borderRadius: 6,
                              border: '1px solid rgba(16, 185, 129, 0.25)'
                            }}>
                              {targetEmployee?.name}: {(!isPureVerdict && myAnswerToPrimary) ? myAnswerToPrimary : (inspectedEmployeeVote.vote === 'good' ? `👍 ${verdictOpt1}` : `👎 ${verdictOpt2}`)}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '0.72rem',
                              color: 'var(--text-dim)',
                              background: 'rgba(255, 255, 255, 0.04)',
                              padding: '2px 8px',
                              borderRadius: 6,
                              border: '1px solid rgba(255, 255, 255, 0.08)'
                            }}>
                              {targetEmployee?.name}: ⏳ Pending
                            </span>
                          )
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: 26, height: 26, border: 'none', background: 'transparent', color: '#f87171', opacity: 0.8 }}
                            onClick={() => handleDelete(item.id)}
                            title="Delete Item"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <h3 className="review-card-title">{item.title}</h3>
                    {item.description && (
                      <p className="review-card-desc" style={{ marginBottom: 12 }}>
                        {item.description}
                      </p>
                    )}

                    {/* Progress track */}
                    {!isPureVerdict && (singleYesNoQ || hasYesNoQuestion) ? (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', marginBottom: 5 }}>
                          <span style={{ color: isActualYesNoPrimary ? '#34d399' : 'var(--accent-cyan)', fontWeight: 700 }}>
                            {isActualYesNoPrimary ? '✓ ' : ''}{opt1Count} {opt1Label}
                          </span>
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
                              {totalAnswers} {totalAnswers === 1 ? 'Vote' : 'Votes'} ({opt1Pct}% {opt1Label})
                            </span>
                            {hasAnswerKey && isAdmin && (
                              <span style={{
                                color: '#fbbf24',
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                background: 'rgba(245, 158, 11, 0.15)',
                                padding: '1px 5px',
                                borderRadius: 4,
                                border: '1px solid rgba(245, 158, 11, 0.25)'
                              }}>
                                Key: {qStat.correctAnswer}
                              </span>
                            )}
                          </span>
                          <span style={{ color: '#f87171', fontWeight: 700 }}>
                            ✕ {opt2Count} {opt2Label}
                          </span>
                        </div>

                        <div className="progress-track" style={{ height: 6 }}>
                          <div 
                            className="progress-fill-good" 
                            style={{ width: `${opt1Pct}%` }} 
                          />
                          <div 
                            className="progress-fill-bad" 
                            style={{ width: `${opt2Pct}%` }} 
                          />
                        </div>

                        {/* Admin Real vs Mixer Split info tag */}
                        {isAdmin && isMixerActive && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.68rem',
                            marginTop: 6,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.07)'
                          }}>
                            <span style={{ color: '#60a5fa', fontWeight: 600 }}>
                              👤 <strong>{realVotesCount}</strong> Real People
                            </span>
                            <span style={{ color: '#c084fc', fontWeight: 600 }}>
                              ⚡ <strong>{mixerTotal}</strong> Mixer
                            </span>
                          </div>
                        )}

                        {isAdmin && !isMixerActive && realVotesCount > 0 && (
                          <div style={{
                            fontSize: '0.68rem',
                            marginTop: 5,
                            color: '#34d399',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            <span>👤 100% Real People ({realVotesCount} {realVotesCount === 1 ? 'response' : 'responses'})</span>
                          </div>
                        )}
                      </div>
                    ) : isPureVerdict ? (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 5 }}>
                          <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>
                            👍 {displayGood} {verdictOpt1}
                          </span>
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                            {displayTotal} {displayTotal === 1 ? 'vote' : 'votes'}
                          </span>
                          <span style={{ color: '#f87171', fontWeight: 700 }}>
                            👎 {displayBad} {verdictOpt2}
                          </span>
                        </div>

                        <div className="progress-track" style={{ height: 6 }}>
                          <div 
                            className="progress-fill-good" 
                            style={{ width: `${displayGoodPct}%` }} 
                          />
                          <div 
                            className="progress-fill-bad" 
                            style={{ width: `${displayTotal > 0 ? 100 - displayGoodPct : 0}%` }} 
                          />
                        </div>

                        {/* Admin Real vs Mixer Split info tag */}
                        {isAdmin && isMixerActive && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '0.68rem',
                            marginTop: 6,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.07)'
                          }}>
                            <span style={{ color: '#60a5fa', fontWeight: 600 }}>
                              👤 <strong>{realVotesCount}</strong> Real ({realGoodCount} {verdictOpt1} / {realBadCount} {verdictOpt2})
                            </span>
                            <span style={{ color: '#c084fc', fontWeight: 600 }}>
                              ⚡ <strong>{mixerTotal}</strong> Mixer
                            </span>
                          </div>
                        )}

                        {isAdmin && !isMixerActive && realVotesCount > 0 && (
                          <div style={{
                            fontSize: '0.68rem',
                            marginTop: 5,
                            color: '#34d399',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            <span>👤 100% Real People ({realVotesCount} {realVotesCount === 1 ? 'response' : 'responses'})</span>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {/* Clean Action Section */}
                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      {/* 1. If this is a Single Yes/No Question and NOT a verdict item, show 1-click Yes/No buttons */}
                      {singleYesNoQ && !hasVerdictQuestion ? (
                        <>
                          {(() => {
                            const hasAnsweredYesNo = (isYesSelected || isNoSelected);
                            const isActualYesNo = singleYesNoQ?.type === 'yes_no' || 
                              (opt1Label.toLowerCase() === 'yes' && opt2Label.toLowerCase() === 'no');
                            return (
                              <>
                                <div style={{ display: 'flex', gap: 10 }}>
                                  <button
                                    type="button"
                                    className={`vote-btn ${isActualYesNo ? 'good' : ''} ${isYesSelected ? 'selected' : ''}`}
                                    onClick={() => !hasAnsweredYesNo && handleQuickYesNo(item.id, singleYesNoQ.id, opt1Label)}
                                    disabled={votingId === item.id || hasAnsweredYesNo}
                                    style={{
                                      padding: '9px 12px',
                                      fontSize: '0.84rem',
                                      background: isYesSelected 
                                        ? (isActualYesNo ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'var(--primary-gradient)') 
                                        : 'rgba(255, 255, 255, 0.04)',
                                      borderColor: isYesSelected 
                                        ? (isActualYesNo ? '#10b981' : 'rgba(99, 102, 241, 0.5)') 
                                        : 'rgba(255, 255, 255, 0.1)',
                                      color: isYesSelected ? '#fff' : (isActualYesNo ? '#34d399' : 'var(--text-muted)'),
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: 6,
                                      cursor: hasAnsweredYesNo ? 'default' : 'pointer',
                                      opacity: hasAnsweredYesNo && !isYesSelected ? 0.4 : 1
                                    }}
                                  >
                                    <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                                      {isActualYesNo ? '✓' : (isYesSelected ? '✓' : '•')}
                                    </span>
                                    <span>{opt1Label}</span>
                                  </button>

                                  <button
                                    type="button"
                                    className={`vote-btn ${isActualYesNo ? 'bad' : ''} ${isNoSelected ? 'selected' : ''}`}
                                    onClick={() => !hasAnsweredYesNo && handleQuickYesNo(item.id, singleYesNoQ.id, opt2Label)}
                                    disabled={votingId === item.id || hasAnsweredYesNo}
                                    style={{
                                      padding: '9px 12px',
                                      fontSize: '0.84rem',
                                      background: isNoSelected 
                                        ? (isActualYesNo ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'var(--primary-gradient)') 
                                        : 'rgba(255, 255, 255, 0.04)',
                                      borderColor: isNoSelected 
                                        ? (isActualYesNo ? '#ef4444' : 'rgba(99, 102, 241, 0.5)') 
                                        : 'rgba(255, 255, 255, 0.1)',
                                      color: isNoSelected ? '#fff' : (isActualYesNo ? '#f87171' : 'var(--text-muted)'),
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: 6,
                                      cursor: hasAnsweredYesNo ? 'default' : 'pointer',
                                      opacity: hasAnsweredYesNo && !isNoSelected ? 0.4 : 1
                                    }}
                                  >
                                    <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>
                                      {isActualYesNo ? '✕' : (isNoSelected ? '✓' : '•')}
                                    </span>
                                    <span>{opt2Label}</span>
                                  </button>
                                </div>
                              </>
                            );
                          })()}

                          {/* Right / Wrong evaluation indicator if answer key is set and user responded */}
                          {hasAnswerKey && (myAnswerToPrimary !== undefined && myAnswerToPrimary !== null && myAnswerToPrimary !== '') && (
                            (() => {
                              const normVal = String(myAnswerToPrimary).toLowerCase();
                              const normKey = String(qStat.correctAnswer).toLowerCase();
                              const isRight = (normKey === 'yes' && (normVal === 'yes' || myAnswerToPrimary === true)) ||
                                              (normKey === 'no' && (normVal === 'no' || myAnswerToPrimary === false)) ||
                                              normVal === normKey;
                              return (
                                <div style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  textAlign: 'center',
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  background: isRight ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  border: `1px solid ${isRight ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                  color: isRight ? '#34d399' : '#f87171'
                                }}>
                                  {isRight ? `✅ Correct! Your answer '${myAnswerToPrimary}' matches key` : `❌ Wrong! Official right answer is '${qStat.correctAnswer}'`}
                                </div>
                              );
                            })()
                          )}
                        </>
                      ) : isPureVerdict ? (
                        /* 2. Pure Verdict or Item with Good/Bad or Up/Down Question */
                        (() => {
                          const opt1Label = verdictOpt1;
                          const opt2Label = verdictOpt2;
                          const hasVotedVerdict = (myVote === 'good' || myVote === 'bad');
                          const verdictAnswerKey = verdictQ?.correctAnswer || qStat?.correctAnswer || null;

                          // Evaluate Right / Wrong if answer key is set
                          let isRight = null;
                          let myAnswerLabel = null;
                          if (verdictAnswerKey && hasVotedVerdict) {
                            myAnswerLabel = myVote === 'good' ? opt1Label : opt2Label;
                            const normVal = String(myAnswerLabel).trim().toLowerCase();
                            const normVote = String(myVote).trim().toLowerCase();
                            const normKey = String(verdictAnswerKey).trim().toLowerCase();

                            isRight = (normKey === normVal) ||
                                      (normKey === 'good' && normVote === 'good') ||
                                      (normKey === 'up' && normVote === 'good') ||
                                      (normKey === 'bad' && normVote === 'bad') ||
                                      (normKey === 'down' && normVote === 'bad') ||
                                      (normKey === String(opt1Label).trim().toLowerCase() && normVote === 'good') ||
                                      (normKey === String(opt2Label).trim().toLowerCase() && normVote === 'bad');
                          }

                          return (
                            <>
                              <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                  type="button"
                                  className={`vote-btn good ${myVote === 'good' ? 'selected' : ''}`}
                                  onClick={() => !hasVotedVerdict && handleQuickVote(item.id, 'good')}
                                  disabled={votingId === item.id || hasVotedVerdict}
                                  style={{
                                    padding: '9px 12px',
                                    fontSize: '0.84rem',
                                    cursor: hasVotedVerdict ? 'default' : 'pointer',
                                    opacity: hasVotedVerdict && myVote !== 'good' ? 0.4 : 1
                                  }}
                                >
                                  <ThumbsUp size={15} />
                                  <span>{opt1Label}</span>
                                </button>

                                <button
                                  type="button"
                                  className={`vote-btn bad ${myVote === 'bad' ? 'selected' : ''}`}
                                  onClick={() => !hasVotedVerdict && handleQuickVote(item.id, 'bad')}
                                  disabled={votingId === item.id || hasVotedVerdict}
                                  style={{
                                    padding: '9px 12px',
                                    fontSize: '0.84rem',
                                    cursor: hasVotedVerdict ? 'default' : 'pointer',
                                    opacity: hasVotedVerdict && myVote !== 'bad' ? 0.4 : 1
                                  }}
                                >
                                  <ThumbsDown size={15} />
                                  <span>{opt2Label}</span>
                                </button>
                              </div>

                              {/* Right / Wrong evaluation indicator for Verdict questions */}
                              {verdictAnswerKey && hasVotedVerdict && (
                                <div style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  textAlign: 'center',
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  background: isRight ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  border: `1px solid ${isRight ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                  color: isRight ? '#34d399' : '#f87171'
                                }}>
                                  {isRight
                                    ? `✅ Correct! Your answer '${myAnswerLabel}' matches key`
                                    : `❌ Wrong! Official right answer is '${verdictAnswerKey}'`}
                                </div>
                              )}
                            </>
                          );
                        })()
                      ) : null}

                      {/* Questionnaire Trigger (When multiple questions exist or requires modal input) */}
                      {(questionCount > 1 || (questionCount === 1 && (!singleYesNoQ || hasVerdictQuestion))) && (
                        <button
                          type="button"
                          onClick={() => setActiveQuestionnaireItem(item)}
                          style={{
                            background: hasAnsweredQuestionnaire 
                              ? 'rgba(16, 185, 129, 0.12)' 
                              : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            border: hasAnsweredQuestionnaire 
                              ? '1px solid rgba(16, 185, 129, 0.35)' 
                              : 'none',
                            color: hasAnsweredQuestionnaire ? '#34d399' : '#ffffff',
                            boxShadow: hasAnsweredQuestionnaire 
                              ? 'none' 
                              : '0 4px 14px rgba(99, 102, 241, 0.45)',
                            borderRadius: 8,
                            padding: '9px 14px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 7,
                            width: '100%',
                            transition: 'all 0.15s ease'
                          }}
                          title={hasAnsweredQuestionnaire ? "View your submitted response" : "Open and answer the questionnaire"}
                        >
                          {hasAnsweredQuestionnaire ? <CheckCircle2 size={15} /> : <ClipboardList size={15} />}
                          <span>
                            {hasAnsweredQuestionnaire 
                              ? `✓ Questionnaire Completed (${questionCount} Qs)` 
                              : `📋 Answer Questionnaire (${questionCount} Qs) →`}
                          </span>
                        </button>
                      )}

                      {/* Typed answer preview on card for respondent */}
                      {hasAnsweredQuestionnaire && myVoteData?.answers && (() => {
                        const textQ = questions.find(q => q.type === 'text' || q.type === 'type_answer');
                        const myTextVal = textQ ? myVoteData.answers[textQ.id] : null;
                        if (!myTextVal) return null;
                        return (
                          <div style={{
                            padding: '8px 12px',
                            background: 'rgba(99, 102, 241, 0.08)',
                            border: '1px solid rgba(99, 102, 241, 0.22)',
                            borderRadius: 8,
                            fontSize: '0.78rem'
                          }}>
                            <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>Your Typed Answer: </span>
                            <span style={{ color: '#f1f5f9', fontStyle: 'italic' }}>"{myTextVal}"</span>
                          </div>
                        );
                      })()}

                      {/* Admin Management Row: Edit Questionnaire, View Responses & Mix Data */}
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setActiveEditQuestionnaireItem(item)}
                            style={{
                              flex: 1,
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              color: '#93c5fd',
                              borderRadius: 7,
                              padding: '7px 6px',
                              fontSize: '0.73rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                              transition: 'all 0.15s ease'
                            }}
                            title="Configure questionnaire questions, multiple choice, 2-options, and typed answers"
                          >
                            <Settings2 size={13} />
                            <span>{questionCount > 0 ? `Edit Qs (${questionCount})` : '+ Add Qs'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveMixerItem(item)}
                            style={{
                              flex: 1,
                              background: item.dataMixer?.enabled ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                              border: `1px solid ${item.dataMixer?.enabled ? 'rgba(99, 102, 241, 0.45)' : 'rgba(255, 255, 255, 0.12)'}`,
                              color: item.dataMixer?.enabled ? '#a5b4fc' : 'var(--text-secondary)',
                              borderRadius: 7,
                              padding: '7px 6px',
                              fontSize: '0.73rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                              transition: 'all 0.15s ease'
                            }}
                            title="Simulate and mix response counts for this review or survey"
                          >
                            <Sliders size={13} color={item.dripCampaign?.status === 'running' ? '#34d399' : item.dataMixer?.enabled ? '#818cf8' : undefined} />
                            <span>{item.dripCampaign?.status === 'running' ? 'Streaming 🟢' : item.dataMixer?.enabled ? 'Mixed ⚡' : 'Mix Data'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActiveStatsItem(item)}
                            style={{
                              flex: 1,
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              color: 'var(--text-secondary)',
                              borderRadius: 7,
                              padding: '7px 6px',
                              fontSize: '0.73rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                              transition: 'all 0.15s ease'
                            }}
                            title="View questionnaire charts, responses, and employee votes"
                          >
                            <BarChart2 size={13} />
                            <span>Stats ({item.totalVotes || 0})</span>
                          </button>
                        </div>
                      )}

                      {/* Knowledge Base & Learning Guide Button */}
                      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <button
                          type="button"
                          onClick={() => setActiveKnowledgeItem(prev => prev?.id === item.id ? null : item)}
                          style={{
                            background: activeKnowledgeItem?.id === item.id ? 'rgba(139, 92, 246, 0.35)' : 'rgba(139, 92, 246, 0.12)',
                            border: `1px solid ${activeKnowledgeItem?.id === item.id ? '#a855f7' : 'rgba(139, 92, 246, 0.28)'}`,
                            color: activeKnowledgeItem?.id === item.id ? '#ffffff' : '#c084fc',
                            boxShadow: activeKnowledgeItem?.id === item.id ? '0 0 12px rgba(168, 85, 247, 0.35)' : 'none',
                            borderRadius: 8,
                            padding: '8px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            width: '100%',
                            transition: 'all 0.15s ease'
                          }}
                          title={activeKnowledgeItem?.id === item.id ? "Close Knowledge Base Guide" : "Open Decision Guide & Things to Learn"}
                        >
                          <BookOpen size={14} />
                          <span>Knowledge Base {activeKnowledgeItem?.id === item.id ? '• Open' : ''}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Lazy-Loaded Modals & Drawers */}
      <Suspense fallback={null}>
        {/* 1. Admin Image & Survey Upload Modal */}
        {isAdmin && (
          <UploadReviewModal
            isOpen={isUploadOpen}
            onClose={() => setIsUploadOpen(false)}
            onItemCreated={(newItem) => {
              setItems(prev => {
                if (prev.some(item => item.id === newItem.id)) {
                  return prev.map(item => item.id === newItem.id ? newItem : item);
                }
                return [newItem, ...prev];
              });
            }}
          />
        )}

        {/* 2. Knowledge Base & Decision Guide Drawer (Slides out at the side) */}
        {activeKnowledgeItem && (
          <KnowledgeBaseDrawer
            isOpen={!!activeKnowledgeItem}
            item={activeKnowledgeItem}
            onClose={() => setActiveKnowledgeItem(null)}
            onItemUpdated={(updatedItem) => {
              setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
              setActiveKnowledgeItem(updatedItem);
            }}
          />
        )}

        {/* 3. Clean Questionnaire Modal for Employees */}
        {activeQuestionnaireItem && (
          <QuestionnaireModal
            isOpen={!!activeQuestionnaireItem}
            item={activeQuestionnaireItem}
            onClose={() => setActiveQuestionnaireItem(null)}
            onResponseSubmitted={(updatedItem) => {
              setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
              if (onItemsChange) onItemsChange();
            }}
          />
        )}

        {/* 4. Clean Responses & Analytics Modal */}
        {activeStatsItem && (
          <ReviewStatsModal
            isOpen={!!activeStatsItem}
            item={activeStatsItem}
            onClose={() => setActiveStatsItem(null)}
            onItemUpdated={(updatedItem) => {
              setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
              setActiveStatsItem(updatedItem);
            }}
          />
        )}

        {/* 5. Admin Questionnaire Configuration Modal */}
        {isAdmin && activeEditQuestionnaireItem && (
          <EditQuestionnaireModal
            isOpen={!!activeEditQuestionnaireItem}
            item={activeEditQuestionnaireItem}
            onClose={() => setActiveEditQuestionnaireItem(null)}
            onUpdated={(updatedItem) => {
              setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
            }}
          />
        )}

        {/* 6. Admin Data Mixer & Simulator Modal */}
        {isAdmin && activeMixerItem && (
          <DataMixerModal
            isOpen={!!activeMixerItem}
            item={activeMixerItem}
            onClose={() => setActiveMixerItem(null)}
            onItemUpdated={(updatedItem) => {
              setItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
              setActiveMixerItem(updatedItem);
            }}
          />
        )}

        {/* 6. Admin Instruction Modal */}
        {isAdmin && isInstructionModalOpen && (
          <InstructionModal
            isOpen={isInstructionModalOpen}
            instruction={editingInstruction}
            onClose={() => {
              setIsInstructionModalOpen(false);
              setEditingInstruction(null);
            }}
            onSaved={(savedInst) => {
              setInstructions(prev => {
                if (prev.some(i => i.id === savedInst.id)) {
                  return prev.map(i => i.id === savedInst.id ? savedInst : i);
                }
                return [savedInst, ...prev];
              });
              setJustSentDirective(true);
              setTimeout(() => setJustSentDirective(false), 20000);
            }}
          />
        )}

        {/* 7. Admin Month-End Reset Modal */}
        {isAdmin && (
          <MonthEndResetModal
            isOpen={isMonthEndResetOpen}
            onClose={() => setIsMonthEndResetOpen(false)}
            onResetSuccess={() => {
              fetchItems();
              fetchInstructions();
              if (onItemsChange) onItemsChange();
              if (onInstructionsChange) onInstructionsChange();
            }}
          />
        )}
        {/* Image Lightbox */}
        {activeImagePreview && (
          <div className="modal-overlay" onClick={() => setActiveImagePreview(null)} style={{ zIndex: 500 }}>
            <div 
              className="modal-dialog" 
              onClick={(e) => e.stopPropagation()} 
              style={{ maxWidth: 1000, width: '94vw', padding: 16, background: 'rgba(11, 15, 25, 0.96)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>{activeImagePreview.title}</h3>
                <button className="modal-close-btn" onClick={() => setActiveImagePreview(null)}>
                  <XCircle size={22} />
                </button>
              </div>
              <div style={{ maxHeight: '82vh', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <img 
                  src={activeImagePreview.url} 
                  alt="Full View" 
                  style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 10 }}
                />
              </div>
            </div>
          </div>
        )}
      </Suspense>
    </div>
  );
}
