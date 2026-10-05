import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Lightbulb, 
  BookOpen, 
  CheckSquare, 
  Edit3, 
  Save, 
  Plus, 
  Trash2, 
  Sparkles, 
  Target, 
  GraduationCap, 
  CheckCircle2, 
  Loader2,
  Layers,
  Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function KnowledgeBaseDrawer({ 
  isOpen, 
  onClose, 
  item, 
  onItemUpdated 
}) {
  const { user, token } = useAuth();
  const isAdmin = user?.isAdmin;

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [backdropPing, setBackdropPing] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Close drawer on Escape key (cancels edit mode if editing, closes drawer if reading)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isEditing, onClose]);

  const handleBackdropClick = () => {
    if (isEditing) {
      // While editing, backdrop click pulses to prevent accidental unsaved work loss
      setBackdropPing(true);
      setTimeout(() => setBackdropPing(false), 300);
    } else {
      // In read mode, clicking the backdrop closes the drawer
      onClose();
    }
  };

  // Editable Headings & Subtitles
  const [criteriaTitle, setCriteriaTitle] = useState('Decision Criteria (Good vs Bad)');
  const [criteriaSubtitle, setCriteriaSubtitle] = useState('Official benchmark points defined by Admin to judge this asset:');
  const [criteria, setCriteria] = useState([]);

  const [learningTitle, setLearningTitle] = useState('Things to Learn & Best Practices');
  const [learningSubtitle, setLearningSubtitle] = useState('Key design principles and industry knowledge to learn from:');
  const [learningTips, setLearningTips] = useState([]);

  const [checklistTitle, setChecklistTitle] = useState('Pre-Evaluation Checklist');
  const [checklistSubtitle, setChecklistSubtitle] = useState('Check off these points as you inspect the image:');
  const [checklist, setChecklist] = useState([]);

  // Custom sections
  const [customSections, setCustomSections] = useState([]);
  
  // Persistent checked items for users
  const [checkedItems, setCheckedItems] = useState({});
  const [checklistSaveStatus, setChecklistSaveStatus] = useState('');
  const saveStatusTimeoutRef = useRef(null);

  useEffect(() => {
    if (!item) return;

    const kb = item.knowledgeBase || {};

    setCriteriaTitle(kb.criteriaTitle || 'Decision Criteria');
    setCriteriaSubtitle(kb.criteriaSubtitle !== undefined ? kb.criteriaSubtitle : '');
    setCriteria(Array.isArray(kb.criteria) ? kb.criteria : []);

    setLearningTitle(kb.learningTitle || 'Things to Learn & Best Practices');
    setLearningSubtitle(kb.learningSubtitle !== undefined ? kb.learningSubtitle : '');
    setLearningTips(Array.isArray(kb.learningTips) ? kb.learningTips : []);

    setChecklistTitle(kb.checklistTitle || 'Pre-Evaluation Checklist');
    setChecklistSubtitle(kb.checklistSubtitle !== undefined ? kb.checklistSubtitle : '');
    setChecklist(Array.isArray(kb.checklist) ? kb.checklist : []);

    setCustomSections(kb.customSections || []);
    setIsEditing(false);
    setError('');
    setImageError(false);

    // Restore checklist checks from localStorage and server
    const storageKey = `QuantumPropAI_checklist_${user?.id || 'guest'}_${item.id}`;
    let restored = {};
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) restored = JSON.parse(cached);
    } catch (_) {}

    if (item.checklistChecks && item.checklistChecks[user?.id]) {
      const serverChecks = item.checklistChecks[user?.id];
      if (typeof serverChecks === 'object') {
        restored = { ...restored, ...serverChecks };
      }
    }
    setCheckedItems(restored);
  }, [item, isOpen, user?.id]);

  if (!isOpen || !item) return null;

  // Checklist toggle with persistent auto-save
  const toggleCheck = async (checkKey) => {
    const newChecked = {
      ...checkedItems,
      [checkKey]: !checkedItems[checkKey]
    };
    setCheckedItems(newChecked);

    // 1. Immediately persist to localStorage
    const storageKey = `QuantumPropAI_checklist_${user?.id || 'guest'}_${item.id}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(newChecked));
    } catch (_) {}

    // 2. Show brief Saved confirmation
    setChecklistSaveStatus('Saved');
    if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
    saveStatusTimeoutRef.current = setTimeout(() => {
      setChecklistSaveStatus('');
    }, 2000);

    // 3. Persist to server
    if (token && item?.id) {
      try {
        const res = await fetch(`/api/dashboard/items/${item.id}/checklist`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ checks: newChecked })
        });
        if (res.ok) {
          const data = await res.json();
          if (onItemUpdated && data.item) {
            onItemUpdated(data.item);
          }
        }
      } catch (err) {
        console.error('Failed to sync checklist to backend:', err);
      }
    }
  };

  // Section 1: Criteria items
  const handleAddCriteria = () => setCriteria(prev => [...prev, 'New decision criteria']);
  const handleUpdateCriteria = (idx, val) => {
    setCriteria(prev => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };
  const handleRemoveCriteria = (idx) => setCriteria(prev => prev.filter((_, i) => i !== idx));

  // Section 2: Learning items
  const handleAddTip = () => setLearningTips(prev => [...prev, 'New learning tip or best practice']);
  const handleUpdateTip = (idx, val) => {
    setLearningTips(prev => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };
  const handleRemoveTip = (idx) => setLearningTips(prev => prev.filter((_, i) => i !== idx));

  // Section 3: Checklist items
  const handleAddChecklist = () => setChecklist(prev => [...prev, 'New checklist item']);
  const handleUpdateChecklist = (idx, val) => {
    setChecklist(prev => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };
  const handleRemoveChecklist = (idx) => setChecklist(prev => prev.filter((_, i) => i !== idx));

  // Custom Sections handlers
  const handleAddCustomSection = () => {
    setCustomSections(prev => [
      ...prev,
      {
        id: `sec_${Date.now()}`,
        title: 'Custom Knowledge Topic',
        subtitle: 'Guidelines and reference details:',
        items: ['First point for this section']
      }
    ]);
  };

  const handleUpdateCustomSection = (secId, field, val) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id === secId) {
        return { ...s, [field]: val };
      }
      return s;
    }));
  };

  const handleRemoveCustomSection = (secId) => {
    setCustomSections(prev => prev.filter(s => s.id !== secId));
  };

  const handleAddCustomSectionItem = (secId) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id === secId) {
        return { ...s, items: [...(s.items || []), 'New item'] };
      }
      return s;
    }));
  };

  const handleUpdateCustomSectionItem = (secId, itemIdx, val) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id === secId) {
        const nextItems = [...(s.items || [])];
        nextItems[itemIdx] = val;
        return { ...s, items: nextItems };
      }
      return s;
    }));
  };

  const handleRemoveCustomSectionItem = (secId, itemIdx) => {
    setCustomSections(prev => prev.map(s => {
      if (s.id === secId) {
        return { ...s, items: (s.items || []).filter((_, i) => i !== itemIdx) };
      }
      return s;
    }));
  };

  const handleSaveGuidelines = async () => {
    setSaving(true);
    setError('');

    const newKb = {
      criteriaTitle: criteriaTitle.trim() || 'Decision Criteria (Good vs Bad)',
      criteriaSubtitle: criteriaSubtitle.trim(),
      criteria: criteria.filter(c => c.trim().length > 0),

      learningTitle: learningTitle.trim() || 'Things to Learn & Best Practices',
      learningSubtitle: learningSubtitle.trim(),
      learningTips: learningTips.filter(t => t.trim().length > 0),

      checklistTitle: checklistTitle.trim() || 'Pre-Evaluation Checklist',
      checklistSubtitle: checklistSubtitle.trim(),
      checklist: checklist.filter(c => c.trim().length > 0),

      customSections: customSections.map(s => ({
        id: s.id,
        title: s.title.trim() || 'Additional Section',
        subtitle: s.subtitle.trim(),
        items: (s.items || []).filter(i => i.trim().length > 0)
      }))
    };

    try {
      const res = await fetch(`/api/dashboard/items/${item.id}/knowledge-base`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ knowledgeBase: newKb })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update knowledge base');
      }

      setIsEditing(false);
      if (onItemUpdated) {
        onItemUpdated(data.item);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={handleBackdropClick}
      style={{ 
        zIndex: 550, 
        justifyContent: 'flex-end',
        padding: 0,
        backgroundColor: 'rgba(4, 7, 14, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
    >
      <div 
        className="contact-drawer" 
        onClick={(e) => e.stopPropagation()} 
        style={{
          width: 520,
          maxWidth: '100vw',
          height: '100%',
          background: 'rgba(13, 17, 28, 0.98)',
          backdropFilter: 'blur(25px)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: backdropPing 
            ? '-10px 0 55px rgba(139, 92, 246, 0.7)' 
            : '-10px 0 40px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          transition: 'box-shadow 0.2s ease'
        }}
      >
        {/* Drawer Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
            }}>
              <BookOpen size={18} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                Knowledge Base & Guide
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                {isEditing ? '✏️ Edit headings, criteria & learning tips' : 'Evaluation criteria and things to learn'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAdmin && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  color: 'var(--accent-cyan)',
                  borderRadius: 8,
                  padding: '5px 12px',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
                title="Admin: Edit headings & learning tips"
              >
                <Edit3 size={13} />
                <span>Edit Headings & Guide</span>
              </button>
            )}

            {isEditing && (
              <button
                type="button"
                onClick={handleSaveGuidelines}
                disabled={saving}
                style={{
                  background: 'var(--primary-gradient)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '6px 14px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                <span>Save Changes</span>
              </button>
            )}

            <button 
              type="button"
              className="modal-close-btn" 
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Item Preview Strip */}
        <div style={{
          padding: '12px 24px',
          background: 'rgba(0, 0, 0, 0.25)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          {item.imageUrl && !imageError ? (
            <img 
              src={item.imageUrl} 
              alt={item.title || 'Review Item'}
              style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }}
              onError={() => setImageError(true)}
            />
          ) : (
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(139, 92, 246, 0.25) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              flexShrink: 0
            }}>
              📋
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.title}
            </div>
            {item.description && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.description}
              </div>
            )}
            {isEditing && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Click any heading or point below to edit it directly
              </div>
            )}
          </div>
        </div>

        {error && (
          <div style={{ margin: '10px 24px 0 24px' }} className="form-error">
            {error}
          </div>
        )}

        {/* Drawer Scrollable Content */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* =========================================================
              SECTION 1: Decision Criteria (With Editable Heading)
              ========================================================= */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, marginRight: 10 }}>
                <Target size={16} color="var(--accent-emerald)" style={{ flexShrink: 0 }} />

                {isEditing ? (
                  <input
                    type="text"
                    className="form-input"
                    value={criteriaTitle}
                    onChange={(e) => setCriteriaTitle(e.target.value)}
                    placeholder="Section Heading..."
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      padding: '4px 8px',
                      color: '#fff',
                      background: 'rgba(0, 0, 0, 0.4)',
                      borderColor: 'rgba(16, 185, 129, 0.4)',
                      width: '100%'
                    }}
                  />
                ) : (
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                    {criteriaTitle}
                  </h4>
                )}
              </div>

              {isEditing && (
                <button
                  type="button"
                  onClick={handleAddCriteria}
                  style={{
                    fontSize: '0.72rem',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px dashed var(--border-glass)',
                    color: 'var(--accent-cyan)',
                    padding: '3px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  + Add Point
                </button>
              )}
            </div>

            {/* Editable Subtitle / Description */}
            {isEditing ? (
              <input
                type="text"
                className="form-input"
                value={criteriaSubtitle}
                onChange={(e) => setCriteriaSubtitle(e.target.value)}
                placeholder="Section subtitle / description..."
                style={{ fontSize: '0.74rem', padding: '3px 8px', marginBottom: 10, color: 'var(--text-muted)' }}
              />
            ) : (
              criteriaSubtitle && (
                <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  {criteriaSubtitle}
                </p>
              )
            )}

            {/* Items List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {criteria.length === 0 && !isEditing && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '6px 0' }}>
                  No criteria points added yet.
                </div>
              )}
              {criteria.map((itemText, idx) => (
                <div 
                  key={idx}
                  style={{
                    background: 'rgba(16, 185, 129, 0.05)',
                    border: '1px solid rgba(16, 185, 129, 0.15)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10
                  }}
                >
                  <span style={{ 
                    width: 20, 
                    height: 20, 
                    borderRadius: '50%', 
                    background: 'rgba(16, 185, 129, 0.2)', 
                    color: 'var(--accent-emerald)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '0.7rem', 
                    fontWeight: 800,
                    flexShrink: 0,
                    marginTop: 1
                  }}>
                    {idx + 1}
                  </span>

                  {isEditing ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input 
                        type="text" 
                        value={itemText}
                        onChange={(e) => handleUpdateCriteria(idx, e.target.value)}
                        className="form-input"
                        style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                      />
                      <button 
                        type="button"
                        onClick={() => handleRemoveCriteria(idx)}
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.45 }}>
                      {itemText}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* =========================================================
              SECTION 2: Things to Learn & Best Practices (Editable Heading)
              ========================================================= */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, marginRight: 10 }}>
                <GraduationCap size={16} color="#fbbf24" style={{ flexShrink: 0 }} />

                {isEditing ? (
                  <input
                    type="text"
                    className="form-input"
                    value={learningTitle}
                    onChange={(e) => setLearningTitle(e.target.value)}
                    placeholder="Section Heading..."
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      padding: '4px 8px',
                      color: '#fff',
                      background: 'rgba(0, 0, 0, 0.4)',
                      borderColor: 'rgba(245, 158, 11, 0.4)',
                      width: '100%'
                    }}
                  />
                ) : (
                  <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                    {learningTitle}
                  </h4>
                )}
              </div>

              {isEditing && (
                <button
                  type="button"
                  onClick={handleAddTip}
                  style={{
                    fontSize: '0.72rem',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px dashed var(--border-glass)',
                    color: '#fbbf24',
                    padding: '3px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  + Add Tip
                </button>
              )}
            </div>

            {/* Editable Subtitle */}
            {isEditing ? (
              <input
                type="text"
                className="form-input"
                value={learningSubtitle}
                onChange={(e) => setLearningSubtitle(e.target.value)}
                placeholder="Section subtitle / description..."
                style={{ fontSize: '0.74rem', padding: '3px 8px', marginBottom: 10, color: 'var(--text-muted)' }}
              />
            ) : (
              learningSubtitle && (
                <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  {learningSubtitle}
                </p>
              )
            )}

            {/* Items List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {learningTips.length === 0 && !isEditing && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '6px 0' }}>
                  No tips or best practices added yet.
                </div>
              )}
              {learningTips.map((tipText, idx) => (
                <div 
                  key={idx}
                  style={{
                    background: 'rgba(245, 158, 11, 0.05)',
                    border: '1px solid rgba(245, 158, 11, 0.15)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10
                  }}
                >
                  <Lightbulb size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />

                  {isEditing ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input 
                        type="text" 
                        value={tipText}
                        onChange={(e) => handleUpdateTip(idx, e.target.value)}
                        className="form-input"
                        style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                      />
                      <button 
                        type="button"
                        onClick={() => handleRemoveTip(idx)}
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.45 }}>
                      {tipText}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* =========================================================
              SECTION 3: Quality Checklist (Editable Heading)
              ========================================================= */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, marginRight: 10 }}>
                <CheckSquare size={16} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />

                {isEditing ? (
                  <input
                    type="text"
                    className="form-input"
                    value={checklistTitle}
                    onChange={(e) => setChecklistTitle(e.target.value)}
                    placeholder="Section Heading..."
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 700,
                      padding: '4px 8px',
                      color: '#fff',
                      background: 'rgba(0, 0, 0, 0.4)',
                      borderColor: 'rgba(99, 102, 241, 0.4)',
                      width: '100%'
                    }}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                      {checklistTitle}
                    </h4>
                    {checklistSaveStatus ? (
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: '#34d399',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '1px 7px',
                        borderRadius: 99,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3
                      }}>
                        <Check size={11} /> Saved
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '0.68rem',
                        color: 'var(--text-dim)',
                        fontWeight: 600
                      }}>
                        ({checklist.filter((_, i) => !!checkedItems[`${item.id}_${i}`]).length}/{checklist.length} checked)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {isEditing && (
                <button
                  type="button"
                  onClick={handleAddChecklist}
                  style={{
                    fontSize: '0.72rem',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px dashed var(--border-glass)',
                    color: 'var(--accent-cyan)',
                    padding: '3px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  + Add Check
                </button>
              )}
            </div>

            {/* Editable Subtitle */}
            {isEditing ? (
              <input
                type="text"
                className="form-input"
                value={checklistSubtitle}
                onChange={(e) => setChecklistSubtitle(e.target.value)}
                placeholder="Section subtitle / description..."
                style={{ fontSize: '0.74rem', padding: '3px 8px', marginBottom: 10, color: 'var(--text-muted)' }}
              />
            ) : (
              checklistSubtitle && (
                <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                  {checklistSubtitle}
                </p>
              )
            )}

            {/* Items List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {checklist.length === 0 && !isEditing && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '6px 0' }}>
                  No checklist items added yet.
                </div>
              )}
              {checklist.map((checkText, idx) => {
                const isChecked = !!checkedItems[`${item.id}_${idx}`];

                return (
                  <div 
                    key={idx}
                    onClick={() => !isEditing && toggleCheck(`${item.id}_${idx}`)}
                    style={{
                      background: isChecked ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                      border: `1px solid ${isChecked ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 255, 255, 0.06)'}`,
                      borderRadius: 10,
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: isEditing ? 'default' : 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      border: `1.5px solid ${isChecked ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.3)'}`,
                      background: isChecked ? 'var(--accent-cyan)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {isChecked && <CheckCircle2 size={13} color="#060913" />}
                    </div>

                    {isEditing ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input 
                          type="text" 
                          value={checkText}
                          onChange={(e) => handleUpdateChecklist(idx, e.target.value)}
                          className="form-input"
                          style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                        />
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRemoveChecklist(idx); }}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <span style={{ 
                        fontSize: '0.82rem', 
                        color: isChecked ? '#fff' : '#cbd5e1', 
                        textDecoration: isChecked ? 'line-through' : 'none' 
                      }}>
                        {checkText}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* =========================================================
              CUSTOM SECTIONS (Admin can add arbitrary new headings)
              ========================================================= */}
          {customSections.map((sec) => (
            <div key={sec.id} style={{ borderTop: '1px solid rgba(255, 255, 255, 0.07)', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, marginRight: 10 }}>
                  <Layers size={16} color="#38bdf8" style={{ flexShrink: 0 }} />

                  {isEditing ? (
                    <input
                      type="text"
                      className="form-input"
                      value={sec.title}
                      onChange={(e) => handleUpdateCustomSection(sec.id, 'title', e.target.value)}
                      placeholder="Custom Section Heading..."
                      style={{
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        padding: '4px 8px',
                        color: '#fff',
                        background: 'rgba(0, 0, 0, 0.4)',
                        borderColor: 'rgba(56, 189, 248, 0.4)',
                        width: '100%'
                      }}
                    />
                  ) : (
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                      {sec.title}
                    </h4>
                  )}
                </div>

                {isEditing && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => handleAddCustomSectionItem(sec.id)}
                      style={{
                        fontSize: '0.72rem',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px dashed var(--border-glass)',
                        color: '#38bdf8',
                        padding: '3px 8px',
                        borderRadius: 6,
                        cursor: 'pointer'
                      }}
                    >
                      + Add Item
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomSection(sec.id)}
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 2 }}
                      title="Delete section"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Subtitle */}
              {isEditing ? (
                <input
                  type="text"
                  className="form-input"
                  value={sec.subtitle || ''}
                  onChange={(e) => handleUpdateCustomSection(sec.id, 'subtitle', e.target.value)}
                  placeholder="Subtitle / description..."
                  style={{ fontSize: '0.74rem', padding: '3px 8px', marginBottom: 10, color: 'var(--text-muted)' }}
                />
              ) : (
                sec.subtitle && (
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                    {sec.subtitle}
                  </p>
                )
              )}

              {/* Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(sec.items || []).map((it, itIdx) => (
                  <div 
                    key={itIdx}
                    style={{
                      background: 'rgba(56, 189, 248, 0.05)',
                      border: '1px solid rgba(56, 189, 248, 0.15)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10
                    }}
                  >
                    <span style={{ color: '#38bdf8', fontSize: '0.8rem', marginTop: 1 }}>•</span>

                    {isEditing ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input 
                          type="text" 
                          value={it}
                          onChange={(e) => handleUpdateCustomSectionItem(sec.id, itIdx, e.target.value)}
                          className="form-input"
                          style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                        />
                        <button 
                          type="button"
                          onClick={() => handleRemoveCustomSectionItem(sec.id, itIdx)}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.45 }}>
                        {it}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Add Custom Section Button when editing */}
          {isEditing && (
            <button
              type="button"
              onClick={handleAddCustomSection}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px dashed rgba(255, 255, 255, 0.2)',
                color: 'var(--accent-cyan)',
                borderRadius: 10,
                padding: '10px 16px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 6
              }}
            >
              <Plus size={15} />
              <span>+ Add Custom Section with Custom Heading</span>
            </button>
          )}

        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.02)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
            {isAdmin ? 'Admin: Click "Edit Headings & Guide" at top to customize' : 'Provided by Admin to guide your decision'}
          </span>

          <div style={{ display: 'flex', gap: 8 }}>
            {isEditing && (
              <>
                <button
                  type="button"
                  className="tab-btn"
                  onClick={() => setIsEditing(false)}
                  style={{ padding: '7px 14px', fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGuidelines}
                  disabled={saving}
                  style={{
                    background: 'var(--primary-gradient)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '7px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 10px rgba(99, 102, 241, 0.4)'
                  }}
                >
                  <Save size={14} />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </>
            )}

            <button
              type="button"
              className="tab-btn"
              onClick={onClose}
              style={{ padding: '7px 16px', fontSize: '0.82rem' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
