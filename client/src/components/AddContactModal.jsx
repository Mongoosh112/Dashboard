import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Check, X, MessageSquare, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AddContactModal({ isOpen, onClose, onSelectConversation, onContactAdded, onOpenEmployeeManagement }) {
  const { token, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState(null);

  // Fetch users matching query or all available users
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setUsers(data.users || []);
        }
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const debounceTimer = setTimeout(fetchUsers, 250);
    return () => {
      isMounted = false;
      clearTimeout(debounceTimer);
    };
  }, [searchQuery, isOpen, token]);

  if (!isOpen) return null;

  const handleAddOrChat = async (targetUser) => {
    try {
      setAddingId(targetUser.id);

      // Add to contacts
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ contactUserId: targetUser.id })
      });

      if (res.ok) {
        const data = await res.json();
        if (onContactAdded) onContactAdded(data.contacts);
        if (data.conversation && onSelectConversation) {
          onSelectConversation({
            ...data.conversation,
            recipient: targetUser
          });
        }
        onClose();
      }
    } catch (err) {
      console.error('Failed to add contact:', err);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: '12px',
              background: 'var(--primary-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <UserPlus size={20} color="#fff" />
            </div>
            <div>
              <h3 className="modal-title">Find & Add People</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Search users on QuantumPropAI to start chatting
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Admin Quick Link to Create Employee */}
        {user?.isAdmin && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.12) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserPlus size={16} color="#fbbf24" />
              <div style={{ fontSize: '0.78rem', color: '#fde68a' }}>
                Onboard a new employee with login credentials
              </div>
            </div>
            <button
              type="button"
              className="add-employee-trigger-btn"
              onClick={() => {
                onClose();
                if (onOpenEmployeeManagement) onOpenEmployeeManagement('create');
              }}
            >
              <UserPlus size={13} />
              + Create
            </button>
          </div>
        )}

        {/* Search Input */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <Search size={18} className="search-icon-inside" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by username or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* Users Results List */}
        <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0', color: 'var(--text-dim)' }}>
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="empty-list" style={{ padding: '30px 0' }}>
              <p>No registered users found matching "{searchQuery}". Try another username!</p>
            </div>
          ) : (
            users.map((u) => (
              <div key={u.id} className="contact-search-card">
                <div className="contact-search-info">
                  <div className="avatar-wrapper">
                    <img src={u.avatar} alt={u.displayName} className="avatar-img" />
                    <span className={`status-dot ${u.isOnline ? 'online' : 'offline'}`} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#fff' }}>
                      {u.displayName}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      @{u.username} • <span style={{ color: u.isOnline ? 'var(--accent-emerald)' : 'var(--text-dim)' }}>
                        {u.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={`add-contact-action-btn ${u.isContact ? 'already-added' : ''}`}
                  onClick={() => handleAddOrChat(u)}
                  disabled={addingId === u.id}
                >
                  {addingId === u.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : u.isContact ? (
                    <>
                      <MessageSquare size={14} /> Chat
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} /> Add Friend
                    </>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
