import React from 'react';
import { MessageSquare, LayoutDashboard, BarChart3, Volume2, VolumeX, LogOut, Users, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { soundManager } from '../utils/sound';

export default function NavigationRail({
  currentView, // 'chat' | 'dashboard' | 'stats'
  onViewChange,
  unreadCount = 0,
  reviewCount = 0,
  employeeCount = 0,
  hasUnreadInstructions = false,
  onOpenProfile,
  onOpenEmployeeManagement,
  isMobileChatActive = false,
  onInteractChat
}) {
  const { user, logout } = useAuth();
  const [soundOn, setSoundOn] = React.useState(soundManager.soundEnabled);

  const toggleSound = () => {
    const newState = soundManager.toggleSound();
    setSoundOn(newState);
  };

  const isAdmin = user?.isAdmin;

  return (
    <nav className={`navigation-rail ${isMobileChatActive ? 'mobile-hidden' : ''}`}>
      {/* Brand Icon */}
      <div 
        className="rail-brand-icon" 
        title="QuantumPropAI Workspace"
        style={{ position: 'relative', cursor: !isAdmin ? 'pointer' : 'default' }}
        onClick={() => {
          if (!isAdmin && onViewChange) onViewChange('chat');
        }}
      >
        <MessageSquare size={22} color="#ffffff" />
      </div>

      {/* Main Switcher Links */}
      <div className="rail-links-group">
        {/* Chat Option */}
        <button
          type="button"
          className={`rail-nav-btn ${currentView === 'chat' ? 'active' : ''}`}
          onClick={() => {
            onViewChange('chat');
            if (currentView === 'chat' && onInteractChat) {
              onInteractChat();
            }
          }}
          title="Direct Messenger"
        >
          <div className="rail-icon-wrapper">
            <MessageSquare size={20} />
            {currentView !== 'chat' && unreadCount > 0 && (
              <span className="rail-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <span className="rail-nav-label">Chat</span>
        </button>

        {/* Dashboard Option */}
        <button
          type="button"
          className={`rail-nav-btn ${currentView === 'dashboard' ? 'active' : ''} ${hasUnreadInstructions ? 'has-important-alert' : ''}`}
          onClick={() => onViewChange('dashboard')}
          title={hasUnreadInstructions ? "⚠️ Important instruction requires your review!" : "Review & Evaluation Dashboard"}
        >
          <div className="rail-icon-wrapper">
            <LayoutDashboard size={20} />
            {hasUnreadInstructions && (
              <span 
                className={`rail-glowing-red-dot ${reviewCount > 0 ? 'with-badge' : ''}`}
                title="Important instruction requires your attention!"
              />
            )}
            {reviewCount > 0 && <span className="rail-badge review">{reviewCount}</span>}
          </div>
          <span className="rail-nav-label">Dashboard</span>
        </button>

        {/* Statistics Option */}
        <button
          type="button"
          className={`rail-nav-btn ${currentView === 'stats' ? 'active' : ''}`}
          onClick={() => onViewChange('stats')}
          title="Review & Response Statistics"
        >
          <div className="rail-icon-wrapper">
            <BarChart3 size={20} />
          </div>
          <span className="rail-nav-label">Stats</span>
        </button>

        {/* Admin Team & Employee Management Option */}
        {isAdmin && (
          <button
            type="button"
            className="rail-nav-btn"
            onClick={() => onOpenEmployeeManagement && onOpenEmployeeManagement('directory')}
            title="Team & Employee Hub (Create & Manage Employees)"
          >
            <div className="rail-icon-wrapper">
              <Users size={20} />
              {employeeCount > 0 && (
                <span className="rail-badge" style={{ background: '#f59e0b', color: '#000' }}>
                  {employeeCount}
                </span>
              )}
            </div>
            <span className="rail-nav-label">Team</span>
          </button>
        )}

        {/* Admin Real-Time User Tracking Option */}
        {isAdmin && (
          <button
            type="button"
            className={`rail-nav-btn ${currentView === 'tracking' ? 'active' : ''}`}
            onClick={() => onViewChange('tracking')}
            title="User Engagement, Screen Presence & Activity Tracking"
          >
            <div className="rail-icon-wrapper">
              <Activity size={20} />
            </div>
            <span className="rail-nav-label">Tracking</span>
          </button>
        )}
      </div>

      {/* Rail Bottom Tools */}
      <div className="rail-bottom-group">
        <button
          type="button"
          className="rail-icon-btn"
          title={soundOn ? 'Sound Chimes On' : 'Sound Chimes Muted'}
          onClick={toggleSound}
        >
          {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>

        <div className="rail-user-avatar" onClick={onOpenProfile} title={`Signed in as ${user?.displayName || user?.username}`}>
          <img src={user?.avatar} alt={user?.displayName} />
          <span className="rail-status-dot online" />
        </div>

        <button
          type="button"
          className="rail-icon-btn danger"
          title="Sign Out"
          onClick={logout}
        >
          <LogOut size={17} />
        </button>
      </div>
    </nav>
  );
}
