import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider, useSocket } from './context/SocketContext';
import NavigationRail from './components/NavigationRail';
import ReviewDashboard from './components/ReviewDashboard';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import AuthModal from './components/AuthModal';
import AddContactModal from './components/AddContactModal';
import ContactProfile from './components/ContactProfile';
import ToastContainer from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { soundManager } from './utils/sound';
import { updateTabBadge, resetTabBadge } from './utils/tabBadge';
import { telemetryTracker } from './utils/telemetryTracker';
import { 
  isDesktopNotificationSupported, 
  getNotificationPermission, 
  requestDesktopNotificationPermission, 
  showDesktopNotification 
} from './utils/desktopNotification';
import { Bell, X } from 'lucide-react';

// Code-split heavy views and modals with React.lazy
const StatisticsView = lazy(() => import('./components/StatisticsView'));
const UserTrackingView = lazy(() => import('./components/UserTrackingView'));
const EmployeeManagementModal = lazy(() => import('./components/EmployeeManagementModal'));
const EmployeeOnboardingModal = lazy(() => import('./components/EmployeeOnboardingModal'));

function ViewSuspenseFallback({ title = 'Loading...' }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: 14,
      color: 'var(--text-muted)'
    }}>
      <div className="circular-loader-ring" />
      <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#f1f5f9' }}>{title}</span>
    </div>
  );
}

function ChatApp() {
  const { user, setUser, token, loading } = useAuth();
  const { socket, reconnectCount } = useSocket();

  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);

  // Views: 'chat' | 'dashboard'
  const [currentView, setCurrentView] = useState('chat');
  const [reviewCount, setReviewCount] = useState(0);
  const [employeeCount, setEmployeeCount] = useState(0);
  const [hasUnreadInstructions, setHasUnreadInstructions] = useState(false);

  // Modals and Drawers
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [employeeModalInitialTab, setEmployeeModalInitialTab] = useState('create');
  const [profileDrawerUser, setProfileDrawerUser] = useState(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [desktopNotificationPerm, setDesktopNotificationPerm] = useState(() => getNotificationPermission());
  const [dismissedPermBanner, setDismissedPermBanner] = useState(false);

  const handleEnableDesktopNotifications = async () => {
    const perm = await requestDesktopNotificationPermission();
    setDesktopNotificationPerm(perm);
    if (perm === 'granted') {
      addToast('✓ Windows Notifications Enabled', 'Urgent pings will now pop up directly on your Windows desktop!');
      showDesktopNotification({
        title: 'QuantumPropAI • Notifications Active',
        body: 'Windows Desktop Notifications are now active!',
        requireInteraction: false
      });
    }
  };

  // Refs to avoid stale closures in socket events
  const activeConversationRef = React.useRef(activeConversation);
  const currentViewRef = React.useRef(currentView);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  const handleClearUnread = useCallback((convId) => {
    if (!convId) return;
    if (socket) {
      socket.emit('mark_read', { conversationId: convId });
    }
    setConversations(prev => prev.map(c => 
      c.id === convId ? { ...c, unreadCount: 0 } : c
    ));
  }, [socket]);

  const handleChatInteraction = useCallback(() => {
    const curActive = activeConversationRef.current;
    if (curActive?.id) {
      handleClearUnread(curActive.id);
    }
  }, [handleClearUnread]);

  // Clear unread for active chat when browser tab/window gains focus or becomes visible
  useEffect(() => {
    const handleFocusOrVisible = () => {
      const curActive = activeConversationRef.current;
      const curView = currentViewRef.current;
      if (curView === 'chat' && curActive?.id) {
        handleClearUnread(curActive.id);
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleFocusOrVisible();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [handleClearUnread]);

  const lastToastRef = React.useRef({ title: '', time: 0 });
  const addToast = useCallback((title, message, options = {}) => {
    const now = Date.now();
    if (lastToastRef.current.title === title && (now - lastToastRef.current.time) < 3000) {
      return;
    }
    lastToastRef.current = { title, time: now };
    const id = now + Math.random();
    const duration = options.duration || (options.type === 'directive-ping' ? 9000 : 4500);
    setToasts(prev => [...prev, { id, title, message, ...options }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Fetch initial conversations & contacts
  const fetchConversations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const convList = data.conversations || [];
        setConversations(convList);
        if (!activeConversation && convList.length > 0) {
          // If not admin, automatically open the conversation with Admin
          setActiveConversation(convList[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, [token]);

  const fetchContacts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/contacts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
    }
  }, [token]);

  const fetchReviewCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/dashboard/items', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (user && !user.isAdmin) {
          // For employees: badge indicates items that are PENDING their vote/review!
          const pendingCount = (data.items || []).filter(item => !item.votes?.[user.id]).length;
          setReviewCount(pendingCount);
        } else {
          // For Admin: no pending review action count on rail badge
          setReviewCount(0);
        }
      }
    } catch (err) {
      console.error('Failed to load review count:', err);
    }
  }, [token, user?.id, user?.isAdmin]);

  const fetchEmployeeCount = useCallback(async () => {
    if (!token || !user?.isAdmin) return;
    try {
      const res = await fetch('/api/admin/employees', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployeeCount(data.employees?.length || 0);
      }
    } catch (err) {
      console.error('Failed to load employee count:', err);
    }
  }, [token, user?.isAdmin]);

  const fetchInstructionsAlert = useCallback(async () => {
    if (!token || user?.isAdmin) {
      setHasUnreadInstructions(false);
      return;
    }
    try {
      const res = await fetch('/api/dashboard/instructions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const unread = (data.instructions || []).some(i => !i.acknowledged);
        setHasUnreadInstructions(unread);
      }
    } catch (err) {
      console.error('Failed to check instructions alert:', err);
    }
  }, [token, user?.isAdmin]);

  useEffect(() => {
    if (user && token) {
      fetchConversations();
      fetchContacts();
      fetchReviewCount();
      fetchEmployeeCount();
      fetchInstructionsAlert();
    }
  }, [user, token, fetchConversations, fetchContacts, fetchReviewCount, fetchEmployeeCount, fetchInstructionsAlert]);

  const lastHandledReconnectRef = React.useRef(0);

  // Real-time Network Reconnection Sync: re-sync all data after connection drops & restores
  useEffect(() => {
    if (reconnectCount > 0 && reconnectCount > lastHandledReconnectRef.current && user && token) {
      lastHandledReconnectRef.current = reconnectCount;
      console.log('[App] Network reconnected! Auto re-syncing conversations, reviews and directives...');
      fetchConversations();
      fetchContacts();
      fetchReviewCount();
      fetchEmployeeCount();
      fetchInstructionsAlert();
      addToast('⚡ Connection Restored', 'Re-synced latest messages, reviews and directives.');
    }
  }, [reconnectCount, user, token, fetchConversations, fetchContacts, fetchReviewCount, fetchEmployeeCount, fetchInstructionsAlert, addToast]);

  // Global Session Expiry Handler (catches 401 token expirations)
  useEffect(() => {
    const handleSessionExpired = (e) => {
      addToast('⚠️ Session Expired', e.detail?.message || 'Please sign in again to continue.');
    };
    window.addEventListener('QuantumPropAI_session_expired', handleSessionExpired);
    return () => window.removeEventListener('QuantumPropAI_session_expired', handleSessionExpired);
  }, [addToast]);

  // Trigger celebratory onboarding for first-time employee login
  useEffect(() => {
    if (user && !user.isAdmin) {
      try {
        const alreadySeen = localStorage.getItem(`QuantumPropAI_onboarding_seen_${user.id}`);
        if (!alreadySeen && user.hasSeenOnboarding !== true) {
          setIsOnboardingOpen(true);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [user]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConversation?.id || !token) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/conversations/${activeConversation.id}/messages`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);

          // Reset unread count locally for this conversation and inform socket
          handleClearUnread(activeConversation.id);
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    };

    loadMessages();
    setIsMobileSidebarOpen(false); // On mobile, close sidebar when conversation is opened
  }, [activeConversation?.id, token]);

  // Socket event subscriptions
  useEffect(() => {
    if (!socket) return;

    // Incoming new message
    const handleNewMessage = (newMsg) => {
      const curActive = activeConversationRef.current;
      const curView = currentViewRef.current;

      // If it belongs to currently active conversation
      if (curActive && newMsg.conversationId === curActive.id) {
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        // If not sent by current user, play chime
        if (newMsg.senderId !== user?.id) {
          soundManager.playMessageReceived();
          
          if (curView !== 'chat') {
            addToast(newMsg.senderName, newMsg.text || 'Sent an attachment');
          } else {
            // User is actively on the chat screen viewing this conversation
            handleClearUnread(curActive.id);
          }

          // Trigger Windows desktop notification if window is minimized or user is on another app
          if (typeof document !== 'undefined' && document.hidden) {
            showDesktopNotification({
              title: `QuantumPropAI • ${newMsg.senderName}`,
              body: newMsg.text || 'Sent an attachment',
              icon: newMsg.senderAvatar,
              tag: `msg-${newMsg.conversationId}`,
              requireInteraction: false,
              onClick: () => {
                window.focus();
              }
            });
          }
        }
      } else {
        // Message is for another conversation
        if (newMsg.senderId !== user?.id) {
          soundManager.playMessageReceived();
          addToast(newMsg.senderName, newMsg.text || 'Sent an attachment');

          if (typeof document !== 'undefined' && document.hidden) {
            showDesktopNotification({
              title: `QuantumPropAI • ${newMsg.senderName}`,
              body: newMsg.text || 'Sent an attachment',
              icon: newMsg.senderAvatar,
              tag: `msg-${newMsg.conversationId}`,
              requireInteraction: false,
              onClick: () => {
                window.focus();
              }
            });
          }
        }
      }

      // Update sidebar conversation preview & sort to top
      setConversations(prev => {
        const index = prev.findIndex(c => c.id === newMsg.conversationId);
        if (index > -1) {
          const conv = { ...prev[index] };
          conv.lastMessage = newMsg;
          conv.updatedAt = newMsg.timestamp;
          if (newMsg.senderId !== user?.id) {
            const isActivelyViewing = (
              curActive && 
              curActive.id === newMsg.conversationId && 
              curView === 'chat'
            );
            if (!isActivelyViewing) {
              conv.unreadCount = (conv.unreadCount || 0) + 1;
            } else {
              conv.unreadCount = 0;
            }
          }
          const updated = [...prev];
          updated.splice(index, 1);
          return [conv, ...updated];
        } else {
          // New conversation, re-fetch conversations list
          fetchConversations();
          return prev;
        }
      });
    };

    // Reaction updated
    const handleReactionUpdated = ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          return { ...m, reactions };
        }
        return m;
      }));
    };

    // Messages marked as read
    const handleMessagesRead = ({ conversationId, readByUserId }) => {
      const curActive = activeConversationRef.current;
      if (curActive && curActive.id === conversationId) {
        setMessages(prev => prev.map(m => {
          if (!m.readBy) m.readBy = [];
          if (!m.readBy.includes(readByUserId)) {
            return { ...m, readBy: [...m.readBy, readByUserId] };
          }
          return m;
        }));
      }
    };

    // Contact added in real time
    const handleContactAdded = () => {
      fetchContacts();
      fetchConversations();
      addToast('New Contact', 'A new contact added you!');
    };

    // Review dashboard events
    const handleNewReviewItem = (item) => {
      // Only show notification and refresh count if targeted to this user, broadcast to all, or user is admin
      const isTargetedToMe = !item.targetUserIds || item.targetUserIds.length === 0 || (user?.id && item.targetUserIds.includes(user.id)) || user?.isAdmin;
      if (!isTargetedToMe) return;

      fetchReviewCount();
      if (item.createdBy !== user?.id) {
        soundManager.playMessageReceived();
        addToast('New Review Item', `${item.createdByName || 'Admin'} shared a new item for evaluation!`);
      }
    };

    const handleNewInstruction = (inst) => {
      if (inst.createdBy !== user?.id) {
        // Only show notification toast if targeted to this user, broadcast to all, or user is admin
        const isTargetedToMe = !inst.targetUserIds || inst.targetUserIds.length === 0 || (user?.id && inst.targetUserIds.includes(user.id)) || user?.isAdmin;
        if (!isTargetedToMe) return;

        soundManager.playMessageReceived();
        addToast('📌 Important Instruction', `${inst.createdByName || 'Admin'}: ${inst.title}`);

        // Light up the glowing red alert beacon on the Dashboard icon for employees
        if (!user?.isAdmin) {
          setHasUnreadInstructions(true);
        }
      }
    };

    const handleInstructionUpdated = () => {
      fetchInstructionsAlert();
    };

    const handleInstructionDeleted = () => {
      fetchInstructionsAlert();
    };

    const handleEmployeeCreated = () => {
      fetchEmployeeCount();
      fetchContacts();
      fetchConversations();
    };

    const handleEmployeeDeleted = () => {
      fetchEmployeeCount();
      fetchContacts();
      fetchConversations();
    };

    const handleUserProfileUpdated = ({ user: updatedUser }) => {
      if (updatedUser?.id === user?.id) {
        setUser(updatedUser);
      }
      fetchContacts();
      fetchConversations();
    };

    const handleDirectivePing = (pingData) => {
      // 1. Play distinct urgent audio notification
      soundManager.playDirectivePing();

      // 2. Trigger native Windows Desktop Notification (appears outside browser in Windows Action Center / screen)
      showDesktopNotification({
        title: `🚨 DIRECTIVE PING from ${pingData.senderName || 'Admin'}`,
        body: `"${pingData.title}"\nImmediate review and acknowledgment requested!`,
        icon: pingData.senderAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        tag: `directive-ping-${pingData.instructionId}`,
        requireInteraction: true,
        onClick: () => {
          try {
            window.focus();
          } catch (e) {
            // ignore
          }
          setCurrentView('dashboard');
          setIsMobileSidebarOpen(false);
        }
      });

      // 3. Light up the glowing red alert beacon on Dashboard for employees
      if (!user?.isAdmin) {
        setHasUnreadInstructions(true);
      }

      // 4. Display urgent toast notification with click to view action
      addToast(
        `🚨 DIRECTIVE PING from ${pingData.senderName || 'Admin'}`,
        `"${pingData.title}" - Immediate review & acknowledgment requested!`,
        {
          type: 'directive-ping',
          duration: 10000,
          actionLabel: 'Review & Acknowledge Now',
          onAction: () => {
            setCurrentView('dashboard');
            setIsMobileSidebarOpen(false);
          }
        }
      );
    };

    // Admin notification when an employee completes an asset review / questionnaire
    const handleEmployeeReviewSubmitted = (payload) => {
      if (!user?.isAdmin) return;
      soundManager.playMessageReceived();
      const voteLabel = payload.vote ? ` (Vote: ${String(payload.vote).toUpperCase()})` : '';
      addToast(
        `✓ Evaluation: ${payload.userName}`,
        `Submitted response for "${payload.itemTitle}"${voteLabel}`,
        {
          duration: 6500,
          actionLabel: 'Open Dashboard',
          onAction: () => {
            setCurrentView('dashboard');
            setIsMobileSidebarOpen(false);
          }
        }
      );
    };

    socket.on('new_message', handleNewMessage);
    socket.on('reaction_updated', handleReactionUpdated);
    socket.on('messages_read', handleMessagesRead);
    socket.on('contact_added', handleContactAdded);
    socket.on('new_review_item', handleNewReviewItem);
    socket.on('new_instruction', handleNewInstruction);
    socket.on('instruction_updated', handleInstructionUpdated);
    socket.on('instruction_deleted', handleInstructionDeleted);
    socket.on('directive_ping', handleDirectivePing);
    socket.on('employee_created', handleEmployeeCreated);
    socket.on('employee_deleted', handleEmployeeDeleted);
    socket.on('user_profile_updated', handleUserProfileUpdated);
    socket.on('employee_review_submitted', handleEmployeeReviewSubmitted);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('reaction_updated', handleReactionUpdated);
      socket.off('messages_read', handleMessagesRead);
      socket.off('contact_added', handleContactAdded);
      socket.off('new_review_item', handleNewReviewItem);
      socket.off('new_instruction', handleNewInstruction);
      socket.off('instruction_updated', handleInstructionUpdated);
      socket.off('instruction_deleted', handleInstructionDeleted);
      socket.off('directive_ping', handleDirectivePing);
      socket.off('employee_created', handleEmployeeCreated);
      socket.off('employee_deleted', handleEmployeeDeleted);
      socket.off('user_profile_updated', handleUserProfileUpdated);
      socket.off('employee_review_submitted', handleEmployeeReviewSubmitted);
    };
  }, [socket, user?.id, user?.isAdmin, fetchConversations, fetchContacts, fetchReviewCount, fetchEmployeeCount, fetchInstructionsAlert, setUser, handleClearUnread]);

  // Send message handler (supports text, PDF, and media attachments)
  const handleSendMessage = (payload) => {
    if (!socket || !activeConversation?.id) return;
    const data = typeof payload === 'string' ? { text: payload } : payload;
    if (!data.text && !data.mediaUrl) return;

    handleClearUnread(activeConversation.id);

    const targetConvId = activeConversation.id;
    socket.emit('send_message', {
      conversationId: targetConvId,
      ...data
    }, (response) => {
      if (response && response.error) {
        addToast('Failed to Send', response.error);
      } else if (response && response.message) {
        // Instantly render the message in the current conversation
        setMessages(prev => {
          if (prev.some(m => m.id === response.message.id)) return prev;
          return [...prev, response.message];
        });
        // Update conversation in sidebar
        setConversations(prev => {
          const idx = prev.findIndex(c => c.id === targetConvId);
          if (idx > -1) {
            const conv = { ...prev[idx], lastMessage: response.message, updatedAt: response.message.timestamp };
            const next = [...prev];
            next.splice(idx, 1);
            return [conv, ...next];
          }
          return prev;
        });
      }
    });
  };

  // Add reaction handler
  const handleAddReaction = (messageId, emoji) => {
    if (!socket || !activeConversation?.id) return;

    socket.emit('add_reaction', {
      conversationId: activeConversation.id,
      messageId,
      emoji
    });
  };

  // Open direct conversation with recipient
  const handleSelectConversation = async (conv) => {
    // If conversation object doesn't have an ID yet (started from contacts or employee roster)
    if (!conv.id && conv.recipient) {
      try {
        const res = await fetch('/api/conversations/direct', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ contactUserId: conv.recipient.id })
        });
        if (res.ok) {
          const data = await res.json();
          setActiveConversation(data.conversation);
          handleClearUnread(data.conversation.id);
          fetchConversations();
          return;
        }
      } catch (err) {
        console.error('Failed to create direct conversation:', err);
      }
    }

    setActiveConversation(conv);
    if (conv?.id) {
      handleClearUnread(conv.id);
    }
  };

  const handleOpenEmployeeManagement = (tab = 'create') => {
    setEmployeeModalInitialTab(tab);
    setIsEmployeeModalOpen(true);
  };

  const handleOpenChatWithUser = (targetUser) => {
    setCurrentView('chat');
    setIsMobileSidebarOpen(false);
    handleSelectConversation({ recipient: targetUser });
  };

  const totalUnreadCount = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  // Synchronize browser tab favicon red dot and unread badge count
  useEffect(() => {
    updateTabBadge(totalUnreadCount);
  }, [totalUnreadCount]);

  // Clean up tab badge on unmount
  useEffect(() => {
    return () => {
      resetTabBadge();
    };
  }, []);

  // Real-time telemetry tracking for regular users (screen presence, clicks, and activity duration)
  useEffect(() => {
    if (user && !user.isAdmin && user.role !== 'admin' && socket) {
      telemetryTracker.start(socket, user, currentView);
    }
    return () => {
      telemetryTracker.stop();
    };
  }, [user, socket]);

  useEffect(() => {
    telemetryTracker.setCurrentView(currentView);
  }, [currentView]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
        color: 'var(--text-muted)'
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="circular-loader-ring lg" style={{ marginBottom: 16 }} />
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff', letterSpacing: '0.2px' }}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Auth Screen if not logged in */}
      {!user && <AuthModal />}

      {/* Main App Layout */}
      {user && (
        <>
          {/* Left Navigation Rail (Chat vs Dashboard) */}
          <NavigationRail
            currentView={currentView}
            onViewChange={(view) => {
              setCurrentView(view);
              telemetryTracker.setCurrentView(view);
              if (view === 'chat') {
                setIsMobileSidebarOpen(true);
              }
              if (view === 'dashboard') {
                fetchInstructionsAlert();
                fetchReviewCount();
              }
            }}
            unreadCount={currentView === 'chat' ? 0 : totalUnreadCount}
            reviewCount={reviewCount}
            employeeCount={employeeCount}
            hasUnreadInstructions={hasUnreadInstructions}
            onOpenProfile={() => setProfileDrawerUser(user)}
            onOpenEmployeeManagement={handleOpenEmployeeManagement}
            isMobileChatActive={currentView === 'chat' && !isMobileSidebarOpen}
            onInteractChat={handleChatInteraction}
          />

          {/* Conditional View Rendering */}
          {currentView === 'chat' ? (
            <>
              <Sidebar
                conversations={conversations}
                contacts={contacts}
                activeConversation={activeConversation}
                totalUnreadCount={totalUnreadCount}
                onSelectConversation={handleSelectConversation}
                onOpenAddContact={() => setIsAddContactOpen(true)}
                onOpenEmployeeManagement={handleOpenEmployeeManagement}
                onOpenProfile={() => setProfileDrawerUser(user)}
                isMobileSidebarOpen={isMobileSidebarOpen}
              />

              <ErrorBoundary sectionName="Chat Area" onNavigateToChat={() => setIsMobileSidebarOpen(true)}>
                <ChatArea
                  conversation={activeConversation}
                  messages={messages}
                  totalUnreadCount={totalUnreadCount}
                  onSendMessage={handleSendMessage}
                  onAddReaction={handleAddReaction}
                  onBackToList={() => setIsMobileSidebarOpen(true)}
                  onToggleProfileDrawer={() => {
                    if (activeConversation?.recipient) {
                      setProfileDrawerUser(activeConversation.recipient);
                    }
                  }}
                  onOpenAddContact={() => setIsAddContactOpen(true)}
                  onInteract={handleChatInteraction}
                />
              </ErrorBoundary>
            </>
          ) : currentView === 'stats' ? (
            <ErrorBoundary sectionName="Statistics" onNavigateToChat={() => setCurrentView('chat')}>
              <Suspense fallback={<ViewSuspenseFallback title="Loading Statistics & Response History..." />}>
                <StatisticsView 
                  onNavigateToDashboard={() => setCurrentView('dashboard')}
                  onNavigateToChat={() => {
                    setCurrentView('chat');
                    setIsMobileSidebarOpen(true);
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          ) : (currentView === 'tracking' && user?.isAdmin) ? (
            <ErrorBoundary sectionName="User Telemetry" onNavigateToChat={() => setCurrentView('chat')}>
              <Suspense fallback={<ViewSuspenseFallback title="Loading User Telemetry..." />}>
                <UserTrackingView 
                  onNavigateToDashboard={() => setCurrentView('dashboard')}
                  onNavigateToChat={() => {
                    setCurrentView('chat');
                    setIsMobileSidebarOpen(true);
                  }}
                />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <ErrorBoundary sectionName="Review Dashboard" onNavigateToChat={() => setCurrentView('chat')}>
              <ReviewDashboard 
                onOpenChat={() => {
                  setCurrentView('chat');
                  setIsMobileSidebarOpen(true);
                }}
                onOpenEmployeeManagement={handleOpenEmployeeManagement}
                onInstructionsChange={fetchInstructionsAlert}
                onItemsChange={fetchReviewCount}
              />
            </ErrorBoundary>
          )}

          {/* Contact Details Drawer */}
          <ContactProfile
            contact={profileDrawerUser}
            isOpen={!!profileDrawerUser}
            onClose={() => setProfileDrawerUser(null)}
            onOpenOnboardingGuide={() => setIsOnboardingOpen(true)}
          />

          {/* Add Contacts Modal */}
          <AddContactModal
            isOpen={isAddContactOpen}
            onClose={() => setIsAddContactOpen(false)}
            onSelectConversation={(conv) => {
              handleSelectConversation(conv);
              fetchConversations();
            }}
            onContactAdded={(updatedContacts) => {
              setContacts(updatedContacts);
              fetchConversations();
            }}
            onOpenEmployeeManagement={handleOpenEmployeeManagement}
          />

          {/* Employee Management & Credentials Modal (Admin Only) */}
          {user?.isAdmin && (
            <Suspense fallback={null}>
              <EmployeeManagementModal
                isOpen={isEmployeeModalOpen}
                onClose={() => setIsEmployeeModalOpen(false)}
                initialTab={employeeModalInitialTab}
                onOpenChatWithUser={handleOpenChatWithUser}
              />
            </Suspense>
          )}

          {/* Employee First-Time Onboarding & Congratulations Modal */}
          {user && !user.isAdmin && (
            <Suspense fallback={null}>
              <EmployeeOnboardingModal
                isOpen={isOnboardingOpen}
                onClose={() => setIsOnboardingOpen(false)}
                onNavigateToDashboard={() => setCurrentView('dashboard')}
                onNavigateToChat={() => {
                  setCurrentView('chat');
                  setIsMobileSidebarOpen(false);
                }}
              />
            </Suspense>
          )}

          {/* Windows Desktop Notifications Permission Banner */}
          {user && desktopNotificationPerm === 'default' && !dismissedPermBanner && (
            <div className="desktop-notification-banner" style={{
              position: 'fixed',
              top: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              background: 'linear-gradient(135deg, rgba(20, 26, 46, 0.96) 0%, rgba(15, 20, 35, 0.96) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.45)',
              borderRadius: 14,
              padding: '10px 18px',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.25)',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              maxWidth: '92vw',
              animation: 'slideDown 0.3s ease-out'
            }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'rgba(99, 102, 241, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8',
                flexShrink: 0
              }}>
                <Bell size={18} />
              </div>
              <div style={{ fontSize: '0.82rem', color: '#e2e8f0', lineHeight: 1.35 }}>
                <strong style={{ color: '#fff' }}>Enable Windows Desktop Notifications?</strong>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                  Receive urgent directive sound pings & alerts directly on your Windows desktop, even when QuantumPropAI is minimized.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleEnableDesktopNotifications}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 14px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(99, 102, 241, 0.35)'
                  }}
                >
                  Enable
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedPermBanner(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: 4
                  }}
                  title="Dismiss"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Notification Toasts */}
          <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <ChatApp />
      </SocketProvider>
    </AuthProvider>
  );
}
