const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

let mongoose = null;
let MongoModels = null;
try {
  mongoose = require('mongoose');
  MongoModels = require('./models');
} catch (e) {
  // Mongoose models optional
}

let _isMongoConnected = false;

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'store.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure data and uploads directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initial state schema
const defaultState = {
  users: [],
  contacts: [],
  conversations: [],
  messages: [],
  reviewItems: [],
  instructions: []
};

// In-memory DB cache to avoid synchronous 50MB disk reads and JSON parsing on every request
let _cachedDB = null;

// Offload data: URI base64 attachments to disk files
function saveDataUrlToFile(dataUrl, originalFileName) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }
  try {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!matches) return dataUrl;
    const mimeType = matches[1].toLowerCase().trim();
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    let ext = '.bin';
    if (mimeType === 'application/pdf') ext = '.pdf';
    else if (mimeType === 'image/png' || mimeType === 'image/x-png') ext = '.png';
    else if (mimeType === 'image/jpeg' || mimeType === 'image/pjpeg') ext = '.jpg';
    else if (mimeType === 'image/webp') ext = '.webp';
    else if (mimeType === 'image/gif') ext = '.gif';
    else if (mimeType === 'image/svg+xml') ext = '.svg';
    else if (originalFileName && typeof originalFileName === 'string') {
      const parts = originalFileName.split('.');
      if (parts.length > 1) {
        const potentialExt = '.' + parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(potentialExt)) {
          ext = potentialExt;
        }
      }
    }

    const uniqueId = `file_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
    const filePath = path.join(UPLOADS_DIR, uniqueId);
    fs.writeFileSync(filePath, buffer);
    return `/api/files/${uniqueId}`;
  } catch (err) {
    console.error('[Storage] Failed to save dataUrl to file:', err);
    return dataUrl;
  }
}

// Automatic migration: offload existing embedded data URLs to disk files
function migrateDataUrlsToFiles(data) {
  if (!data) return false;
  let migratedCount = 0;
  if (Array.isArray(data.messages)) {
    for (const m of data.messages) {
      if (m && m.mediaUrl && typeof m.mediaUrl === 'string' && m.mediaUrl.startsWith('data:')) {
        const fileUrl = saveDataUrlToFile(m.mediaUrl, m.fileName);
        if (fileUrl !== m.mediaUrl) {
          m.mediaUrl = fileUrl;
          migratedCount++;
        }
      }
    }
  }
  if (Array.isArray(data.reviewItems)) {
    for (const r of data.reviewItems) {
      if (r && r.imageUrl && typeof r.imageUrl === 'string' && r.imageUrl.startsWith('data:')) {
        const fileUrl = saveDataUrlToFile(r.imageUrl, `${r.id}_image`);
        if (fileUrl !== r.imageUrl) {
          r.imageUrl = fileUrl;
          migratedCount++;
        }
      }
    }
  }
  if (migratedCount > 0) {
    console.log(`[Storage Migration] Successfully extracted ${migratedCount} embedded attachments to disk files in server/data/uploads.`);
    return true;
  }
  return false;
}

// Clean legacy plainPassword properties from stored users to ensure at-rest credential security
function sanitizeStoredDB(data) {
  if (data && Array.isArray(data.users)) {
    let changed = false;
    data.users.forEach(u => {
      if (u.plainPassword !== undefined) {
        delete u.plainPassword;
        changed = true;
      }
    });
    if (changed) {
      saveDB(data);
    }
  }
}

// Safe cached load
function loadDB() {
  if (_cachedDB) {
    if (!Array.isArray(_cachedDB.users)) _cachedDB.users = [];
    if (!Array.isArray(_cachedDB.contacts)) _cachedDB.contacts = [];
    if (!Array.isArray(_cachedDB.conversations)) _cachedDB.conversations = [];
    if (!Array.isArray(_cachedDB.messages)) _cachedDB.messages = [];
    if (!Array.isArray(_cachedDB.reviewItems)) _cachedDB.reviewItems = [];
    if (!Array.isArray(_cachedDB.instructions)) _cachedDB.instructions = [];
    return _cachedDB;
  }
  try {
    if (!fs.existsSync(DB_FILE)) {
      _cachedDB = JSON.parse(JSON.stringify(defaultState));
      saveDB(_cachedDB);
      return _cachedDB;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(data);
    _cachedDB = parsed;

    const migrated = migrateDataUrlsToFiles(_cachedDB);
    sanitizeStoredDB(_cachedDB);
    if (migrated) {
      saveDB(_cachedDB);
    }
    return _cachedDB;
  } catch (err) {
    console.error('Error reading database:', err);
    _cachedDB = JSON.parse(JSON.stringify(defaultState));
    return _cachedDB;
  }
}

// Debounced non-blocking atomic disk persistence
let _saveTimeout = null;

function flushSaveDB() {
  if (!_cachedDB) return;
  const toSave = _cachedDB;
  const jsonStr = JSON.stringify(toSave, null, 2);
  const tempFile = `${DB_FILE}.${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tempFile, jsonStr, 'utf8');
    try {
      fs.renameSync(tempFile, DB_FILE);
    } catch (renameErr) {
      // On Windows NTFS, renameSync can fail with EPERM/EBUSY if destination has an active lock
      fs.copyFileSync(tempFile, DB_FILE);
      try { fs.unlinkSync(tempFile); } catch (_) {}
    }
  } catch (err) {
    console.error('Error writing database:', err);
    try {
      // Direct write fallback
      fs.writeFileSync(DB_FILE, jsonStr, 'utf8');
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (fallbackErr) {
      console.error('Critical: fallback database write failed:', fallbackErr);
    }
  }

  // Asynchronously sync modified records to MongoDB if connected
  if (_isMongoConnected && MongoModels) {
    setImmediate(async () => {
      try {
        if (toSave.users) {
          for (const u of toSave.users) {
            await MongoModels.User.findOneAndUpdate({ id: u.id }, u, { upsert: true });
          }
        }
        if (toSave.reviewItems) {
          for (const r of toSave.reviewItems) {
            await MongoModels.ReviewItem.findOneAndUpdate({ id: r.id }, r, { upsert: true });
          }
        }
        if (toSave.instructions) {
          for (const i of toSave.instructions) {
            await MongoModels.Instruction.findOneAndUpdate({ id: i.id }, i, { upsert: true });
          }
        }
        if (toSave.conversations) {
          for (const c of toSave.conversations) {
            await MongoModels.Conversation.findOneAndUpdate({ id: c.id }, c, { upsert: true });
          }
        }
        if (toSave.messages) {
          for (const m of toSave.messages) {
            await MongoModels.Message.findOneAndUpdate({ id: m.id }, m, { upsert: true });
          }
        }
      } catch (mongoSyncErr) {
        console.error('[Database] MongoDB sync error:', mongoSyncErr.message);
      }
    });
  }
}

// Ensure pending writes flush before process exits
process.on('beforeExit', () => {
  if (_saveTimeout) {
    clearTimeout(_saveTimeout);
    _saveTimeout = null;
    flushSaveDB();
  }
});

function saveDB(data, immediate = false) {
  if (data) {
    _cachedDB = data;
  }
  if (immediate) {
    if (_saveTimeout) {
      clearTimeout(_saveTimeout);
      _saveTimeout = null;
    }
    flushSaveDB();
    return;
  }
  // Debounce disk I/O by 50ms so user API interactions respond in single-digit milliseconds
  if (!_saveTimeout) {
    _saveTimeout = setTimeout(() => {
      _saveTimeout = null;
      flushSaveDB();
    }, 50);
  }
}

async function initMongoDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[Database] ℹ️  MONGODB_URI not defined. Operating with persistent local storage (data/store.json).');
    return false;
  }
  if (!mongoose || !MongoModels) {
    console.warn('[Database] ⚠️  Mongoose driver not available.');
    return false;
  }

  try {
    console.log('[Database] Connecting to MongoDB Atlas / cluster...');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    _isMongoConnected = true;
    console.log('[Database] ✓ Connected to MongoDB successfully!');

    // Initialize or sync collections
    const userCount = await MongoModels.User.countDocuments();
    const currentLocal = loadDB();

    if (userCount === 0 && currentLocal && Array.isArray(currentLocal.users) && currentLocal.users.length > 0) {
      console.log('[Database] MongoDB is fresh. Auto-seeding existing records into MongoDB collections...');
      for (const u of (currentLocal.users || [])) {
        await MongoModels.User.findOneAndUpdate({ id: u.id }, u, { upsert: true });
      }
      for (const c of (currentLocal.conversations || [])) {
        await MongoModels.Conversation.findOneAndUpdate({ id: c.id }, c, { upsert: true });
      }
      for (const m of (currentLocal.messages || [])) {
        await MongoModels.Message.findOneAndUpdate({ id: m.id }, m, { upsert: true });
      }
      for (const r of (currentLocal.reviewItems || [])) {
        await MongoModels.ReviewItem.findOneAndUpdate({ id: r.id }, r, { upsert: true });
      }
      for (const i of (currentLocal.instructions || [])) {
        await MongoModels.Instruction.findOneAndUpdate({ id: i.id }, i, { upsert: true });
      }
      console.log('[Database] ✓ Auto-seeding to MongoDB completed!');
    } else if (userCount > 0) {
      // Load current state from MongoDB into in-memory cache
      const users = await MongoModels.User.find({}).lean();
      const conversations = await MongoModels.Conversation.find({}).lean();
      const messages = await MongoModels.Message.find({}).lean();
      const reviewItems = await MongoModels.ReviewItem.find({}).lean();
      const instructions = await MongoModels.Instruction.find({}).lean();

      _cachedDB = {
        users: users || [],
        contacts: (currentLocal && Array.isArray(currentLocal.contacts)) ? currentLocal.contacts : [],
        conversations: conversations || [],
        messages: messages || [],
        reviewItems: reviewItems || [],
        instructions: instructions || []
      };
      const migrated = migrateDataUrlsToFiles(_cachedDB);
      if (migrated) {
        saveDB(_cachedDB);
      }
      console.log(`[Database] ✓ Synced cache from MongoDB: ${users.length} users, ${reviewItems.length} review items, ${instructions.length} directives.`);
    }
    return true;
  } catch (err) {
    console.warn(`[Database] ⚠️  MongoDB connection warning: ${err.message}. Operating in local JSON fallback mode.`);
    _isMongoConnected = false;
    return false;
  }
}

// Ensure clean state with Admin account only (no dummy demo data)
function seedDemoUsers() {
  const db = loadDB();

  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.contacts)) db.contacts = [];
  if (!Array.isArray(db.conversations)) db.conversations = [];
  if (!Array.isArray(db.messages)) db.messages = [];
  if (!Array.isArray(db.reviewItems)) db.reviewItems = [];
  if (!Array.isArray(db.instructions)) db.instructions = [];

  const adminExists = db.users.some(u => u.isAdmin || u.username === 'admin');
  if (!adminExists) {
    const envPassword = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : '';
    const adminPassword = envPassword.length >= 8
      ? envPassword
      : crypto.randomBytes(16).toString('base64url');
    const salt = bcrypt.genSaltSync(10);
    const adminHash = bcrypt.hashSync(adminPassword, salt);
    const adminUser = {
      id: 'u_admin',
      username: 'admin',
      email: 'admin@QuantumPropAI.io',
      displayName: 'QuantumPropAI Admin',
      passwordHash: adminHash,
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=AdminDash&backgroundColor=ffdfbf',
      bio: 'Official Admin & Support Host • Ask me anything!',
      status: 'Admin Online ⚡',
      role: 'admin',
      isAdmin: true,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
    db.users.unshift(adminUser);
    saveDB(db);
    if (envPassword.length >= 8) {
      console.log('[Database] Clean admin account initialized');
    } else {
      console.log(`[Database] ADMIN_PASSWORD not set in .env. Generated admin password: ${adminPassword}`);
      console.log('[Database] Set ADMIN_PASSWORD in .env to choose your own password.');
    }
  }
}

// Initialize seed
seedDemoUsers();

// User methods
function findUserByUsername(username) {
  const db = loadDB();
  return db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
}

function findUserById(id) {
  const db = loadDB();
  return db.users.find(u => u.id === id);
}

function updateUserProfile(userId, updates = {}) {
  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (updates.avatar && typeof updates.avatar === 'string' && updates.avatar.trim()) {
    user.avatar = updates.avatar.trim();
  }
  if (updates.displayName && typeof updates.displayName === 'string' && updates.displayName.trim()) {
    user.displayName = updates.displayName.trim();
  }
  if (typeof updates.bio === 'string') {
    user.bio = updates.bio.trim();
  }
  if (updates.email && typeof updates.email === 'string' && updates.email.trim()) {
    const cleanEmail = updates.email.trim().toLowerCase();
    const existing = db.users.find(u => u.email && u.email.toLowerCase() === cleanEmail && u.id !== userId);
    if (existing) {
      throw new Error(`Email "${cleanEmail}" is already in use by another account.`);
    }
    user.email = cleanEmail;
  }
  if (updates.createdAt && typeof updates.createdAt === 'string' && updates.createdAt.trim()) {
    const d = new Date(updates.createdAt.trim());
    if (!isNaN(d.getTime())) {
      user.createdAt = d.toISOString();
    }
  }

  user.updatedAt = new Date().toISOString();

  // Sync displayName to messages sent by this user
  if (updates.displayName) {
    if (Array.isArray(db.messages)) {
      db.messages.forEach(m => {
        if (m.senderId === userId) {
          m.senderName = user.displayName;
        }
      });
    }
    if (Array.isArray(db.reviewItems)) {
      db.reviewItems.forEach(item => {
        if (item.createdBy === userId) {
          item.createdByName = user.displayName;
        }
        if (item.votes && item.votes[userId]) {
          item.votes[userId].userName = user.displayName;
        }
      });
    }
  }

  // Sync avatar to messages sent by this user so their chat history updates
  if (updates.avatar) {
    if (Array.isArray(db.messages)) {
      db.messages.forEach(m => {
        if (m.senderId === userId) {
          m.senderAvatar = user.avatar;
        }
      });
    }

    // Sync avatar to review item votes & creations
    if (Array.isArray(db.reviewItems)) {
      db.reviewItems.forEach(item => {
        if (item.createdBy === userId) {
          item.createdByAvatar = user.avatar;
        }
        if (item.votes && item.votes[userId]) {
          item.votes[userId].userAvatar = user.avatar;
        }
      });
    }
  }

  saveDB(db);

  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function getAdminUser() {
  const db = loadDB();
  return (db.users || []).find(u => u.isAdmin || u.username === 'admin') || null;
}

function createUser({ username, email, displayName, password, avatar, bio }) {
  const cleanUsername = (username || '').trim().toLowerCase();
  const db = loadDB();
  const existing = (db.users || []).find(u => u.username.toLowerCase() === cleanUsername);
  if (existing) {
    throw new Error('Username already taken');
  }

  if (cleanUsername === 'admin') {
    throw new Error('Username "admin" is reserved');
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const isAdmin = false;

  const newUser = {
    id: `u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    username: username.trim().toLowerCase(),
    email: (email || `${username}@QuantumPropAI.io`).trim().toLowerCase(),
    displayName: displayName.trim() || username.trim(),
    passwordHash,
    avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`,
    bio: bio || (isAdmin ? 'QuantumPropAI Administrator' : 'Hello! I am using QuantumPropAI 💬'),
    status: isAdmin ? 'Admin Online' : 'User active',
    role: isAdmin ? 'admin' : 'user',
    isAdmin,
    hasSeenOnboarding: isAdmin ? true : false,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString()
  };

  db.users.push(newUser);

  // If a regular user signs up, automatically establish direct connection with the Admin!
  if (!isAdmin) {
    const admin = getAdminUser();
    if (admin) {
      // Connect in contacts
      db.contacts.push(
        { id: `c_${admin.id}_${newUser.id}`, userId: admin.id, contactUserId: newUser.id, addedAt: new Date().toISOString() },
        { id: `c_${newUser.id}_${admin.id}`, userId: newUser.id, contactUserId: admin.id, addedAt: new Date().toISOString() }
      );

      // Create initial direct conversation
      const sorted = [admin.id, newUser.id].sort();
      const convId = `dm_${sorted[0]}_${sorted[1]}`;
      const welcomeMsg = {
        id: `m_welcome_${Date.now()}`,
        conversationId: convId,
        senderId: admin.id,
        senderName: admin.displayName,
        senderAvatar: admin.avatar,
        text: `Hello ${newUser.displayName}! Welcome to QuantumPropAI. You are connected directly to the Admin. How can I help you today?`,
        timestamp: new Date().toISOString(),
        readBy: [admin.id],
        reactions: { '👋': [admin.id] }
      };

      db.conversations.push({
        id: convId,
        type: 'direct',
        participants: sorted,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: welcomeMsg
      });

      db.messages.push(welcomeMsg);
    }
  }

  saveDB(db);

  const { passwordHash: _, plainPassword: __, ...safeUser } = newUser;
  return safeUser;
}

// Search users:
// Admin can search all users.
// Regular users can ONLY search/see Admin!
function searchUsers(query, currentUserId) {
  const db = loadDB();
  const currentUser = db.users.find(u => u.id === currentUserId);
  const q = (query || '').toLowerCase().trim();

  if (!currentUser) return [];

  if (currentUser.isAdmin) {
    // Admin sees all other users
    return db.users
      .filter(u => u.id !== currentUserId)
      .filter(u => !q || u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q))
      .map(({ passwordHash, plainPassword, ...safe }) => safe);
  } else {
    // Regular users can ONLY see the Admin!
    return db.users
      .filter(u => u.isAdmin || u.username === 'admin')
      .filter(u => !q || u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q))
      .map(({ passwordHash, plainPassword, ...safe }) => safe);
  }
}

function updateLastSeen(userId) {
  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  if (user) {
    user.lastSeen = new Date().toISOString();
    saveDB(db);
  }
}

// Contacts:
// Admin sees all added users.
// Regular users can ONLY see Admin.
function getContacts(userId) {
  const db = loadDB();
  const currentUser = db.users.find(u => u.id === userId);
  if (!currentUser) return [];

  const contactEntries = (db.contacts || []).filter(c => c.userId === userId);
  const contactUserIds = contactEntries.map(c => c.contactUserId);

  let targetUsers = db.users.filter(u => contactUserIds.includes(u.id));

  // Security barrier: Non-admins cannot see any regular user
  if (!currentUser.isAdmin) {
    targetUsers = targetUsers.filter(u => u.isAdmin || u.username === 'admin');
  }

  return targetUsers.map(({ passwordHash, plainPassword, ...safe }) => {
    const entry = contactEntries.find(c => c.contactUserId === safe.id);
    const result = {
      ...safe,
      addedAt: entry ? entry.addedAt : null
    };
    delete result.password;
    return result;
  });
}

function addContact(userId, contactUserId) {
  if (userId === contactUserId) {
    throw new Error('Cannot add yourself as a contact');
  }
  const db = loadDB();
  const currentUser = db.users.find(u => u.id === userId);
  const targetUser = db.users.find(u => u.id === contactUserId);

  if (!currentUser || !targetUser) {
    throw new Error('User does not exist');
  }

  // Security barrier: One of the participants MUST be an admin!
  if (!currentUser.isAdmin && !targetUser.isAdmin) {
    throw new Error('Regular users can only communicate with the Admin.');
  }

  const exists = db.contacts.some(c => c.userId === userId && c.contactUserId === contactUserId);
  if (!exists) {
    db.contacts.push({
      id: `c_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      userId,
      contactUserId,
      addedAt: new Date().toISOString()
    });
    // Two-way connection
    const reverseExists = db.contacts.some(c => c.userId === contactUserId && c.contactUserId === userId);
    if (!reverseExists) {
      db.contacts.push({
        id: `c_${Date.now() + 1}_${Math.random().toString(36).substr(2, 6)}`,
        userId: contactUserId,
        contactUserId: userId,
        addedAt: new Date().toISOString()
      });
    }
    saveDB(db);
  }

  return getContacts(userId);
}

// Conversations:
// Admin sees conversations with all users.
// Regular users can ONLY have a conversation with Admin.
function getOrCreateDirectConversation(userId1, userId2) {
  if (userId1 === userId2) {
    throw new Error('Cannot create conversation with yourself');
  }
  const db = loadDB();
  const u1 = db.users.find(u => u.id === userId1);
  const u2 = db.users.find(u => u.id === userId2);

  if (!u1 || !u2) {
    throw new Error('User not found');
  }

  // CRITICAL ENFORCEMENT: One participant must be Admin!
  if (!u1.isAdmin && !u2.isAdmin) {
    throw new Error('Communication not allowed: Users can only talk to the Admin.');
  }

  const sorted = [userId1, userId2].sort();
  const convId = `dm_${sorted[0]}_${sorted[1]}`;

  let conv = db.conversations.find(c => c.id === convId);
  if (!conv) {
    conv = {
      id: convId,
      type: 'direct',
      participants: sorted,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: null
    };
    db.conversations.push(conv);
    saveDB(db);
  }
  return conv;
}

function getUserConversations(userId) {
  const db = loadDB();
  const currentUser = db.users.find(u => u.id === userId);
  if (!currentUser) return [];

  // Get user's conversations where the other party exists
  let userConvs = db.conversations.filter(c => {
    if (!c.participants.includes(userId)) return false;
    const otherId = c.participants.find(p => p !== userId);
    return db.users.some(u => u.id === otherId);
  });

  // If regular user, only keep conversation where the other party is Admin
  if (!currentUser.isAdmin) {
    userConvs = userConvs.filter(c => {
      const otherId = c.participants.find(p => p !== userId);
      const otherUser = db.users.find(u => u.id === otherId);
      return otherUser && (otherUser.isAdmin || otherUser.username === 'admin');
    });
  }

  return userConvs.map(c => {
    const otherUserId = c.participants.find(p => p !== userId);
    const otherUser = db.users.find(u => u.id === otherUserId);
    let safeOther = null;
    if (otherUser) {
      const { passwordHash, plainPassword, password, ...rest } = otherUser;
      safeOther = { ...rest };
    }

    const unreadCount = db.messages.filter(m => 
      m.conversationId === c.id && 
      m.senderId !== userId && 
      (!m.readBy || !m.readBy.includes(userId))
    ).length;

    return {
      ...c,
      recipient: safeOther,
      unreadCount
    };
  }).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

// Messages
function saveMessage({ conversationId, senderId, text, mediaUrl, mediaType, fileName, fileSize }) {
  const db = loadDB();
  const sender = db.users.find(u => u.id === senderId);
  if (!sender) throw new Error('Sender not found');

  const conv = db.conversations.find(c => c.id === conversationId);
  if (!conv) throw new Error('Conversation not found');

  // Verify conversation participants
  const otherUserId = conv.participants.find(p => p !== senderId);
  const recipient = db.users.find(u => u.id === otherUserId);

  // Security check: Must involve Admin
  if (!sender.isAdmin && (!recipient || !recipient.isAdmin)) {
    throw new Error('Forbidden: Regular users can only message the Admin.');
  }

  const storedMediaUrl = (mediaUrl && typeof mediaUrl === 'string' && mediaUrl.startsWith('data:'))
    ? saveDataUrlToFile(mediaUrl, fileName)
    : (mediaUrl || null);

  const message = {
    id: `m_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
    conversationId,
    senderId,
    senderName: sender.displayName || sender.username,
    senderAvatar: sender.avatar,
    text: text || '',
    mediaUrl: storedMediaUrl,
    mediaType: mediaType || null,
    fileName: fileName || null,
    fileSize: fileSize || null,
    timestamp: new Date().toISOString(),
    readBy: [senderId],
    reactions: {}
  };

  db.messages.push(message);

  conv.updatedAt = message.timestamp;
  conv.lastMessage = {
    id: message.id,
    text: message.text || (message.fileName ? `📄 ${message.fileName}` : 'Attachment'),
    senderId: message.senderId,
    timestamp: message.timestamp
  };

  saveDB(db);
  return message;
}

function getConversationMessages(conversationId) {
  const db = loadDB();
  return db.messages.filter(m => m.conversationId === conversationId);
}

function markMessagesAsRead(conversationId, userId) {
  const db = loadDB();
  const conv = db.conversations.find(c => c.id === conversationId);
  const user = db.users.find(u => u.id === userId);
  if (!conv || !user) return;
  if (!conv.participants.includes(userId) && !user.isAdmin) return;

  let updated = false;
  db.messages.forEach(m => {
    if (m.conversationId === conversationId && m.senderId !== userId) {
      if (!m.readBy) m.readBy = [];
      if (!m.readBy.includes(userId)) {
        m.readBy.push(userId);
        updated = true;
      }
    }
  });
  if (updated) {
    saveDB(db);
  }
}

function addMessageReaction(messageId, userId, emoji) {
  if (!emoji || typeof emoji !== 'string' || emoji.length > 16) {
    throw new Error('Invalid emoji');
  }

  const db = loadDB();
  const message = db.messages.find(m => m.id === messageId);
  if (!message) throw new Error('Message not found');

  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  const conv = db.conversations.find(c => c.id === message.conversationId);
  if (!conv || (!conv.participants.includes(userId) && !user.isAdmin)) {
    throw new Error('Unauthorized to react to this message');
  }

  if (!message.reactions) message.reactions = {};
  if (!message.reactions[emoji]) message.reactions[emoji] = [];

  const index = message.reactions[emoji].indexOf(userId);
  if (index > -1) {
    message.reactions[emoji].splice(index, 1);
    if (message.reactions[emoji].length === 0) {
      delete message.reactions[emoji];
    }
  } else {
    message.reactions[emoji].push(userId);
  }

  saveDB(db);
  return message;
}

// Review Dashboard methods
function formatReviewItem(item, currentUserId = null, isAdmin = false) {
  const defaultQuestions = [
    { id: 'q_verdict', text: 'Overall Verdict: Is this design Good or Bad?', type: 'verdict', required: true },
    { id: 'q_clarity', text: 'Is the visual contrast and readability clear?', type: 'boolean', required: false },
    { id: 'q_rating', text: 'Visual Quality & Polish Rating (1 to 5)', type: 'rating', required: false },
    { id: 'q_feedback', text: 'Employee Feedback & Comments', type: 'text', required: false }
  ];

  const questions = (item.questions && item.questions.length > 0) ? item.questions : defaultQuestions;
  const votesObj = item.votes || {};
  const voteList = Object.values(votesObj);

  const hasVerdictQuestion = questions.some(q => q.type === 'verdict');
  const isPureVerdict = !questions.length || hasVerdictQuestion;

  // Overall real verdict counters (only applies if item is a verdict/up-down item)
  const realGoodCount = isPureVerdict ? voteList.filter(v => (v.vote || '').toLowerCase() === 'good').length : 0;
  const realBadCount = isPureVerdict ? voteList.filter(v => (v.vote || '').toLowerCase() === 'bad').length : 0;
  const realTotalVotes = isPureVerdict ? (realGoodCount + realBadCount) : voteList.length;

  const mixer = item.dataMixer || null;
  const isMixerActive = !!(mixer && mixer.enabled);
  const isAddMode = mixer ? mixer.mode !== 'override' : true;
  const simGood = isMixerActive ? (Number(mixer.goodCount) || 0) : 0;
  const simBad = isMixerActive ? (Number(mixer.badCount) || 0) : 0;

  const goodCount = isMixerActive 
    ? (isAddMode ? (realGoodCount + simGood) : simGood)
    : realGoodCount;
  const badCount = isMixerActive 
    ? (isAddMode ? (realBadCount + simBad) : simBad)
    : realBadCount;
  const totalVotes = isMixerActive 
    ? (isAddMode ? (realTotalVotes + simGood + simBad) : (goodCount + badCount))
    : realTotalVotes;
  const goodPercentage = totalVotes > 0 ? Math.round((goodCount / totalVotes) * 100) : 0;

  // Questionnaire aggregation per question
  const questionStats = questions.map(q => {
    const qBoost = (isMixerActive && mixer.questionBoosts) ? (mixer.questionBoosts[q.id] || {}) : {};
    const simOpt1 = Number(qBoost.opt1Count) || 0;
    const simOpt2 = Number(qBoost.opt2Count) || 0;

    if (q.type === 'verdict') {
      const opt1 = q.options?.[0] || 'Good';
      const opt2 = q.options?.[1] || 'Bad';
      const rawG = voteList.filter(v => {
        const a = (v.answers?.[q.id] || '').toLowerCase();
        const vt = (v.vote || '').toLowerCase();
        return a === 'good' || a === opt1.toLowerCase() || (!v.answers?.[q.id] && vt === 'good');
      }).length;
      const rawB = voteList.filter(v => {
        const a = (v.answers?.[q.id] || '').toLowerCase();
        const vt = (v.vote || '').toLowerCase();
        return a === 'bad' || a === opt2.toLowerCase() || (!v.answers?.[q.id] && vt === 'bad');
      }).length;

      const g = isMixerActive ? (isAddMode ? (rawG + simGood) : simGood) : rawG;
      const b = isMixerActive ? (isAddMode ? (rawB + simBad) : simBad) : rawB;
      const total = g + b;
      const correctAnswer = q.correctAnswer !== undefined && q.correctAnswer !== null && q.correctAnswer !== '' ? String(q.correctAnswer).trim() : null;
      let correctCount = 0;
      let wrongCount = 0;
      if (correctAnswer) {
        const normCA = correctAnswer.toLowerCase();
        if (normCA === 'good' || normCA === 'up' || normCA === opt1.toLowerCase()) {
          correctCount = g;
          wrongCount = b;
        } else if (normCA === 'bad' || normCA === 'down' || normCA === opt2.toLowerCase()) {
          correctCount = b;
          wrongCount = g;
        } else {
          voteList.forEach(v => {
            const ans = (v.answers?.[q.id] || v.vote || '').toLowerCase().trim();
            if (ans === normCA) correctCount++;
            else if (ans) wrongCount++;
          });
        }
      }
      const accPct = (correctCount + wrongCount) > 0 ? Math.round((correctCount / (correctCount + wrongCount)) * 100) : 0;
      return {
        ...q,
        opt1Count: g,
        opt2Count: b,
        totalVotes: total,
        opt1Percentage: total > 0 ? Math.round((g / total) * 100) : 0,
        opt2Percentage: total > 0 ? Math.round((b / total) * 100) : 0,
        correctCount,
        wrongCount,
        correctPercentage: accPct,
        accuracyPercentage: accPct
      };
    }
    if (q.type === 'two_options' || q.type === 'yes_no') {
      const opt1 = q.options?.[0] || 'Option A';
      const opt2 = q.options?.[1] || 'Option B';
      const raw1 = voteList.filter(v => (v.answers?.[q.id] || '').toLowerCase() === opt1.toLowerCase()).length;
      const raw2 = voteList.filter(v => (v.answers?.[q.id] || '').toLowerCase() === opt2.toLowerCase()).length;

      const c1 = isMixerActive ? (isAddMode ? (raw1 + simOpt1) : simOpt1) : raw1;
      const c2 = isMixerActive ? (isAddMode ? (raw2 + simOpt2) : simOpt2) : raw2;
      const total = c1 + c2;
      const correctAnswer = q.correctAnswer !== undefined && q.correctAnswer !== null && q.correctAnswer !== '' ? String(q.correctAnswer).trim() : null;
      let correctCount = 0;
      let wrongCount = 0;
      if (correctAnswer) {
        const normCA = correctAnswer.toLowerCase();
        if (normCA === opt1.toLowerCase()) {
          correctCount = c1;
          wrongCount = c2;
        } else if (normCA === opt2.toLowerCase()) {
          correctCount = c2;
          wrongCount = c1;
        } else {
          voteList.forEach(v => {
            const ans = (v.answers?.[q.id] || '').toLowerCase().trim();
            if (ans === normCA) correctCount++;
            else if (ans) wrongCount++;
          });
        }
      }
      const accPct = (correctCount + wrongCount) > 0 ? Math.round((correctCount / (correctCount + wrongCount)) * 100) : 0;
      return {
        ...q,
        opt1Count: c1,
        opt2Count: c2,
        totalVotes: total,
        opt1Percentage: total > 0 ? Math.round((c1 / total) * 100) : 0,
        opt2Percentage: total > 0 ? Math.round((c2 / total) * 100) : 0,
        correctCount,
        wrongCount,
        correctPercentage: accPct,
        accuracyPercentage: accPct
      };
    }
    if (q.type === 'boolean') {
      const rawYes = voteList.filter(v => v.answers?.[q.id] === true || v.answers?.[q.id] === 'true' || v.answers?.[q.id] === 'yes').length;
      const rawNo = voteList.filter(v => v.answers?.[q.id] === false || v.answers?.[q.id] === 'false' || v.answers?.[q.id] === 'no').length;

      const yes = isMixerActive ? (isAddMode ? (rawYes + simOpt1) : simOpt1) : rawYes;
      const no = isMixerActive ? (isAddMode ? (rawNo + simOpt2) : simOpt2) : rawNo;
      const total = yes + no;
      const correctAnswer = q.correctAnswer !== undefined && q.correctAnswer !== null && q.correctAnswer !== '' ? String(q.correctAnswer).trim().toLowerCase() : null;
      let correctCount = 0;
      let wrongCount = 0;
      if (correctAnswer !== null) {
        if (correctAnswer === 'yes' || correctAnswer === 'true') {
          correctCount = yes;
          wrongCount = no;
        } else if (correctAnswer === 'no' || correctAnswer === 'false') {
          correctCount = no;
          wrongCount = yes;
        } else {
          voteList.forEach(v => {
            const ans = v.answers?.[q.id];
            if (ans !== undefined && ans !== null) {
              const strAns = String(ans).toLowerCase().trim();
              if (strAns === correctAnswer) correctCount++;
              else wrongCount++;
            }
          });
        }
      }
      const accPct = (correctCount + wrongCount) > 0 ? Math.round((correctCount / (correctCount + wrongCount)) * 100) : 0;
      return {
        ...q,
        yesCount: yes,
        noCount: no,
        totalVotes: total,
        yesPercentage: total > 0 ? Math.round((yes / total) * 100) : 0,
        noPercentage: total > 0 ? Math.round((no / total) * 100) : 0,
        correctCount,
        wrongCount,
        correctPercentage: accPct,
        accuracyPercentage: accPct
      };
    }
    if (q.type === 'rating') {
      const ratings = voteList
        .map(v => Number(v.answers?.[q.id]))
        .filter(n => !isNaN(n) && n >= 1 && n <= 5);
      const rawAvg = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0;
      let avg = Math.round(rawAvg * 10) / 10;
      let totalRatings = ratings.length;

      if (isMixerActive && qBoost.averageRating !== undefined) {
        const simAvg = Number(qBoost.averageRating) || 0;
        const simRatings = Number(qBoost.totalRatings) || 0;
        if (isAddMode) {
          const combinedTotal = totalRatings + simRatings;
          avg = combinedTotal > 0 ? Math.round(((rawAvg * totalRatings + simAvg * simRatings) / combinedTotal) * 10) / 10 : simAvg;
          totalRatings = combinedTotal;
        } else {
          avg = simAvg;
          totalRatings = simRatings;
        }
      }
      return { ...q, averageRating: avg, totalRatings };
    }
    if (q.type === 'choice') {
      const choiceCounts = {};
      (q.options || []).forEach(opt => { choiceCounts[opt] = 0; });
      voteList.forEach(v => {
        const selected = v.answers?.[q.id];
        if (selected && choiceCounts[selected] !== undefined) {
          choiceCounts[selected]++;
        }
      });
      if (isMixerActive && qBoost.choiceCounts) {
        Object.keys(choiceCounts).forEach(opt => {
          const simC = Number(qBoost.choiceCounts[opt]) || 0;
          choiceCounts[opt] = isAddMode ? (choiceCounts[opt] + simC) : simC;
        });
      }
      return { ...q, choiceCounts };
    }
    if (q.type === 'multi_choice') {
      const choiceCounts = {};
      (q.options || []).forEach(opt => { choiceCounts[opt] = 0; });
      voteList.forEach(v => {
        const selected = v.answers?.[q.id];
        if (Array.isArray(selected)) {
          selected.forEach(opt => {
            if (choiceCounts[opt] !== undefined) choiceCounts[opt]++;
          });
        } else if (selected && choiceCounts[selected] !== undefined) {
          choiceCounts[selected]++;
        }
      });
      if (isMixerActive && qBoost.choiceCounts) {
        Object.keys(choiceCounts).forEach(opt => {
          const simC = Number(qBoost.choiceCounts[opt]) || 0;
          choiceCounts[opt] = isAddMode ? (choiceCounts[opt] + simC) : simC;
        });
      }
      return { ...q, choiceCounts, isMulti: true };
    }
    if (q.type === 'text' || q.type === 'type_answer') {
      const textQuestions = questions.filter(qu => qu.type === 'text' || qu.type === 'type_answer');
      const isSoleText = textQuestions.length === 1;
      const responses = voteList
        .filter(v => (v.answers && v.answers[q.id]) || (q.id === 'q_feedback' && v.comment) || (isSoleText && v.comment))
        .map(v => ({
          userId: v.userId,
          userName: v.userName,
          userAvatar: v.userAvatar,
          text: (v.answers && v.answers[q.id]) || v.comment || '',
          timestamp: v.timestamp
        }))
        .filter(r => Boolean(r.text && String(r.text).trim()));
      return { ...q, responses };
    }
    return q;
  });

  const defaultKnowledgeBase = {
    criteriaTitle: 'Decision Criteria',
    criteria: [],
    learningTitle: 'Things to Learn & Best Practices',
    learningTips: [],
    checklistTitle: 'Pre-Evaluation Checklist',
    checklist: []
  };

  const knowledgeBase = item.knowledgeBase || defaultKnowledgeBase;

  // Target recipients resolution: Admin can view target list; employees never receive peer profiles
  let targetRecipients = [];
  if (isAdmin && Array.isArray(item.targetUserIds) && item.targetUserIds.length > 0) {
    const db = loadDB();
    targetRecipients = item.targetUserIds.map(uid => {
      const u = (db.users || []).find(user => user.id === uid);
      return u
        ? { id: u.id, displayName: u.displayName, username: u.username, avatar: u.avatar, role: u.role || 'Employee' }
        : { id: uid, displayName: 'Unknown Employee', username: uid, role: 'Employee' };
    });
  }

  // Non-admins must NOT see peer individual votes, personal answers, or comments
  const safeVoteList = isAdmin
    ? voteList
    : (currentUserId ? voteList.filter(v => v.userId === currentUserId) : []);

  const safeVotes = isAdmin
    ? (item.votes || {})
    : ((currentUserId && item.votes && item.votes[currentUserId]) ? { [currentUserId]: item.votes[currentUserId] } : {});

  const safeQuestionStats = questionStats.map(q => {
    if (!isAdmin && (q.type === 'text' || q.type === 'type_answer')) {
      const userResp = (q.responses || []).filter(r => r.userId === currentUserId);
      return { ...q, responses: userResp };
    }
    return q;
  });

  return {
    ...item,
    votes: safeVotes,
    questions,
    questionStats: safeQuestionStats,
    knowledgeBase,
    targetUserIds: isAdmin ? (Array.isArray(item.targetUserIds) ? item.targetUserIds : null) : null,
    targetRecipients,
    goodCount,
    badCount,
    totalVotes,
    goodPercentage,
    voteList: safeVoteList,
    dataMixer: isAdmin ? (item.dataMixer || null) : null,
    realStats: isAdmin ? {
      goodCount: realGoodCount,
      badCount: realBadCount,
      totalVotes: realTotalVotes,
      simGood,
      simBad,
      simTotal: simGood + simBad,
      isMixerActive
    } : null
  };
}

function getReviewItems(userId, includeArchived = false) {
  const db = loadDB();
  if (!db.reviewItems) db.reviewItems = [];

  const currentUser = userId ? db.users.find(u => u.id === userId) : null;
  const isAdmin = !!currentUser?.isAdmin;

  return db.reviewItems
    .filter(item => {
      // Exclude archived items unless specifically requested (e.g. for historical statistics)
      if (!includeArchived && item.isArchived) return false;

      // Administrators see all review items
      if (isAdmin) return true;
      // If no targetUserIds specified, it is broadcast to all employees
      if (!item.targetUserIds || !Array.isArray(item.targetUserIds) || item.targetUserIds.length === 0) {
        return true;
      }
      // Creator can always see their own item
      if (item.createdBy === userId) return true;
      // Targeted employees only see it if their ID is in targetUserIds
      return item.targetUserIds.includes(userId);
    })
    .map(item => formatReviewItem(item, userId, isAdmin))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function sanitizeQuestionList(questions) {
  if (Array.isArray(questions)) {
    return questions
      .filter(q => q && q.enabled !== false)
      .map((q, idx) => {
        const type = q.type || 'choice';
        let options = Array.isArray(q.options) 
          ? q.options.map(o => String(o).trim()).filter(Boolean) 
          : [];
        let optionImages = Array.isArray(q.optionImages)
          ? q.optionImages.map(img => String(img || '').trim())
          : [];
        if (type === 'verdict') {
          if (options.length < 2) {
            options = ['Good', 'Bad'];
          }
        } else if (type === 'two_options' || type === 'yes_no') {
          if (options.length < 2) {
            options = type === 'yes_no' ? ['Yes', 'No'] : ['Option A', 'Option B'];
          }
        }

        let correctAnswer = null;
        if (q.correctAnswer !== undefined && q.correctAnswer !== null && q.correctAnswer !== '') {
          correctAnswer = String(q.correctAnswer).trim();
        }

        return {
          id: q.id || `q_${Date.now()}_${idx}`,
          text: (q.text || '').trim() || `Question ${idx + 1}`,
          type,
          required: !!q.required,
          options,
          optionImages: optionImages.length > 0 ? optionImages : undefined,
          correctAnswer
        };
      });
  }
  return [];
}

function updateReviewItemQuestions(itemId, userId, questions, imageUrl, title, description, targetUserIds) {
  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can update questionnaire');
  }

  if (!db.reviewItems) db.reviewItems = [];
  const item = db.reviewItems.find(i => i.id === itemId);
  if (!item) throw new Error('Review item not found');

  if (questions !== undefined) {
    item.questions = sanitizeQuestionList(questions);
  }
  if (imageUrl !== undefined) {
    let cleanImageUrl = imageUrl || null;
    if (cleanImageUrl && typeof cleanImageUrl === 'string' && cleanImageUrl.startsWith('data:')) {
      cleanImageUrl = saveDataUrlToFile(cleanImageUrl, `${item.id}_image`);
    }
    item.imageUrl = cleanImageUrl;
  }
  if (title !== undefined && title.trim()) {
    item.title = title.trim();
  }
  if (description !== undefined) {
    item.description = description.trim();
  }
  if (targetUserIds !== undefined) {
    item.targetUserIds = Array.isArray(targetUserIds) && targetUserIds.length > 0 ? targetUserIds : null;
  }
  saveDB(db);

  return formatReviewItem(item, userId, true);
}

function setQuestionCorrectAnswer(itemId, questionId, correctAnswer, adminId) {
  const db = loadDB();
  const user = db.users.find(u => u.id === adminId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can assign answer keys');
  }

  if (!db.reviewItems) db.reviewItems = [];
  const item = db.reviewItems.find(i => i.id === itemId);
  if (!item) throw new Error('Review item not found');

  if (!item.questions) item.questions = [];
  const question = item.questions.find(q => q.id === questionId);
  if (!question) throw new Error('Question not found');

  // Set or clear correct answer
  question.correctAnswer = correctAnswer !== undefined && correctAnswer !== null && correctAnswer !== ''
    ? String(correctAnswer).trim()
    : null;

  saveDB(db);
  return formatReviewItem(item, adminId, true);
}

function createReviewItem({ title, description, imageUrl, createdBy, questions, knowledgeBase, targetUserIds }) {
  const db = loadDB();
  const creator = db.users.find(u => u.id === createdBy);
  if (!creator || !creator.isAdmin) {
    throw new Error('Unauthorized: Only Admin can share items for employee review');
  }

  const sanitizedQuestions = sanitizeQuestionList(questions);

  let finalImageUrl = imageUrl || null;
  if (finalImageUrl && typeof finalImageUrl === 'string' && finalImageUrl.startsWith('data:')) {
    finalImageUrl = saveDataUrlToFile(finalImageUrl, 'review_image');
  }

  const newItem = {
    id: `rev_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    title: title?.trim() || (finalImageUrl ? 'Untitled Image Review' : 'Questionnaire Survey'),
    description: description?.trim() || '',
    imageUrl: finalImageUrl,
    questions: sanitizedQuestions,
    knowledgeBase: knowledgeBase || null,
    targetUserIds: Array.isArray(targetUserIds) && targetUserIds.length > 0 ? targetUserIds : null,
    createdAt: new Date().toISOString(),
    createdBy: creator.id,
    createdByName: creator.displayName,
    createdByAvatar: creator.avatar,
    status: 'active',
    votes: {}
  };

  if (!db.reviewItems) db.reviewItems = [];
  db.reviewItems.push(newItem);
  saveDB(db);

  return formatReviewItem(newItem, createdBy, true);
}

function updateReviewItemKnowledgeBase(itemId, userId, knowledgeBase) {
  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can update guidelines and knowledge base');
  }

  if (!db.reviewItems) db.reviewItems = [];
  const item = db.reviewItems.find(i => i.id === itemId);
  if (!item) throw new Error('Review item not found');

  item.knowledgeBase = knowledgeBase;
  saveDB(db);

  return formatReviewItem(item, userId, true);
}

function updateReviewItemDataMixer(itemId, userId, dataMixer) {
  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can customize review data mixing');
  }

  if (!db.reviewItems) db.reviewItems = [];
  const item = db.reviewItems.find(i => i.id === itemId);
  if (!item) throw new Error('Review item not found');

  if (!dataMixer) {
    item.dataMixer = null;
  } else {
    item.dataMixer = {
      enabled: !!dataMixer.enabled,
      mode: dataMixer.mode === 'override' ? 'override' : 'add',
      goodCount: Math.max(0, parseInt(dataMixer.goodCount, 10) || 0),
      badCount: Math.max(0, parseInt(dataMixer.badCount, 10) || 0),
      questionBoosts: typeof dataMixer.questionBoosts === 'object' && dataMixer.questionBoosts !== null ? dataMixer.questionBoosts : {}
    };
  }

  saveDB(db);
  return formatReviewItem(item, userId, true);
}

function submitReviewVote({ itemId, userId, vote, answers = {}, comment = '' }) {
  const db = loadDB();
  if (!db.reviewItems) db.reviewItems = [];

  const item = db.reviewItems.find(i => i.id === itemId);
  if (!item) throw new Error('Review item not found');

  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  if (item.isArchived) {
    throw new Error('This review questionnaire is archived and no longer accepting submissions.');
  }

  if (!user.isAdmin && Array.isArray(item.targetUserIds) && item.targetUserIds.length > 0 && !item.targetUserIds.includes(userId)) {
    throw new Error('Unauthorized: You are not assigned to review this item.');
  }

  // Once an employee has submitted a vote/answer, they cannot change it
  if (!user.isAdmin && item.votes && item.votes[userId]) {
    throw new Error('Your response has already been submitted and cannot be changed.');
  }

  // Determine final vote (good or bad) - only applicable if item is a verdict item or has a verdict question
  const questions = item.questions || [];
  const verdictQ = questions.find(q => q.type === 'verdict');
  const hasVerdict = !questions.length || !!verdictQ;

  let finalVote = null;
  if (hasVerdict) {
    if (vote && (vote === 'good' || vote === 'bad')) {
      finalVote = vote;
    } else if (verdictQ && answers && answers[verdictQ.id]) {
      const vVal = String(answers[verdictQ.id]).toLowerCase();
      finalVote = (vVal === 'bad' || vVal === 'down' || vVal === (verdictQ.options?.[1] || '').toLowerCase()) ? 'bad' : 'good';
    } else if (answers && answers['q_verdict']) {
      finalVote = answers['q_verdict'];
    } else if (!questions.length) {
      finalVote = vote || 'good';
    }
  }

  const formattedAnswers = { ...answers };
  if (hasVerdict && !formattedAnswers['q_verdict'] && finalVote) {
    formattedAnswers['q_verdict'] = finalVote;
  }
  if (hasVerdict && verdictQ && !formattedAnswers[verdictQ.id] && finalVote) {
    formattedAnswers[verdictQ.id] = (finalVote === 'good') ? (verdictQ.options?.[0] || 'Good') : (verdictQ.options?.[1] || 'Bad');
  }

  let finalComment = (comment || '').trim();
  if (!finalComment && formattedAnswers['q_feedback']) {
    finalComment = String(formattedAnswers['q_feedback']).trim();
  }
  if (!finalComment) {
    const textQ = questions.find(q => q.type === 'text' || q.type === 'type_answer');
    if (textQ && formattedAnswers[textQ.id]) {
      finalComment = String(formattedAnswers[textQ.id]).trim();
    }
  }

  // Also vice-versa: if a sole text question exists without an answer, assign finalComment
  const textQuestions = questions.filter(q => q.type === 'text' || q.type === 'type_answer');
  if (textQuestions.length === 1 && finalComment && !formattedAnswers[textQuestions[0].id]) {
    formattedAnswers[textQuestions[0].id] = finalComment;
  }

  if (!item.votes) item.votes = {};

  item.votes[userId] = {
    userId: user.id,
    vote: finalVote,
    answers: formattedAnswers,
    comment: finalComment,
    userName: user.displayName || user.username,
    userAvatar: user.avatar,
    timestamp: new Date().toISOString()
  };

  saveDB(db);

  return formatReviewItem(item, userId, !!user.isAdmin);
}

function deleteReviewItem(itemId, userId) {
  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can delete review items');
  }

  if (!db.reviewItems) db.reviewItems = [];
  db.reviewItems = db.reviewItems.filter(i => i.id !== itemId);
  saveDB(db);
  return true;
}

function updateItemChecklist(itemId, userId, checks) {
  const db = loadDB();
  if (!db.reviewItems) db.reviewItems = [];
  const item = db.reviewItems.find(i => i.id === itemId);
  if (!item) throw new Error('Review item not found');

  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  if (item.isArchived) {
    throw new Error('This review item is archived and checklist cannot be modified.');
  }

  if (!user.isAdmin && Array.isArray(item.targetUserIds) && item.targetUserIds.length > 0 && !item.targetUserIds.includes(userId)) {
    throw new Error('Unauthorized: You are not assigned to review this item.');
  }

  if (!item.checklistChecks) {
    item.checklistChecks = {};
  }

  item.checklistChecks[userId] = checks;
  saveDB(db);

  return formatReviewItem(item, userId, !!user?.isAdmin);
}

const defaultInstructions = [
  {
    id: 'inst_1',
    title: 'Design Evaluation & Quality Review Standards',
    content: `Team, when reviewing newly posted UI designs and questionnaires, please adhere to these key instructions:

1. Contrast & Readability: Verify all body text has minimum 4.5:1 contrast ratio against the background.
2. Spacing & Alignment: Check for consistent 8px/16px grid alignment across cards and navigation.
3. Questionnaire Accuracy: Answer all required survey questions honestly — constructive critiques are highly valued.
4. Timely Submissions: Ensure you submit evaluations within 24 hours of posting so design iterations can proceed.`,
    priority: 'important',
    category: 'Review Guidelines',
    pinned: true,
    createdAt: '2026-09-06T10:00:00.000Z',
    createdBy: 'u_admin',
    createdByName: 'QuantumPropAI Admin',
    createdByAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    acknowledgedBy: ['u_sarah']
  },
  {
    id: 'inst_2',
    title: 'Urgent: Release Candidate 2.4 Sign-Off Deadline',
    content: `Notice for all review team members:

All pending survey questions and image reviews for Release 2.4 must be completed before Friday at 4:00 PM EST.

If you identify any blocking UI defects or inconsistencies, select "Bad" / "Needs Adjustment" and explicitly detail the rationale in the typed answer field.`,
    priority: 'urgent',
    category: 'Company Directive',
    pinned: true,
    createdAt: '2026-09-07T09:30:00.000Z',
    createdBy: 'u_admin',
    createdByName: 'QuantumPropAI Admin',
    createdByAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    acknowledgedBy: []
  }
];

function formatInstruction(inst, currentUserId) {
  const db = loadDB();
  const currentUser = (db.users || []).find(user => user.id === currentUserId);
  const isAdmin = !!currentUser?.isAdmin;
  const acknowledged = (inst.acknowledgedBy || []).includes(currentUserId);
  
  let targetRecipients = [];
  let acknowledgedUsers = [];
  let pendingUsers = [];
  let totalAudienceCount = 0;

  if (isAdmin) {
    if (Array.isArray(inst.targetUserIds) && inst.targetUserIds.length > 0) {
      targetRecipients = inst.targetUserIds.map(uid => {
        const u = (db.users || []).find(user => user.id === uid);
        return u 
          ? { id: u.id, displayName: u.displayName, username: u.username, avatar: u.avatar, role: u.role || 'Employee', email: u.email } 
          : { id: uid, displayName: 'Unknown Employee', username: uid, role: 'Employee' };
      });
    }

    if (Array.isArray(inst.acknowledgedBy) && inst.acknowledgedBy.length > 0) {
      acknowledgedUsers = inst.acknowledgedBy.map(uid => {
        const u = (db.users || []).find(user => user.id === uid);
        return u
          ? { id: u.id, displayName: u.displayName, username: u.username, avatar: u.avatar, role: u.role || 'Employee', email: u.email }
          : { id: uid, displayName: 'Unknown Employee', username: uid, role: 'Employee' };
      });
    }

    const allEmployeeUsers = (db.users || [])
      .filter(u => !u.isAdmin)
      .map(u => ({
        id: u.id,
        displayName: u.displayName,
        username: u.username,
        avatar: u.avatar,
        role: u.role || 'Employee',
        email: u.email
      }));

    if (Array.isArray(inst.targetUserIds) && inst.targetUserIds.length > 0) {
      pendingUsers = targetRecipients.filter(r => !(inst.acknowledgedBy || []).includes(r.id));
    } else {
      pendingUsers = allEmployeeUsers.filter(e => !(inst.acknowledgedBy || []).includes(e.id));
    }

    totalAudienceCount = Array.isArray(inst.targetUserIds) && inst.targetUserIds.length > 0
      ? targetRecipients.length
      : allEmployeeUsers.length;
  }

  return {
    ...inst,
    acknowledged,
    acknowledgedCount: isAdmin ? (inst.acknowledgedBy || []).length : undefined,
    acknowledgedUsers,
    pendingUsers,
    totalAudienceCount,
    targetUserIds: isAdmin ? (Array.isArray(inst.targetUserIds) ? inst.targetUserIds : null) : null,
    targetRecipients
  };
}

function getInstructions(userId, includeArchived = false) {
  // Automatically purge any urgent directives that have passed their 1-hour post-acknowledgment lifespan
  purgeExpiredUrgentInstructions();

  const db = loadDB();
  if (!Array.isArray(db.instructions)) {
    db.instructions = [];
    saveDB(db);
  }

  const currentUser = db.users.find(u => u.id === userId);
  const isAdmin = !!currentUser?.isAdmin;
  const now = Date.now();
  const lifetimeMs = parseInt(process.env.URGENT_DIRECTIVE_LIFETIME_MS, 10) || (60 * 60 * 1000);

  return db.instructions
    .filter(inst => {
      // Exclude archived instructions unless specifically requested
      if (!includeArchived && inst.isArchived) return false;

      // If urgent directive was acknowledged by this user >= 1 hour ago, hide from user's view
      if (inst.priority === 'urgent' && inst.acknowledgments?.[userId]) {
        const userAckTime = new Date(inst.acknowledgments[userId]).getTime();
        if (now - userAckTime >= lifetimeMs) {
          return false;
        }
      }

      // Administrators see all instructions (including targeted directives)
      if (isAdmin) return true;
      // Instructions with no specific target are broadcast to all employees
      if (!inst.targetUserIds || !Array.isArray(inst.targetUserIds) || inst.targetUserIds.length === 0) {
        return true;
      }
      // Creator can always see their own instruction
      if (inst.createdBy === userId) return true;
      // Targeted employees only see it if their userId is included
      return inst.targetUserIds.includes(userId);
    })
    .map(inst => formatInstruction(inst, userId))
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function createInstruction({ title, content, priority = 'important', category = 'Review Guidelines', pinned = false, targetUserIds = null, createdBy }) {
  const db = loadDB();
  const creator = db.users.find(u => u.id === createdBy);
  if (!creator || !creator.isAdmin) {
    throw new Error('Unauthorized: Only Admin can post important instructions');
  }

  if (!title || !title.trim()) {
    throw new Error('Instruction title is required');
  }
  if (!content || !content.trim()) {
    throw new Error('Instruction content is required');
  }

  const cleanTargetUserIds = Array.isArray(targetUserIds) && targetUserIds.length > 0
    ? targetUserIds.filter(id => typeof id === 'string' && id.trim())
    : null;

  const newInst = {
    id: `inst_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    title: title.trim(),
    content: content.trim(),
    priority: priority || 'important',
    category: category || 'General Notice',
    pinned: !!pinned,
    targetUserIds: cleanTargetUserIds,
    createdAt: new Date().toISOString(),
    createdBy: creator.id,
    createdByName: creator.displayName,
    createdByAvatar: creator.avatar,
    acknowledgedBy: []
  };

  if (!db.instructions) db.instructions = [];
  db.instructions.unshift(newInst);
  saveDB(db);

  return formatInstruction(newInst, createdBy);
}

function updateInstruction(id, userId, updates) {
  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can update instructions');
  }

  if (!db.instructions) db.instructions = [];
  const inst = db.instructions.find(i => i.id === id);
  if (!inst) throw new Error('Instruction not found');

  if (updates.title !== undefined && updates.title.trim()) inst.title = updates.title.trim();
  if (updates.content !== undefined && updates.content.trim()) inst.content = updates.content.trim();
  if (updates.priority !== undefined) inst.priority = updates.priority;
  if (updates.category !== undefined) inst.category = updates.category;
  if (updates.pinned !== undefined) inst.pinned = !!updates.pinned;
  if (updates.targetUserIds !== undefined) {
    inst.targetUserIds = Array.isArray(updates.targetUserIds) && updates.targetUserIds.length > 0
      ? updates.targetUserIds.filter(id => typeof id === 'string' && id.trim())
      : null;
  }

  saveDB(db);
  return formatInstruction(inst, userId);
}

function deleteInstruction(id, userId) {
  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can delete instructions');
  }

  if (!db.instructions) db.instructions = [];
  db.instructions = db.instructions.filter(i => i.id !== id);
  saveDB(db);
  return true;
}

function acknowledgeInstruction(id, userId) {
  const db = loadDB();
  if (!db.instructions) db.instructions = [];
  const inst = db.instructions.find(i => i.id === id);
  if (!inst) throw new Error('Instruction not found');

  const user = (db.users || []).find(u => u.id === userId);
  if (!user) throw new Error('User not found');
  if (!user.isAdmin && Array.isArray(inst.targetUserIds) && inst.targetUserIds.length > 0 && !inst.targetUserIds.includes(userId)) {
    throw new Error('Forbidden: You are not a designated recipient for this directive');
  }

  if (!inst.acknowledgedBy) inst.acknowledgedBy = [];
  if (!inst.acknowledgments) inst.acknowledgments = {};

  const nowIso = new Date().toISOString();
  if (!inst.acknowledgedBy.includes(userId)) {
    inst.acknowledgedBy.push(userId);
  }
  inst.acknowledgments[userId] = nowIso;
  if (!inst.acknowledgedAt) {
    inst.acknowledgedAt = nowIso;
  }

  // Urgent directives auto-delete 1 hour after being read and acknowledged
  if (inst.priority === 'urgent') {
    if (!inst.autoDeleteAt) {
      const lifetimeMs = parseInt(process.env.URGENT_DIRECTIVE_LIFETIME_MS, 10) || (60 * 60 * 1000);
      inst.autoDeleteAt = new Date(Date.now() + lifetimeMs).toISOString();
    }
  }

  saveDB(db);
  return formatInstruction(inst, userId);
}

function purgeExpiredUrgentInstructions() {
  const db = loadDB();
  if (!Array.isArray(db.instructions) || db.instructions.length === 0) return [];
  const now = Date.now();
  const lifetimeMs = parseInt(process.env.URGENT_DIRECTIVE_LIFETIME_MS, 10) || (60 * 60 * 1000);
  const expiredIds = [];

  db.instructions.forEach(inst => {
    if (inst.priority === 'urgent') {
      const autoDeleteTime = inst.autoDeleteAt ? new Date(inst.autoDeleteAt).getTime() : null;
      const ackTime = inst.acknowledgedAt ? new Date(inst.acknowledgedAt).getTime() : null;

      if (autoDeleteTime && autoDeleteTime <= now) {
        expiredIds.push(inst.id);
      } else if (ackTime && (now - ackTime >= lifetimeMs)) {
        expiredIds.push(inst.id);
      } else if (inst.acknowledgedBy && inst.acknowledgedBy.length > 0) {
        // Fallback: if user acknowledgments exist and any is >= 1 hour ago
        if (inst.acknowledgments && Object.keys(inst.acknowledgments).length > 0) {
          const earliest = Object.values(inst.acknowledgments)[0];
          if (earliest && (now - new Date(earliest).getTime() >= lifetimeMs)) {
            expiredIds.push(inst.id);
          }
        }
      }
    }
  });

  if (expiredIds.length > 0) {
    db.instructions = db.instructions.filter(i => !expiredIds.includes(i.id));
    saveDB(db);
  }
  return expiredIds;
}

function getMonthEndResetPreview(adminUserId) {
  const db = loadDB();
  const user = db.users.find(u => u.id === adminUserId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can preview month-end reset');
  }

  const reviewItems = db.reviewItems || [];
  const instructions = db.instructions || [];

  const activeItems = reviewItems.filter(i => !i.isArchived);
  const completedItems = activeItems.filter(i => Boolean(i.votes && Object.keys(i.votes).length > 0));
  
  const activeInstructions = instructions.filter(i => !i.isArchived);
  const unpinnedInstructions = activeInstructions.filter(i => !i.pinned);
  const pinnedInstructions = activeInstructions.filter(i => !!i.pinned);

  return {
    totalActiveItems: activeItems.length,
    completedItemsCount: completedItems.length,
    pendingItemsCount: activeItems.length - completedItems.length,
    totalActiveInstructions: activeInstructions.length,
    unpinnedInstructionsCount: unpinnedInstructions.length,
    pinnedInstructionsCount: pinnedInstructions.length
  };
}

function resetMonthEndQueue({ adminUserId, resetCompletedOnly = true, resetAllItems = false, resetUnpinnedInstructions = true }) {
  const db = loadDB();
  const user = db.users.find(u => u.id === adminUserId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can perform month-end reset');
  }

  const now = new Date().toISOString();
  let archivedItemsCount = 0;
  let archivedInstructionsCount = 0;
  let preservedPinnedCount = 0;
  let remainingActiveItemsCount = 0;

  if (!db.reviewItems) db.reviewItems = [];
  if (!db.instructions) db.instructions = [];

  // 1. Process Review Items
  db.reviewItems = db.reviewItems.map(item => {
    // Already archived items stay as they are
    if (item.isArchived) return item;

    // Check if item is completed (has received any votes / questionnaire answers)
    const hasVotes = Boolean(item.votes && Object.keys(item.votes).length > 0);
    const shouldArchive = resetAllItems || (resetCompletedOnly ? hasVotes : true);

    if (shouldArchive) {
      archivedItemsCount++;
      return {
        ...item,
        isArchived: true,
        archivedAt: now,
        archivedBy: adminUserId
      };
    } else {
      remainingActiveItemsCount++;
      return item;
    }
  });

  // 2. Process Instructions (Directives)
  // Pinned instructions are ALWAYS preserved on active board
  db.instructions = db.instructions.map(inst => {
    if (inst.isArchived) return inst;

    if (inst.pinned) {
      preservedPinnedCount++;
      return inst; // Kept active on board
    }

    if (resetUnpinnedInstructions) {
      archivedInstructionsCount++;
      return {
        ...inst,
        isArchived: true,
        archivedAt: now,
        archivedBy: adminUserId
      };
    }

    return inst;
  });

  saveDB(db);

  return {
    archivedItemsCount,
    archivedInstructionsCount,
    preservedPinnedCount,
    remainingActiveItemsCount,
    archivedAt: now
  };
}

function createEmployee({ username, password, displayName, email, role, bio, avatar, adminId }) {
  const db = loadDB();
  const admin = db.users.find(u => u.id === adminId);
  if (!admin || !admin.isAdmin) {
    throw new Error('Unauthorized: Only Admin can create employee accounts');
  }

  const cleanUsername = (username || '').trim().toLowerCase();
  if (!cleanUsername || cleanUsername.length < 3) {
    throw new Error('Username must be at least 3 characters');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(cleanUsername)) {
    throw new Error('Username can only contain letters, numbers, dots, dashes, and underscores');
  }

  if (!password || password.length < 4) {
    throw new Error('Password must be at least 4 characters');
  }

  const existing = db.users.find(u => u.username.toLowerCase() === cleanUsername);
  if (existing) {
    throw new Error(`Username "@${cleanUsername}" is already taken. Please choose another username.`);
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  const cleanDisplayName = (displayName || '').trim() || cleanUsername;
  const userRole = (role || 'Employee Reviewer').trim();

  const newEmployee = {
    id: `u_emp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    username: cleanUsername,
    email: (email || `${cleanUsername}@QuantumPropAI.internal`).trim().toLowerCase(),
    displayName: cleanDisplayName,
    passwordHash,
    avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUsername)}`,
    bio: bio ? bio.trim() : `${userRole} • QuantumPropAI Team`,
    status: 'Active Employee',
    role: userRole,
    isAdmin: false,
    isEmployee: true,
    createdByAdmin: true,
    password: password,
    hasSeenOnboarding: false,
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString()
  };

  db.users.push(newEmployee);

  // Automatically connect with Admin in contacts
  const c1Exists = db.contacts.some(c => c.userId === admin.id && c.contactUserId === newEmployee.id);
  if (!c1Exists) {
    db.contacts.push({
      id: `c_${admin.id}_${newEmployee.id}`,
      userId: admin.id,
      contactUserId: newEmployee.id,
      addedAt: new Date().toISOString()
    });
  }
  const c2Exists = db.contacts.some(c => c.userId === newEmployee.id && c.contactUserId === admin.id);
  if (!c2Exists) {
    db.contacts.push({
      id: `c_${newEmployee.id}_${admin.id}`,
      userId: newEmployee.id,
      contactUserId: admin.id,
      addedAt: new Date().toISOString()
    });
  }

  // Create initial direct conversation with welcome message from Admin
  const sorted = [admin.id, newEmployee.id].sort();
  const convId = `dm_${sorted[0]}_${sorted[1]}`;
  let conv = db.conversations.find(c => c.id === convId);

  const welcomeMsg = {
    id: `m_welcome_${Date.now()}`,
    conversationId: convId,
    senderId: admin.id,
    senderName: admin.displayName,
    senderAvatar: admin.avatar,
    text: `Hello ${newEmployee.displayName}! Welcome to QuantumPropAI. Your employee credentials have been provisioned by Admin. You can chat here directly with Admin and participate in the Review Dashboard.`,
    timestamp: new Date().toISOString(),
    readBy: [admin.id],
    reactions: { '👋': [admin.id] }
  };

  if (!conv) {
    conv = {
      id: convId,
      type: 'direct',
      participants: sorted,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: welcomeMsg
    };
    db.conversations.push(conv);
  } else {
    conv.updatedAt = new Date().toISOString();
    conv.lastMessage = welcomeMsg;
  }
  db.messages.push(welcomeMsg);

  saveDB(db);

  const { passwordHash: _, plainPassword: __, ...safeEmployee } = newEmployee;
  return {
    employee: safeEmployee,
    initialPassword: password
  };
}

function getEmployees() {
  const db = loadDB();
  const employees = db.users.filter(u => !u.isAdmin && u.username !== 'admin');
  return employees.map(({ passwordHash, plainPassword, ...safe }) => {
    let reviewCount = 0;
    (db.reviewItems || []).forEach(item => {
      if (item.votes && item.votes[safe.id]) {
        reviewCount++;
      }
    });
    const effectivePassword = safe.password || '';
    return {
      ...safe,
      password: effectivePassword,
      reviewsCount: reviewCount
    };
  });
}

function updateEmployeePassword(employeeId, newPassword, adminId) {
  const db = loadDB();
  const admin = db.users.find(u => u.id === adminId);
  if (!admin || !admin.isAdmin) {
    throw new Error('Unauthorized: Only Admin can update employee credentials');
  }

  const employee = db.users.find(u => u.id === employeeId);
  if (!employee) {
    throw new Error('Employee not found');
  }
  if (employee.isAdmin) {
    throw new Error('Cannot modify Admin password with this method');
  }

  if (!newPassword || newPassword.length < 4) {
    throw new Error('New password must be at least 4 characters');
  }

  const salt = bcrypt.genSaltSync(10);
  employee.passwordHash = bcrypt.hashSync(newPassword, salt);
  employee.password = newPassword;
  delete employee.plainPassword;
  employee.tokenVersion = (employee.tokenVersion || 0) + 1;
  employee.passwordChangedAt = new Date().toISOString();
  saveDB(db);

  const { passwordHash: _, plainPassword: __, ...safeEmployee } = employee;
  return {
    employee: safeEmployee,
    newPassword
  };
}

function deleteEmployee(employeeId, adminId) {
  const db = loadDB();
  const admin = db.users.find(u => u.id === adminId);
  if (!admin || !admin.isAdmin) {
    throw new Error('Unauthorized: Only Admin can delete employees');
  }

  const index = db.users.findIndex(u => u.id === employeeId);
  if (index === -1) {
    throw new Error('Employee not found');
  }
  if (db.users[index].isAdmin) {
    throw new Error('Cannot delete Administrator account');
  }

  // Remove from users
  db.users.splice(index, 1);

  // Remove from contacts
  db.contacts = db.contacts.filter(c => c.userId !== employeeId && c.contactUserId !== employeeId);

  // Remove conversations & messages
  const userConvs = db.conversations.filter(c => c.participants.includes(employeeId));
  const convIds = new Set(userConvs.map(c => c.id));
  db.conversations = db.conversations.filter(c => !convIds.has(c.id));
  db.messages = db.messages.filter(m => !convIds.has(m.conversationId));

  // Remove votes, checklist checks, and target audience assignments from review items
  (db.reviewItems || []).forEach(item => {
    if (item.votes && item.votes[employeeId]) {
      delete item.votes[employeeId];
    }
    if (item.checklistChecks && item.checklistChecks[employeeId]) {
      delete item.checklistChecks[employeeId];
    }
    if (Array.isArray(item.targetUserIds)) {
      item.targetUserIds = item.targetUserIds.filter(id => id !== employeeId);
      if (item.targetUserIds.length === 0) item.targetUserIds = null;
    }
  });

  // Remove from instructions target audience and acknowledgments
  (db.instructions || []).forEach(inst => {
    if (Array.isArray(inst.targetUserIds)) {
      inst.targetUserIds = inst.targetUserIds.filter(id => id !== employeeId);
      if (inst.targetUserIds.length === 0) inst.targetUserIds = null;
    }
    if (Array.isArray(inst.acknowledgedBy)) {
      inst.acknowledgedBy = inst.acknowledgedBy.filter(id => id !== employeeId);
    }
  });

  saveDB(db);
  return true;
}

function markUserOnboarded(userId) {
  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  if (user) {
    user.hasSeenOnboarding = true;
    saveDB(db);
    const { passwordHash, ...safe } = user;
    return safe;
  }
  return null;
}

function findReviewItemByMediaUrl(urlOrFilename) {
  if (!urlOrFilename) return null;
  const db = loadDB();
  const cleanTarget = path.basename(urlOrFilename).split('?')[0];
  return (db.reviewItems || []).find(r => {
    if (!r.imageUrl) return false;
    if (r.imageUrl === urlOrFilename) return true;
    const base = path.basename(r.imageUrl).split('?')[0];
    return base === cleanTarget;
  }) || null;
}

function findMessageByMediaUrl(urlOrFilename) {
  if (!urlOrFilename) return null;
  const db = loadDB();
  const cleanTarget = path.basename(urlOrFilename).split('?')[0];
  return (db.messages || []).find(m => {
    if (!m.mediaUrl) return false;
    if (m.mediaUrl === urlOrFilename) return true;
    const base = path.basename(m.mediaUrl).split('?')[0];
    return base === cleanTarget;
  }) || null;
}

module.exports = {
  loadDB,
  saveDB,
  UPLOADS_DIR,
  saveDataUrlToFile,
  findReviewItemByMediaUrl,
  findMessageByMediaUrl,
  findUserByUsername,
  findUserById,
  getAdminUser,
  createUser,
  searchUsers,
  updateLastSeen,
  addContact,
  getContacts,
  getOrCreateDirectConversation,
  getUserConversations,
  saveMessage,
  getConversationMessages,
  markMessagesAsRead,
  addMessageReaction,
  getReviewItems,
  formatReviewItem,
  createReviewItem,
  submitReviewVote,
  deleteReviewItem,
  updateReviewItemKnowledgeBase,
  updateReviewItemDataMixer,
  updateItemChecklist,
  updateReviewItemQuestions,
  setQuestionCorrectAnswer,
  getInstructions,
  formatInstruction,
  createInstruction,
  updateInstruction,
  deleteInstruction,
  acknowledgeInstruction,
  purgeExpiredUrgentInstructions,
  createEmployee,
  getEmployees,
  updateEmployeePassword,
  deleteEmployee,
  markUserOnboarded,
  updateUserProfile,
  getMonthEndResetPreview,
  resetMonthEndQueue,
  initMongoDB
};

