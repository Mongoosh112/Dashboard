const fs = require('fs');
const path = require('path');

let mongoose = null;
let MongoModels = null;
try {
  mongoose = require('mongoose');
  MongoModels = require('./models');
} catch (e) {
  // Mongo models optional
}

const TELEMETRY_FILE = path.join(__dirname, 'data', 'telemetry.json');

class TelemetryEngine {
  constructor() {
    this.io = null;
    this.db = null;
    this.users = new Map(); // userId -> UserTelemetry
    this.clickStream = []; // Recent 300 global click events
    this.timer = null;
    this.saveTimer = null;
  }

  init(io, db) {
    this.io = io;
    this.db = db;
    this.loadFromDisk();

    // Start 1-second resolution tick for time counters & heartbeat stale check
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), 1000);
    }

    // Auto-save telemetry every 30 seconds
    if (!this.saveTimer) {
      this.saveTimer = setInterval(() => this.saveToDisk(), 30000);
    }

    console.log('📊 Real-time User Telemetry & Tracking Engine initialized');
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(TELEMETRY_FILE)) {
        const raw = fs.readFileSync(TELEMETRY_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data.users && typeof data.users === 'object') {
          Object.entries(data.users).forEach(([uid, uData]) => {
            if (this.isUserAdmin(uid) || uData.role === 'admin') return;
            this.users.set(uid, {
              ...uData,
              status: 'offline', // Reset live status to offline on server startup
              lastPing: 0,
              isVisible: false,
              isFocused: false,
              currentView: uData.lastActiveView || uData.currentView || 'chat',
              lastActiveView: uData.lastActiveView || uData.currentView || 'chat',
              recentClicks: uData.recentClicks || []
            });
          });
        }
        if (Array.isArray(data.clickStream)) {
          this.clickStream = data.clickStream.filter(c => !this.isUserAdmin(c.userId) && c.role !== 'admin').slice(-100);
        }
      }
    } catch (err) {
      console.warn('[Telemetry] Could not load telemetry.json:', err.message);
    }
  }

  saveToDisk() {
    try {
      const usersObj = {};
      this.users.forEach((data, uid) => {
        if (this.isUserAdmin(uid) || data.role === 'admin') return;
        usersObj[uid] = {
          userId: data.userId,
          username: data.username,
          displayName: data.displayName,
          role: data.role,
          avatar: data.avatar,
          activeScreenSeconds: data.activeScreenSeconds || 0,
          backgroundSeconds: data.backgroundSeconds || 0,
          totalClicks: data.totalClicks || 0,
          lastSeenAt: data.lastSeenAt || null,
          lastScreenSeenAt: data.lastScreenSeenAt || null,
          lastActiveView: data.lastActiveView || 'chat',
          userAgent: data.userAgent || '',
          recentClicks: (data.recentClicks || []).slice(-50)
        };
      });

      const payload = {
        updatedAt: new Date().toISOString(),
        users: usersObj,
        clickStream: this.clickStream.filter(c => !this.isUserAdmin(c.userId) && c.role !== 'admin').slice(-100)
      };

      fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(payload, null, 2), 'utf-8');

      // Also persist to MongoDB Atlas if connected
      if (MongoModels && MongoModels.Telemetry && mongoose && mongoose.connection.readyState === 1) {
        MongoModels.Telemetry.updateOne(
          { key: 'main' },
          { $set: { users: usersObj, clickStream: payload.clickStream, updatedAt: new Date() } },
          { upsert: true }
        ).catch(err => console.warn('[Telemetry] Mongo sync error:', err.message));
      }
    } catch (err) {
      console.warn('[Telemetry] Failed to save telemetry.json:', err.message);
    }
  }

  isUserAdmin(userId) {
    if (!this.db) return false;
    try {
      const dbUser = this.db.findUserById(userId);
      return !!(dbUser?.isAdmin || dbUser?.role === 'admin');
    } catch (e) {
      return false;
    }
  }

  ensureUserRecord(userId) {
    if (this.isUserAdmin(userId)) {
      return null;
    }

    if (!this.users.has(userId)) {
      let dbUser = null;
      try {
        dbUser = this.db ? this.db.findUserById(userId) : null;
      } catch (e) {}

      this.users.set(userId, {
        userId,
        username: dbUser?.username || userId,
        displayName: dbUser?.displayName || userId,
        role: dbUser?.role || (dbUser?.isAdmin ? 'admin' : 'user'),
        avatar: dbUser?.avatar || '',
        status: 'offline',
        isVisible: false,
        isFocused: false,
        currentView: 'chat',
        lastActiveView: 'chat',
        activeScreenSeconds: 0,
        backgroundSeconds: 0,
        totalClicks: 0,
        lastSeenAt: null,
        lastScreenSeenAt: null,
        lastPing: 0,
        userAgent: '',
        screenRes: '',
        recentClicks: []
      });
    }
    return this.users.get(userId);
  }

  recordPing(userId, pingData = {}) {
    if (this.isUserAdmin(userId)) return;
    const record = this.ensureUserRecord(userId);
    if (!record) return;
    const now = Date.now();
    const isoNow = new Date(now).toISOString();

    const isVisible = !!pingData.isVisible;
    const isFocused = !!pingData.isFocused;
    const view = pingData.currentView || record.currentView || 'chat';

    record.lastPing = now;
    record.lastSeenAt = isoNow;
    record.isVisible = isVisible;
    record.isFocused = isFocused;
    record.currentView = view;
    record.lastActiveView = view;

    if (pingData.userAgent) record.userAgent = pingData.userAgent;
    if (pingData.screenWidth && pingData.screenHeight) {
      record.screenRes = `${pingData.screenWidth}x${pingData.screenHeight}`;
    }

    const prevStatus = record.status;
    if (isVisible && isFocused) {
      record.status = 'active_screen';
      record.lastScreenSeenAt = isoNow;
    } else {
      record.status = 'another_tab';
    }

    if (prevStatus !== record.status) {
      this.broadcastTelemetryUpdate();
    }
  }

  recordClick(userId, clickData = {}) {
    if (this.isUserAdmin(userId)) return;
    const record = this.ensureUserRecord(userId);
    if (!record) return;
    const now = Date.now();
    const isoNow = new Date(now).toISOString();

    record.totalClicks = (record.totalClicks || 0) + 1;
    record.lastPing = now;
    record.lastSeenAt = isoNow;
    record.lastScreenSeenAt = isoNow;
    record.status = 'active_screen';
    record.isVisible = true;
    record.isFocused = true;

    const page = clickData.page || record.currentView || 'chat';
    record.currentView = page;
    record.lastActiveView = page;

    const event = {
      id: `clk_${now}_${Math.random().toString(36).substr(2, 6)}`,
      userId,
      username: record.username,
      displayName: record.displayName,
      avatar: record.avatar,
      role: record.role,
      target: clickData.target || 'element',
      element: clickData.element || 'button',
      text: (clickData.text || '').substring(0, 120),
      page,
      section: clickData.section || '',
      coordinates: clickData.coordinates || null,
      timestamp: isoNow
    };

    record.recentClicks.unshift(event);
    if (record.recentClicks.length > 50) {
      record.recentClicks.pop();
    }

    this.clickStream.unshift(event);
    if (this.clickStream.length > 100) {
      this.clickStream = this.clickStream.slice(0, 100);
    }

    // Immediately broadcast click and schedule consolidated telemetry update
    if (this.io) {
      this.io.to('admin_room').emit('admin_telemetry_click', event);
      this.scheduleTelemetryUpdate();
    }
  }

  scheduleTelemetryUpdate() {
    if (this._updateTimer) return;
    this._updateTimer = setTimeout(() => {
      this._updateTimer = null;
      this.broadcastTelemetryUpdate();
    }, 250);
  }

  handleUserDisconnect(userId) {
    if (this.isUserAdmin(userId)) return;
    if (this.users.has(userId)) {
      const record = this.users.get(userId);
      record.status = 'offline';
      record.isVisible = false;
      record.isFocused = false;
      this.broadcastTelemetryUpdate();
    }
  }

  tick() {
    const now = Date.now();
    let changed = false;

    this.users.forEach((record) => {
      if (this.isUserAdmin(record.userId)) return;
      // Check staleness (if no ping received for > 16 seconds, user is offline)
      if (record.status !== 'offline') {
        const timeSincePing = now - (record.lastPing || 0);
        if (timeSincePing > 16000) {
          record.status = 'offline';
          record.isVisible = false;
          record.isFocused = false;
          changed = true;
        } else if (record.status === 'active_screen') {
          record.activeScreenSeconds = (record.activeScreenSeconds || 0) + 1;
        } else if (record.status === 'another_tab') {
          record.backgroundSeconds = (record.backgroundSeconds || 0) + 1;
        }
      }
    });

    // Periodically broadcast state every 3 seconds to keep admin counters fresh
    if (changed || (Math.floor(now / 1000) % 3 === 0)) {
      this.broadcastTelemetryUpdate();
    }
  }

  broadcastTelemetryUpdate() {
    if (!this.io) return;
    const summary = this.getSummaryStats();
    this.io.to('admin_room').emit('admin_telemetry_update', {
      summary,
      users: this.getTelemetryUserList()
    });
  }

  getSummaryStats() {
    let activeOnScreen = 0;
    let anotherTab = 0;
    let offline = 0;
    let trackedCount = 0;

    this.users.forEach((u) => {
      if (this.isUserAdmin(u.userId)) return;
      trackedCount++;

      if (u.status === 'active_screen') activeOnScreen++;
      else if (u.status === 'another_tab') anotherTab++;
      else offline++;
    });

    return {
      totalUsers: trackedCount,
      activeOnScreen,
      anotherTab,
      offline
    };
  }

  getTelemetryUserList() {
    // Ensure all DB users are represented, excluding Admin
    const dbData = this.db ? this.db.loadDB() : null;
    const allDbUsers = (dbData && Array.isArray(dbData.users)) ? dbData.users : [];
    const nonAdminDbUsers = allDbUsers.filter(u => !u.isAdmin && u.role !== 'admin');

    const list = nonAdminDbUsers.map(dbUser => {
      const record = this.ensureUserRecord(dbUser.id);
      if (!record) return null;
      return {
        userId: dbUser.id,
        username: dbUser.username,
        displayName: dbUser.displayName,
        role: dbUser.role || 'user',
        isAdmin: false,
        avatar: dbUser.avatar,
        status: record.status,
        isVisible: record.isVisible,
        isFocused: record.isFocused,
        currentView: record.currentView,
        lastActiveView: record.lastActiveView,
        activeScreenSeconds: record.activeScreenSeconds || 0,
        backgroundSeconds: record.backgroundSeconds || 0,
        totalClicks: record.totalClicks || 0,
        lastSeenAt: record.lastSeenAt || dbUser.lastSeen,
        lastScreenSeenAt: record.lastScreenSeenAt,
        userAgent: record.userAgent,
        screenRes: record.screenRes,
        recentClicks: (record.recentClicks || []).slice(0, 50),
        recentClicksCount: Math.min((record.recentClicks || []).length, 50)
      };
    }).filter(Boolean);

    return list.sort((a, b) => {
      // Sort active_screen first, then another_tab, then offline
      const rank = { active_screen: 0, another_tab: 1, offline: 2 };
      const rA = rank[a.status] ?? 3;
      const rB = rank[b.status] ?? 3;
      if (rA !== rB) return rA - rB;
      return (b.activeScreenSeconds || 0) - (a.activeScreenSeconds || 0);
    });
  }

  resetMetrics(targetUserId = null) {
    if (targetUserId) {
      if (this.users.has(targetUserId)) {
        const record = this.users.get(targetUserId);
        record.activeScreenSeconds = 0;
        record.backgroundSeconds = 0;
        record.totalClicks = 0;
        record.recentClicks = [];
      }
      this.clickStream = this.clickStream.filter(c => c.userId !== targetUserId);
    } else {
      this.users.forEach((record) => {
        record.activeScreenSeconds = 0;
        record.backgroundSeconds = 0;
        record.totalClicks = 0;
        record.recentClicks = [];
      });
      this.clickStream = [];
    }

    this.saveToDisk();
    this.broadcastTelemetryUpdate();
  }

  deleteUser(userId) {
    if (this.users.has(userId)) {
      this.users.delete(userId);
    }
    this.clickStream = this.clickStream.filter(c => c.userId !== userId);
    this.saveToDisk();
    this.broadcastTelemetryUpdate();
  }

  getFullData() {
    return {
      summary: this.getSummaryStats(),
      users: this.getTelemetryUserList(),
      clickStream: this.clickStream.filter(c => !this.isUserAdmin(c.userId)).slice(0, 100)
    };
  }
}

module.exports = new TelemetryEngine();
