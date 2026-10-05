import React, { useState } from 'react';
import { X, Users, ThumbsUp, ThumbsDown, Star, CheckCircle2, MessageSquare, Clock, Check, Loader2, Award } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatRelativeTime } from '../utils/helpers';

export default function ReviewStatsModal({ isOpen, onClose, item, onItemUpdated }) {
  const { user, token } = useAuth();
  const [updatingQuestionId, setUpdatingQuestionId] = useState(null);
  const [error, setError] = useState('');

  if (!isOpen || !item) return null;

  const questions = item.questions || [];
  const voteList = item.voteList || [];
  const questionStats = item.questionStats || [];
  const isAdmin = !!user?.isAdmin;

  // Real vs Mixer statistics
  const verdictQuestion = (item.questions || []).find(q => q.type === 'verdict');
  const verdictOpt1 = verdictQuestion?.options?.[0] || 'Good';
  const verdictOpt2 = verdictQuestion?.options?.[1] || 'Bad';

  const realVotesCount = item.realStats?.totalVotes ?? voteList.length;
  const realGoodCount = item.realStats?.goodCount ?? voteList.filter(v => (v.vote || '').toLowerCase() === 'good').length;
  const realBadCount = item.realStats?.badCount ?? voteList.filter(v => (v.vote || '').toLowerCase() === 'bad').length;
  const mixerTotal = item.realStats?.simTotal ?? (item.dataMixer?.enabled ? ((Number(item.dataMixer.goodCount) || 0) + (Number(item.dataMixer.badCount) || 0)) : 0);
  const mixerGood = item.realStats?.simGood ?? (item.dataMixer?.enabled ? (Number(item.dataMixer.goodCount) || 0) : 0);
  const mixerBad = item.realStats?.simBad ?? (item.dataMixer?.enabled ? (Number(item.dataMixer.badCount) || 0) : 0);
  const isMixerActive = Boolean(item.dataMixer?.enabled || mixerTotal > 0);

  const handleSetCorrectAnswer = async (questionId, newKey) => {
    if (!token || !isAdmin) return;
    setUpdatingQuestionId(questionId);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/items/${item.id}/questions/${questionId}/correct-answer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ correctAnswer: newKey })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update answer key');
      if (onItemUpdated) {
        onItemUpdated(data.item);
      }
    } catch (err) {
      console.error('Failed to update answer key:', err);
      setError(err.message);
    } finally {
      setUpdatingQuestionId(null);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 450 }}>
      <div 
        className="modal-dialog" 
        style={{ 
          maxWidth: 720, 
          width: '92vw', 
          maxHeight: '88vh', 
          overflowY: 'auto',
          background: 'rgba(15, 20, 32, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '24px 28px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
            }}>
              <Users size={20} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                {item.title}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span>
                  {isMixerActive
                    ? `Evaluation Results: ${item.totalVotes} total (${realVotesCount} real people • ${mixerTotal} mixer)`
                    : `Evaluation Results & Submissions (${voteList.length} responses)`}
                </span>
                {Array.isArray(item.targetUserIds) && item.targetUserIds.length > 0 && (
                  <span style={{
                    fontSize: '0.72rem',
                    color: '#818cf8',
                    background: 'rgba(99, 102, 241, 0.12)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    padding: '1px 6px',
                    borderRadius: 8,
                    fontWeight: 600
                  }}>
                    🎯 Targeted ({item.targetRecipients?.length || item.targetUserIds.length} recipients)
                  </span>
                )}
              </p>
            </div>
          </div>

          <button 
            type="button"
            className="modal-close-btn" 
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

        {/* Overall Verdict Bar */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: isMixerActive ? 14 : 18
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: 700, marginBottom: 8 }}>
            <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ThumbsUp size={15} /> {item.goodCount} {verdictOpt1} ({item.goodPercentage}%)
            </span>
            <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ThumbsDown size={15} /> {item.badCount} {verdictOpt2} ({item.totalVotes > 0 ? 100 - item.goodPercentage : 0}%)
            </span>
          </div>

          <div className="progress-track" style={{ height: 10 }}>
            <div 
              className="progress-fill-good" 
              style={{ width: `${item.goodPercentage}%` }} 
            />
            <div 
              className="progress-fill-bad" 
              style={{ width: `${item.totalVotes > 0 ? 100 - item.goodPercentage : 0}%` }} 
            />
          </div>
        </div>

        {/* Real vs Mixer Submissions Breakdown */}
        {isAdmin && isMixerActive && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            marginBottom: 20
          }}>
            <div style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: 10,
              padding: '12px 14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  👤 Real People Submissions
                </span>
                <span style={{ fontSize: '0.72rem', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                  {realVotesCount} total
                </span>
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#34d399' }}>{realGoodCount} {verdictOpt1}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>vs</span>
                <span style={{ color: '#f87171' }}>{realBadCount} {verdictOpt2}</span>
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Actual responses submitted by team members listed below
              </p>
            </div>

            <div style={{
              background: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              borderRadius: 10,
              padding: '12px 14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  ⚡ Data Mixer (Simulated)
                </span>
                <span style={{ fontSize: '0.72rem', background: 'rgba(139, 92, 246, 0.2)', color: '#d8b4fe', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                  {mixerTotal} total
                </span>
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#34d399' }}>{mixerGood} {verdictOpt1}</span>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>vs</span>
                <span style={{ color: '#f87171' }}>{mixerBad} {verdictOpt2}</span>
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Synthetic / streamed numbers configured via Data Mixer
              </p>
            </div>
          </div>
        )}

        {isAdmin && !isMixerActive && realVotesCount > 0 && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.07)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 18,
            fontSize: '0.74rem',
            color: '#34d399',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <span>👤</span>
            <span><strong>100% Real People Data</strong> — All {realVotesCount} {realVotesCount === 1 ? 'submission is' : 'submissions are'} from actual team members (Data Mixer is inactive).</span>
          </div>
        )}

        {/* Questions Statistical Summary */}
        {questionStats && questionStats.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: '0.86rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Question Breakdown & Answer Keys
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {questionStats.map((qs, idx) => {
                const isYesNo = qs.type === 'yes_no' || qs.type === 'two_options' || qs.type === 'boolean';
                const hasKey = !!qs.correctAnswer;
                const isUpdatingThis = updatingQuestionId === qs.id;

                return (
                  <div 
                    key={qs.id || idx}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: `1px solid ${hasKey ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.06)'}`,
                      borderRadius: 10,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          color: 'var(--accent-cyan)',
                          background: 'rgba(99, 102, 241, 0.2)',
                          padding: '1px 6px',
                          borderRadius: 4
                        }}>
                          Q{idx + 1}
                        </span>
                        <span style={{ fontSize: '0.84rem', color: '#fff', fontWeight: 600 }}>
                          {qs.text}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.82rem', fontWeight: 700, flexShrink: 0 }}>
                        {qs.type === 'verdict' && (
                          <span style={{ color: 'var(--accent-emerald)' }}>
                            👍 {qs.options?.[0] || 'Good'}: {qs.goodCount || 0} • <span style={{ color: '#f87171' }}>👎 {qs.options?.[1] || 'Bad'}: {qs.badCount || 0}</span>
                          </span>
                        )}
                        {isYesNo && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: '#34d399' }}>{qs.options?.[0] || 'Yes'}: {qs.opt1Count || qs.yesCount || 0}</span>
                            <span style={{ color: 'var(--text-dim)' }}>•</span>
                            <span style={{ color: '#f87171' }}>{qs.options?.[1] || 'No'}: {qs.opt2Count || qs.noCount || 0}</span>
                          </span>
                        )}
                        {qs.type === 'rating' && (
                          <span style={{ color: '#fbbf24' }}>
                            ⭐ {qs.averageRating || 0} / 5 Avg ({qs.totalRatings || 0} ratings)
                          </span>
                        )}
                        {qs.type === 'choice' && (
                          <span style={{ color: '#c7d2fe' }}>
                            {Object.entries(qs.choiceCounts || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || '0 votes'}
                          </span>
                        )}
                        {qs.type === 'multi_choice' && (
                          <span style={{ color: '#a78bfa' }}>
                            {Object.entries(qs.choiceCounts || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || '0 selections'}
                          </span>
                        )}
                        {(qs.type === 'text' || qs.type === 'type_answer') && (
                          <span style={{ color: 'var(--text-muted)' }}>
                            {qs.responses?.length || 0} typed {qs.responses?.length === 1 ? 'response' : 'responses'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Typed Responses List for Admin and Employee Review */}
                    {(qs.type === 'text' || qs.type === 'type_answer') && (
                      <div style={{
                        marginTop: 10,
                        background: 'rgba(0, 0, 0, 0.28)',
                        border: '1px solid rgba(255, 255, 255, 0.07)',
                        borderRadius: 10,
                        padding: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            ✍️ Employee Written Answers ({qs.responses?.length || 0})
                          </span>
                        </div>
                        {(!qs.responses || qs.responses.length === 0) ? (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 0' }}>
                            No typed answers submitted yet.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                            {qs.responses.map((resp, rIdx) => (
                              <div
                                key={rIdx}
                                style={{
                                  background: 'rgba(99, 102, 241, 0.08)',
                                  border: '1px solid rgba(99, 102, 241, 0.22)',
                                  borderRadius: 8,
                                  padding: '10px 12px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <img 
                                      src={resp.userAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'} 
                                      alt={resp.userName} 
                                      style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} 
                                    />
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0' }}>{resp.userName}</span>
                                  </div>
                                  {resp.timestamp && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                      <Clock size={10} /> {formatRelativeTime(resp.timestamp)}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.84rem', color: '#f8fafc', whiteSpace: 'pre-wrap', lineHeight: 1.45, paddingLeft: 27 }}>
                                  "{resp.text}"
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Answer Key assignment controls for Admin on Yes/No and 2-option questions */}
                    {isYesNo && (
                      <div style={{
                        background: 'rgba(0, 0, 0, 0.28)',
                        borderRadius: 8,
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 8,
                        fontSize: '0.74rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--text-dim)' }}>Answer Key:</span>
                          {hasKey ? (
                            <span style={{
                              fontWeight: 700,
                              color: '#34d399',
                              background: 'rgba(16, 185, 129, 0.15)',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              padding: '2px 8px',
                              borderRadius: 4
                            }}>
                              ✅ '{qs.correctAnswer}' is Right • {qs.correctCount || 0} Correct ({qs.accuracyPercentage ?? 0}%) • {qs.wrongCount || 0} Wrong
                            </span>
                          ) : (
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                              ⚪ Unassigned (Opinion Poll)
                            </span>
                          )}
                        </div>

                        {isAdmin && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Assign Key:</span>
                            <button
                              type="button"
                              disabled={isUpdatingThis}
                              onClick={() => handleSetCorrectAnswer(qs.id, 'Yes')}
                              style={{
                                fontSize: '0.7rem',
                                padding: '3px 8px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                background: qs.correctAnswer === 'Yes' ? '#10b981' : 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                color: qs.correctAnswer === 'Yes' ? '#000' : '#34d399',
                                fontWeight: 700
                              }}
                              title="Assign 'Yes' as the correct answer"
                            >
                              {isUpdatingThis && qs.correctAnswer !== 'Yes' ? <Loader2 size={11} className="spin" /> : "Set 'Yes' Right"}
                            </button>
                            <button
                              type="button"
                              disabled={isUpdatingThis}
                              onClick={() => handleSetCorrectAnswer(qs.id, 'No')}
                              style={{
                                fontSize: '0.7rem',
                                padding: '3px 8px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                background: qs.correctAnswer === 'No' ? '#ef4444' : 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                color: qs.correctAnswer === 'No' ? '#fff' : '#f87171',
                                fontWeight: 700
                              }}
                              title="Assign 'No' as the correct answer"
                            >
                              {isUpdatingThis && qs.correctAnswer !== 'No' ? <Loader2 size={11} className="spin" /> : "Set 'No' Right"}
                            </button>
                            {hasKey && (
                              <button
                                type="button"
                                disabled={isUpdatingThis}
                                onClick={() => handleSetCorrectAnswer(qs.id, null)}
                                style={{
                                  fontSize: '0.7rem',
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  background: 'rgba(255, 255, 255, 0.04)',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  color: 'var(--text-muted)'
                                }}
                                title="Clear answer key back to unassigned"
                              >
                                Clear Key
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Individual Respondent Details */}
        <div>
          <h4 style={{ fontSize: '0.86rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Employee Responses ({voteList.length})
          </h4>

          {voteList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
              No responses submitted yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
              {voteList.map((v, vIdx) => (
                <div 
                  key={vIdx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: 12,
                    padding: '12px 14px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img 
                        src={v.userAvatar} 
                        alt={v.userName}
                        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                      />
                      <div>
                        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fff' }}>
                          {v.userName}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} />
                          <span>{formatRelativeTime(v.timestamp)}</span>
                        </div>
                      </div>
                    </div>

                    {(v.vote === 'good' || v.vote === 'bad') ? (
                      <span className={`eval-badge ${v.vote === 'good' ? 'good' : 'bad'}`} style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
                        {v.vote === 'good' ? `👍 ${verdictOpt1}` : `👎 ${verdictOpt2}`}
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 20,
                        background: 'rgba(99, 102, 241, 0.2)',
                        color: '#c7d2fe',
                        border: '1px solid rgba(99, 102, 241, 0.4)'
                      }}>
                        📝 Completed
                      </span>
                    )}
                  </div>

                  {/* Answers Map */}
                  {v.answers && (
                    <div style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      fontSize: '0.78rem'
                    }}>
                      {questions.map((q, qIdx) => {
                        const val = v.answers[q.id];
                        if (val === undefined || val === null || val === '') return null;

                        const hasKey = !!q.correctAnswer;
                        let isRight = false;
                        if (hasKey) {
                          const normVal = String(val).toLowerCase();
                          const normKey = String(q.correctAnswer).toLowerCase();
                          isRight = (normKey === 'yes' && (normVal === 'yes' || val === true)) ||
                                    (normKey === 'no' && (normVal === 'no' || val === false)) ||
                                    normVal === normKey;
                        }

                        if (q.type === 'text' || q.type === 'type_answer') {
                          return (
                            <div key={qIdx} style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                              background: 'rgba(99, 102, 241, 0.08)',
                              padding: '8px 12px',
                              borderRadius: 6,
                              border: '1px solid rgba(99, 102, 241, 0.2)'
                            }}>
                              <span style={{ color: 'var(--accent-cyan)', fontSize: '0.74rem', fontWeight: 700 }}>
                                ✍️ {q.text}:
                              </span>
                              <span style={{ color: '#f8fafc', fontSize: '0.82rem', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                                "{String(val)}"
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div key={qIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: 'var(--text-dim)' }}>{q.text}:</span>
                            {hasKey ? (
                              <span style={{
                                fontWeight: 700,
                                color: isRight ? '#34d399' : '#f87171',
                                background: isRight ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                padding: '1px 8px',
                                borderRadius: 4,
                                border: `1px solid ${isRight ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                              }}>
                                {isRight ? '✅' : '❌'} {String(val)} {isRight ? '(Right)' : `(Wrong - Key: ${q.correctAnswer})`}
                              </span>
                            ) : (
                              <span style={{ fontWeight: 600, color: '#f1f5f9' }}>
                                {Array.isArray(val) 
                                  ? val.join(', ') 
                                  : (val === 'good' ? `👍 ${verdictOpt1}` : val === 'bad' ? `👎 ${verdictOpt2}` : val === 'yes' ? '✓ Yes' : val === 'no' ? '✕ No' : String(val))}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {v.comment && !v.answers?.['q_feedback'] && (
                    <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: 6, fontStyle: 'italic' }}>
                      "{v.comment}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
