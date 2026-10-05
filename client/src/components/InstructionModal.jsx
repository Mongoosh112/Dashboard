import React, { useState, useEffect } from 'react';
import { 
  X, 
  Pin, 
  Save, 
  Loader2, 
  Sparkles, 
  AlertTriangle, 
  BookOpen, 
  Info, 
  BookmarkCheck,
  Tag,
  Users,
  UserCheck,
  Globe,
  Search,
  Check,
  Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AVATAR_PRESETS } from '../utils/helpers';

const INSTRUCTION_TEMPLATES = [
  {
    name: '🎨 Review Guidelines',
    title: 'UI Quality & Design Evaluation Standards',
    priority: 'important',
    category: 'Review Guidelines',
    content: `Team, when reviewing newly posted UI designs and questionnaires, please verify these quality points:

1. Contrast & Readability: Body text must meet minimum 4.5:1 contrast against dark/light backgrounds.
2. Grid & Alignment: Ensure buttons, form fields, and headings follow an 8px/16px spatial grid.
3. Questionnaire Feedback: Provide detailed rationale whenever selecting "Bad" or rating below 4 stars.
4. Response Window: Complete all assigned evaluations within 24 hours of notification.`
  },
  {
    name: '🚨 Release Deadline',
    title: 'Urgent: Release Candidate QA Sign-Off Cutoff',
    priority: 'urgent',
    category: 'Company Directive',
    content: `All design review items and employee questionnaires for the upcoming release must be completed before Friday at 4:00 PM EST.

• If you notice any visual bugs or missing responsive states, select "Bad" and leave a description.
• Once finished, verify your checklist items on the dashboard.`
  },
  {
    name: '📱 Mobile Tap Targets',
    title: 'Touchscreen Usability & Minimum Tap Sizes',
    priority: 'guideline',
    category: 'Quality Standards',
    content: `Standard guideline for all mobile application designs:

- Interactive buttons and icons must be at least 44x44px touch target size.
- Ensure thumb-friendly spacing between primary and secondary call-to-action buttons.
- Bottom sheet drawer handles must be obvious and draggable.`
  }
];

export default function InstructionModal({ isOpen, onClose, instruction, onSaved }) {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState('important');
  const [category, setCategory] = useState('Review Guidelines');
  const [pinned, setPinned] = useState(false);
  const [targetType, setTargetType] = useState('all'); // 'all' | 'specific'
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  // Fetch employees list to choose recipients from
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

  useEffect(() => {
    if (instruction) {
      setTitle(instruction.title || '');
      setContent(instruction.content || '');
      setPriority(instruction.priority || 'important');
      setCategory(instruction.category || 'Review Guidelines');
      setPinned(!!instruction.pinned);
      if (Array.isArray(instruction.targetUserIds) && instruction.targetUserIds.length > 0) {
        setTargetType('specific');
        setSelectedUserIds(instruction.targetUserIds);
      } else {
        setTargetType('all');
        setSelectedUserIds([]);
      }
    } else {
      setTitle('');
      setContent('');
      setPriority('important');
      setCategory('Review Guidelines');
      setPinned(false);
      setTargetType('all');
      setSelectedUserIds([]);
    }
    setSearchEmployeeQuery('');
    setError('');
  }, [instruction, isOpen]);

  if (!isOpen) return null;

  const handleApplyTemplate = (tmpl) => {
    setTitle(tmpl.title);
    setContent(tmpl.content);
    setPriority(tmpl.priority);
    setCategory(tmpl.category);
  };

  const toggleEmployeeSelection = (empId) => {
    setSelectedUserIds(prev => 
      prev.includes(empId) ? prev.filter(id => id !== empId) : [...prev, empId]
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a title for the instruction');
      return;
    }
    if (!content.trim()) {
      setError('Please provide the instruction content');
      return;
    }
    if (targetType === 'specific' && selectedUserIds.length === 0) {
      setError('Please select at least one recipient employee or choose "All Employees"');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const url = instruction 
        ? `/api/dashboard/instructions/${instruction.id}` 
        : '/api/dashboard/instructions';
      const method = instruction ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          priority,
          category: category.trim() || 'General Notice',
          pinned,
          targetUserIds: targetType === 'specific' ? selectedUserIds : null
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save instruction');
      }

      if (onSaved) {
        onSaved(data.instruction);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 450 }}>
      <div 
        className="modal-dialog" 
        style={{ 
          maxWidth: 620, 
          width: '92vw', 
          maxHeight: '90vh', 
          overflowY: 'auto',
          background: 'rgba(15, 20, 32, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          padding: '24px 26px',
          borderRadius: 16
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(245, 158, 11, 0.35)'
            }}>
              <Pin size={20} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.12rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                {instruction ? 'Edit Important Instruction' : 'Post Important Instruction'}
              </h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Share directives, guidelines, and critical instructions for employees
              </p>
            </div>
          </div>

          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Template Presets */}
        {!instruction && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 10,
            padding: '8px 12px',
            marginBottom: 16
          }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Sparkles size={12} color="#f59e0b" /> Quick Templates:
            </span>
            {INSTRUCTION_TEMPLATES.map((tmpl, idx) => (
              <button
                key={idx}
                type="button"
                className="demo-badge-btn"
                onClick={() => handleApplyTemplate(tmpl)}
                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              >
                {tmpl.name}
              </button>
            ))}
          </div>
        )}

        {error && <div className="form-error" style={{ marginBottom: 14 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <div>
            <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
              Instruction Title *
            </label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Design Review Guidelines & Quality Standards"
              required
              style={{ fontSize: '0.88rem' }}
            />
          </div>

          {/* Priority & Category */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                Priority Level
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="form-input"
                style={{ fontSize: '0.82rem' }}
              >
                <option value="urgent">🚨 Urgent (Immediate Attention)</option>
                <option value="important">📌 Important (Key Directive)</option>
                <option value="guideline">📋 Guideline (Quality Standard)</option>
                <option value="general">💡 General Notice (Information)</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                Category Tag
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="form-input"
                placeholder="e.g. Review Guidelines"
                style={{ fontSize: '0.82rem' }}
              />
            </div>
          </div>

          {/* Target Audience / Send To */}
          <div className="instruction-audience-wrapper">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={14} color="#f59e0b" /> Send To (Target Audience)
              </label>
              {targetType === 'specific' && (
                <span style={{ fontSize: '0.74rem', color: selectedUserIds.length > 0 ? '#38bdf8' : '#f87171', fontWeight: 600 }}>
                  {selectedUserIds.length} of {employees.length} {selectedUserIds.length === 1 ? 'employee' : 'employees'} selected
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
                  <div style={{ fontSize: '0.68rem', opacity: 0.75 }}>Only chosen team members will see this</div>
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
                            style={{ accentColor: '#f59e0b', width: 14, height: 14, cursor: 'pointer' }}
                          />
                          <img
                            src={emp.avatar || AVATAR_PRESETS[0]}
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

          {/* Pin to Top Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="pinToggle"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              style={{ accentColor: '#f59e0b', width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="pinToggle" style={{ fontSize: '0.84rem', color: '#e2e8f0', cursor: 'pointer', margin: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📌 Pin this instruction to the top of the employee list</span>
            </label>
          </div>

          {/* Content Textarea */}
          <div>
            <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
              Instruction Content / Details *
            </label>
            <textarea
              className="form-input"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter instructions, expectations, numbered steps, or specific rules for employees..."
              rows={7}
              required
              style={{ fontSize: '0.84rem', lineHeight: 1.5, resize: 'vertical' }}
            />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: '4px 0 0 0' }}>
              Tip: Supports bullet points (-), numbered lists (1.), and paragraph breaks.
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 16, marginTop: 4 }}>
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
              style={{ 
                padding: '9px 24px', 
                fontSize: '0.86rem', 
                width: 'auto', 
                margin: 0,
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                boxShadow: '0 2px 12px rgba(245, 158, 11, 0.4)'
              }}
            >
              {saving ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={16} className="animate-spin" /> Saving Instruction...
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Save size={16} /> {instruction ? 'Update Instruction' : 'Post Instruction'}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
