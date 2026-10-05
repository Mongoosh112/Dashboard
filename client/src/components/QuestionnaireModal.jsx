import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Send, 
  ThumbsUp, 
  ThumbsDown, 
  Star, 
  Check, 
  ListChecks, 
  Loader2, 
  Sparkles,
  HelpCircle,
  Lock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Helper to evaluate whether an answered value matches the question's answer key
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

  // 3. Two Options / Contrast checks / Single Choice
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

// Render evaluation indicator badge ONLY after the employee has submitted
function AnswerValidationFeedback({ q, currentVal, isSubmitted }) {
  if (!isSubmitted) return null;
  if (!q?.correctAnswer) return null;
  if (currentVal === undefined || currentVal === null || currentVal === '') return null;
  if (Array.isArray(currentVal) && currentVal.length === 0) return null;

  const isMatch = checkIsAnswerCorrect(q, currentVal);

  return (
    <div style={{
      marginTop: 9,
      padding: '7px 12px',
      borderRadius: 8,
      fontSize: '0.76rem',
      fontWeight: 600,
      background: isMatch ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
      border: `1px solid ${isMatch ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
      color: isMatch ? '#34d399' : '#f87171',
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }}>
      <span>{isMatch ? '✅' : '❌'}</span>
      <span>
        {isMatch
          ? `Right! '${q.correctAnswer}' is the correct answer.`
          : `Wrong. The assigned right answer is '${q.correctAnswer}'.`}
      </span>
    </div>
  );
}

export default function QuestionnaireModal({ 
  isOpen, 
  onClose, 
  item, 
  onResponseSubmitted 
}) {
  const { user, token } = useAuth();
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const isMouseDownOnOverlay = useRef(false);

  // Check if current user already submitted a response
  const myVote = item?.votes?.[user?.id];
  const isAlreadySubmitted = !!myVote;

  // Initialize answers from existing vote/responses
  useEffect(() => {
    if (!item) return;

    const existingVote = item.votes?.[user?.id];
    const hasVerdictQ = (item.questions || []).some(q => q.type === 'verdict');

    if (existingVote) {
      const initAnswers = { ...(existingVote.answers || {}) };
      if (existingVote.comment && !initAnswers.q_feedback) {
        initAnswers.q_feedback = existingVote.comment;
      }
      const textQs = (item.questions || []).filter(q => q.type === 'text' || q.type === 'type_answer');
      if (textQs.length === 1 && existingVote.comment && !initAnswers[textQs[0].id]) {
        initAnswers[textQs[0].id] = existingVote.comment;
      }
      if (hasVerdictQ) {
        const vQ = (item.questions || []).find(q => q.type === 'verdict');
        if (vQ && !initAnswers[vQ.id]) {
          const vVote = existingVote.vote || initAnswers.q_verdict;
          if (vVote === 'good') initAnswers[vQ.id] = vQ.options?.[0] || 'Good';
          else if (vVote === 'bad') initAnswers[vQ.id] = vQ.options?.[1] || 'Bad';
          else if (vVote) initAnswers[vQ.id] = vVote;
        }
        if (!initAnswers.q_verdict && existingVote.vote) {
          initAnswers.q_verdict = existingVote.vote;
        }
      }
      setAnswers(initAnswers);
    } else {
      // Empty by default for new respondent
      setAnswers({});
    }
    setSuccess(false);
    setError('');
  }, [item, user?.id, isOpen]);

  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const questions = item.questions || [];

  // Allow selecting or changing answer before final submission
  const handleSetAnswer = (qId, value) => {
    // If questionnaire already submitted, lock all
    if (isAlreadySubmitted) return;

    setAnswers(prev => ({
      ...prev,
      [qId]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isAlreadySubmitted) return;
    setLoading(true);
    setError('');

    const verdictQ = questions.find(q => q.type === 'verdict');
    const existingVote = item.votes?.[user?.id]?.vote;
    // Derive vote from verdict question (Good/Bad or Up/Down), otherwise preserve existing
    let vote = existingVote || 'good';
    if (verdictQ) {
      const vAnswer = answers[verdictQ.id] || answers['q_verdict'];
      if (vAnswer !== undefined && vAnswer !== null) {
        const opt2 = verdictQ.options?.[1] || 'Bad';
        if (vAnswer === opt2 || vAnswer === 'bad' || vAnswer === 'down' || /^(bad|down|fail|no|reject)/i.test(String(vAnswer).trim())) {
          vote = 'bad';
        } else {
          vote = 'good';
        }
      }
    }
    let comment = answers['q_feedback'] || '';
    if (!comment) {
      const textQ = questions.find(q => q.type === 'text' || q.type === 'type_answer');
      if (textQ && answers[textQ.id]) {
        comment = String(answers[textQ.id]).trim();
      }
    }

    try {
      const res = await fetch(`/api/dashboard/items/${item.id}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          vote,
          answers,
          comment
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit response');
      }

      setSuccess(true);
      if (onResponseSubmitted) {
        onResponseSubmitted(data.item);
      }

      // Close modal after brief confirmation
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="modal-overlay" 
      onMouseDown={(e) => {
        isMouseDownOnOverlay.current = (e.target === e.currentTarget);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && isMouseDownOnOverlay.current) {
          onClose();
        }
        isMouseDownOnOverlay.current = false;
      }} 
      style={{ zIndex: 450 }}
    >
      <div 
        className="modal-dialog" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: 600, 
          width: '92vw', 
          maxHeight: '88vh', 
          overflowY: 'auto',
          background: 'rgba(15, 20, 32, 0.97)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '24px 28px'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'var(--primary-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)'
            }}>
              <ListChecks size={20} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                {item.title}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Questionnaire Evaluation • {questions.length} questions
              </p>
            </div>
          </div>

          <button 
            type="button"
            className="modal-close-btn" 
            onClick={onClose}
            style={{ marginTop: -4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Target Image Thumbnail Banner (or Text-Only Survey Header) */}
        {item.imageUrl ? (
          <div style={{
            position: 'relative',
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 18,
            border: '1px solid var(--border-glass)',
            background: '#000',
            maxHeight: 180
          }}>
            <img 
              src={item.imageUrl} 
              alt={item.title}
              style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }}
            />
            {item.description && (
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)',
                padding: '16px 14px 8px 14px',
                fontSize: '0.8rem',
                color: '#e2e8f0'
              }}>
                {item.description}
              </div>
            )}
          </div>
        ) : (
          item.description && (
            <div style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              marginBottom: 18,
              fontSize: '0.84rem',
              color: 'var(--text-main)',
              lineHeight: 1.45
            }}>
              <span style={{ fontWeight: 600, color: 'var(--accent-cyan)', display: 'block', fontSize: '0.74rem', marginBottom: 2 }}>
                Survey Context & Instructions:
              </span>
              {item.description}
            </div>
          )
        )}        {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

        {/* Questions Form */}
        <form 
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
              e.preventDefault();
            }
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {questions.map((q, qIdx) => {
              let currentVal = answers[q.id];
              if (currentVal === undefined && q.type === 'verdict') {
                const vVote = answers['q_verdict'] || myVote?.vote;
                if (vVote === 'good') currentVal = q.options?.[0] || 'Good';
                else if (vVote === 'bad') currentVal = q.options?.[1] || 'Bad';
                else if (vVote) currentVal = vVote;
              }
              const isQLocked = isAlreadySubmitted;
              const isSubmitted = isAlreadySubmitted || success;

              return (
                <div 
                  key={q.id || qIdx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: 12,
                    padding: '14px 16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: 'var(--accent-cyan)',
                        background: 'rgba(99, 102, 241, 0.2)',
                        padding: '2px 7px',
                        borderRadius: 6
                      }}>
                        Q{qIdx + 1}
                      </span>
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff' }}>
                        {q.text}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {q.correctAnswer ? (
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399',
                          border: '1px solid rgba(16, 185, 129, 0.3)'
                        }}>
                          🎯 Quiz Question
                        </span>
                      ) : (
                        q.type === 'yes_no' && (
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.3)'
                          }}>
                            ❓ Yes / No
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  {/* 0. Yes / No Question (Right / Wrong Quiz) */}
                  {q.type === 'yes_no' && (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          { label: 'Yes', icon: '✓', color: '#10b981', gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
                          { label: 'No', icon: '✕', color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }
                        ].map((btn) => {
                          const isYes = btn.label === 'Yes';
                          const isSelected = isYes
                            ? (currentVal === 'Yes' || currentVal === 'yes' || currentVal === true)
                            : (currentVal === 'No' || currentVal === 'no' || currentVal === false);
                          return (
                            <button
                              key={btn.label}
                              type="button"
                              disabled={isQLocked}
                              onClick={() => handleSetAnswer(q.id, btn.label)}
                              style={{
                                padding: '12px 18px',
                                fontSize: '0.92rem',
                                fontWeight: 700,
                                borderRadius: 10,
                                background: isSelected ? btn.gradient : 'rgba(255, 255, 255, 0.04)',
                                color: isSelected ? '#ffffff' : 'var(--text-muted)',
                                border: `1px solid ${isSelected ? btn.color : 'rgba(255, 255, 255, 0.1)'}`,
                                boxShadow: isSelected ? `0 4px 14px ${btn.color}40` : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                cursor: isQLocked ? 'default' : 'pointer',
                                opacity: isQLocked && !isSelected ? 0.4 : 1,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>{btn.icon}</span>
                              <span>{btn.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Right / Wrong evaluation indicator if answer key is set and user responded */}
                      <AnswerValidationFeedback q={q} currentVal={currentVal} isSubmitted={isSubmitted} />
                    </div>
                  )}

                  {/* 1. Verdict type (Good / Bad or Up / Down Custom Labels) */}
                  {q.type === 'verdict' && (() => {
                    const opt1 = q.options?.[0] || 'Good';
                    const opt2 = q.options?.[1] || 'Bad';
                    const isOpt1 = currentVal === 'good' || currentVal === 'up' || String(currentVal).toLowerCase() === String(opt1).toLowerCase();
                    const isOpt2 = currentVal === 'bad' || currentVal === 'down' || String(currentVal).toLowerCase() === String(opt2).toLowerCase();

                    return (
                      <div>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <button
                            type="button"
                            className={`vote-btn good ${isOpt1 ? 'selected' : ''}`}
                            disabled={isQLocked}
                            onClick={() => handleSetAnswer(q.id, opt1)}
                            style={{
                              flex: 1,
                              padding: '10px 14px',
                              cursor: isQLocked ? 'default' : 'pointer',
                              opacity: isQLocked && !isOpt1 ? 0.4 : 1
                            }}
                          >
                            <ThumbsUp size={16} />
                            <span>{opt1}</span>
                          </button>

                          <button
                            type="button"
                            className={`vote-btn bad ${isOpt2 ? 'selected' : ''}`}
                            disabled={isQLocked}
                            onClick={() => handleSetAnswer(q.id, opt2)}
                            style={{
                              flex: 1,
                              padding: '10px 14px',
                              cursor: isQLocked ? 'default' : 'pointer',
                              opacity: isQLocked && !isOpt2 ? 0.4 : 1
                            }}
                          >
                            <ThumbsDown size={16} />
                            <span>{opt2}</span>
                          </button>
                        </div>
                        <AnswerValidationFeedback q={q} currentVal={currentVal} isSubmitted={isSubmitted} />
                      </div>
                    );
                  })()}

                  {/* 2. 2 Options Type (Custom labels e.g. Yes/No, A/B with optional Option Images) */}
                  {(q.type === 'two_options' || q.type === 'boolean') && (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {([q.options?.[0] || 'Yes', q.options?.[1] || 'No']).map((opt, optIdx) => {
                          const isSelected = currentVal === opt || (optIdx === 0 && currentVal === 'yes') || (optIdx === 1 && currentVal === 'no');
                          const optImg = q.optionImages?.[optIdx];
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              className={`tab-btn ${isSelected ? 'active' : ''}`}
                              disabled={isQLocked}
                              onClick={() => handleSetAnswer(q.id, opt)}
                              style={{
                                padding: optImg ? '8px 8px 10px 8px' : '11px 16px',
                                fontSize: '0.86rem',
                                fontWeight: 600,
                                borderRadius: 10,
                                background: isSelected ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.04)',
                                color: isSelected ? '#ffffff' : 'var(--text-muted)',
                                border: `1px solid ${isSelected ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
                                boxShadow: isSelected ? '0 2px 10px rgba(99, 102, 241, 0.35)' : 'none',
                                display: 'flex',
                                flexDirection: optImg ? 'column' : 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                cursor: isQLocked ? 'default' : 'pointer',
                                opacity: isQLocked && !isSelected ? 0.4 : 1,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {optImg && (
                                <img 
                                  src={optImg} 
                                  alt={opt} 
                                  style={{ 
                                    width: '100%', 
                                    height: 85, 
                                    objectFit: 'cover', 
                                    borderRadius: 8, 
                                    border: '1px solid rgba(255, 255, 255, 0.15)' 
                                  }} 
                                />
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: '0.9rem', color: isSelected ? '#ffffff' : 'var(--text-dim)' }}>
                                  {isSelected ? '✓' : '•'}
                                </span>
                                <span>{opt}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <AnswerValidationFeedback q={q} currentVal={currentVal} isSubmitted={isSubmitted} />
                    </div>
                  )}

                  {/* 3. Multiple Choice (Select Multiple Options) */}
                  {q.type === 'multi_choice' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                        Select all options that apply:
                      </span>
                      {(q.options || []).map((opt, optIdx) => {
                        const selectedList = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
                        const isChecked = selectedList.includes(opt);
                        return (
                          <label
                            key={optIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              fontSize: '0.86rem',
                              color: isChecked ? '#fff' : 'var(--text-muted)',
                              background: isChecked ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                              padding: '10px 14px',
                              borderRadius: 10,
                              cursor: isAlreadySubmitted ? 'default' : 'pointer',
                              border: `1px solid ${isChecked ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255, 255, 255, 0.06)'}`,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isAlreadySubmitted}
                              onChange={() => {
                                if (isAlreadySubmitted) return;
                                const next = isChecked 
                                  ? selectedList.filter(item => item !== opt) 
                                  : [...selectedList, opt];
                                setAnswers(prev => ({
                                  ...prev,
                                  [q.id]: next
                                }));
                              }}
                              style={{ accentColor: 'var(--accent-cyan)', width: 17, height: 17, cursor: isAlreadySubmitted ? 'default' : 'pointer' }}
                            />
                            <span style={{ fontWeight: isChecked ? 600 : 400, flex: 1 }}>{opt}</span>
                          </label>
                        );
                      })}
                      <AnswerValidationFeedback q={q} currentVal={currentVal} isSubmitted={isSubmitted} />
                    </div>
                  )}

                  {/* 4. Multiple Options (Single Pick) */}
                  {q.type === 'choice' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                        Select one option:
                      </span>
                      {(q.options || []).map((opt, optIdx) => {
                        const isChosen = currentVal === opt;
                        return (
                          <label
                            key={optIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              fontSize: '0.86rem',
                              color: isChosen ? '#fff' : 'var(--text-muted)',
                              background: isChosen ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                              padding: '10px 14px',
                              borderRadius: 10,
                              cursor: isQLocked ? 'default' : 'pointer',
                              opacity: isQLocked && !isChosen ? 0.4 : 1,
                              border: `1px solid ${isChosen ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255, 255, 255, 0.06)'}`,
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <input
                              type="radio"
                              name={`choice_${q.id}`}
                              value={opt}
                              checked={isChosen}
                              disabled={isQLocked}
                              onChange={() => handleSetAnswer(q.id, opt)}
                              style={{ accentColor: 'var(--accent-cyan)', width: 17, height: 17, cursor: isQLocked ? 'default' : 'pointer' }}
                            />
                            <span style={{ fontWeight: isChosen ? 600 : 400, flex: 1 }}>{opt}</span>
                          </label>
                        );
                      })}
                      <AnswerValidationFeedback q={q} currentVal={currentVal} isSubmitted={isSubmitted} />
                    </div>
                  )}

                  {/* 5. Type Your Answer (Open Text) */}
                  {(q.type === 'text' || q.type === 'type_answer') && (
                    <div>
                      <textarea
                        className="form-input"
                        rows={3}
                        placeholder={isAlreadySubmitted ? "Response submitted" : "Type your answer or comments here..."}
                        value={currentVal || ''}
                        readOnly={isAlreadySubmitted}
                        disabled={isAlreadySubmitted}
                        onChange={(e) => {
                          if (isAlreadySubmitted) return;
                          setAnswers(prev => ({ ...prev, [q.id]: e.target.value }));
                        }}
                        style={{
                          fontSize: '0.85rem',
                          padding: '10px 14px',
                          resize: isAlreadySubmitted ? 'none' : 'vertical',
                          width: '100%',
                          borderRadius: 10,
                          opacity: isAlreadySubmitted ? 0.9 : 1,
                          background: isAlreadySubmitted ? 'rgba(99, 102, 241, 0.08)' : undefined,
                          borderColor: isAlreadySubmitted ? 'rgba(99, 102, 241, 0.35)' : undefined,
                          color: '#fff',
                          cursor: isAlreadySubmitted ? 'default' : 'text'
                        }}
                      />
                      {isAlreadySubmitted && currentVal && (
                        <div style={{
                          marginTop: 6,
                          fontSize: '0.74rem',
                          color: '#34d399',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5
                        }}>
                          <span>✓</span>
                          <span>Your answer has been recorded: <strong>"{currentVal}"</strong></span>
                        </div>
                      )}
                      <AnswerValidationFeedback q={q} currentVal={currentVal} isSubmitted={isSubmitted} />
                    </div>
                  )}

                  {/* 6. Star Rating Scale (1 to 5) */}
                  {q.type === 'rating' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                        {[1, 2, 3, 4, 5].map(starNum => {
                          const isSelected = Number(currentVal) >= starNum;
                          return (
                            <button
                              key={starNum}
                              type="button"
                              disabled={isQLocked}
                              onClick={() => handleSetAnswer(q.id, starNum)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: isQLocked ? 'default' : 'pointer',
                                padding: '4px',
                                color: isSelected ? '#fbbf24' : 'rgba(255, 255, 255, 0.2)',
                                transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                                opacity: isQLocked && !isSelected ? 0.4 : 1,
                                transition: 'all 0.15s ease'
                              }}
                              title={`${starNum} Stars`}
                            >
                              <Star size={24} fill={isSelected ? '#fbbf24' : 'none'} />
                            </button>
                          );
                        })}
                        <span style={{ fontSize: '0.84rem', color: '#fbbf24', marginLeft: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {currentVal ? `${currentVal} / 5 Stars` : 'Select a rating'}
                        </span>
                      </div>
                      <AnswerValidationFeedback q={q} currentVal={currentVal} isSubmitted={isSubmitted} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 22 }}>
            <div>
              {user?.isAdmin && !isAlreadySubmitted && (
                <button
                  type="button"
                  onClick={() => setAnswers({})}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fbbf24',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                  title="Admin only: Clear draft answers to test again"
                >
                  Admin: Reset Selection Test
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="tab-btn"
                onClick={onClose}
                style={{ padding: '9px 18px', fontSize: '0.85rem' }}
              >
                {isAlreadySubmitted ? 'Close' : 'Cancel'}
              </button>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading || isAlreadySubmitted}
                style={{
                  padding: '9px 24px',
                  fontSize: '0.85rem',
                  width: 'auto',
                  margin: 0,
                  opacity: isAlreadySubmitted ? 0.65 : 1,
                  cursor: isAlreadySubmitted ? 'default' : 'pointer'
                }}
              >
                {loading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </span>
                ) : isAlreadySubmitted ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#34d399' }}>
                    <Check size={16} /> Response Submitted
                  </span>
                ) : success ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#34d399' }}>
                    <Check size={16} /> Saved!
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Send size={15} /> Submit Questionnaire
                  </span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
