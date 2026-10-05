import React, { useState, useMemo } from 'react';
import { 
  Pin, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  Clock, 
  Search, 
  X, 
  AlertTriangle, 
  FileText, 
  Check, 
  Sparkles,
  ShieldAlert,
  HelpCircle,
  Eye,
  BookmarkCheck,
  Users,
  Target,
  UserCheck,
  LayoutGrid,
  List,
  Bell,
  BellRing
} from 'lucide-react';
import { formatRelativeTime } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { soundManager } from '../utils/sound';

export default function ImportantInstructionsView({
  instructions = [],
  loading = false,
  onAcknowledge,
  onEdit,
  onDelete,
  onOpenCreate,
  isAdmin = false,
  currentUserId,
  allEmployeesCount = 0
}) {
  const { token } = useAuth() || {};
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [ackModalInst, setAckModalInst] = useState(null);
  const [ackTab, setAckTab] = useState('acknowledged'); // 'acknowledged' | 'pending'
  const [ackSearch, setAckSearch] = useState('');
  const [pingingTarget, setPingingTarget] = useState(null);
  const [pingSuccessMap, setPingSuccessMap] = useState({});

  // Real-time directive sound ping sender (Admin only)
  const handleSendPing = async (instructionId, targetUserId = null) => {
    const pingKey = targetUserId || `all_${instructionId}`;
    setPingingTarget(pingKey);
    try {
      const res = await fetch(`/api/dashboard/instructions/${instructionId}/ping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId })
      });

      if (res.ok) {
        // Play local confirmation chime on Admin device
        soundManager.playNudgeSent();

        // Mark temporary success indication
        setPingSuccessMap(prev => ({ ...prev, [pingKey]: true }));
        setTimeout(() => {
          setPingSuccessMap(prev => {
            const next = { ...prev };
            delete next[pingKey];
            return next;
          });
        }, 3500);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to send sound ping');
      }
    } catch (err) {
      console.error('Failed to send sound ping:', err);
    } finally {
      setPingingTarget(null);
    }
  };

  // Priority metadata helper
  const getPriorityMeta = (priority) => {
    switch (priority) {
      case 'urgent':
        return {
          label: '🚨 URGENT',
          color: '#f87171',
          bg: 'rgba(239, 68, 68, 0.16)',
          border: 'rgba(239, 68, 68, 0.35)',
          glow: '0 0 12px rgba(239, 68, 68, 0.25)'
        };
      case 'important':
        return {
          label: '📌 IMPORTANT',
          color: '#fbbf24',
          bg: 'rgba(245, 158, 11, 0.16)',
          border: 'rgba(245, 158, 11, 0.35)',
          glow: '0 0 10px rgba(245, 158, 11, 0.2)'
        };
      case 'guideline':
        return {
          label: '📋 GUIDELINE',
          color: '#60a5fa',
          bg: 'rgba(59, 130, 246, 0.16)',
          border: 'rgba(59, 130, 246, 0.35)',
          glow: 'none'
        };
      default:
        return {
          label: '💡 GENERAL NOTICE',
          color: '#a78bfa',
          bg: 'rgba(139, 92, 246, 0.14)',
          border: 'rgba(139, 92, 246, 0.3)',
          glow: 'none'
        };
    }
  };

  const filteredInstructions = useMemo(() => {
    return instructions.filter(inst => {
      if (filterPriority !== 'all' && inst.priority !== filterPriority) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (inst.title || '').toLowerCase().includes(q);
        const matchContent = (inst.content || '').toLowerCase().includes(q);
        const matchCategory = (inst.category || '').toLowerCase().includes(q);
        return matchTitle || matchContent || matchCategory;
      }
      return true;
    });
  }, [instructions, filterPriority, searchQuery]);

  const unreadCount = useMemo(() => {
    if (!currentUserId || isAdmin) return 0;
    return instructions.filter(i => !(i.acknowledgedBy || []).includes(currentUserId)).length;
  }, [instructions, currentUserId, isAdmin]);

  // Identify the latest directive by newest creation date
  const latestInstruction = useMemo(() => {
    if (!instructions || instructions.length === 0) return null;
    return instructions.reduce((prev, curr) => {
      const prevTime = new Date(prev.createdAt || 0).getTime();
      const currTime = new Date(curr.createdAt || 0).getTime();
      return currTime > prevTime ? curr : prev;
    }, instructions[0]);
  }, [instructions]);

  const priorityCounts = useMemo(() => {
    // For employees, counts reflect pending unacknowledged instructions
    const targetInstructions = !isAdmin && currentUserId
      ? instructions.filter(i => !(i.acknowledgedBy || []).includes(currentUserId))
      : instructions;

    return {
      all: targetInstructions.length,
      urgent: targetInstructions.filter(i => i.priority === 'urgent').length,
      important: targetInstructions.filter(i => i.priority === 'important').length,
      guideline: targetInstructions.filter(i => i.priority === 'guideline').length,
      general: targetInstructions.filter(i => i.priority === 'general' || (!i.priority || !['urgent', 'important', 'guideline'].includes(i.priority))).length
    };
  }, [instructions, isAdmin, currentUserId]);

  const filterChips = [
    { 
      id: 'all', 
      label: 'All Instructions', 
      icon: null,
      count: priorityCounts.all,
      activeColor: '#fbbf24',
      activeBg: 'rgba(245, 158, 11, 0.2)',
      activeBorder: 'rgba(245, 158, 11, 0.55)',
      activeGlow: '0 0 14px rgba(245, 158, 11, 0.22)'
    },
    { 
      id: 'urgent', 
      label: 'Urgent', 
      icon: '🚨',
      count: priorityCounts.urgent,
      activeColor: '#f87171',
      activeBg: 'rgba(239, 68, 68, 0.2)',
      activeBorder: 'rgba(239, 68, 68, 0.55)',
      activeGlow: '0 0 14px rgba(239, 68, 68, 0.25)'
    },
    { 
      id: 'important', 
      label: 'Important', 
      icon: '📌',
      count: priorityCounts.important,
      activeColor: '#fbbf24',
      activeBg: 'rgba(245, 158, 11, 0.2)',
      activeBorder: 'rgba(245, 158, 11, 0.55)',
      activeGlow: '0 0 14px rgba(245, 158, 11, 0.22)'
    },
    { 
      id: 'guideline', 
      label: 'Guidelines', 
      icon: '📋',
      count: priorityCounts.guideline,
      activeColor: '#60a5fa',
      activeBg: 'rgba(59, 130, 246, 0.2)',
      activeBorder: 'rgba(59, 130, 246, 0.55)',
      activeGlow: '0 0 14px rgba(59, 130, 246, 0.22)'
    },
    { 
      id: 'general', 
      label: 'General Notices', 
      icon: '💡',
      count: priorityCounts.general,
      activeColor: '#c084fc',
      activeBg: 'rgba(168, 85, 247, 0.2)',
      activeBorder: 'rgba(168, 85, 247, 0.55)',
      activeGlow: '0 0 14px rgba(168, 85, 247, 0.22)'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Banner & Action Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(217, 119, 6, 0.08) 50%, rgba(15, 23, 42, 0.6) 100%)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: 16,
        padding: '22px 26px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 46,
            height: 46,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(245, 158, 11, 0.4)',
            flexShrink: 0
          }}>
            <Pin size={24} color="#fff" />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                Important Instructions & Directives
              </h2>
              {isAdmin ? (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 9px',
                  borderRadius: 99,
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.35)'
                }}>
                  {instructions.length} Total
                </span>
              ) : unreadCount > 0 ? (
                <span 
                  className="tab-badge glowing-directive-badge"
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 9px',
                    borderRadius: 99
                  }}
                >
                  {unreadCount} Unread
                </span>
              ) : (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 9px',
                  borderRadius: 99,
                  background: 'rgba(16, 185, 129, 0.18)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.35)'
                }}>
                  ✓ All Acknowledged
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Official directives, quality checklists, and review procedures shared by the Admin for all employees
            </p>
          </div>
        </div>

        {/* Admin Action Button */}
        {isAdmin && (
          <button
            type="button"
            className="auth-submit-btn"
            onClick={onOpenCreate}
            style={{
              width: 'auto',
              padding: '10px 20px',
              fontSize: '0.86rem',
              margin: 0,
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              boxShadow: '0 2px 12px rgba(245, 158, 11, 0.4)'
            }}
          >
            <Plus size={16} /> Post New Instruction
          </button>
        )}
      </div>

      {/* Latest Directive Pointer Callout */}
      {latestInstruction && (
        <div
          className="latest-directive-pointer-bar"
          onClick={() => {
            setFilterPriority('all');
            setSearchQuery('');
            setTimeout(() => {
              const el = document.getElementById(`directive-card-${latestInstruction.id}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('pulse-highlight');
                setTimeout(() => el.classList.remove('pulse-highlight'), 2600);
              }
            }, 60);
          }}
          title="Click to instantly focus and point out the latest directive"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <span className="latest-directive-pointer-tag">
              <Sparkles size={12} />
              <span>LATEST DIRECTIVE</span>
            </span>
            <span className="latest-directive-pointer-title">
              {latestInstruction.title}
            </span>
            <span className="latest-directive-pointer-meta">
              • {formatRelativeTime(latestInstruction.createdAt)}
            </span>
          </div>
          <div className="latest-directive-pointer-action">
            <span>Point to Directive</span>
            <span className="pointer-arrow">↓</span>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="instruction-filters-bar">
        {/* Priority Filter Chips */}
        <div className="instruction-filter-chips">
          {filterChips.map(chip => {
            const isActive = filterPriority === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                className={`instruction-filter-btn ${isActive ? 'active' : ''}`}
                onClick={() => setFilterPriority(chip.id)}
                style={{
                  background: isActive ? chip.activeBg : 'rgba(255, 255, 255, 0.03)',
                  borderColor: isActive ? chip.activeBorder : 'rgba(255, 255, 255, 0.09)',
                  color: isActive ? chip.activeColor : 'var(--text-muted)',
                  boxShadow: isActive ? chip.activeGlow : 'none'
                }}
              >
                {chip.icon && <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{chip.icon}</span>}
                <span>{chip.label}</span>
                {chip.count > 0 && (
                  <span 
                    className="chip-badge"
                    style={{
                      background: isActive ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.07)',
                      color: isActive ? '#ffffff' : 'var(--text-dim)'
                    }}
                  >
                    {chip.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search Input & View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 260, minWidth: 200 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="form-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search instructions..."
              style={{ 
                fontSize: '0.84rem', 
                padding: '8px 32px 8px 36px', 
                height: 38,
                borderRadius: 999,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                width: '100%'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ 
                  position: 'absolute', 
                  right: 10, 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--text-dim)', 
                  cursor: 'pointer', 
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Grid vs Feed View Mode Toggle */}
          <div className="instruction-view-toggle">
            <button
              type="button"
              className={`instruction-view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View (side-by-side cards)"
            >
              <LayoutGrid size={14} />
              <span>Grid</span>
            </button>
            <button
              type="button"
              className={`instruction-view-toggle-btn ${viewMode === 'feed' ? 'active' : ''}`}
              onClick={() => setViewMode('feed')}
              title="Feed View (centered stream)"
            >
              <List size={14} />
              <span>Feed</span>
            </button>
          </div>
        </div>
      </div>

      {/* Instructions List */}
      {loading ? (
        <div className="empty-list" style={{ padding: '70px 20px', textAlign: 'center' }}>
          <div className="circular-loader-ring amber" style={{ margin: '0 auto 16px auto' }} />
          <h3 style={{ color: '#fff', fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>Loading...</h3>
        </div>
      ) : filteredInstructions.length === 0 ? (
        <div className="empty-list" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <Sparkles size={36} color="#f59e0b" />
          <h3 style={{ color: '#fff', fontSize: '1.15rem', marginTop: 10 }}>No instructions found</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            {searchQuery 
              ? `No instructions match "${searchQuery}"`
              : isAdmin 
                ? "Click 'Post New Instruction' above to share guidance or directives with employees."
                : "No active instructions in this category. You are all caught up!"}
          </p>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'instructions-grid-layout' : 'instructions-feed-layout'}>
          {filteredInstructions.map(inst => {
            const isLatest = latestInstruction?.id === inst.id;
            const meta = getPriorityMeta(inst.priority);
            const isAcknowledged = (inst.acknowledgedBy || []).includes(currentUserId);
            const ackCount = (inst.acknowledgedBy || []).length;
            const priorityClass = `priority-${inst.priority || 'general'}`;
            const pinnedClass = inst.pinned ? 'is-pinned' : '';
            const latestClass = isLatest ? 'is-latest-directive' : '';

            return (
              <div
                key={inst.id}
                id={`directive-card-${inst.id}`}
                className={`instruction-card-modern ${priorityClass} ${pinnedClass} ${latestClass}`}
              >
                {/* Card Top Row: Badges & Controls */}
                <div className="instruction-card-header">
                  <div className="instruction-badge-group">
                    {/* Latest Directive Badge */}
                    {isLatest && (
                      <span className="instruction-badge-pill latest-directive-pill">
                        <Sparkles size={11} />
                        <span>✨ LATEST DIRECTIVE</span>
                      </span>
                    )}

                    {/* Priority Badge */}
                    <span 
                      className="instruction-badge-pill"
                      style={{
                        background: meta.bg,
                        color: meta.color,
                        border: `1px solid ${meta.border}`,
                        boxShadow: meta.glow
                      }}
                    >
                      {meta.label}
                    </span>

                    {/* Category Pill */}
                    {inst.category && (
                      <span 
                        className="instruction-badge-pill"
                        style={{
                          background: 'rgba(255, 255, 255, 0.04)',
                          color: 'var(--text-muted)',
                          border: '1px solid rgba(255, 255, 255, 0.08)'
                        }}
                      >
                        📁 {inst.category}
                      </span>
                    )}

                    {/* Pinned Tag */}
                    {inst.pinned && (
                      <span 
                        className="instruction-badge-pill"
                        style={{
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#fbbf24',
                          border: '1px solid rgba(245, 158, 11, 0.3)'
                        }}
                      >
                        <Pin size={11} /> Pinned Directive
                      </span>
                    )}

                    {/* Target Audience Pill */}
                    {Array.isArray(inst.targetUserIds) && inst.targetUserIds.length > 0 ? (
                      <span 
                        className="instruction-badge-pill"
                        style={{
                          background: 'rgba(168, 85, 247, 0.15)',
                          color: '#c084fc',
                          border: '1px solid rgba(168, 85, 247, 0.3)'
                        }}
                        title={inst.targetRecipients && inst.targetRecipients.length > 0 
                          ? `Recipients: ${inst.targetRecipients.map(r => r.displayName || r.username).join(', ')}`
                          : `Targeted to ${inst.targetUserIds.length} employees`}
                      >
                        <Target size={11} />
                        <span>
                          {isAdmin 
                            ? `Targeted (${inst.targetRecipients && inst.targetRecipients.length > 0 ? inst.targetRecipients.map(r => r.displayName).slice(0, 2).join(', ') + (inst.targetRecipients.length > 2 ? ` +${inst.targetRecipients.length - 2}` : '') : `${inst.targetUserIds.length} employees`})`
                            : 'Direct Directive for You'}
                        </span>
                      </span>
                    ) : (
                      <span 
                        className="instruction-badge-pill"
                        style={{
                          background: 'rgba(255, 255, 255, 0.04)',
                          color: 'var(--text-muted)',
                          border: '1px solid rgba(255, 255, 255, 0.08)'
                        }}
                      >
                        <Users size={11} /> All Employees
                      </span>
                    )}
                  </div>

                  {/* Admin Edit/Delete Controls */}
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => onEdit(inst)}
                        className="instruction-action-btn"
                        title="Edit instruction"
                      >
                        <Edit3 size={13} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(inst.id)}
                        className="instruction-action-btn delete-btn"
                        title="Delete instruction"
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Instruction Title */}
                <h3 className="instruction-card-title">
                  {inst.title}
                </h3>

                {/* Instruction Content (Spacious, unboxed typography) */}
                <div className="instruction-card-body">
                  {inst.content}
                </div>

                {/* Footer Row: Author, Timestamp, and Acknowledge Button */}
                <div className="instruction-card-footer">
                  {/* Author Meta */}
                  <div className="instruction-author-meta">
                    <img
                      src={inst.createdByAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                      alt={inst.createdByName || 'Admin'}
                      style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: 600 }}>
                      {inst.createdByName || 'Admin'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {formatRelativeTime(inst.createdAt)}
                    </span>
                  </div>

                  {/* Acknowledge Status & Action */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Admin view: Interactive Acknowledgment stats with avatar stack & quick sound ping */}
                    {isAdmin && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAckModalInst(inst);
                            setAckTab('acknowledged');
                            setAckSearch('');
                          }}
                          className="instruction-ack-trigger-btn"
                          title="Click to view list of employees who acknowledged"
                        >
                          <div className="instruction-ack-avatars">
                            {inst.acknowledgedUsers && inst.acknowledgedUsers.length > 0 ? (
                              inst.acknowledgedUsers.slice(0, 3).map((u, i) => (
                                <img
                                  key={u.id || i}
                                  src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username || 'user'}`}
                                  alt={u.displayName || u.username}
                                  className="ack-bubble-avatar"
                                />
                              ))
                            ) : (
                              <CheckCircle2 size={13} color="var(--accent-emerald)" />
                            )}
                          </div>
                          <span>
                            <strong style={{ color: ackCount > 0 ? '#34d399' : 'inherit' }}>{ackCount}</strong>
                            {' '}
                            {ackCount === 1 ? 'employee' : 'employees'} acknowledged
                          </span>
                          <span className="ack-view-hint">
                            <Users size={12} />
                            <span>View</span>
                          </span>
                        </button>

                        {/* Quick Sound Ping button if any employee has not acknowledged yet */}
                        {((inst.pendingUsers?.length ?? ((inst.targetUserIds?.length || allEmployeesCount || 0) - ackCount)) > 0) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendPing(inst.id, null);
                            }}
                            disabled={pingingTarget === `all_${inst.id}`}
                            className="instruction-quick-ping-btn"
                            title="Send audible sound ping to all pending recipients"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '5px 10px',
                              borderRadius: 8,
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              background: pingSuccessMap[`all_${inst.id}`]
                                ? 'rgba(16, 185, 129, 0.16)'
                                : 'rgba(239, 68, 68, 0.14)',
                              border: `1px solid ${pingSuccessMap[`all_${inst.id}`] ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.35)'}`,
                              color: pingSuccessMap[`all_${inst.id}`] ? '#34d399' : '#fca5a5',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Bell size={12} />
                            <span>
                              {pingingTarget === `all_${inst.id}`
                                ? 'Pinging...'
                                : pingSuccessMap[`all_${inst.id}`]
                                  ? '✓ Pinged!'
                                  : 'Sound Ping'}
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Employee view: Simple Acknowledge Button or status only */}
                    {!isAdmin && (
                      isAcknowledged ? (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.78rem',
                          color: 'var(--accent-emerald)',
                          background: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          padding: '5px 12px',
                          borderRadius: 8,
                          fontWeight: 600
                        }}>
                          <Check size={14} />
                          <span>Acknowledged by You</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAcknowledge(inst.id)}
                          className="auth-submit-btn"
                          style={{
                            width: 'auto',
                            padding: '6px 14px',
                            fontSize: '0.78rem',
                            margin: 0,
                            borderRadius: 8,
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)'
                          }}
                        >
                          <BookmarkCheck size={14} /> Mark as Read & Acknowledged
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Acknowledgment Inspector Modal - ONLY ADMIN CAN VIEW */}
      {isAdmin && ackModalInst && (() => {
        const activeInst = instructions.find(i => i.id === ackModalInst.id) || ackModalInst;
        const ackUsers = activeInst.acknowledgedUsers || [];
        const pendingUsers = activeInst.pendingUsers || [];
        const totalAudience = ackUsers.length + pendingUsers.length || 1;
        const percent = Math.round((ackUsers.length / totalAudience) * 100);

        const currentList = ackTab === 'acknowledged' ? ackUsers : pendingUsers;
        const filteredList = currentList.filter(u => {
          if (!ackSearch.trim()) return true;
          const q = ackSearch.toLowerCase();
          return (u.displayName || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
        });

        return (
          <div 
            className="review-modal-backdrop" 
            onClick={() => setAckModalInst(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '20px'
            }}
          >
            <div 
              className="review-modal-content"
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '540px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
                overflow: 'hidden',
                background: '#131826',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '18px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(16, 185, 129, 0.12)'
              }}
            >
              {/* Header */}
              <div className="ack-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <UserCheck size={20} color="#10b981" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#ffffff', fontWeight: 700 }}>
                      Instruction Acknowledgments
                    </h3>
                    <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '340px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {activeInst.title}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="close-btn"
                  onClick={() => setAckModalInst(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-dim)',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Progress & Overview Box */}
              <div className="ack-modal-progress-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.8rem', color: '#e2e8f0', fontWeight: 600 }}>
                    Overall Compliance Rate
                  </span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: percent === 100 ? '#34d399' : '#fbbf24' }}>
                    {ackUsers.length} / {totalAudience} ({percent}%)
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: 8,
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: 999,
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${percent}%`,
                    background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
                    borderRadius: 999,
                    transition: 'width 0.4s ease'
                  }} />
                </div>
              </div>

              {/* Tabs */}
              <div className="ack-modal-tabs">
                <button
                  type="button"
                  className={`ack-modal-tab ${ackTab === 'acknowledged' ? 'active' : ''}`}
                  onClick={() => setAckTab('acknowledged')}
                >
                  <CheckCircle2 size={14} color={ackTab === 'acknowledged' ? '#34d399' : 'currentColor'} />
                  <span>Acknowledged ({ackUsers.length})</span>
                </button>
                <button
                  type="button"
                  className={`ack-modal-tab ${ackTab === 'pending' ? 'active' : ''}`}
                  onClick={() => setAckTab('pending')}
                >
                  <Clock size={14} color={ackTab === 'pending' ? '#fbbf24' : 'currentColor'} />
                  <span>Pending ({pendingUsers.length})</span>
                </button>
              </div>

              {/* Action Banner for Pending Tab: Ping All Pending */}
              {ackTab === 'pending' && pendingUsers.length > 0 && (
                <div style={{
                  padding: '10px 22px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  borderBottom: '1px solid rgba(239, 68, 68, 0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <BellRing size={16} color="#f87171" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', color: '#fca5a5', lineHeight: 1.3 }}>
                      Send an urgent audible sound chime directly to their devices.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendPing(activeInst.id, null)}
                    disabled={pingingTarget === `all_${activeInst.id}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: pingSuccessMap[`all_${activeInst.id}`]
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 14px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 10px rgba(239, 68, 68, 0.35)',
                      flexShrink: 0,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Bell size={13} />
                    <span>
                      {pingingTarget === `all_${activeInst.id}`
                        ? 'Pinging All...'
                        : pingSuccessMap[`all_${activeInst.id}`]
                          ? '✓ Ping Sent to All!'
                          : `Ping All (${pendingUsers.length})`}
                    </span>
                  </button>
                </div>
              )}

              {/* Search input if audience > 2 */}
              {(ackUsers.length + pendingUsers.length > 2) && (
                <div style={{ padding: '14px 22px 6px 22px' }}>
                  <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
                    <Search 
                      size={15} 
                      style={{ 
                        position: 'absolute', 
                        left: 12, 
                        top: '50%', 
                        transform: 'translateY(-50%)', 
                        color: 'var(--text-dim)', 
                        pointerEvents: 'none',
                        zIndex: 1
                      }} 
                    />
                    <input
                      type="text"
                      className="form-input"
                      placeholder={`Search ${ackTab} employees...`}
                      value={ackSearch}
                      onChange={e => setAckSearch(e.target.value)}
                      style={{
                        width: '100%',
                        height: 38,
                        fontSize: '0.84rem',
                        padding: '8px 32px 8px 36px',
                        borderRadius: 10,
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#ffffff',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    {ackSearch && (
                      <button
                        type="button"
                        onClick={() => setAckSearch('')}
                        style={{
                          position: 'absolute',
                          right: 10,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 1
                        }}
                        title="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Employee List */}
              <div style={{
                padding: '16px 22px',
                overflowY: 'auto',
                maxHeight: '340px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                {filteredList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '36px 12px', color: 'var(--text-muted)' }}>
                    {ackTab === 'acknowledged' ? (
                      <>
                        <Clock size={28} style={{ opacity: 0.4, margin: '0 auto 8px auto', display: 'block' }} />
                        <p style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8' }}>
                          {ackSearch ? 'No matching acknowledged employees.' : 'No employees have acknowledged this instruction yet.'}
                        </p>
                      </>
                    ) : (
                      <>
                        <Sparkles size={28} color="#34d399" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                        <p style={{ margin: 0, fontSize: '0.88rem', color: '#34d399', fontWeight: 600 }}>
                          {ackSearch ? 'No matching pending employees.' : 'All employees have acknowledged this instruction! 🎉'}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  filteredList.map(u => (
                    <div key={u.id} className="ack-modal-user-item">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <img
                          src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username || 'user'}`}
                          alt={u.displayName || u.username}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '1.5px solid rgba(255, 255, 255, 0.15)',
                            background: '#1e2433'
                          }}
                        />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: 600 }}>
                              {u.displayName || u.username}
                            </span>
                            {u.role && (
                              <span style={{
                                fontSize: '0.68rem',
                                color: 'var(--text-muted)',
                                background: 'rgba(255, 255, 255, 0.05)',
                                padding: '1px 6px',
                                borderRadius: 4,
                                border: '1px solid rgba(255, 255, 255, 0.08)'
                              }}>
                                {u.role}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                            @{u.username}
                          </span>
                        </div>
                      </div>

                      {/* Status badge & Sound Ping button */}
                      {ackTab === 'acknowledged' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          color: '#34d399',
                          background: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          padding: '3px 10px',
                          borderRadius: 6
                        }}>
                          <CheckCircle2 size={12} color="#34d399" />
                          Acknowledged
                        </span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            color: '#fbbf24',
                            background: 'rgba(245, 158, 11, 0.12)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            padding: '3px 8px',
                            borderRadius: 6
                          }}>
                            <Clock size={12} color="#fbbf24" />
                            Pending
                          </span>

                          <button
                            type="button"
                            onClick={() => handleSendPing(activeInst.id, u.id)}
                            disabled={pingingTarget === u.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              color: pingSuccessMap[u.id] ? '#34d399' : '#fca5a5',
                              background: pingSuccessMap[u.id] ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              border: `1px solid ${pingSuccessMap[u.id] ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.35)'}`,
                              padding: '4px 10px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            title={`Send audible directive ping to ${u.displayName || u.username}`}
                          >
                            <Bell size={12} />
                            <span>
                              {pingingTarget === u.id 
                                ? 'Pinging...' 
                                : pingSuccessMap[u.id] 
                                  ? '✓ Pinged! 🔔' 
                                  : 'Sound Ping'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '14px 22px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                justifyContent: 'flex-end',
                background: 'rgba(0, 0, 0, 0.15)'
              }}>
                <button
                  type="button"
                  onClick={() => setAckModalInst(null)}
                  className="auth-submit-btn"
                  style={{
                    width: 'auto',
                    padding: '6px 18px',
                    fontSize: '0.82rem',
                    margin: 0,
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
