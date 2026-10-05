import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { formatTime, downloadPdfFile, openPdfInNewTab, getAuthenticatedMediaUrl } from '../utils/helpers';
import MessageInput from './MessageInput';
import { 
  ArrowLeft, 
  Info, 
  Check, 
  CheckCheck, 
  Smile, 
  UserPlus, 
  MessageSquare, 
  Sparkles,
  FileText, 
  Download, 
  ExternalLink, 
  Maximize2, 
  Image as ImageIcon, 
  X
} from 'lucide-react';

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '🔥', '🎉'];

export default function ChatArea({
  conversation,
  messages,
  onSendMessage,
  onAddReaction,
  onBackToList,
  onToggleProfileDrawer,
  onOpenAddContact,
  onInteract,
  totalUnreadCount = 0
}) {
  const { user, token } = useAuth();
  const { socket, isUserOnline, reconnectCount } = useSocket();
  const [typingUsers, setTypingUsers] = useState(new Set());
  const messagesEndRef = useRef(null);

  const recipient = conversation?.recipient;
  const recipientRef = useRef(recipient);
  useEffect(() => {
    recipientRef.current = recipient;
  }, [recipient]);

  const isRecipientOnline = recipient ? isUserOnline(recipient.id) : false;
  const [activeImageModal, setActiveImageModal] = useState(null);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState(null);

  // Close image lightbox on Escape key
  useEffect(() => {
    if (!activeImageModal) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveImageModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeImageModal]);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    scrollToBottom(false);
  }, [conversation?.id]);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, typingUsers.size]);

  // Socket room joining and typing events
  useEffect(() => {
    if (!socket || !conversation?.id) return;

    socket.emit('join_conversation', conversation.id);
    // Mark as read
    socket.emit('mark_read', { conversationId: conversation.id });

    const typingTimers = new Map();

    const handleUserTyping = ({ conversationId, userId, username }) => {
      if (conversationId === conversation.id && userId !== user?.id) {
        const name = username || recipientRef.current?.displayName || 'User';
        setTypingUsers(prev => new Set(prev).add(name));

        // Auto-expire after 4.5s in case user disconnects or stop packet is lost
        if (typingTimers.has(name)) {
          clearTimeout(typingTimers.get(name));
        }
        typingTimers.set(name, setTimeout(() => {
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
          typingTimers.delete(name);
        }, 4500));
      }
    };

    const handleUserStoppedTyping = ({ conversationId, username }) => {
      if (conversationId === conversation.id) {
        const name = username || recipientRef.current?.displayName;
        if (name) {
          if (typingTimers.has(name)) {
            clearTimeout(typingTimers.get(name));
            typingTimers.delete(name);
          }
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.delete(name);
            return next;
          });
        } else {
          typingTimers.forEach(t => clearTimeout(t));
          typingTimers.clear();
          setTypingUsers(new Set());
        }
      }
    };

    socket.on('user_typing', handleUserTyping);
    socket.on('user_stopped_typing', handleUserStoppedTyping);

    return () => {
      socket.emit('leave_conversation', conversation.id);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stopped_typing', handleUserStoppedTyping);
      typingTimers.forEach(t => clearTimeout(t));
      typingTimers.clear();
      setTypingUsers(new Set());
    };
  }, [socket, conversation?.id, user?.id, reconnectCount]);

  const handleTypingStart = () => {
    if (socket && conversation?.id) {
      socket.emit('typing_start', { conversationId: conversation.id });
    }
  };

  const handleTypingStop = () => {
    if (socket && conversation?.id) {
      socket.emit('typing_stop', { conversationId: conversation.id });
    }
  };

  // If no conversation selected, show Welcome View
  if (!conversation) {
    return (
      <main className="chat-main-container">
        <div className="welcome-chat-view">
          <div className="welcome-icon-glow">
            <MessageSquare size={44} color="#ffffff" />
          </div>
          <h2 className="welcome-title">Welcome to QuantumPropAI</h2>
          <p className="welcome-desc">
            Connect and communicate in real time with anyone. Select a chat from the sidebar or click below to discover and add contacts!
          </p>
          <button className="welcome-cta-btn" onClick={onOpenAddContact}>
            <UserPlus size={18} />
            <span>Find People & Start Chatting</span>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="chat-main-container" onClick={onInteract}>
      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-info">
          <button className="icon-btn mobile-back-btn" onClick={onBackToList} title="Back" style={{ position: 'relative' }}>
            <ArrowLeft size={20} />
            {totalUnreadCount > 0 && <span className="mobile-unread-dot" />}
          </button>

          <div className="avatar-wrapper" onClick={onToggleProfileDrawer} style={{ cursor: 'pointer' }}>
            <img 
              src={recipient?.avatar} 
              alt={recipient?.displayName || 'User'} 
              className="avatar-img" 
            />
            <span className={`status-dot ${isRecipientOnline ? 'online' : 'offline'}`} />
          </div>

          <div style={{ cursor: 'pointer' }} onClick={onToggleProfileDrawer}>
            <div className="chat-header-title">
              {recipient?.displayName || recipient?.username || 'Chat'}
            </div>
            <div className={`chat-header-status ${isRecipientOnline ? 'online' : ''}`}>
              <span>{isRecipientOnline ? 'Active Now' : 'Offline'}</span>
              {recipient?.bio && <span style={{ color: 'var(--text-dim)' }}>• {recipient.bio}</span>}
            </div>
          </div>
        </div>

        <div className="chat-header-actions">
          <button className="icon-btn" title="View details" onClick={onToggleProfileDrawer}>
            <Info size={18} />
          </button>
        </div>
      </header>

      {/* Messages Stream */}
      <div className="messages-stream-container">
        {messages.length === 0 ? (
          <div className="empty-list" style={{ marginTop: 'auto', marginBottom: 'auto' }}>
            <div style={{
              width: 50,
              height: 50,
              borderRadius: '16px',
              background: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-gradient)'
            }}>
              <Sparkles size={24} color="#8b5cf6" />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              This is the beginning of your direct chat with <strong style={{ color: '#fff' }}>{recipient?.displayName}</strong>.
            </p>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              Send a hello to break the ice! 👋
            </span>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user?.id;
            const isRead = msg.readBy && msg.readBy.length > 1;

            return (
              <div key={msg.id} className={`message-row ${isMe ? 'sent' : 'received'}`}>
                {!isMe && (
                  <img
                    src={msg.senderAvatar || recipient?.avatar}
                    alt={msg.senderName}
                    className="bubble-avatar"
                  />
                )}

                <div style={{ position: 'relative' }}>
                  {/* Quick Reaction Bar on Hover or Mobile Tap */}
                  <div className={`bubble-actions-hover ${activeReactionMsgId === msg.id ? 'mobile-visible' : ''}`}>
                    {EMOJI_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="reaction-quick-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddReaction(msg.id, emoji);
                          setActiveReactionMsgId(null);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {/* Message Bubble Card */}
                  <div 
                    className="bubble-card"
                    onClick={() => setActiveReactionMsgId(prev => prev === msg.id ? null : msg.id)}
                  >
                    {/* Media Attachments: Image or PDF */}
                    {msg.mediaUrl && (
                      (msg.mediaType?.startsWith('image/') || (msg.fileName && /\.(png|jpe?g|gif|webp|svg)$/i.test(msg.fileName)) || (!msg.fileName && msg.mediaUrl.startsWith('data:image'))) ? (
                        <div className="image-bubble-attachment">
                          <img
                            src={getAuthenticatedMediaUrl(msg.mediaUrl, token)}
                            alt={msg.fileName || 'Attached Image'}
                            className="chat-attached-image"
                            onClick={() => setActiveImageModal({ url: getAuthenticatedMediaUrl(msg.mediaUrl, token), name: msg.fileName })}
                          />
                          <div className="image-actions-overlay">
                            <button
                              type="button"
                              className="pdf-action-link"
                              onClick={() => setActiveImageModal({ url: getAuthenticatedMediaUrl(msg.mediaUrl, token), name: msg.fileName })}
                              title="View Full Size"
                            >
                              <Maximize2 size={13} />
                              <span>Expand</span>
                            </button>
                            <button
                              type="button"
                              className="pdf-action-link primary"
                              onClick={() => downloadPdfFile(msg.mediaUrl, msg.fileName || 'image.jpg')}
                              title="Download Image"
                            >
                              <Download size={13} />
                              <span>Save</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="pdf-bubble-attachment">
                          <div 
                            className="pdf-attachment-header"
                            onClick={(e) => {
                              e.stopPropagation();
                              openPdfInNewTab(msg.mediaUrl, msg.fileName);
                            }}
                            title="Click to open PDF in new tab"
                          >
                            <div className="pdf-icon-badge">
                              <FileText size={18} color="#fff" />
                            </div>
                            <div className="pdf-meta-text">
                              <div className="pdf-file-name">
                                {msg.fileName || 'Attached_Document.pdf'}
                              </div>
                              <div className="pdf-file-size">
                                {msg.fileSize || 'PDF Document'}
                              </div>
                            </div>
                          </div>

                          <div className="pdf-actions-row">
                            <button
                              type="button"
                              className="pdf-action-link"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPdfInNewTab(msg.mediaUrl, msg.fileName);
                              }}
                              title="Open in new tab"
                            >
                              <ExternalLink size={13} />
                              <span>Open</span>
                            </button>
                            <button
                              type="button"
                              className="pdf-action-link primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadPdfFile(msg.mediaUrl, msg.fileName);
                              }}
                              title="Download PDF"
                            >
                              <Download size={13} />
                              <span>Download</span>
                            </button>
                          </div>
                        </div>
                      )
                    )}

                    {/* Accompanying text if any */}
                    {msg.text && <div style={{ marginTop: msg.mediaUrl ? 8 : 0 }}>{msg.text}</div>}

                    <div className="bubble-meta">
                      <span>{formatTime(msg.timestamp)}</span>
                      {isMe && (
                        <span>
                          {isRead ? (
                            <CheckCheck size={14} color="#2dd4bf" />
                          ) : (
                            <Check size={14} />
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reactions Tray */}
                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="bubble-reactions-tray">
                      {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                        if (!userIds || userIds.length === 0) return null;
                        const hasReacted = userIds.includes(user?.id);
                        return (
                          <button
                            key={emoji}
                            type="button"
                            className={`reaction-pill ${hasReacted ? 'reacted' : ''}`}
                            onClick={() => onAddReaction(msg.id, emoji)}
                          >
                            <span>{emoji}</span>
                            <span>{userIds.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Live Typing Indicator */}
        {typingUsers.size > 0 && (
          <div className="typing-indicator-row">
            <div className="bouncing-dots">
              <span />
              <span />
              <span />
            </div>
            <span>{Array.from(typingUsers).join(', ')} is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Compose bar */}
      <MessageInput
        onSendMessage={onSendMessage}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
        onInteract={onInteract}
      />

      {/* Image Lightbox Modal - Portalled directly to document.body so it appears on top of the sidebar and rail */}
      {activeImageModal && typeof document !== 'undefined' && createPortal(
        <div 
          className="modal-overlay image-lightbox-overlay" 
          onClick={() => setActiveImageModal(null)} 
          style={{ zIndex: 9999, background: 'rgba(4, 7, 14, 0.85)' }}
        >
          <div 
            className="modal-dialog image-lightbox-dialog" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: 960, 
              width: '94vw', 
              padding: 20, 
              background: '#0d1321', 
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(99, 102, 241, 0.2)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                {activeImageModal.name || 'Image Preview'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="pdf-action-link primary"
                  onClick={() => downloadPdfFile(activeImageModal.url, activeImageModal.name || 'image.jpg')}
                  style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Download size={14} />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setActiveImageModal(null)}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div style={{ 
              maxHeight: '82vh', 
              overflow: 'hidden', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              borderRadius: 10,
              background: 'rgba(3, 7, 18, 0.6)',
              padding: 10
            }}>
              <img
                src={activeImageModal.url}
                alt={activeImageModal.name || 'Full preview'}
                style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: 8, display: 'block' }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </main>
  );
}
