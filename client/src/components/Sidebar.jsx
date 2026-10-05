import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { formatRelativeTime } from '../utils/helpers';
import { 
  MessageSquare, 
  UserPlus, 
  Users, 
  Search, 
  ChevronRight
} from 'lucide-react';

export default function Sidebar({
  conversations,
  contacts,
  activeConversation,
  totalUnreadCount = 0,
  onSelectConversation,
  onOpenAddContact,
  onOpenEmployeeManagement,
  onOpenProfile,
  isMobileSidebarOpen
}) {
  const { user } = useAuth();
  const { isUserOnline } = useSocket();
  const [tab, setTab] = useState('chats'); // 'chats' | 'contacts'
  const [filterQuery, setFilterQuery] = useState('');

  const isAdmin = user?.isAdmin;
  const cleanDisplayName = (user?.displayName || user?.username || '').replace(/\s*👑\s*/g, '').trim();

  // Filtered conversations (match recipient name, username, last message content, or attached file name)
  const filteredConversations = conversations.filter(c => {
    const q = filterQuery.toLowerCase().trim();
    if (!q) return true;
    const name = (c.recipient?.displayName || c.recipient?.username || '').toLowerCase();
    const lastMsg = (c.lastMessage?.text || '').toLowerCase();
    const fileName = (c.lastMessage?.fileName || '').toLowerCase();
    return name.includes(q) || lastMsg.includes(q) || fileName.includes(q);
  });

  // Filtered contacts
  const filteredContacts = contacts.filter(c => {
    const name = c.displayName || c.username || '';
    return name.toLowerCase().includes(filterQuery.toLowerCase());
  });

  return (
    <aside className={`sidebar ${!isMobileSidebarOpen ? 'hidden-mobile' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="brand-badge">
          <div className="brand-icon-wrapper" style={{
            background: 'var(--primary-gradient)',
            position: 'relative'
          }}>
            <MessageSquare size={20} color="#ffffff" />
          </div>
          <div className="brand-title-wrap">
            <span className="brand-title">QuantumPropAI</span>
            {isAdmin && (
              <span className="admin-pill-badge">
                ADMIN
              </span>
            )}
          </div>
        </div>

        <div className="sidebar-actions">
          {isAdmin && (
            <button 
              type="button"
              className="add-employee-trigger-btn" 
              title="Create Employee & Set Password" 
              onClick={() => onOpenEmployeeManagement && onOpenEmployeeManagement('create')}
            >
              <UserPlus size={14} />
              <span>+ Employee</span>
            </button>
          )}
        </div>
      </div>

      {/* User profile card */}
      <div className="user-profile-pill" onClick={onOpenProfile} title="View Your Profile">
        <div className="profile-pill-info">
          <div className="avatar-wrapper">
            <img src={user?.avatar} alt={user?.displayName} className="avatar-img" />
            <span className="status-dot online" />
          </div>
          <div className="profile-names">
            <div className="profile-display-name">
              <span>{cleanDisplayName}</span>
            </div>
            <div className="profile-handle">
              @{user?.username} • <span style={{ color: isAdmin ? '#fbbf24' : 'var(--accent-cyan)' }}>
                {isAdmin ? 'Administrator' : 'Employee'}
              </span>
            </div>
          </div>
        </div>
        <div className="profile-pill-action" title="View Profile">
          <ChevronRight size={16} />
        </div>
      </div>

      {/* Search Input (Visible for Admin, or whenever conversations or contacts exist) */}
      {(isAdmin || conversations.length > 0 || contacts.length > 0) && (
        <div className="sidebar-search-box">
          <Search size={16} className="search-icon-inside" />
          <input
            type="text"
            className="search-input"
            placeholder={isAdmin ? "Search users or messages..." : "Search messages or contacts..."}
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
        </div>
      )}

      {/* Navigation tabs for Admin */}
      {isAdmin && (
        <div className="sidebar-tabs">
          <button
            className={`tab-btn ${tab === 'chats' ? 'active' : ''}`}
            onClick={() => setTab('chats')}
          >
            <MessageSquare size={14} /> Active Chats ({conversations.length})
          </button>
          <button
            className={`tab-btn ${tab === 'contacts' ? 'active' : ''}`}
            onClick={() => setTab('contacts')}
          >
            <Users size={14} /> All Users ({contacts.length})
          </button>
        </div>
      )}

      {/* List Container */}
      <div className="sidebar-list-container">
        {tab === 'chats' ? (
          filteredConversations.length === 0 ? (
            <div className="empty-list">
              <MessageSquare size={36} />
              <p>{isAdmin ? 'No user messages yet.' : 'Connecting to Admin...'}</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const recipient = conv.recipient;
              const isSelected = activeConversation?.id === conv.id;
              const online = recipient ? isUserOnline(recipient.id) : false;

              return (
                <div
                  key={conv.id}
                  className={`chat-item ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelectConversation(conv)}
                >
                  <div className="avatar-wrapper">
                    <img 
                      src={recipient?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(recipient?.username || 'User')}&backgroundColor=b6e3f4`} 
                      alt={recipient?.displayName || recipient?.username || 'User'} 
                      className="avatar-img" 
                    />
                    <span className={`status-dot ${online ? 'online' : 'offline'}`} />
                  </div>

                  <div className="chat-item-content">
                    <div className="chat-item-top">
                      <span className="chat-item-name">
                        {recipient?.displayName || recipient?.username || (user?.isAdmin ? 'Unknown User' : 'Admin Support')}
                      </span>
                      <span className="chat-item-time">
                        {formatRelativeTime(conv.lastMessage?.timestamp || conv.updatedAt)}
                      </span>
                    </div>

                    <div className="chat-item-bottom">
                      <span className="chat-item-preview">
                        {conv.lastMessage ? (
                          <>
                            {conv.lastMessage.senderId === user?.id && <span style={{ color: 'var(--text-dim)' }}>You: </span>}
                            {conv.lastMessage.text}
                          </>
                        ) : (
                          <span style={{ fontStyle: 'italic' }}>Direct connection ready</span>
                        )}
                      </span>

                      {conv.unreadCount > 0 && (
                        <span className="unread-badge">{conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )
        ) : (
          /* Contacts / All Users Directory (Admin Only) */
          filteredContacts.length === 0 ? (
            <div className="empty-list">
              <Users size={36} />
              <p>No other users found.</p>
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const online = isUserOnline(contact.id);
              return (
                <div
                  key={contact.id}
                  className="chat-item"
                  onClick={() => {
                    onSelectConversation({
                      id: `dm_${[user.id, contact.id].sort().join('_')}`,
                      recipient: contact
                    });
                  }}
                >
                  <div className="avatar-wrapper">
                    <img src={contact.avatar} alt={contact.displayName} className="avatar-img" />
                    <span className={`status-dot ${online ? 'online' : 'offline'}`} />
                  </div>
                  <div className="chat-item-content">
                    <div className="chat-item-top">
                      <span className="chat-item-name">{contact.displayName}</span>
                    </div>
                    <div className="chat-item-bottom">
                      <span className="chat-item-preview">
                        @{contact.username} • <span style={{ color: online ? 'var(--accent-emerald)' : 'var(--text-dim)' }}>
                          {online ? 'Online' : 'Offline'}
                        </span>
                      </span>
                      <ChevronRight size={16} color="var(--text-dim)" />
                    </div>
                  </div>
                </div>
              );
            })
          )
        )}
      </div>
    </aside>
  );
}
