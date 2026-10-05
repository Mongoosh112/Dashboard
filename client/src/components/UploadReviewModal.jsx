import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  AlertCircle, 
  Loader2, 
  Plus, 
  Trash2, 
  HelpCircle, 
  ListChecks, 
  Star, 
  ThumbsUp, 
  CheckCircle, 
  MessageSquare,
  Globe,
  UserCheck,
  Search,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AVATAR_PRESETS } from '../utils/helpers';

const SAMPLE_DESIGNS = [
  {
    title: 'Brand Mascot 3D Illustration',
    desc: 'Reviewing 3D lighting, textures, and character expression for onboarding screen.',
    url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?w=1000&auto=format&fit=crop&q=80'
  },
  {
    title: 'SaaS Analytics Dashboard Dark Mode',
    desc: 'Check chart readability and widget hierarchy for executive analytics view.',
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1000&auto=format&fit=crop&q=80'
  },
  {
    title: 'Product Packaging Matte Finish Concept',
    desc: 'Verify typography contrast and logo placement against dark packaging.',
    url: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=1000&auto=format&fit=crop&q=80'
  }
];

const TEMPLATES = [
  {
    name: 'Yes / No Knowledge & Compliance Quiz',
    questions: [
      { id: 'q_yesno_1', text: 'Does this design follow our brand typography guidelines?', type: 'yes_no', options: ['Yes', 'No'], correctAnswer: 'Yes', required: true },
      { id: 'q_yesno_2', text: 'Are there any blurry assets or low-resolution images visible?', type: 'yes_no', options: ['Yes', 'No'], correctAnswer: 'No', required: true },
      { id: 'q_yesno_3', text: 'Does this screen pass the 4.5:1 text accessibility contrast check?', type: 'yes_no', options: ['Yes', 'No'], correctAnswer: 'Yes', required: false },
      { id: 'q_feedback', text: 'Type your feedback and specific suggestions for improvement', type: 'type_answer', required: false }
    ]
  },
  {
    name: 'Comprehensive Design Audit',
    questions: [
      { id: 'q_2opts', text: 'Does this image strictly follow our brand design language?', type: 'two_options', options: ['Follows Brand', 'Deviates from Brand'], required: false },
      { id: 'q_features', text: 'Which areas are executed strongly? (Select all that apply)', type: 'multi_choice', options: ['Typography & Hierarchy', 'Color Balance', 'Whitespace & Padding', 'Icon Quality'], required: false },
      { id: 'q_readiness', text: 'Production Readiness Status', type: 'choice', options: ['Ready to Ship', 'Minor Polish Needed', 'Major Revisions Required'], required: false },
      { id: 'q_feedback', text: 'Type your feedback and specific suggestions for improvement', type: 'type_answer', required: false }
    ]
  },
  {
    name: 'Quick 2-Option & Text Poll',
    questions: [
      { id: 'q_approval', text: 'Is this image approved for release?', type: 'two_options', options: ['Approved', 'Needs Revision'], required: true },
      { id: 'q_feedback', text: 'Type your feedback and critique', type: 'type_answer', required: false }
    ]
  },
  {
    name: 'Multi-Choice Feedback',
    questions: [
      { id: 'q_approval', text: 'Approval Status', type: 'two_options', options: ['Approved', 'Needs Revision'], required: true },
      { id: 'q_issues', text: 'Which elements need polish before launch? (Select all that apply)', type: 'multi_choice', options: ['Contrast / Readability', 'Font Sizing', 'Alignment / Spacing', 'Image Resolution'], required: false },
      { id: 'q_rating', text: 'Overall Aesthetic Polish (1 to 5 Stars)', type: 'rating', required: false },
      { id: 'q_notes', text: 'Type your notes or design suggestions', type: 'type_answer', required: false }
    ]
  }
];

export default function UploadReviewModal({ isOpen, onClose, onItemCreated }) {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [includeImage, setIncludeImage] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

  // Questionnaire state
  const [includeQuestionnaire, setIncludeQuestionnaire] = useState(true);
  const [questions, setQuestions] = useState(() => 
    TEMPLATES[0].questions.map(q => ({
      ...q,
      enabled: true,
      options: q.options ? [...q.options] : (q.type === 'verdict' ? ['Good', 'Bad'] : [])
    }))
  );

  // Knowledge Base & Guidelines state (starts completely empty)
  const [showKbSection, setShowKbSection] = useState(false);
  const [criteriaHeading, setCriteriaHeading] = useState('');
  const [criteriaText, setCriteriaText] = useState('');
  const [tipsHeading, setTipsHeading] = useState('');
  const [tipsText, setTipsText] = useState('');

  // Target Audience state (All Employees vs Specific People)
  const [targetType, setTargetType] = useState('all'); // 'all' | 'specific'
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState('');

  // Fetch employees list to choose recipients from
  React.useEffect(() => {
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
    return (emp.displayName || '').toLowerCase().includes(q) || (emp.username || '').toLowerCase().includes(q);
  });

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target.result);
      if (!title) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ');
        setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSelectSample = (sample) => {
    setTitle(sample.title);
    setDescription(sample.desc);
    setImageUrl(sample.url);
  };

  const handleSelectTemplate = (tmpl) => {
    setIncludeQuestionnaire(true);
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

  const handleSelectAllQuestions = (keep) => {
    setQuestions(prev => prev.map(q => ({ ...q, enabled: keep })));
  };

  const handleClearAllQuestions = () => {
    setQuestions([]);
  };

  // Questionnaire actions
  const handleAddQuestion = (type = 'yes_no') => {
    const defaultTexts = {
      yes_no: 'Is this requirement or statement correct?',
      type_answer: 'Type your answer or feedback for this design',
      two_options: 'Does this meet quality guidelines?',
      boolean: 'Does this meet quality guidelines?',
      choice: 'Select readiness status',
      multi_choice: 'Select all features that apply to this design',
      text: 'Type your answer or feedback for this design',
      rating: 'Rate overall aesthetic appeal (1 to 5 stars)',
      verdict: 'Overall Verdict: Up or Down?'
    };

    let defaultOptions = [];
    if (type === 'yes_no') {
      defaultOptions = ['Yes', 'No'];
    } else if (type === 'two_options' || type === 'boolean') {
      defaultOptions = ['Option A', 'Option B'];
    } else if (type === 'verdict') {
      defaultOptions = ['Up', 'Down'];
    } else if (type === 'choice') {
      defaultOptions = ['High Quality', 'Acceptable', 'Needs Rework'];
    } else if (type === 'multi_choice') {
      defaultOptions = ['Typography', 'Color Contrast', 'Layout & Spacing', 'Icon Consistency'];
    }

    const newQ = {
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      text: defaultTexts[type] || 'New question for employees',
      type: type === 'boolean' ? 'two_options' : (type === 'text' ? 'type_answer' : type),
      required: false,
      enabled: true,
      options: defaultOptions,
      correctAnswer: null // Can be assigned now or assigned later!
    };
    setIncludeQuestionnaire(true);
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

  const handleAddChoiceOption = (qId) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        const currentOpts = q.options || [];
        return { ...q, options: [...currentOpts, `Option ${currentOpts.length + 1}`] };
      }
      return q;
    }));
  };

  const handleUpdateChoiceOption = (qId, optIdx, newVal) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        const newOpts = [...(q.options || [])];
        newOpts[optIdx] = newVal;
        return { ...q, options: newOpts };
      }
      return q;
    }));
  };

  const handleRemoveChoiceOption = (qId, optIdx) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId) {
        const newOpts = (q.options || []).filter((_, idx) => idx !== optIdx);
        return { ...q, options: newOpts };
      }
      return q;
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const targetImageUrl = includeImage ? (imageUrl || '').trim() : null;
    if (includeImage && !targetImageUrl) {
      setError('Please upload an image, select a preset, or uncheck "Include Target Image" to post a text-only survey');
      return;
    }

    if (targetType === 'specific' && selectedUserIds.length === 0) {
      setError('Please select at least one employee, or select "All Employees".');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const activeQuestions = includeQuestionnaire
        ? questions
            .filter(q => q.enabled !== false && q.text && q.text.trim())
            .map(q => ({
              ...q,
              options: Array.isArray(q.options) ? q.options.map(o => String(o).trim()).filter(Boolean) : (q.type === 'yes_no' ? ['Yes', 'No'] : []),
              correctAnswer: q.correctAnswer !== undefined && q.correctAnswer !== null && q.correctAnswer !== '' ? String(q.correctAnswer).trim() : null
            }))
        : [];

      const res = await fetch('/api/dashboard/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: title.trim() || (targetImageUrl ? 'Untitled Review Item' : 'Questionnaire Survey'),
          description: description.trim(),
          imageUrl: targetImageUrl,
          questions: activeQuestions,
          targetUserIds: targetType === 'specific' ? selectedUserIds : null,
          knowledgeBase: {
            criteriaTitle: (criteriaHeading || '').trim() || 'Decision Criteria (Good vs Bad)',
            criteria: (criteriaText || '').split('\n').map(s => s.trim()).filter(Boolean),
            learningTitle: (tipsHeading || '').trim() || 'Things to Learn & Best Practices',
            learningTips: (tipsText || '').split('\n').map(s => s.trim()).filter(Boolean),
            checklistTitle: 'Pre-Evaluation Checklist',
            checklist: []
          }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create review item');
      }

      if (onItemCreated) {
        onItemCreated(data.item);
      }
      onClose();
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
      style={{ zIndex: 350 }}
    >
      <div 
        className="modal-dialog" 
        onClick={(e) => e.stopPropagation()} 
        style={{ maxWidth: 640, width: '92vw', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '12px',
              background: 'var(--primary-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)'
            }}>
              <ListChecks size={20} color="#fff" />
            </div>
            <div>
              <h3 className="modal-title">Create New Post</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Share updates, media, and questionnaire evaluations with your team
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {error && <div className="form-error">{error}</div>}

        <form 
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
              e.preventDefault();
            }
          }}
        >
          {/* 1. Image Upload Area */}
          <div className="form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={includeImage}
                  onChange={(e) => setIncludeImage(e.target.checked)}
                  style={{ accentColor: 'var(--accent-cyan)', width: 16, height: 16, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#fff' }}>
                  1. Target Image {includeImage ? (imageUrl ? '(Attached)' : '(Upload or Choose)') : '(Skipped / Text-Only Survey)'}
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
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />

                {imageUrl ? (
                  <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border-glass)', marginBottom: 10 }}>
                    <img
                      src={imageUrl}
                      alt="Review Target"
                      style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }}
                    />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        background: 'rgba(0, 0, 0, 0.75)',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '50%',
                        width: 32,
                        height: 32,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                      title="Remove image"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed rgba(99, 102, 241, 0.45)',
                      borderRadius: 14,
                      padding: '24px 20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: 'rgba(99, 102, 241, 0.06)',
                      transition: 'all 0.2s ease',
                      marginBottom: 10
                    }}
                  >
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'rgba(99, 102, 241, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 10px auto',
                      color: 'var(--accent-cyan)'
                    }}>
                      <ImageIcon size={22} />
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#fff' }}>
                      Click to upload target image
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 4 }}>
                      Supports PNG, JPG, WEBP, GIF
                    </div>
                  </div>
                )}

                {/* Sample Presets */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={12} color="#a855f7" />
                    Quick Presets:
                  </span>
                  {SAMPLE_DESIGNS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="demo-badge-btn"
                      onClick={() => handleSelectSample(s)}
                      style={{ fontSize: '0.74rem' }}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{
                padding: '12px 16px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px dashed rgba(255, 255, 255, 0.14)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                color: 'var(--text-muted)',
                fontSize: '0.84rem'
              }}>
                <ImageIcon size={20} color="var(--text-dim)" />
                <span>Target image excluded. This item will be posted as a text-only survey / questionnaire.</span>
              </div>
            )}
          </div>

          {/* 2. Review Title & Context */}
          <div className="form-group">
            <label className="form-label">2. Review Title</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Mobile App Redesign v2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                }
              }}
              autoComplete="off"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Instructions / Context for Employees</label>
            <textarea
              className="form-input"
              style={{ minHeight: 65, resize: 'vertical' }}
              placeholder="Provide context on what this image represents and what employees should evaluate..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Target Audience (All Employees vs Specific People) */}
          <div className="form-group instruction-audience-wrapper" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                <Users size={15} color="var(--accent-cyan)" />
                <span style={{ fontWeight: 700, color: '#fff' }}>Target Audience</span>
              </label>
              {targetType === 'specific' && (
                <span style={{ fontSize: '0.74rem', color: selectedUserIds.length > 0 ? '#34d399' : '#f87171', fontWeight: 600 }}>
                  {selectedUserIds.length} employee{selectedUserIds.length === 1 ? '' : 's'} selected
                </span>
              )}
            </div>

            {/* Toggle Switch */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: targetType === 'specific' ? 10 : 0 }}>
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
                    Clear
                  </button>
                </div>

                {/* Employees Chip Grid */}
                {employeesLoading ? (
                  <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    Loading employee directory...
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '14px 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    {searchEmployeeQuery ? 'No employees match search' : 'No employees found in directory'}
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
                            style={{ accentColor: '#6366f1', width: 14, height: 14, cursor: 'pointer' }}
                          />
                          <img
                            src={emp.avatar || (AVATAR_PRESETS && AVATAR_PRESETS[0]) || `https://api.dicebear.com/7.x/bottts/svg?seed=${emp.username}`}
                            alt={emp.displayName}
                            style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {emp.displayName}
                            </div>
                            <div style={{ fontSize: '0.67rem', color: 'var(--text-dim)' }}>
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

          {/* 3. Questionnaire Builder */}
          <div className="form-group" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 16 }}>
          {/* 3. Questionnaire Configuration */}
          <div className="form-group">
            {/* Header with Master Toggle and Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 2 }}>
                  <input
                    type="checkbox"
                    checked={includeQuestionnaire}
                    onChange={(e) => setIncludeQuestionnaire(e.target.checked)}
                    style={{ accentColor: 'var(--accent-cyan)', width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                    3. Attach Questionnaire ({questions.filter(q => q.enabled !== false).length} Active)
                  </span>
                </label>
                <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '2px 0 0 24px' }}>
                  {includeQuestionnaire 
                    ? `${questions.filter(q => q.enabled !== false).length} of ${questions.length} questions kept • Customize options or toggle keep/skip` 
                    : "Disabled: Employees will evaluate with 1-click Good / Bad voting only"}
                </p>
              </div>

              {includeQuestionnaire && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginRight: 2 }}>Presets:</span>
                  {TEMPLATES.map((tmpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectTemplate(tmpl)}
                      className="tab-btn"
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      title={`Apply template: ${tmpl.name}`}
                    >
                      Template {idx + 1}
                    </button>
                  ))}

                  <span style={{ color: 'rgba(255, 255, 255, 0.2)', margin: '0 2px' }}>|</span>

                  <button
                    type="button"
                    onClick={() => handleSelectAllQuestions(true)}
                    className="tab-btn"
                    style={{ fontSize: '0.7rem', padding: '3px 7px' }}
                    title="Keep all questions"
                  >
                    Keep All
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAllQuestions(false)}
                    className="tab-btn"
                    style={{ fontSize: '0.7rem', padding: '3px 7px' }}
                    title="Skip all questions"
                  >
                    Skip All
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllQuestions}
                    className="tab-btn"
                    style={{ fontSize: '0.7rem', padding: '3px 7px', color: '#f87171' }}
                    title="Remove all questions"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {includeQuestionnaire && (
              <>
                {questions.length === 0 ? (
                  <div style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    marginBottom: 14
                  }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
                      No questions configured. Click a template above or add a question below.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                    {questions.map((q, idx) => (
                      <div 
                        key={q.id || idx}
                        style={{
                          background: q.enabled === false ? 'rgba(255, 255, 255, 0.015)' : 'rgba(255, 255, 255, 0.03)',
                          border: q.enabled === false ? '1px dashed rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: 12,
                          padding: 12,
                          opacity: q.enabled === false ? 0.6 : 1,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {/* Question Card Top Bar */}
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

                            {/* KEEP OR NOT TOGGLE BUTTON */}
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
                              title={q.enabled === false ? "Click to keep in questionnaire" : "Click to exclude this question"}
                            >
                              {q.enabled === false ? '✕ Excluded' : '✓ Kept in Survey'}
                            </button>

                            {/* Required checkbox */}
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

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <select
                              value={q.type}
                              onChange={(e) => handleUpdateQuestion(q.id, 'type', e.target.value)}
                              style={{
                                background: 'rgba(0, 0, 0, 0.4)',
                                border: '1px solid var(--border-glass)',
                                color: '#fff',
                                fontSize: '0.74rem',
                                borderRadius: 6,
                                padding: '3px 8px'
                              }}
                            >
                              <option value="yes_no">❓ Yes / No (Right / Wrong Quiz)</option>
                              <option value="two_options">⚖️ 2 Options (Custom A / B)</option>
                              <option value="multi_choice">☑️ Multiple Choice (Multi-Select)</option>
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
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Question Prompt Input */}
                        <input
                          type="text"
                          className="form-input"
                          value={q.text}
                          onChange={(e) => handleUpdateQuestion(q.id, 'text', e.target.value)}
                          placeholder="Enter question text..."
                          style={{ fontSize: '0.85rem', padding: '8px 12px', marginBottom: 6 }}
                          required
                        />

                        {/* 0. Yes / No Quiz (with Right / Wrong answer key assignment) */}
                        {q.type === 'yes_no' && (
                          <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 14px', borderRadius: 8, marginTop: 6, border: '1px solid rgba(99, 102, 241, 0.25)' }}>
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
                          <div style={{ background: 'rgba(0, 0, 0, 0.22)', padding: '12px 14px', borderRadius: 8, marginTop: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                                Verdict Option Labels (Good/Bad or Up/Down):
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleUpdateChoiceOption(q.id, 0, 'Good');
                                    handleUpdateChoiceOption(q.id, 1, 'Bad');
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
                                    handleUpdateChoiceOption(q.id, 0, 'Up');
                                    handleUpdateChoiceOption(q.id, 1, 'Down');
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
                                    handleUpdateChoiceOption(q.id, 0, 'Thumbs Up');
                                    handleUpdateChoiceOption(q.id, 1, 'Thumbs Down');
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
                                    onChange={(e) => handleUpdateChoiceOption(q.id, 0, e.target.value)}
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
                                    onChange={(e) => handleUpdateChoiceOption(q.id, 1, e.target.value)}
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

                        {/* 2. 2 Options Config (with optional Option Images) */}
                        {(q.type === 'two_options' || q.type === 'boolean') && (
                          <div style={{ background: 'rgba(0, 0, 0, 0.22)', padding: '10px 12px', borderRadius: 8, marginTop: 6 }}>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginBottom: 6 }}>
                              Customize 2 Options (Labels & Optional Image URLs):
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              <div>
                                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Option 1 Label</label>
                                <input
                                  type="text"
                                  value={q.options?.[0] ?? 'Option A'}
                                  onChange={(e) => handleUpdateChoiceOption(q.id, 0, e.target.value)}
                                  className="form-input"
                                  style={{ fontSize: '0.8rem', padding: '5px 8px', marginBottom: 4 }}
                                  placeholder="e.g. Yes, Design A"
                                />
                                <input
                                  type="text"
                                  value={q.optionImages?.[0] || ''}
                                  onChange={(e) => {
                                    const nextImgs = [e.target.value, q.optionImages?.[1] || ''];
                                    handleUpdateQuestion(q.id, 'optionImages', nextImgs);
                                  }}
                                  className="form-input"
                                  style={{ fontSize: '0.74rem', padding: '4px 8px', color: 'var(--accent-cyan)' }}
                                  placeholder="Optional Image URL (https://...)"
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Option 2 Label</label>
                                <input
                                  type="text"
                                  value={q.options?.[1] ?? 'Option B'}
                                  onChange={(e) => handleUpdateChoiceOption(q.id, 1, e.target.value)}
                                  className="form-input"
                                  style={{ fontSize: '0.8rem', padding: '5px 8px', marginBottom: 4 }}
                                  placeholder="e.g. No, Design B"
                                />
                                <input
                                  type="text"
                                  value={q.optionImages?.[1] || ''}
                                  onChange={(e) => {
                                    const nextImgs = [q.optionImages?.[0] || '', e.target.value];
                                    handleUpdateQuestion(q.id, 'optionImages', nextImgs);
                                  }}
                                  className="form-input"
                                  style={{ fontSize: '0.74rem', padding: '4px 8px', color: 'var(--accent-cyan)' }}
                                  placeholder="Optional Image URL (https://...)"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 3. Multiple Choice & Single Pick */}
                        {(q.type === 'multi_choice' || q.type === 'choice') && (
                          <div style={{ background: 'rgba(0, 0, 0, 0.22)', padding: '10px 12px', borderRadius: 8, marginTop: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                                Options ({q.type === 'multi_choice' ? 'Employees can select multiple' : 'Employees pick one'}):
                              </span>
                              <span style={{ fontSize: '0.7rem', color: q.type === 'multi_choice' ? 'var(--accent-cyan)' : 'var(--text-muted)', fontWeight: 600 }}>
                                {q.type === 'multi_choice' ? '☑️ Multi-Select' : '🔘 Single Pick'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {(q.options || []).map((opt, optIdx) => (
                                <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: '0.8rem' }}>{q.type === 'multi_choice' ? '☑️' : '🔘'}</span>
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => handleUpdateChoiceOption(q.id, optIdx, e.target.value)}
                                    className="form-input"
                                    style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                                    placeholder={`Option ${optIdx + 1}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveChoiceOption(q.id, optIdx)}
                                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px 4px' }}
                                    title="Delete this option"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => handleAddChoiceOption(q.id)}
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

                        {/* 4. Type Your Answer */}
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
                            gap: 6,
                            marginTop: 6
                          }}>
                            <span>✍️</span>
                            <span>Employees will type their response in a written text area.</span>
                          </div>
                        )}

                        {/* 5. Rating preview */}
                        {q.type === 'rating' && (
                          <div style={{ display: 'flex', gap: 4, color: '#fbbf24', fontSize: '0.84rem', marginTop: 6 }}>
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star key={star} size={15} fill="#fbbf24" />
                            ))}
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 6 }}>1 to 5 Stars</span>
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

                {/* Add Question Button bar */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: 4, fontWeight: 700 }}>
                    + Add Another Question:
                  </span>
                  <button
                    type="button"
                    className="demo-badge-btn"
                    onClick={() => handleAddQuestion('yes_no')}
                    style={{ fontSize: '0.74rem', background: 'rgba(99, 102, 241, 0.25)', borderColor: 'rgba(99, 102, 241, 0.5)', color: '#a5b4fc', fontWeight: 700 }}
                  >
                    ❓ Yes / No Quiz
                  </button>
                  <button
                    type="button"
                    className="demo-badge-btn"
                    onClick={() => handleAddQuestion('two_options')}
                    style={{ fontSize: '0.74rem' }}
                  >
                    ⚖️ 2 Options
                  </button>
                  <button
                    type="button"
                    className="demo-badge-btn"
                    onClick={() => handleAddQuestion('multi_choice')}
                    style={{ fontSize: '0.74rem' }}
                  >
                    ☑️ Multiple Choice
                  </button>
                  <button
                    type="button"
                    className="demo-badge-btn"
                    onClick={() => handleAddQuestion('choice')}
                    style={{ fontSize: '0.74rem' }}
                  >
                    🔘 Multiple Options
                  </button>
                  <button
                    type="button"
                    className="demo-badge-btn"
                    onClick={() => handleAddQuestion('type_answer')}
                    style={{ fontSize: '0.74rem' }}
                  >
                    ✍️ Type Answer
                  </button>
                  <button
                    type="button"
                    className="demo-badge-btn"
                    onClick={() => handleAddQuestion('rating')}
                    style={{ fontSize: '0.74rem' }}
                  >
                    ⭐ 1-5 Rating
                  </button>
                  <button
                    type="button"
                    className="demo-badge-btn"
                    onClick={() => handleAddQuestion('verdict')}
                    style={{ fontSize: '0.74rem', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#6ee7b7' }}
                  >
                    👍 Up or Down
                  </button>
                </div>
              </>
            )}
          </div>
          </div>

          {/* 4. Knowledge Base & Decision Guide (Optional) */}
          <div className="form-group" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 14 }}>
            <div 
              onClick={() => setShowKbSection(!showKbSection)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                cursor: 'pointer',
                padding: '8px 12px',
                background: 'rgba(139, 92, 246, 0.08)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: 8
              }}
            >
              <div>
                <label className="form-label" style={{ margin: 0, cursor: 'pointer', color: '#c084fc', display: 'flex', alignItems: 'center', gap: 6 }}>
                  💡 4. Knowledge Base & Decision Guide (Optional)
                </label>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                  Define decision criteria and learning tips for employees to consult
                </p>
              </div>
              <span style={{ fontSize: '0.76rem', color: 'var(--accent-cyan)' }}>
                {showKbSection ? 'Hide ▲' : 'Customize ▼'}
              </span>
            </div>

            {showKbSection && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>
                    Section 1 Heading:
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={criteriaHeading}
                    onChange={(e) => setCriteriaHeading(e.target.value)}
                    placeholder="e.g. Decision Criteria (Good vs Bad)"
                    style={{ fontSize: '0.82rem', marginBottom: 6, fontWeight: 700 }}
                  />
                  <label className="form-label" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    🎯 Decision Criteria Points (One rule per line):
                  </label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={criteriaText}
                    onChange={(e) => setCriteriaText(e.target.value)}
                    placeholder="Enter guidelines for employees to judge this image..."
                    style={{ fontSize: '0.8rem', resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>
                    Section 2 Heading:
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={tipsHeading}
                    onChange={(e) => setTipsHeading(e.target.value)}
                    placeholder="e.g. Things to Learn & Best Practices"
                    style={{ fontSize: '0.82rem', marginBottom: 6, fontWeight: 700 }}
                  />
                  <label className="form-label" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    🧠 Things to Learn & Best Practices (One tip per line):
                  </label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={tipsText}
                    onChange={(e) => setTipsText(e.target.value)}
                    placeholder="Enter design tips and things employees should learn..."
                    style={{ fontSize: '0.8rem', resize: 'vertical' }}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading || (includeImage && !imageUrl)}
            style={{ marginTop: 18 }}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={18} className="animate-spin" /> Publishing Post...
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Upload size={18} /> Publish Post
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
