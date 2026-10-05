import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ListChecks, 
  Plus, 
  Trash2, 
  Save, 
  Loader2, 
  HelpCircle, 
  Check, 
  CheckSquare, 
  Radio, 
  FileText, 
  SlidersHorizontal,
  Star,
  ThumbsUp,
  Image as ImageIcon,
  Sparkles,
  Upload,
  Globe,
  UserCheck,
  Search,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AVATAR_PRESETS } from '../utils/helpers';

const SAMPLE_DESIGNS = [
  {
    title: 'Mobile App Redesign v2',
    desc: 'New dark-mode onboarding and navigation flow for mobile banking clients.',
    url: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=1200&auto=format&fit=crop&q=80'
  },
  {
    title: 'Analytics SaaS Dashboard',
    desc: 'Executive analytics dashboard with realtime ARR, churn and conversion funnel metrics.',
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&auto=format&fit=crop&q=80'
  },
  {
    title: 'Minimalist E-Commerce Checkout',
    desc: 'Frictionless one-click checkout modal with payment method cards.',
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&auto=format&fit=crop&q=80'
  },
  {
    title: 'Brand Identity & Color Guide',
    desc: 'Primary and secondary brand palette guidelines for Q3 marketing collaterals.',
    url: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1200&auto=format&fit=crop&q=80'
  }
];

const QUESTION_TEMPLATES = [
  {
    name: 'Comprehensive Design Audit',
    questions: [
      { id: 'q_2opts', text: 'Does this image strictly follow the brand style guidelines?', type: 'two_options', options: ['Meets Guidelines', 'Needs Adjustment'], required: false },
      { id: 'q_multichoice', text: 'Which visual aspects are executed well? (Select all that apply)', type: 'multi_choice', options: ['Typography & Hierarchy', 'Color Balance', 'Whitespace & Padding', 'Icon & Graphic Quality'], required: false },
      { id: 'q_status', text: 'Current production readiness level', type: 'choice', options: ['Ready to Ship', 'Minor Tweaks Required', 'Major Rework Needed'], required: false },
      { id: 'q_feedback', text: 'Type your feedback and specific suggestions for improvement', type: 'type_answer', required: false }
    ]
  },
  {
    name: 'Quick 2-Option & Text Poll',
    questions: [
      { id: 'q_approval', text: 'Is this asset approved for release?', type: 'two_options', options: ['Approved', 'Rejected'], required: true },
      { id: 'q_critique', text: 'Type your explanation or critique', type: 'type_answer', required: false }
    ]
  }
];

export default function EditQuestionnaireModal({ isOpen, onClose, item, onQuestionsUpdated, onUpdated }) {
  const { token } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [imageUrl, setImageUrl] = useState('');
  const [includeImage, setIncludeImage] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);
  const isMouseDownOnOverlay = useRef(false);

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

  // Target Audience state (who this post is sent to)
  const [targetType, setTargetType] = useState('all'); // 'all' | 'specific'
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState('');

  // Fetch employees list for recipient targeting
  useEffect(() => {
    if (!isOpen || !token) return;
    setEmployeesLoading(true);
    fetch('/api/admin/employees', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) {
          return fetch('/api/contacts', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => ({ employees: (d.contacts || []).filter(c => !c.isAdmin) }));
        }
        return res.json();
      })
      .then(data => {
        setEmployees(data.employees || []);
      })
      .catch(err => {
        console.error('Failed to fetch employees for targeting:', err);
      })
      .finally(() => {
        setEmployeesLoading(false);
      });
  }, [isOpen, token]);

  const toggleEmployeeSelection = (id) => {
    setSelectedUserIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllEmployees = () => {
    setSelectedUserIds(employees.map(e => e.id));
  };

  const handleDeselectAllEmployees = () => {
    setSelectedUserIds([]);
  };

  const filteredEmployees = employees.filter(emp => {
    if (!searchEmployeeQuery.trim()) return true;
    const q = searchEmployeeQuery.toLowerCase();
    const name = (emp.displayName || emp.username || '').toLowerCase();
    const role = (emp.role || '').toLowerCase();
    return name.includes(q) || role.includes(q);
  });

  useEffect(() => {
    if (!item) return;
    setImageUrl(item.imageUrl || '');
    setIncludeImage(!!item.imageUrl);
    setTitle(item.title || '');
    setDescription(item.description || '');

    const isTargeted = Array.isArray(item.targetUserIds) && item.targetUserIds.length > 0;
    setTargetType(isTargeted ? 'specific' : 'all');
    setSelectedUserIds(isTargeted ? [...item.targetUserIds] : []);
    setSearchEmployeeQuery('');

    const initial = (item.questions || []).map((q, idx) => ({
      id: q.id || `q_${Date.now()}_${idx}`,
      text: q.text || '',
      type: q.type === 'boolean' ? 'two_options' : (q.type === 'text' ? 'type_answer' : q.type),
      required: !!q.required,
      enabled: true,
      correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : null,
      optionImages: Array.isArray(q.optionImages) ? [...q.optionImages] : [],
      options: Array.isArray(q.options) && q.options.length > 0 
        ? [...q.options] 
        : (q.type === 'yes_no' ? ['Yes', 'No'] : (q.type === 'verdict' ? ['Good', 'Bad'] : (q.type === 'two_options' || q.type === 'boolean' ? ['Option A', 'Option B'] : ['Option 1', 'Option 2', 'Option 3'])))
    }));

    setQuestions(initial.length > 0 ? initial : [
      { id: 'q_verdict', text: 'Overall Verdict: Is this design Good or Bad?', type: 'verdict', options: ['Good', 'Bad'], required: true, enabled: true },
      { id: 'q_feedback', text: 'Type your answer or feedback', type: 'type_answer', required: false, enabled: true }
    ]);
    setError('');
    setSuccess(false);
  }, [item, isOpen]);

  if (!isOpen || !item) return null;

  const handleApplyTemplate = (tmpl) => {
    setQuestions(tmpl.questions.map(q => ({
      ...q,
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      enabled: true,
      correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : null,
      options: q.options ? [...q.options] : (q.type === 'yes_no' ? ['Yes', 'No'] : (q.type === 'verdict' ? ['Good', 'Bad'] : []))
    })));
  };

  const handleToggleKeepQuestion = (id) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, enabled: q.enabled === false ? true : false } : q));
  };

  const handleSelectAll = (keep) => {
    setQuestions(prev => prev.map(q => ({ ...q, enabled: keep })));
  };

  const handleClearAll = () => {
    setQuestions([]);
  };

  const handleAddQuestion = (type = 'yes_no') => {
    const defaultTexts = {
      yes_no: 'Is this requirement or statement correct?',
      type_answer: 'Type your answer or feedback for this design',
      two_options: 'Does this meet quality guidelines?',
      choice: 'Select readiness status',
      multi_choice: 'Select all features that apply to this design',
      rating: 'Rate the aesthetic quality (1 to 5 stars)',
      verdict: 'Overall Verdict: Up or Down?'
    };

    let defaultOpts = [];
    if (type === 'yes_no') {
      defaultOpts = ['Yes', 'No'];
    } else if (type === 'two_options') {
      defaultOpts = ['Option A', 'Option B'];
    } else if (type === 'verdict') {
      defaultOpts = ['Up', 'Down'];
    } else if (type === 'choice') {
      defaultOpts = ['High Quality', 'Acceptable', 'Needs Rework'];
    } else if (type === 'multi_choice') {
      defaultOpts = ['Typography', 'Color Contrast', 'Layout & Spacing', 'Icon Consistency'];
    }

    const newQ = {
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      text: defaultTexts[type] || 'New question for employees',
      type,
      required: false,
      enabled: true,
      options: defaultOpts,
      correctAnswer: null // Can be assigned now or assigned later!
    };
    setQuestions(prev => [...prev, newQ]);
  };

  const handleUpdateQuestion = (id, field, value) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === id) {
        const updated = { ...q, [field]: value };
        if (field === 'type') {
          if (value === 'yes_no') {
            updated.options = ['Yes', 'No'];
          } else if (value === 'verdict' && (!q.options || q.options.length < 2)) {
            updated.options = ['Up', 'Down'];
          } else if (value === 'two_options' && (!q.options || q.options.length < 2)) {
            updated.options = ['Option A', 'Option B'];
          } else if ((value === 'choice' || value === 'multi_choice') && (!q.options || q.options.length === 0)) {
            updated.options = ['Option 1', 'Option 2', 'Option 3'];
          }
        }
        return updated;
      }
      return q;
    }));
  };

  const handleDeleteQuestion = (id) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleAddOption = (qId) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        const currentOpts = q.options || [];
        return { ...q, options: [...currentOpts, `Option ${currentOpts.length + 1}`] };
      }
      return q;
    }));
  };

  const handleUpdateOption = (qId, optIdx, newVal) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        const newOpts = [...(q.options || [])];
        newOpts[optIdx] = newVal;
        return { ...q, options: newOpts };
      }
      return q;
    }));
  };

  const handleRemoveOption = (qId, optIdx) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        const newOpts = (q.options || []).filter((_, idx) => idx !== optIdx);
        return { ...q, options: newOpts };
      }
      return q;
    }));
  };

  const handleUpdateOptionImage = (qId, optIdx, newVal) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        const newImages = [...(q.optionImages || [])];
        newImages[optIdx] = newVal;
        return { ...q, optionImages: newImages };
      }
      return q;
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target.result);
      setIncludeImage(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const targetImageUrl = includeImage ? (imageUrl || '').trim() : null;
    if (includeImage && !targetImageUrl) {
      setError('Please upload an image, select a preset, or uncheck "Include Target Image" to keep it text-only');
      return;
    }

    if (targetType === 'specific' && selectedUserIds.length === 0) {
      setError('Please select at least one employee recipient, or switch to All Employees.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const activeQuestions = questions
        .filter(q => q.enabled !== false && q.text && q.text.trim())
        .map(q => ({
          ...q,
          options: Array.isArray(q.options) ? q.options.map(o => String(o).trim()).filter(Boolean) : (q.type === 'yes_no' ? ['Yes', 'No'] : []),
          optionImages: Array.isArray(q.optionImages) ? q.optionImages.map(o => (o || '').trim()) : [],
          correctAnswer: q.correctAnswer !== undefined && q.correctAnswer !== null && q.correctAnswer !== '' ? String(q.correctAnswer).trim() : null
        }));

      const res = await fetch(`/api/dashboard/items/${item.id}/questions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          questions: activeQuestions,
          imageUrl: targetImageUrl,
          title: title.trim() || item.title,
          description: description.trim(),
          targetUserIds: targetType === 'specific' ? selectedUserIds : null
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update questionnaire');
      }

      setSuccess(true);
      if (onQuestionsUpdated) {
        onQuestionsUpdated(data.item);
      } else if (onUpdated) {
        onUpdated(data.item);
      }
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
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
          maxWidth: 680, 
          width: '92vw', 
          maxHeight: '90vh', 
          overflowY: 'auto',
          background: 'rgba(15, 20, 32, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '24px 26px'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'var(--primary-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)'
            }}>
              <ListChecks size={20} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.12rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                Configure Questionnaire
              </h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Admin: Add multiple choice, typed answers, 2-options, or multiple options
              </p>
            </div>
          </div>

          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Template Quick Actions & Toolbars */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 10,
          padding: '8px 12px',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 600 }}>
              Presets:
            </span>
            {QUESTION_TEMPLATES.map((tmpl, idx) => (
              <button
                key={idx}
                type="button"
                className="tab-btn"
                onClick={() => handleApplyTemplate(tmpl)}
                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              >
                {tmpl.name}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              className="tab-btn"
              style={{ fontSize: '0.7rem', padding: '3px 7px' }}
            >
              Keep All
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll(false)}
              className="tab-btn"
              style={{ fontSize: '0.7rem', padding: '3px 7px' }}
            >
              Skip All
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="tab-btn"
              style={{ fontSize: '0.7rem', padding: '3px 7px', color: '#f87171' }}
            >
              Clear All
            </button>
          </div>
        </div>

        {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

        <form 
          onSubmit={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
              e.preventDefault();
            }
          }}
        >
          {/* Target Image & Review Details Section */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.025)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={includeImage}
                  onChange={(e) => setIncludeImage(e.target.checked)}
                  style={{ accentColor: 'var(--accent-cyan)', width: 16, height: 16, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
                  Target Image {includeImage ? (imageUrl ? '(Attached)' : '(Upload or Choose)') : '(Skipped • Text-Only Questionnaire)'}
                </span>
              </label>

              {includeImage && imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  style={{ fontSize: '0.72rem', color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Trash2 size={13} />
                  <span>Remove Image</span>
                </button>
              )}
            </div>

            {includeImage ? (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />

                {imageUrl ? (
                  <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-glass)', marginBottom: 10 }}>
                    <img
                      src={imageUrl}
                      alt="Review Target"
                      style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }}
                    />
                    <div style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      display: 'flex',
                      gap: 6
                    }}>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="tab-btn"
                        style={{ fontSize: '0.72rem', padding: '4px 8px', background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)' }}
                      >
                        Replace Image
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        style={{
                          background: 'rgba(0, 0, 0, 0.75)',
                          border: 'none',
                          color: '#f87171',
                          borderRadius: '50%',
                          width: 28,
                          height: 28,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        title="Remove image"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed rgba(99, 102, 241, 0.45)',
                      borderRadius: 10,
                      padding: '16px 14px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: 'rgba(99, 102, 241, 0.06)',
                      marginBottom: 10
                    }}
                  >
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#fff' }}>
                      Click to upload new target image
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: 2 }}>
                      Supports PNG, JPG, WEBP, GIF
                    </div>
                  </div>
                )}

                {/* Quick Presets */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={11} color="#a855f7" /> Quick Presets:
                  </span>
                  {SAMPLE_DESIGNS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="demo-badge-btn"
                      onClick={() => setImageUrl(s.url)}
                      style={{ fontSize: '0.7rem', padding: '3px 7px' }}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed rgba(255, 255, 255, 0.12)',
                color: 'var(--text-muted)',
                fontSize: '0.8rem',
                marginBottom: 10
              }}>
                Target image removed. This review will be presented as a text-only survey / questionnaire.
              </div>
            )}

            {/* Title & Description Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.76rem' }}>Review Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                    }
                  }}
                  placeholder="Review title..."
                  autoComplete="off"
                  style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.76rem' }}>Context / Instructions for Employees</label>
                <textarea
                  className="form-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Context & instructions for employees..."
                  rows={2}
                  style={{ fontSize: '0.8rem', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* Target Audience / Sent To Section */}
          <div className="form-group instruction-audience-wrapper" style={{
            background: 'rgba(255, 255, 255, 0.025)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={15} color="var(--accent-cyan)" />
                <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#fff' }}>Sent To / Target Audience</span>
              </div>
              <div>
                {targetType === 'specific' ? (
                  <span style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: '#818cf8',
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    padding: '2px 8px',
                    borderRadius: 10
                  }}>
                    🎯 Sent to {selectedUserIds.length} Employee{selectedUserIds.length === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: '#34d399',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    padding: '2px 8px',
                    borderRadius: 10
                  }}>
                    👥 Broadcasted to All Employees
                  </span>
                )}
              </div>
            </div>

            {/* Toggle Switch */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: targetType === 'specific' ? 12 : 0 }}>
              <button
                type="button"
                className={`audience-segment-btn ${targetType === 'all' ? 'active' : ''}`}
                onClick={() => setTargetType('all')}
              >
                <Globe size={16} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>All Employees</div>
                  <div style={{ fontSize: '0.68rem', opacity: 0.75 }}>Broadcast to everyone on the team</div>
                </div>
              </button>

              <button
                type="button"
                className={`audience-segment-btn ${targetType === 'specific' ? 'active' : ''}`}
                onClick={() => setTargetType('specific')}
              >
                <UserCheck size={16} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>Specific People</div>
                  <div style={{ fontSize: '0.68rem', opacity: 0.75 }}>Only chosen team members will see & answer</div>
                </div>
              </button>
            </div>

            {/* Specific Recipient Picker Box */}
            {targetType === 'specific' && (
              <div className="audience-picker-box">
                {/* Search & Bulk Select Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search employees by name or @handle..."
                      value={searchEmployeeQuery}
                      onChange={(e) => setSearchEmployeeQuery(e.target.value)}
                      style={{ paddingLeft: 26, fontSize: '0.76rem', height: 28, padding: '4px 8px 4px 26px' }}
                    />
                  </div>
                  <button
                    type="button"
                    className="demo-badge-btn"
                    onClick={handleSelectAllEmployees}
                    style={{ fontSize: '0.72rem', padding: '4px 8px', whiteSpace: 'nowrap' }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="demo-badge-btn"
                    onClick={handleDeselectAllEmployees}
                    style={{ fontSize: '0.72rem', padding: '4px 8px', whiteSpace: 'nowrap' }}
                  >
                    Deselect All
                  </button>
                </div>

                {/* Employees Chip Grid */}
                {employeesLoading ? (
                  <div style={{ textAlign: 'center', padding: '12px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Loading employee directory...
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '12px 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {searchEmployeeQuery ? 'No matching employees found' : 'No employees available to select'}
                  </div>
                ) : (
                  <div className="audience-chip-grid">
                    {filteredEmployees.map(emp => {
                      const isSelected = selectedUserIds.includes(emp.id);
                      return (
                        <div
                          key={emp.id}
                          className={`audience-user-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleEmployeeSelection(emp.id)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // handled by parent click
                            style={{ accentColor: 'var(--accent-cyan)', width: 14, height: 14, cursor: 'pointer' }}
                          />
                          <img
                            src={emp.avatar || (AVATAR_PRESETS && AVATAR_PRESETS[0]) || `https://api.dicebear.com/7.x/bottts/svg?seed=${emp.username}`}
                            alt={emp.displayName || emp.username}
                            style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {emp.displayName || emp.username}
                            </div>
                            <div style={{ fontSize: '0.67rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              @{emp.username}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Question List Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
              Questionnaire ({questions.filter(q => q.enabled !== false).length} Active)
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Check/uncheck to keep or skip individual questions
            </span>
          </div>

          {/* Question List */}
          {questions.length === 0 ? (
            <div style={{
              padding: '24px 16px',
              textAlign: 'center',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px dashed rgba(255, 255, 255, 0.1)',
              borderRadius: 12,
              marginBottom: 16
            }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: 0 }}>
                No questions. Click a template above or add a question below to attach to this item.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {questions.map((q, idx) => (
                <div
                  key={q.id || idx}
                  style={{
                    background: q.enabled === false ? 'rgba(255, 255, 255, 0.015)' : 'rgba(255, 255, 255, 0.03)',
                    border: q.enabled === false ? '1px dashed rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 12,
                    padding: '14px 16px',
                    opacity: q.enabled === false ? 0.6 : 1,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        background: q.enabled === false ? 'rgba(255, 255, 255, 0.08)' : 'rgba(99, 102, 241, 0.2)',
                        color: q.enabled === false ? 'var(--text-muted)' : 'var(--accent-cyan)',
                        padding: '2px 6px',
                        borderRadius: 6
                      }}>
                        Q{idx + 1}
                      </span>

                      {/* Keep or Skip Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleKeepQuestion(q.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: q.enabled === false ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.15)',
                          border: `1px solid ${q.enabled === false ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.35)'}`,
                          color: q.enabled === false ? '#f87171' : '#34d399',
                          transition: 'all 0.15s ease'
                        }}
                        title={q.enabled === false ? "Click to keep in survey" : "Click to exclude from survey"}
                      >
                        {q.enabled === false ? '✕ Excluded' : '✓ Kept in Survey'}
                      </button>

                      {/* Required toggle */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!q.required}
                          onChange={(e) => handleUpdateQuestion(q.id, 'required', e.target.checked)}
                          style={{ accentColor: 'var(--accent-cyan)', width: 13, height: 13 }}
                        />
                        <span>Required</span>
                      </label>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <select
                        value={q.type}
                        onChange={(e) => handleUpdateQuestion(q.id, 'type', e.target.value)}
                        style={{
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid var(--border-glass)',
                          color: '#fff',
                          fontSize: '0.74rem',
                          borderRadius: 6,
                          padding: '4px 8px'
                        }}
                      >
                        <option value="yes_no">❓ Yes / No (Right / Wrong Quiz)</option>
                        <option value="two_options">⚖️ 2 Options (Custom A / B)</option>
                        <option value="multi_choice">☑️ Multiple Choice (Select Multiple)</option>
                        <option value="choice">🔘 Multiple Options (Single Pick)</option>
                        <option value="type_answer">✍️ Type Your Answer (Text Field)</option>
                        <option value="rating">⭐ 1-5 Star Rating</option>
                        <option value="verdict">👍 Up or Down (Verdict)</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(q.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f87171',
                          cursor: 'pointer',
                          padding: 4
                        }}
                        title="Delete question"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Question Text */}
                  <input
                    type="text"
                    className="form-input"
                    value={q.text}
                    onChange={(e) => handleUpdateQuestion(q.id, 'text', e.target.value)}
                    placeholder="Enter question text for employees..."
                    style={{ fontSize: '0.86rem', padding: '8px 12px', marginBottom: 10 }}
                    required
                  />

                  {/* 0. Yes / No Quiz (with Right / Wrong answer key assignment) */}
                  {q.type === 'yes_no' && (
                    <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 14px', borderRadius: 8, marginBottom: 10, border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.76rem', color: 'var(--accent-cyan)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span>❓</span> Yes / No Question Options
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                          Standard Yes / No Options
                        </span>
                      </div>

                      {/* Options Preview */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: q.correctAnswer === 'Yes' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                          border: `1px solid ${q.correctAnswer === 'Yes' ? '#10b981' : 'rgba(255, 255, 255, 0.1)'}`,
                          color: q.correctAnswer === 'Yes' ? '#34d399' : '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <span style={{ fontWeight: 700, fontSize: '0.84rem' }}>✓ Yes</span>
                          {q.correctAnswer === 'Yes' && <span style={{ fontSize: '0.68rem', background: '#10b981', color: '#000', fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>RIGHT ANSWER</span>}
                        </div>
                        <div style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: q.correctAnswer === 'No' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                          border: `1px solid ${q.correctAnswer === 'No' ? '#10b981' : 'rgba(255, 255, 255, 0.1)'}`,
                          color: q.correctAnswer === 'No' ? '#34d399' : '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <span style={{ fontWeight: 700, fontSize: '0.84rem' }}>✕ No</span>
                          {q.correctAnswer === 'No' && <span style={{ fontSize: '0.68rem', background: '#10b981', color: '#000', fontWeight: 800, padding: '1px 6px', borderRadius: 4 }}>RIGHT ANSWER</span>}
                        </div>
                      </div>

                    </div>
                  )}

                  {/* 1. Verdict (Good / Bad or Up / Down Custom Labels) */}
                  {q.type === 'verdict' && (
                    <div style={{ background: 'rgba(0, 0, 0, 0.22)', padding: '12px 14px', borderRadius: 8, marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                          Verdict Option Labels (Good/Bad or Up/Down):
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateOption(q.id, 0, 'Good');
                              handleUpdateOption(q.id, 1, 'Bad');
                            }}
                            className="demo-badge-btn"
                            style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                            title="Preset: Good / Bad"
                          >
                            👍 Good / 👎 Bad
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateOption(q.id, 0, 'Up');
                              handleUpdateOption(q.id, 1, 'Down');
                              if (q.text.includes('Good or Bad') || q.text.includes('Standard') || !q.text) {
                                handleUpdateQuestion(q.id, 'text', 'Overall Verdict: Up or Down?');
                              }
                            }}
                            className="demo-badge-btn"
                            style={{ fontSize: '0.7rem', padding: '3px 8px', borderColor: 'rgba(99, 102, 241, 0.45)', color: '#c7d2fe' }}
                            title="Preset: Up / Down"
                          >
                            👍 Up / 👎 Down
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateOption(q.id, 0, 'Thumbs Up');
                              handleUpdateOption(q.id, 1, 'Thumbs Down');
                            }}
                            className="demo-badge-btn"
                            style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                            title="Preset: Thumbs Up / Down"
                          >
                            👍 Thumbs Up / Down
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>Option 1 (Positive / Up)</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            <span style={{ fontSize: '0.85rem' }}>👍</span>
                            <input
                              type="text"
                              value={q.options?.[0] ?? 'Good'}
                              onChange={(e) => handleUpdateOption(q.id, 0, e.target.value)}
                              className="form-input"
                              style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                              placeholder="e.g. Good, Up, Approved"
                            />
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 600 }}>Option 2 (Negative / Down)</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            <span style={{ fontSize: '0.85rem' }}>👎</span>
                            <input
                              type="text"
                              value={q.options?.[1] ?? 'Bad'}
                              onChange={(e) => handleUpdateOption(q.id, 1, e.target.value)}
                              className="form-input"
                              style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                              placeholder="e.g. Bad, Down, Rejected"
                            />
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, fontSize: '0.74rem', marginTop: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Live Preview:</span>
                        <span className="eval-badge good">👍 {q.options?.[0] || 'Good'}</span>
                        <span className="eval-badge bad">👎 {q.options?.[1] || 'Bad'}</span>
                      </div>
                    </div>
                  )}

                  {/* 2. 2 Options (Customizable Option 1 & 2) */}
                  {(q.type === 'two_options' || q.type === 'boolean') && (
                    <div style={{ background: 'rgba(0, 0, 0, 0.22)', padding: '10px 12px', borderRadius: 8, marginBottom: 6 }}>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginBottom: 6 }}>
                        Customize 2 Options:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Option 1 Label</label>
                          <input
                            type="text"
                            value={q.options?.[0] ?? 'Option A'}
                            onChange={(e) => handleUpdateOption(q.id, 0, e.target.value)}
                            className="form-input"
                            style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                            placeholder="e.g. Yes, Pass, Approved"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Option 2 Label</label>
                          <input
                            type="text"
                            value={q.options?.[1] ?? 'Option B'}
                            onChange={(e) => handleUpdateOption(q.id, 1, e.target.value)}
                            className="form-input"
                            style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                            placeholder="e.g. No, Fail, Rejected"
                          />
                        </div>
                      </div>

                      {/* Optional Option Images for A/B Visual Comparison */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8, paddingTop: 8, borderTop: '1px dashed rgba(255, 255, 255, 0.08)' }}>
                        <div>
                          <label style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Option 1 Image URL (Optional)</label>
                          <input
                            type="text"
                            value={q.optionImages?.[0] || ''}
                            onChange={(e) => handleUpdateOptionImage(q.id, 0, e.target.value)}
                            className="form-input"
                            style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                            placeholder="https://... (Image A)"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Option 2 Image URL (Optional)</label>
                          <input
                            type="text"
                            value={q.optionImages?.[1] || ''}
                            onChange={(e) => handleUpdateOptionImage(q.id, 1, e.target.value)}
                            className="form-input"
                            style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                            placeholder="https://... (Image B)"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. Multiple Choice (Multi-Select) */}
                  {q.type === 'multi_choice' && (
                    <div style={{ background: 'rgba(0, 0, 0, 0.22)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                          Options (Employees can check multiple):
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                          Multi-Select
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(q.options || []).map((opt, optIdx) => (
                          <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.8rem' }}>☑️</span>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => handleUpdateOption(q.id, optIdx, e.target.value)}
                              className="form-input"
                              style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                              placeholder={`Option ${optIdx + 1}`}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(q.id, optIdx)}
                              style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px 4px' }}
                              title="Delete option"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAddOption(q.id)}
                          style={{
                            fontSize: '0.74rem',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px dashed var(--border-glass)',
                            color: 'var(--accent-cyan)',
                            borderRadius: 6,
                            padding: '5px 10px',
                            cursor: 'pointer',
                            marginTop: 4,
                            alignSelf: 'flex-start'
                          }}
                        >
                          + Add Choice Option
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 4. Multiple Options (Single Pick) */}
                  {q.type === 'choice' && (
                    <div style={{ background: 'rgba(0, 0, 0, 0.22)', padding: '10px 12px', borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                          Options (Employees pick one):
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Single Pick
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(q.options || []).map((opt, optIdx) => (
                          <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.8rem' }}>🔘</span>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => handleUpdateOption(q.id, optIdx, e.target.value)}
                              className="form-input"
                              style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                              placeholder={`Option ${optIdx + 1}`}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(q.id, optIdx)}
                              style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px 4px' }}
                              title="Delete option"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAddOption(q.id)}
                          style={{
                            fontSize: '0.74rem',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px dashed var(--border-glass)',
                            color: 'var(--accent-cyan)',
                            borderRadius: 6,
                            padding: '5px 10px',
                            cursor: 'pointer',
                            marginTop: 4,
                            alignSelf: 'flex-start'
                          }}
                        >
                          + Add Option
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 5. Type Your Answer */}
                  {(q.type === 'type_answer' || q.type === 'text') && (
                    <div style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px dashed rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: '0.76rem',
                      color: 'var(--text-dim)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <span>✍️</span>
                      <span>Employees will type their response in a written text area.</span>
                    </div>
                  )}

                  {/* 6. Rating preview */}
                  {q.type === 'rating' && (
                    <div style={{ display: 'flex', gap: 4, color: '#fbbf24', fontSize: '0.84rem' }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star key={star} size={15} fill="#fbbf24" />
                      ))}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 6 }}>1 to 5 Stars scale</span>
                    </div>
                  )}

                  {/* Universal Answer Key Designation: Which answer is RIGHT? */}
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    marginTop: 10
                  }}>
                    <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <span>🎯 Which answer is RIGHT? (You can assign or change this later)</span>
                      <span style={{ fontSize: '0.68rem', color: q.correctAnswer ? '#34d399' : '#f59e0b', fontWeight: 600 }}>
                        {q.correctAnswer ? `Key: '${q.correctAnswer}' is Right` : '⚪ Unassigned (Opinion / Ungraded Poll)'}
                      </span>
                    </div>

                    {/* Options-based types: yes_no, two_options, verdict, choice, multi_choice */}
                    {(q.type === 'yes_no' || q.type === 'two_options' || q.type === 'boolean' || q.type === 'verdict' || q.type === 'choice' || q.type === 'multi_choice') && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuestion(q.id, 'correctAnswer', null)}
                          style={{
                            fontSize: '0.72rem',
                            padding: '5px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: !q.correctAnswer ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${!q.correctAnswer ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)'}`,
                            color: !q.correctAnswer ? '#fbbf24' : 'var(--text-muted)',
                            fontWeight: !q.correctAnswer ? 700 : 500
                          }}
                        >
                          ⚪ Assign Later / No Key
                        </button>

                        {(q.type === 'yes_no' ? ['Yes', 'No'] : (q.options || [])).map((opt, optIdx) => {
                          const isRight = q.correctAnswer === opt;
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => handleUpdateQuestion(q.id, 'correctAnswer', opt)}
                              style={{
                                fontSize: '0.72rem',
                                padding: '5px 10px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                background: isRight ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                                border: `1px solid ${isRight ? '#10b981' : 'rgba(255, 255, 255, 0.1)'}`,
                                color: isRight ? '#34d399' : 'var(--text-muted)',
                                fontWeight: isRight ? 700 : 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <span>{isRight ? '✅' : '⚪'}</span>
                              <span>'{opt}' is Right</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Rating Type (1 to 5 Stars) */}
                    {q.type === 'rating' && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuestion(q.id, 'correctAnswer', null)}
                          style={{
                            fontSize: '0.72rem',
                            padding: '5px 10px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            background: !q.correctAnswer ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${!q.correctAnswer ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)'}`,
                            color: !q.correctAnswer ? '#fbbf24' : 'var(--text-muted)',
                            fontWeight: !q.correctAnswer ? 700 : 500
                          }}
                        >
                          ⚪ Assign Later / No Key
                        </button>
                        {[1, 2, 3, 4, 5].map(star => {
                          const starVal = String(star);
                          const isRight = q.correctAnswer === starVal;
                          return (
                            <button
                              key={star}
                              type="button"
                              onClick={() => handleUpdateQuestion(q.id, 'correctAnswer', starVal)}
                              style={{
                                fontSize: '0.72rem',
                                padding: '5px 10px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                background: isRight ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                                border: `1px solid ${isRight ? '#10b981' : 'rgba(255, 255, 255, 0.1)'}`,
                                color: isRight ? '#34d399' : 'var(--text-muted)',
                                fontWeight: isRight ? 700 : 500
                              }}
                            >
                              {isRight ? '✅ ' : ''}{star} Star{star > 1 ? 's' : ''}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Type Answer / Text Field */}
                    {(q.type === 'type_answer' || q.type === 'text') && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{ fontSize: '0.78rem', padding: '5px 10px', flex: 1, minWidth: 200 }}
                          placeholder="Type expected correct text answer (or leave blank for ungraded)..."
                          value={q.correctAnswer || ''}
                          onChange={(e) => handleUpdateQuestion(q.id, 'correctAnswer', e.target.value ? e.target.value : null)}
                        />
                        {q.correctAnswer && (
                          <button
                            type="button"
                            onClick={() => handleUpdateQuestion(q.id, 'correctAnswer', null)}
                            style={{
                              fontSize: '0.72rem',
                              padding: '5px 10px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid #f59e0b',
                              color: '#fbbf24',
                              fontWeight: 600
                            }}
                          >
                            Clear Key
                          </button>
                        )}
                      </div>
                    )}

                    <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 6 }}>
                      💡 Tip: You can leave this unassigned now and assign or change the right answer at any time later from the Statistics & Review dashboard.
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quick Add Buttons Bar */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 20
          }}>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 700, marginBottom: 8 }}>
              + Add Another Question:
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="demo-badge-btn"
                onClick={() => handleAddQuestion('yes_no')}
                style={{ fontSize: '0.76rem', padding: '6px 12px', background: 'rgba(99, 102, 241, 0.25)', borderColor: 'rgba(99, 102, 241, 0.5)', color: '#a5b4fc', fontWeight: 700 }}
              >
                ❓ Yes / No Quiz
              </button>
              <button
                type="button"
                className="demo-badge-btn"
                onClick={() => handleAddQuestion('two_options')}
                style={{ fontSize: '0.76rem', padding: '6px 12px' }}
              >
                ⚖️ 2 Options
              </button>
              <button
                type="button"
                className="demo-badge-btn"
                onClick={() => handleAddQuestion('multi_choice')}
                style={{ fontSize: '0.76rem', padding: '6px 12px' }}
              >
                ☑️ Multiple Choice
              </button>
              <button
                type="button"
                className="demo-badge-btn"
                onClick={() => handleAddQuestion('choice')}
                style={{ fontSize: '0.76rem', padding: '6px 12px' }}
              >
                🔘 Multiple Options
              </button>
              <button
                type="button"
                className="demo-badge-btn"
                onClick={() => handleAddQuestion('type_answer')}
                style={{ fontSize: '0.76rem', padding: '6px 12px' }}
              >
                ✍️ Type Answer
              </button>
              <button
                type="button"
                className="demo-badge-btn"
                onClick={() => handleAddQuestion('rating')}
                style={{ fontSize: '0.76rem', padding: '6px 12px' }}
              >
                ⭐ 1-5 Rating
              </button>
              <button
                type="button"
                className="demo-badge-btn"
                onClick={() => handleAddQuestion('verdict')}
                style={{ fontSize: '0.76rem', padding: '6px 12px', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#6ee7b7' }}
              >
                👍 Up or Down
              </button>
            </div>
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 16 }}>
            <button
              type="button"
              className="tab-btn"
              onClick={onClose}
              style={{ padding: '9px 18px', fontSize: '0.84rem' }}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={saving}
              style={{ padding: '9px 24px', fontSize: '0.86rem', width: 'auto', margin: 0 }}
            >
              {saving ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={16} className="animate-spin" /> Saving Questionnaire...
                </span>
              ) : success ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#34d399' }}>
                  <Check size={16} /> Questionnaire Saved!
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Save size={15} /> Save Questionnaire
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
