import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Eye, 
  Layers, 
  Clock, 
  MousePointer, 
  Activity, 
  Search, 
  Filter, 
  Radio, 
  CheckCircle2, 
  AlertCircle, 
  UserCheck, 
  Users,
  Monitor, 
  ExternalLink, 
  RefreshCw, 
  ChevronRight,
  Shield,
  Smartphone,
  Laptop,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

// Format seconds into readable duration (e.g. "1h 14m 20s" or "45s")
function formatDuration(totalSeconds = 0) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

// Relative time from ISO string
function formatRelativeTime(isoString) {
  if (!isoString) return 'Never';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// Friendly page formatter with icons
function formatPageView(pageKey) {
  if (!pageKey) return { label: 'Chat Area', icon: '💬' };
  const clean = pageKey.toLowerCase();
  const map = {
    chat: { label: 'Chat Area', icon: '💬' },
    dashboard: { label: 'Dashboard', icon: '📊' },
    stats: { label: 'Statistics', icon: '📈' },
    tracking: { label: 'Tracking', icon: '⚡' },
    knowledge_base: { label: 'Knowledge Base', icon: '📚' },
    data_mixer: { label: 'Data Mixer', icon: '🎛️' },
    employee_management: { label: 'Team Hub', icon: '👥' },
    team: { label: 'Team Hub', icon: '👥' },
    contact_profile: { label: 'Profile Drawer', icon: '👤' },
    onboarding: { label: 'Onboarding', icon: '🚀' }
  };
  if (map[clean]) return map[clean];
  const pretty = clean.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { label: pretty, icon: '💻' };
}

export default function UserTrackingView({ onNavigateToDashboard, onNavigateToChat }) {
  const { token, user: currentUser } = useAuth();
  const { socket } = useSocket();

  const [telemetryData, setTelemetryData] = useState({
    summary: {
      totalUsers: 0,
      activeOnScreen: 0,
      anotherTab: 0,
      offline: 0
    },
    users: [],
    clickStream: []
  });

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active_screen' | 'another_tab' | 'offline'
  const [selectedUserForDrilldown, setSelectedUserForDrilldown] = useState(null);
  const [isLiveActive, setIsLiveActive] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  // Auto-scroll click stream ref
  const clickStreamRef = useRef(null);

  // Fetch initial telemetry
  const fetchTelemetry = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/telemetry', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTelemetryData({
          summary: data.summary || {},
          users: data.users || [],
          clickStream: (data.clickStream || []).slice(0, 100)
        });
      }
    } catch (err) {
      console.error('Failed to fetch telemetry data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Reset telemetry metrics (active screen time, background tab time, and clicks to 0)
  const handleResetTelemetry = async (targetUserId = null) => {
    const isSingleUser = !!targetUserId;
    const confirmMsg = isSingleUser
      ? 'Reset active screen time, background tab time, and clicks to 0 for this user?'
      : 'Are you sure you want to reset active screen time, background tab time, and clicks to 0 for all users?';

    if (!window.confirm(confirmMsg)) return;

    setIsResetting(true);
    try {
      const res = await fetch('/api/admin/telemetry/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId: targetUserId })
      });

      if (res.ok) {
        const data = await res.json();
        setTelemetryData({
          summary: data.summary || {},
          users: data.users || [],
          clickStream: (data.clickStream || []).slice(0, 100)
        });

        if (selectedUserForDrilldown) {
          if (!targetUserId || selectedUserForDrilldown.userId === targetUserId) {
            setSelectedUserForDrilldown(prev => prev ? ({
              ...prev,
              activeScreenSeconds: 0,
              backgroundSeconds: 0,
              totalClicks: 0,
              recentClicks: []
            }) : null);
          }
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to reset telemetry metrics');
      }
    } catch (err) {
      console.error('Failed to reset telemetry metrics:', err);
      alert('Failed to reset telemetry metrics');
    } finally {
      setIsResetting(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, [token]);

  // Socket listener for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleTelemetryUpdate = (payload) => {
      if (!isLiveActive) return;
      setTelemetryData((prev) => ({
        ...prev,
        summary: payload.summary || prev.summary,
        users: payload.users || prev.users
      }));
    };

    const handleTelemetryClick = (clickEvent) => {
      if (!isLiveActive) return;
      setTelemetryData((prev) => {
        const nextClicks = [clickEvent, ...(prev.clickStream || [])].slice(0, 100);
        // Also update the matching user's click count locally
        const updatedUsers = (prev.users || []).map((u) => {
          if (u.userId === clickEvent.userId) {
            const userRecent = [clickEvent, ...(u.recentClicks || [])].slice(0, 50);
            return {
              ...u,
              totalClicks: (u.totalClicks || 0) + 1,
              status: 'active_screen',
              currentView: clickEvent.page || u.currentView,
              lastActiveView: clickEvent.page || u.lastActiveView,
              lastScreenSeenAt: clickEvent.timestamp,
              lastSeenAt: clickEvent.timestamp,
              recentClicks: userRecent,
              recentClicksCount: userRecent.length
            };
          }
          return u;
        });

        return {
          ...prev,
          users: updatedUsers,
          clickStream: nextClicks
        };
      });
    };

    socket.on('admin_telemetry_update', handleTelemetryUpdate);
    socket.on('admin_telemetry_click', handleTelemetryClick);

    return () => {
      socket.off('admin_telemetry_update', handleTelemetryUpdate);
      socket.off('admin_telemetry_click', handleTelemetryClick);
    };
  }, [socket, isLiveActive]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return (telemetryData.users || []).filter((u) => {
      // Filter by status
      if (statusFilter !== 'all' && u.status !== statusFilter) {
        return false;
      }
      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (u.displayName || '').toLowerCase().includes(q);
        const matchesUser = (u.username || '').toLowerCase().includes(q);
        const matchesRole = (u.role || '').toLowerCase().includes(q);
        return matchesName || matchesUser || matchesRole;
      }
      return true;
    });
  }, [telemetryData.users, statusFilter, searchQuery]);

  // Selected user click log (capped to last 50 actions)
  const selectedUserClicks = useMemo(() => {
    if (!selectedUserForDrilldown) return [];
    const userFromData = (telemetryData.users || []).find((u) => u.userId === selectedUserForDrilldown.userId);
    if (userFromData && Array.isArray(userFromData.recentClicks) && userFromData.recentClicks.length > 0) {
      return userFromData.recentClicks.slice(0, 50);
    }
    return (telemetryData.clickStream || []).filter(
      (c) => c.userId === selectedUserForDrilldown.userId
    ).slice(0, 50);
  }, [telemetryData.users, telemetryData.clickStream, selectedUserForDrilldown]);

  if (loading) {
    return (
      <div className="user-tracking-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="circular-loader-ring lg" style={{ margin: '0 auto 16px auto' }} />
          <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: 0, fontWeight: 600 }}>Loading...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="user-tracking-view">
      {/* Top Header */}
      <div className="tracking-header">
        <div className="tracking-header-left">
          <div className="tracking-title-row">
            <div className="tracking-badge-icon">
              <Activity size={22} className="pulsing-icon" />
            </div>
            <div>
              <h1 className="tracking-title">User Screen & Activity Live Tracking</h1>
              <p className="tracking-subtitle">
                Monitor user engagement, active foreground screen viewing vs background tab browsing, and real-time click streams.
              </p>
            </div>
          </div>
        </div>

        <div className="tracking-header-actions admin-tracking-controls">
          <div className={`live-pulse-badge ${isLiveActive ? 'active' : 'paused'}`}>
            <span className="live-dot" />
            <span>{isLiveActive ? 'Live Real-Time' : 'Paused'}</span>
          </div>

          <button 
            type="button" 
            className="tracking-action-btn"
            onClick={() => setIsLiveActive(!isLiveActive)}
            title={isLiveActive ? 'Pause live streaming' : 'Resume live streaming'}
          >
            <Radio size={15} />
            <span>{isLiveActive ? 'Pause' : 'Resume'}</span>
          </button>

          <button 
            type="button" 
            className="tracking-action-btn"
            onClick={fetchTelemetry}
            title="Refresh metrics from server"
          >
            <RefreshCw size={15} />
            <span>Sync</span>
          </button>

          <button 
            type="button" 
            className="tracking-action-btn"
            onClick={() => handleResetTelemetry(null)}
            disabled={isResetting}
            title="Reset active screen time, background tab time, and clicks to 0 for all users"
            style={{ 
              color: '#f87171', 
              borderColor: 'rgba(239, 68, 68, 0.3)',
              background: 'rgba(239, 68, 68, 0.08)'
            }}
          >
            <RotateCcw size={15} />
            <span>{isResetting ? 'Resetting...' : 'Reset to 0'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="tracking-kpi-grid">
        {/* Card 1: Active on Screen */}
        <div className="tracking-kpi-card live-foreground">
          <div className="kpi-icon-wrap green">
            <Eye size={22} />
          </div>
          <div className="kpi-content">
            <div className="kpi-label">Active on Screen</div>
            <div className="kpi-value-row">
              <span className="kpi-value text-emerald">
                {telemetryData.summary.activeOnScreen || 0}
              </span>
              <span className="kpi-status-pill green">
                🟢 Looking at Screen
              </span>
            </div>
            <div className="kpi-hint">Tab focused in foreground right now</div>
          </div>
        </div>

        {/* Card 2: In Another Tab */}
        <div className="tracking-kpi-card live-background">
          <div className="kpi-icon-wrap amber">
            <Layers size={22} />
          </div>
          <div className="kpi-content">
            <div className="kpi-label">Online in Another Tab</div>
            <div className="kpi-value-row">
              <span className="kpi-value text-amber">
                {telemetryData.summary.anotherTab || 0}
              </span>
              <span className="kpi-status-pill amber">
                🟡 Hidden / Blurred Tab
              </span>
            </div>
            <div className="kpi-hint">Tab open in background or other window</div>
          </div>
        </div>

        {/* Card 3: Offline Employees */}
        <div className="tracking-kpi-card">
          <div className="kpi-icon-wrap gray">
            <UserCheck size={22} />
          </div>
          <div className="kpi-content">
            <div className="kpi-label">Offline Employees</div>
            <div className="kpi-value-row">
              <span className="kpi-value" style={{ color: 'var(--text-muted)' }}>
                {telemetryData.summary.offline || 0}
              </span>
              <span className="kpi-status-pill gray">
                ⚪ Disconnected
              </span>
            </div>
            <div className="kpi-hint">Employees currently not in app</div>
          </div>
        </div>

        {/* Card 4: Total Tracked Team Members */}
        <div className="tracking-kpi-card">
          <div className="kpi-icon-wrap purple">
            <Users size={22} />
          </div>
          <div className="kpi-content">
            <div className="kpi-label">Monitored Team Members</div>
            <div className="kpi-value-row">
              <span className="kpi-value text-purple">
                {telemetryData.summary.totalUsers || filteredUsers.length || 0}
              </span>
              <span className="kpi-status-pill purple">Employees</span>
            </div>
            <div className="kpi-hint">Total registered employee accounts</div>
          </div>
        </div>
      </div>

      {/* Main Content Split: Users Table + Live Click Stream */}
      <div className="tracking-main-layout">
        {/* Left Column: User Telemetry Table */}
        <div className="tracking-users-section">
          {/* Controls Bar */}
          <div className="tracking-controls-bar admin-tracking-controls">
            <div className="tracking-search-box">
              <Search size={16} className="search-icon" />
              <input 
                type="text"
                placeholder="Search user by name, handle, role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="tracking-filter-tabs">
              <button 
                type="button"
                className={`filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                All Users ({telemetryData.users?.length || 0})
              </button>
              <button 
                type="button"
                className={`filter-pill green ${statusFilter === 'active_screen' ? 'active' : ''}`}
                onClick={() => setStatusFilter('active_screen')}
              >
                🟢 On Screen ({telemetryData.summary.activeOnScreen || 0})
              </button>
              <button 
                type="button"
                className={`filter-pill amber ${statusFilter === 'another_tab' ? 'active' : ''}`}
                onClick={() => setStatusFilter('another_tab')}
              >
                🟡 Another Tab ({telemetryData.summary.anotherTab || 0})
              </button>
              <button 
                type="button"
                className={`filter-pill gray ${statusFilter === 'offline' ? 'active' : ''}`}
                onClick={() => setStatusFilter('offline')}
              >
                ⚪ Offline ({telemetryData.summary.offline || 0})
              </button>
            </div>
          </div>

          {/* User Cards / Table */}
          <div className="tracking-table-card">
            <div className="tracking-table-header">
              <div className="th col-user">User</div>
              <div className="th col-status">Screen Status</div>
              <div className="th col-last-seen">Last Saw Screen</div>
              <div className="th col-time">Active vs Tab Time</div>
              <div className="th col-view">Current Page</div>
              <div className="th col-clicks">Clicks</div>
              <div className="th col-action">Audit</div>
            </div>

            <div className="tracking-table-body">
              {filteredUsers.length === 0 ? (
                <div className="tracking-empty-state">
                  <UserCheck size={36} color="var(--text-muted)" />
                  <p>No matching users found for this filter.</p>
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isActiveScreen = u.status === 'active_screen';
                  const isAnotherTab = u.status === 'another_tab';
                  const totalSecs = (u.activeScreenSeconds || 0) + (u.backgroundSeconds || 0);
                  const activePercent = totalSecs > 0 ? Math.round(((u.activeScreenSeconds || 0) / totalSecs) * 100) : 0;

                  return (
                    <div 
                      key={u.userId} 
                      className={`tracking-row ${isActiveScreen ? 'row-active-screen' : isAnotherTab ? 'row-another-tab' : 'row-offline'}`}
                      onClick={() => setSelectedUserForDrilldown(u)}
                    >
                      {/* User Info */}
                      <div className="td col-user">
                        <div className="user-avatar-wrap">
                          <img src={u.avatar} alt={u.displayName} className="user-avatar" />
                          <span className={`status-indicator ${u.status}`} />
                        </div>
                        <div className="user-text-info">
                          <div className="user-display-name">
                            {u.displayName}
                            {u.isAdmin && <span className="admin-tag">Admin</span>}
                          </div>
                          <div className="user-handle">@{u.username}</div>
                        </div>
                      </div>

                      {/* Screen Status */}
                      <div className="td col-status">
                        {isActiveScreen && (
                          <span className="badge-status foreground">
                            <span className="glow-dot green" />
                            Looking at Screen
                          </span>
                        )}
                        {isAnotherTab && (
                          <span className="badge-status background">
                            <span className="glow-dot amber" />
                            In Another Tab
                          </span>
                        )}
                        {!isActiveScreen && !isAnotherTab && (
                          <span className="badge-status offline">
                            <span className="glow-dot gray" />
                            Offline
                          </span>
                        )}
                      </div>

                      {/* Last Saw Screen */}
                      <div className="td col-last-seen">
                        <div className="seen-time">
                          {isActiveScreen ? (
                            <span className="active-now-tag">Viewing Now</span>
                          ) : (
                            formatRelativeTime(u.lastScreenSeenAt)
                          )}
                        </div>
                        {u.lastScreenSeenAt && (
                          <div className="seen-date">
                            {new Date(u.lastScreenSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </div>
                        )}
                      </div>

                      {/* Active Screen Time vs Background */}
                      <div className="td col-time">
                        <div className="time-primary">
                          <Eye size={13} className="inline-icon text-emerald" />
                          <strong>{formatDuration(u.activeScreenSeconds)}</strong>
                        </div>
                        <div className="time-secondary">
                          <Layers size={13} className="inline-icon text-amber" />
                          <span>{formatDuration(u.backgroundSeconds)} tab</span>
                        </div>
                        <div className="time-bar-bg" title={`${activePercent}% active focus ratio`}>
                          <div className="time-bar-fill" style={{ width: `${activePercent}%` }} />
                        </div>
                      </div>

                      {/* Current / Last Page */}
                      <div className="td col-view">
                        {(() => {
                          const pageInfo = formatPageView(u.currentView || u.lastActiveView);
                          const isOffline = u.status === 'offline';
                          return (
                            <span 
                              className={`view-pill ${u.status}`}
                              title={isOffline ? `Last active on ${pageInfo.label}` : `Currently on ${pageInfo.label}`}
                            >
                              <span className="view-pill-icon">{pageInfo.icon}</span>
                              <span className="view-pill-text">{pageInfo.label}</span>
                              {isOffline && <span className="view-pill-sub">(last)</span>}
                            </span>
                          );
                        })()}
                        {u.screenRes && <div className="screen-res-hint">{u.screenRes}</div>}
                      </div>

                      {/* Clicks */}
                      <div className="td col-clicks">
                        <div className="clicks-count">
                          <MousePointer size={13} className="inline-icon" />
                          <span>{u.totalClicks || 0}</span>
                        </div>
                      </div>

                      {/* Action */}
                      <div className="td col-action">
                        <button 
                          type="button"
                          className="view-audit-btn"
                          title="View user action click stream"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUserForDrilldown(u);
                          }}
                        >
                          Details <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Action / Click Stream */}
        <div className="tracking-stream-section">
          <div className="stream-header">
            <div className="stream-title-row">
              <MousePointer size={18} className="text-purple" />
              <h3>Live Click Stream</h3>
            </div>
            <span className="stream-counter">
              {Math.min(telemetryData.clickStream?.length || 0, 100)} logged (max 100)
            </span>
          </div>

          <div className="stream-list" ref={clickStreamRef}>
            {telemetryData.clickStream?.length === 0 ? (
              <div className="stream-empty">
                <Activity size={28} color="var(--text-muted)" />
                <p>Waiting for user clicks & interactions...</p>
              </div>
            ) : (
              telemetryData.clickStream.slice(0, 100).map((event) => (
                <div key={event.id} className="stream-item">
                  <div className="stream-item-top">
                    <div className="stream-user">
                      <img src={event.avatar} alt={event.displayName} className="stream-avatar" />
                      <span className="stream-username">{event.displayName}</span>
                    </div>
                    <span className="stream-time">
                      {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  <div className="stream-action">
                    <span className="stream-badge-section">{event.section || 'App'}</span>
                    <span className="stream-badge-page">{event.page}</span>
                  </div>

                  <div className="stream-click-text">
                    Clicked: <strong title={event.text}>"{event.text}"</strong>
                  </div>

                  {event.coordinates && (
                    <div className="stream-coords">
                      pos: ({event.coordinates.x}px, {event.coordinates.y}px)
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* User Drilldown Modal / Drawer */}
      {selectedUserForDrilldown && (
        <div className="tracking-modal-overlay">
          <div className="tracking-modal-content">
            <div className="tracking-modal-header">
              <div className="modal-user-profile">
                <img 
                  src={selectedUserForDrilldown.avatar} 
                  alt={selectedUserForDrilldown.displayName} 
                  className="modal-avatar" 
                />
                <div>
                  <h2 className="modal-user-title">
                    {selectedUserForDrilldown.displayName}
                    <span className="modal-user-handle">@{selectedUserForDrilldown.username}</span>
                  </h2>
                  <div className="modal-user-status">
                    Status: <strong>{selectedUserForDrilldown.status === 'active_screen' ? '🟢 Looking at Screen' : selectedUserForDrilldown.status === 'another_tab' ? '🟡 In Another Tab' : '⚪ Offline'}</strong>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button 
                  type="button" 
                  className="tracking-action-btn"
                  onClick={() => handleResetTelemetry(selectedUserForDrilldown.userId)}
                  disabled={isResetting}
                  title="Reset active screen time, background tab time, and clicks to 0 for this user"
                  style={{ 
                    fontSize: '0.74rem',
                    padding: '5px 10px',
                    color: '#f87171', 
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                    background: 'rgba(239, 68, 68, 0.08)'
                  }}
                >
                  <RotateCcw size={13} />
                  <span>Reset to 0</span>
                </button>

                <button 
                  type="button" 
                  className="modal-close-btn"
                  onClick={() => setSelectedUserForDrilldown(null)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="modal-stats-grid">
              <div className="modal-stat-box">
                <div className="mstat-label">Active Screen Time</div>
                <div className="mstat-value text-emerald">
                  {formatDuration(selectedUserForDrilldown.activeScreenSeconds)}
                </div>
              </div>
              <div className="modal-stat-box">
                <div className="mstat-label">Background Tab Time</div>
                <div className="mstat-value text-amber">
                  {formatDuration(selectedUserForDrilldown.backgroundSeconds)}
                </div>
              </div>
              <div className="modal-stat-box">
                <div className="mstat-label">Last Screen Seen</div>
                <div className="mstat-value">
                  {formatRelativeTime(selectedUserForDrilldown.lastScreenSeenAt)}
                </div>
              </div>
              <div className="modal-stat-box">
                <div className="mstat-label">Total Clicks</div>
                <div className="mstat-value text-purple">
                  {selectedUserForDrilldown.totalClicks || 0}
                </div>
              </div>
            </div>

            {/* User Specific Click Log */}
            <div className="modal-clicks-section">
              <h3>Recent Actions & Clicks (Last {selectedUserClicks.length} / Max 50)</h3>
              <div className="modal-clicks-list">
                {selectedUserClicks.length === 0 ? (
                  <p className="no-clicks-hint">No recent clicks recorded for this user during this session.</p>
                ) : (
                  selectedUserClicks.map((clk) => (
                    <div key={clk.id} className="modal-click-row">
                      <div className="clk-time">
                        {new Date(clk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div className="clk-details">
                        <span className="clk-sec">{clk.section}</span>
                        <span className="clk-text">"{clk.text}"</span>
                        <span className="clk-page">in {clk.page}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
