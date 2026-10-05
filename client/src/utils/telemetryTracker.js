/**
 * Telemetry Tracker for QuantumPropAI
 * Tracks screen presence, tab focus, time, and user interaction stream
 */

class TelemetryTracker {
  constructor() {
    this.socket = null;
    this.user = null;
    this.currentView = 'chat';
    this.pingInterval = null;
    this.isTracking = false;
    this.lastVisibilityState = null;
    this.clickHandler = this.handleClick.bind(this);
    this.visibilityHandler = this.handleVisibilityChange.bind(this);
    this.focusHandler = this.handleFocusChange.bind(this);
  }

  start(socket, user, currentView = 'chat') {
    if (!user) return;
    // Admins are not tracked
    if (user.isAdmin || user.role === 'admin') {
      this.stop();
      return;
    }

    this.socket = socket;
    this.user = user;
    this.currentView = currentView;

    if (this.isTracking) {
      this.sendPing();
      return;
    }

    this.isTracking = true;

    // Attach listeners
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('focus', this.focusHandler);
    window.addEventListener('blur', this.focusHandler);
    document.addEventListener('click', this.clickHandler, true); // capture phase

    // Send immediate initial state ping
    this.sendPing();

    // Start 4-second heartbeat
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 4000);
  }

  setCurrentView(view) {
    if (this.currentView !== view) {
      this.currentView = view;
      this.sendPing();
    }
  }

  updateSocket(socket) {
    this.socket = socket;
    if (this.isTracking) {
      this.sendPing();
    }
  }

  detectCurrentPage() {
    try {
      // 1. Check open modals and drawers
      if (document.querySelector('.knowledge-base-drawer.open') || document.querySelector('.knowledge-base-drawer')) {
        return 'knowledge_base';
      }
      if (document.querySelector('.data-mixer-modal') || document.querySelector('.data-mixer-overlay') || document.querySelector('.mixer-modal-content')) {
        return 'data_mixer';
      }
      if (document.querySelector('.employee-management-modal') || document.querySelector('.emp-modal-container')) {
        return 'employee_management';
      }
      if (document.querySelector('.employee-onboarding-modal')) {
        return 'onboarding';
      }
      if (document.querySelector('.contact-profile-drawer.open')) {
        return 'contact_profile';
      }

      // 2. Check main active views
      if (document.querySelector('.user-tracking-view')) {
        return 'tracking';
      }
      if (document.querySelector('.statistics-view')) {
        return 'stats';
      }
      if (document.querySelector('.review-dashboard')) {
        return 'dashboard';
      }
      if (document.querySelector('.chat-area') || document.querySelector('.chat-container')) {
        return 'chat';
      }
    } catch (e) {
      // Ignore DOM errors
    }

    return this.currentView || 'chat';
  }

  getPresenceState() {
    const isVisible = document.visibilityState === 'visible';
    const isFocused = document.hasFocus ? document.hasFocus() : true;
    const detectedPage = this.detectCurrentPage();
    if (detectedPage && detectedPage !== this.currentView && !['chat', 'dashboard', 'stats', 'tracking'].includes(this.currentView)) {
      this.currentView = detectedPage;
    }

    return {
      isVisible,
      isFocused,
      currentView: detectedPage || this.currentView || 'chat',
      screenWidth: window.innerWidth || (window.screen && window.screen.width) || 0,
      screenHeight: window.innerHeight || (window.screen && window.screen.height) || 0,
      userAgent: navigator.userAgent || ''
    };
  }

  sendPing() {
    if (!this.user || this.user.isAdmin || this.user.role === 'admin') return;
    const state = this.getPresenceState();

    if (this.socket && this.socket.connected) {
      this.socket.emit('user_telemetry_ping', state);
    }
  }

  handleVisibilityChange() {
    this.sendPing();
  }

  handleFocusChange() {
    this.sendPing();
  }

  handleClick(e) {
    if (!this.user || this.user.isAdmin || this.user.role === 'admin' || !e.target) return;
    try {
      const target = e.target;
      // Skip clicking inside tracking inspector controls itself to avoid feedback loops if desired
      if (target.closest && target.closest('.admin-tracking-controls')) {
        return;
      }

      // Find informative interactive element
      const interactiveEl = target.closest('button, a, input, textarea, [role="button"], .tab, .card, .rail-nav-btn, .vote-btn, .reaction-btn, li') || target;
      
      let text = '';
      const isInput = interactiveEl.tagName === 'INPUT' || interactiveEl.tagName === 'TEXTAREA';
      if (isInput) {
        if (interactiveEl.type === 'password') {
          text = '[Password Field]';
        } else {
          text = interactiveEl.getAttribute('placeholder') || interactiveEl.getAttribute('name') || interactiveEl.getAttribute('aria-label') || interactiveEl.tagName.toLowerCase();
        }
      } else {
        text = (interactiveEl.innerText || interactiveEl.textContent || interactiveEl.getAttribute('title') || interactiveEl.getAttribute('aria-label') || '').trim();
      }
      if (text.length > 80) text = text.substring(0, 80) + '...';

      // Detect app section
      let section = 'Workspace';
      if (target.closest('.navigation-rail')) section = 'Navigation';
      else if (target.closest('.chat-area') || target.closest('.chat-container')) section = 'Chat Area';
      else if (target.closest('.sidebar-container')) section = 'Conversation Sidebar';
      else if (target.closest('.review-dashboard')) section = 'Review Dashboard';
      else if (target.closest('.statistics-view')) section = 'Statistics View';
      else if (target.closest('.knowledge-base-drawer')) section = 'Knowledge Drawer';
      else if (target.closest('.employee-management-modal')) section = 'Team Modal';
      else if (target.closest('.data-mixer-modal') || target.closest('.data-mixer-overlay')) section = 'Data Mixer';
      else if (target.closest('.user-tracking-view')) section = 'Tracking Dashboard';

      // Accurately determine page context, including click navigation intent
      let page = this.detectCurrentPage();
      const railBtn = target.closest('.rail-nav-btn');
      if (railBtn) {
        const label = (railBtn.querySelector('.rail-nav-label')?.innerText || '').trim().toLowerCase();
        if (label === 'dashboard') page = 'dashboard';
        else if (label === 'chat') page = 'chat';
        else if (label === 'stats') page = 'stats';
        else if (label === 'team') page = 'employee_management';
        else if (label === 'tracking') page = 'tracking';
        this.currentView = page;
      } else if (target.closest('.knowledge-base-drawer') || text.toLowerCase().includes('knowledge')) {
        page = 'knowledge_base';
      }

      const tagName = (interactiveEl.tagName || 'ELEMENT').toLowerCase();
      const clickData = {
        target: interactiveEl.className || tagName,
        element: tagName,
        text: text || tagName,
        page,
        section,
        coordinates: {
          x: Math.round(e.clientX),
          y: Math.round(e.clientY)
        },
        timestamp: new Date().toISOString()
      };

      if (this.socket && this.socket.connected) {
        this.socket.emit('user_action_click', clickData);
      }

      // If clicked a navigation element, send an immediate follow-up ping after DOM updates
      if (railBtn) {
        setTimeout(() => {
          this.sendPing();
        }, 80);
      }
    } catch (err) {
      // Ignore click logging errors
    }
  }

  stop() {
    this.isTracking = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    window.removeEventListener('focus', this.focusHandler);
    window.removeEventListener('blur', this.focusHandler);
    document.removeEventListener('click', this.clickHandler, true);
  }
}

export const telemetryTracker = new TelemetryTracker();
