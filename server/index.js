require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const path = require('path');

const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const db = require('./db');
const { generateToken, verifyToken, authMiddleware } = require('./auth');
const dripEngine = require('./dripEngine');
const telemetry = require('./telemetry');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

// Security Headers via Helmet with tailored CSP to allow Vite HMR, Dicebear avatars, Unsplash designs & PDF frames
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com", "https://api.dicebear.com", "https://*.dicebear.com"],
      connectSrc: ["'self'", "ws:", "wss:", "http://localhost:*", "http://127.0.0.1:*", "https://api.dicebear.com"],
      objectSrc: ["'self'", "blob:", "data:"],
      frameSrc: ["'self'", "blob:", "data:"]
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Safe CORS origin validator
function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
  } catch (e) {
    return false;
  }
  if (process.env.ALLOWED_ORIGINS) {
    const allowed = process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
    if (allowed.includes(origin) || allowed.includes('*')) return true;
    return false;
  }
  return true;
}

// Secure CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy violation: Foreign origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// General API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500, // generous max requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP. Please slow down.' }
});
app.use('/api', apiLimiter);

// Dedicated Strict Login Rate Limiter (Brute-force protection: 10 attempts / 15 min)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this IP. Please try again after 15 minutes.' }
});

// Dedicated Strict Signup Rate Limiter (Protection against automated registration spam)
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many account registrations from this IP. Please try again after 15 minutes.' }
});

// Telemetry Fallback Rate Limiter (Max 120 events / min per IP)
const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Telemetry rate limit exceeded' }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Setup Socket.IO with origin verification and 50MB buffer to handle PDF and media transfers
const io = new Server(server, {
  maxHttpBufferSize: 50 * 1024 * 1024,
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy violation: Foreign origin not allowed'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Sliding window message rate limiter per socket connection (max 10 messages per 5 seconds)
const socketMessageTimestamps = new Map();

function checkSocketMessageRateLimit(socketId) {
  const now = Date.now();
  const windowMs = 5000;
  const maxMessages = 10;

  let timestamps = socketMessageTimestamps.get(socketId) || [];
  timestamps = timestamps.filter(t => now - t < windowMs);

  if (timestamps.length >= maxMessages) {
    return false;
  }

  timestamps.push(now);
  socketMessageTimestamps.set(socketId, timestamps);
  return true;
}

// Telemetry click rate limiting per socket (max 15 clicks per 3 seconds)
const socketClickTimestamps = new Map();
function checkSocketClickRateLimit(socketId) {
  const now = Date.now();
  const windowMs = 3000;
  const maxClicks = 15;

  let timestamps = socketClickTimestamps.get(socketId) || [];
  timestamps = timestamps.filter(t => now - t < windowMs);

  if (timestamps.length >= maxClicks) {
    return false;
  }

  timestamps.push(now);
  socketClickTimestamps.set(socketId, timestamps);
  return true;
}

// Media and attachment validation against dangerous executable/script injection
function isAllowedMime(mime) {
  if (!mime || typeof mime !== 'string') return false;
  const m = mime.toLowerCase().trim();
  return m === 'application/pdf' || 
         m.startsWith('image/') || 
         m === 'image/x-png' || 
         m === 'image/pjpeg';
}

const BLOCKED_EXTENSIONS = /\.(exe|bat|cmd|sh|vbs|js|html|htm|php|phtml|jar|msi|ps1)$/i;

function validateAttachment({ mediaUrl, mediaType, fileName }) {
  if (!mediaUrl) return { valid: true };

  if (typeof mediaUrl !== 'string') {
    return { valid: false, error: 'Invalid attachment data format.' };
  }

  if (fileName && BLOCKED_EXTENSIONS.test(fileName)) {
    return { valid: false, error: 'File extension not permitted for security reasons.' };
  }

  if (mediaType && !isAllowedMime(mediaType)) {
    return { valid: false, error: 'Only images (PNG, JPEG, WebP, GIF, SVG) and PDF documents are allowed.' };
  }

  if (mediaUrl.startsWith('data:')) {
    if (mediaUrl.length > 45 * 1024 * 1024) {
      return { valid: false, error: 'Attachment file size exceeds 30MB limit.' };
    }

    const mimeMatch = mediaUrl.slice(0, 100).match(/^data:([^;,]+)/i);
    const extractedMime = mimeMatch ? mimeMatch[1].toLowerCase().trim() : '';

    if (!extractedMime || !isAllowedMime(extractedMime)) {
      return { valid: false, error: 'Invalid attachment type. Only standard images and PDFs are allowed.' };
    }

    if (extractedMime === 'image/svg+xml') {
      const decoded = decodeURIComponent(mediaUrl);
      if (
        /<script[\s>]/i.test(decoded) ||
        /on\w+\s*=/i.test(decoded) ||
        /href\s*=\s*["']?\s*javascript:/i.test(decoded) ||
        /xlink:href\s*=\s*["']?\s*javascript:/i.test(decoded) ||
        /<foreignObject[\s>]/i.test(decoded) ||
        /<use[\s>]/i.test(decoded)
      ) {
        return { valid: false, error: 'SVG files containing embedded scripts, active links, or event handlers are blocked for security.' };
      }
    }
  } else if (!mediaUrl.startsWith('https://') && !mediaUrl.startsWith('http://') && !mediaUrl.startsWith('/api/files/')) {
    return { valid: false, error: 'Invalid attachment URL scheme.' };
  }

  return { valid: true };
}

function sanitizeText(str, maxLength = 5000) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, maxLength).trim();
}

function isValidAvatarUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  if (trimmed.startsWith('https://api.dicebear.com') ||
      trimmed.startsWith('https://images.unsplash.com') ||
      trimmed.startsWith('data:image/')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

// Track online users: userId -> Set(socketId)
const onlineUsers = new Map();

function isUserOnline(userId) {
  const sockets = onlineUsers.get(userId);
  return !!(sockets && sockets.size > 0);
}

function getOnlineUserIds() {
  return Array.from(onlineUsers.keys()).filter(id => {
    const s = onlineUsers.get(id);
    return s && s.size > 0;
  });
}

// Socket Auth Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  const decoded = verifyToken(token);
  if (!decoded || !decoded.id) {
    return next(new Error('Invalid token'));
  }
  const dbUser = db.findUserById(decoded.id);
  if (!dbUser) {
    return next(new Error('User account not found'));
  }
  const currentVersion = dbUser.tokenVersion || 0;
  const tokenVersion = decoded.tokenVersion || 0;
  if (tokenVersion < currentVersion) {
    return next(new Error('Session invalidated due to password change'));
  }
  socket.userId = dbUser.id;
  socket.username = dbUser.username;
  socket.isAdmin = !!dbUser.isAdmin;
  next();
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  console.log(`[Socket] User connected: ${socket.username} (${userId})`);

  // Track socket connection
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socket.id);

  // Join personal notification room
  socket.join(`user:${userId}`);

  // Join admin room if administrator for isolated admin-only broadcasts
  if (socket.isAdmin) {
    socket.join('admin_room');
    console.log(`[Socket] Admin ${socket.username} joined admin_room`);
  }

  // Broadcast presence update with role-based privacy
  // Admins always receive the full online list
  io.to('admin_room').emit('presence_update', {
    userId,
    isOnline: true,
    onlineUserIds: getOnlineUserIds()
  });

  if (socket.isAdmin) {
    // When Admin comes online, notify all clients without leaking other user IDs
    socket.broadcast.emit('presence_update', {
      userId,
      isOnline: true
    });
  } else {
    // When a regular user comes online, notify only their own user room
    io.to(`user:${userId}`).emit('presence_update', {
      userId,
      isOnline: true
    });
  }

  // Client requests list of online users
  socket.on('get_online_users', (callback) => {
    if (typeof callback === 'function') {
      if (socket.isAdmin) {
        callback(getOnlineUserIds());
      } else {
        const adminUser = db.getAdminUser();
        const adminId = adminUser ? adminUser.id : null;
        const online = getOnlineUserIds().filter(id => id === socket.userId || (adminId && id === adminId));
        callback(online);
      }
    }
  });

  // Joining conversation room with strict participant check
  socket.on('join_conversation', (conversationId) => {
    const currentDB = db.loadDB();
    const conv = (currentDB.conversations || []).find(c => c.id === conversationId);
    if (!conv || (!conv.participants.includes(userId) && !socket.isAdmin)) {
      console.warn(`[Socket Security] Unauthorized attempt by ${socket.username} (${userId}) to join conv:${conversationId}`);
      return;
    }
    socket.join(`conv:${conversationId}`);
    console.log(`[Socket] ${socket.username} joined conv:${conversationId}`);
  });

  // Leaving conversation room
  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conv:${conversationId}`);
    socket.to(`conv:${conversationId}`).emit('user_stopped_typing', {
      conversationId,
      userId,
      username: socket.username
    });
    console.log(`[Socket] ${socket.username} left conv:${conversationId}`);
  });

  // Typing indicators with conversation authorization check
  socket.on('typing_start', ({ conversationId }) => {
    if (!conversationId || typeof conversationId !== 'string') return;
    const currentDB = db.loadDB();
    const conv = (currentDB.conversations || []).find(c => c.id === conversationId);
    if (!conv || (!conv.participants.includes(userId) && !socket.isAdmin)) {
      return;
    }
    socket.to(`conv:${conversationId}`).emit('user_typing', {
      conversationId,
      userId,
      username: socket.username
    });
  });

  socket.on('typing_stop', ({ conversationId }) => {
    if (!conversationId || typeof conversationId !== 'string') return;
    const currentDB = db.loadDB();
    const conv = (currentDB.conversations || []).find(c => c.id === conversationId);
    if (!conv || (!conv.participants.includes(userId) && !socket.isAdmin)) {
      return;
    }
    socket.to(`conv:${conversationId}`).emit('user_stopped_typing', {
      conversationId,
      userId,
      username: socket.username
    });
  });

  // Telemetry real-time ping from client tracker
  socket.on('user_telemetry_ping', (data) => {
    telemetry.recordPing(socket.userId, data);
  });

  // Telemetry user click event with rate limiting
  socket.on('user_action_click', (data) => {
    if (!checkSocketClickRateLimit(socket.id)) return;
    telemetry.recordClick(socket.userId, data);
  });

  // Real-time message sending with conversation participant verification, rate limiting, and attachment safety
  socket.on('send_message', async (data, callback) => {
    try {
      // Enforce rate limit (max 10 messages per 5 seconds per socket)
      if (!checkSocketMessageRateLimit(socket.id)) {
        if (typeof callback === 'function') {
          callback({ error: 'Please slow down. You are sending messages too quickly.' });
        }
        return;
      }

      const { conversationId, text, mediaUrl, mediaType, fileName, fileSize } = data;
      if (!text && !mediaUrl) {
        if (typeof callback === 'function') callback({ error: 'Message cannot be empty' });
        return;
      }

      // Validate attachment safety
      const attachmentCheck = validateAttachment({ mediaUrl, mediaType, fileName });
      if (!attachmentCheck.valid) {
        console.warn(`[Attachment Rejected] From ${socket.username}: ${attachmentCheck.error} (type: ${mediaType}, file: ${fileName})`);
        if (typeof callback === 'function') {
          callback({ error: attachmentCheck.error });
        }
        return;
      }

      const currentDB = db.loadDB();
      const conv = (currentDB.conversations || []).find(c => c.id === conversationId);
      if (!conv || (!conv.participants.includes(userId) && !socket.isAdmin)) {
        console.warn(`[Socket Security] Unauthorized attempt to send message by ${socket.username} to conv:${conversationId}`);
        if (typeof callback === 'function') callback({ error: 'Forbidden: You are not a participant in this conversation' });
        return;
      }

      const cleanText = sanitizeText(text, 5000);
      const cleanFileName = fileName ? sanitizeText(fileName, 120) : null;

      // Infer mediaType reliably if missing or empty
      let effectiveMediaType = mediaType;
      if (!effectiveMediaType && mediaUrl && mediaUrl.startsWith('data:')) {
        effectiveMediaType = mediaUrl.slice(0, 100).match(/^data:([^;,]+)/i)?.[1] || null;
      }
      if (!effectiveMediaType && cleanFileName) {
        const ext = cleanFileName.split('.').pop()?.toLowerCase();
        if (['png', 'x-png'].includes(ext)) effectiveMediaType = 'image/png';
        else if (['jpg', 'jpeg'].includes(ext)) effectiveMediaType = 'image/jpeg';
        else if (['webp'].includes(ext)) effectiveMediaType = 'image/webp';
        else if (['gif'].includes(ext)) effectiveMediaType = 'image/gif';
        else if (['pdf'].includes(ext)) effectiveMediaType = 'application/pdf';
      }

      const message = db.saveMessage({
        conversationId,
        senderId: userId,
        text: cleanText,
        mediaUrl,
        mediaType: effectiveMediaType,
        fileName: cleanFileName,
        fileSize
      });

      console.log(`[Socket] Message saved: sender=${socket.username}, conv=${conversationId}, hasMedia=${!!mediaUrl}, mediaType=${effectiveMediaType}`);

      // Broadcast to conversation room and to all participants' personal user rooms
      // This guarantees every participant receives new_message even if on the Dashboard or in another view
      const targetRooms = [`conv:${conversationId}`];
      if (conv && conv.participants) {
        conv.participants.forEach(pId => targetRooms.push(`user:${pId}`));
      }
      io.to(targetRooms).emit('new_message', message);

      if (typeof callback === 'function') {
        callback({ success: true, message });
      }
    } catch (err) {
      console.error('Error handling send_message:', err);
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  // Add message reaction
  socket.on('add_reaction', ({ messageId, conversationId, emoji }, callback) => {
    try {
      if (!emoji || typeof emoji !== 'string' || emoji.length > 16) {
        if (typeof callback === 'function') callback({ error: 'Invalid emoji' });
        return;
      }
      const currentDB = db.loadDB();
      const conv = (currentDB.conversations || []).find(c => c.id === conversationId);
      if (!conv || (!conv.participants.includes(userId) && !socket.isAdmin)) {
        if (typeof callback === 'function') callback({ error: 'Unauthorized to react in this conversation' });
        return;
      }
      const updatedMessage = db.addMessageReaction(messageId, userId, emoji);
      io.to(`conv:${conversationId}`).emit('reaction_updated', {
        messageId,
        reactions: updatedMessage.reactions
      });
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      console.error('Error adding reaction:', err);
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  // Mark as read
  socket.on('mark_read', ({ conversationId }) => {
    try {
      const currentDB = db.loadDB();
      const conv = (currentDB.conversations || []).find(c => c.id === conversationId);
      if (!conv || (!conv.participants.includes(userId) && !socket.isAdmin)) {
        return;
      }
      db.markMessagesAsRead(conversationId, userId);
      socket.to(`conv:${conversationId}`).emit('messages_read', {
        conversationId,
        readByUserId: userId
      });
    } catch (err) {
      console.error('Error in mark_read:', err);
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`[Socket] User disconnected: ${socket.username} (${userId})`);
    socketMessageTimestamps.delete(socket.id);
    socketClickTimestamps.delete(socket.id);
    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
        db.updateLastSeen(userId);
        telemetry.handleUserDisconnect(userId);

        const isoLastSeen = new Date().toISOString();

        // Admins receive the full list and status
        io.to('admin_room').emit('presence_update', {
          userId,
          isOnline: false,
          lastSeen: isoLastSeen,
          onlineUserIds: getOnlineUserIds()
        });

        if (socket.isAdmin) {
          // If Admin went offline, notify all clients
          io.emit('presence_update', {
            userId,
            isOnline: false,
            lastSeen: isoLastSeen
          });
        } else {
          // If regular user went offline, only notify their own user room
          io.to(`user:${userId}`).emit('presence_update', {
            userId,
            isOnline: false,
            lastSeen: isoLastSeen
          });
        }
      }
    }
  });
});

// REST API ROUTES

// Auth: Sign Up with rate limiting
app.post('/api/auth/signup', signupLimiter, (req, res) => {
  try {
    const { username, email, displayName, password, avatar, bio } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const newUser = db.createUser({ username, email, displayName, password, avatar, bio });
    const token = generateToken(newUser);

    return res.status(201).json({
      user: newUser,
      token
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Auth: Login with brute-force rate limiting
app.post('/api/auth/login', loginLimiter, (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = db.findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const match = bcrypt.compareSync(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const { passwordHash, ...safeUser } = user;
    const token = generateToken(safeUser);

    return res.json({
      user: safeUser,
      token
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error during login' });
  }
});

// Auth: Current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const { passwordHash, ...safeUser } = user;
  return res.json({ user: safeUser });
});

// Users: Complete onboarding
app.post('/api/users/onboarding-complete', authMiddleware, (req, res) => {
  try {
    const updatedUser = db.markUserOnboarded(req.user.id);
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Users: Update profile (change avatar, display name, bio, email, member since / createdAt)
app.put('/api/users/profile', authMiddleware, (req, res) => {
  try {
    const targetUserId = (req.user.isAdmin && req.body.userId) ? req.body.userId : req.user.id;
    const { avatar, displayName, bio, email, createdAt } = req.body;

    if (avatar && !isValidAvatarUrl(avatar)) {
      return res.status(400).json({ error: 'Invalid avatar URL protocol or domain' });
    }

    const cleanDisplayName = displayName ? sanitizeText(displayName, 60) : undefined;
    const cleanBio = bio !== undefined ? sanitizeText(bio, 500) : undefined;
    const safeCreatedAt = req.user.isAdmin ? createdAt : undefined;

    const updatedUser = db.updateUserProfile(targetUserId, {
      avatar,
      displayName: cleanDisplayName,
      bio: cleanBio,
      email,
      createdAt: safeCreatedAt
    });

    // Broadcast user profile update: Admin updates are visible to all; employee updates only to Admin and the user
    if (updatedUser.isAdmin) {
      io.emit('user_profile_updated', {
        user: updatedUser
      });
    } else {
      io.to('admin_room').emit('user_profile_updated', {
        user: updatedUser
      });
      io.to(`user:${targetUserId}`).emit('user_profile_updated', {
        user: updatedUser
      });
    }

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Users: Search
app.get('/api/users/search', authMiddleware, (req, res) => {
  const query = req.query.q || '';
  const users = db.searchUsers(query, req.user.id);
  const contacts = db.getContacts(req.user.id);
  const contactIds = new Set(contacts.map(c => c.id));

  const enrichedUsers = users.map(u => ({
    ...u,
    isContact: contactIds.has(u.id),
    isOnline: isUserOnline(u.id)
  }));

  res.json({ users: enrichedUsers });
});

// Contacts: Get All
app.get('/api/contacts', authMiddleware, (req, res) => {
  const contacts = db.getContacts(req.user.id);
  const enrichedContacts = contacts.map(c => ({
    ...c,
    isOnline: isUserOnline(c.id)
  }));
  res.json({ contacts: enrichedContacts });
});

// Contacts: Add
app.post('/api/contacts', authMiddleware, (req, res) => {
  try {
    const { contactUserId } = req.body;
    if (!contactUserId) {
      return res.status(400).json({ error: 'contactUserId is required' });
    }
    const updatedContacts = db.addContact(req.user.id, contactUserId);
    
    // Automatically create a direct conversation too
    const conversation = db.getOrCreateDirectConversation(req.user.id, contactUserId);

    // Notify the added contact if online so their contacts list updates in real time
    io.to(`user:${contactUserId}`).emit('contact_added', {
      byUserId: req.user.id
    });

    res.json({
      success: true,
      contacts: updatedContacts.map(c => ({
        ...c,
        isOnline: isUserOnline(c.id)
      })),
      conversation
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Conversations: Get All
app.get('/api/conversations', authMiddleware, (req, res) => {
  const conversations = db.getUserConversations(req.user.id);
  const enriched = conversations.map(c => {
    if (c.recipient) {
      c.recipient.isOnline = isUserOnline(c.recipient.id);
    }
    return c;
  });
  res.json({ conversations: enriched });
});

// Conversations: Start or get direct conversation
app.post('/api/conversations/direct', authMiddleware, (req, res) => {
  try {
    const { contactUserId } = req.body;
    if (!contactUserId) {
      return res.status(400).json({ error: 'contactUserId is required' });
    }
    if (contactUserId === req.user.id) {
      return res.status(400).json({ error: 'Cannot create conversation with yourself' });
    }
    const conv = db.getOrCreateDirectConversation(req.user.id, contactUserId);
    const recipient = db.findUserById(contactUserId);
    const safeRecipient = recipient ? (({ passwordHash, ...rest }) => rest)(recipient) : null;
    if (safeRecipient) {
      safeRecipient.isOnline = isUserOnline(contactUserId);
    }

    res.json({
      conversation: {
        ...conv,
        recipient: safeRecipient,
        unreadCount: 0
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Conversations: Messages
app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  const convId = req.params.id;
  const currentDB = db.loadDB();
  const conv = (currentDB.conversations || []).find(c => c.id === convId);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  if (!conv.participants.includes(req.user.id) && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: You do not have permission to view this conversation' });
  }

  const messages = db.getConversationMessages(convId);
  // Mark as read for this user
  db.markMessagesAsRead(convId, req.user.id);
  io.to(`conv:${convId}`).emit('messages_read', { conversationId: convId, readByUserId: req.user.id });
  res.json({ messages });
});

// Secure File Serving Endpoint with Strict Authorization & Path Traversal Prevention
app.get('/api/files/:filename', (req, res) => {
  const rawParam = req.params.filename;
  if (!rawParam || typeof rawParam !== 'string') {
    return res.status(400).json({ error: 'Invalid file parameter' });
  }

  // Defend against path traversal: extract solely the basename
  const safeBaseName = path.basename(rawParam).split('?')[0];
  if (!safeBaseName || safeBaseName.includes('..') || safeBaseName.includes('/') || safeBaseName.includes('\\')) {
    return res.status(400).json({ error: 'Illegal file path' });
  }

  const uploadsDir = path.resolve(db.UPLOADS_DIR);
  const targetFilePath = path.resolve(uploadsDir, safeBaseName);

  // Assert target path is strictly within uploads directory
  if (!targetFilePath.startsWith(uploadsDir)) {
    return res.status(403).json({ error: 'Access denied: Path traversal detected' });
  }

  const fs = require('fs');
  if (!fs.existsSync(targetFilePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const sendSafeFile = (downloadName) => {
    const ext = path.extname(safeBaseName).toLowerCase();
    const mimeMap = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    const safeName = downloadName ? downloadName.replace(/["\r\n]/g, '') : safeBaseName;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    return res.sendFile(targetFilePath);
  };

  // 1. If file is associated with a Review Item (team-shared), serve directly
  const reviewItem = db.findReviewItemByMediaUrl(safeBaseName);
  if (reviewItem) {
    return sendSafeFile(reviewItem.title || safeBaseName);
  }

  // 2. Otherwise for private conversation messages, enforce strict authMiddleware
  authMiddleware(req, res, () => {
    const message = db.findMessageByMediaUrl(safeBaseName);
    if (message && message.conversationId) {
      const currentDB = db.loadDB();
      const conv = (currentDB.conversations || []).find(c => c.id === message.conversationId);
      if (conv && !conv.participants.includes(req.user.id) && !req.user.isAdmin) {
        return res.status(403).json({ error: 'Forbidden: You do not have permission to view this attachment' });
      }
    }
    sendSafeFile(message?.fileName);
  });
});

// Secure Attachment Upload Endpoint
app.post('/api/upload', authMiddleware, (req, res) => {
  try {
    const { dataUrl, fileName, mediaType } = req.body;
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return res.status(400).json({ error: 'Invalid or missing attachment data' });
    }

    const check = validateAttachment({ mediaUrl: dataUrl, mediaType, fileName });
    if (!check.valid) {
      return res.status(400).json({ error: check.error || 'Attachment validation failed' });
    }

    const savedUrl = db.saveDataUrlToFile(dataUrl, fileName);
    if (!savedUrl || savedUrl.startsWith('data:')) {
      return res.status(500).json({ error: 'Failed to process and store attachment' });
    }

    res.json({
      success: true,
      mediaUrl: savedUrl,
      fileName: fileName || null,
      mediaType: mediaType || null
    });
  } catch (err) {
    console.error('Error handling /api/upload:', err);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

// Conversations: Mark read
app.post('/api/conversations/:id/read', authMiddleware, (req, res) => {
  const convId = req.params.id;
  const currentDB = db.loadDB();
  const conv = (currentDB.conversations || []).find(c => c.id === convId);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  if (!conv.participants.includes(req.user.id) && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Access denied' });
  }

  db.markMessagesAsRead(convId, req.user.id);
  io.to(`conv:${convId}`).emit('messages_read', { conversationId: convId, readByUserId: req.user.id });
  res.json({ success: true });
});

// ==========================================
// Employee Review Dashboard Endpoints
// ==========================================

// Real-time privacy-preserving review item distribution helper
function broadcastReviewItem(itemId, eventName = 'review_vote_updated') {
  const currentDB = db.loadDB();
  const rawItem = (currentDB.reviewItems || []).find(i => i.id === itemId);
  if (!rawItem) return;

  // 1. Admin room gets unredacted version with real stats and dataMixer
  io.to('admin_room').emit(eventName, db.formatReviewItem(rawItem, null, true));

  // 2. Non-admin active users get user-scoped sanitized items (only if targeted or global)
  onlineUsers.forEach((sockets, uid) => {
    const u = db.findUserById(uid);
    if (u && !u.isAdmin) {
      if (!rawItem.targetUserIds || rawItem.targetUserIds.length === 0 || rawItem.targetUserIds.includes(uid)) {
        io.to(`user:${uid}`).emit(eventName, db.formatReviewItem(rawItem, uid, false));
      }
    }
  });
}

// Real-time privacy-preserving directive / instruction distribution helper
function broadcastInstruction(instructionId, eventName = 'instruction_updated') {
  const currentDB = db.loadDB();
  const rawInst = (currentDB.instructions || []).find(i => i.id === instructionId);
  if (!rawInst) return;

  const admin = db.getAdminUser();
  const adminId = admin ? admin.id : null;

  // 1. Admin room gets unredacted instruction with targeted/pending audience data
  io.to('admin_room').emit(eventName, db.formatInstruction(rawInst, adminId));

  // 2. Non-admin active users get sanitized instruction (only if targeted or global)
  onlineUsers.forEach((sockets, uid) => {
    const u = db.findUserById(uid);
    if (u && !u.isAdmin) {
      if (!rawInst.targetUserIds || rawInst.targetUserIds.length === 0 || rawInst.targetUserIds.includes(uid)) {
        io.to(`user:${uid}`).emit(eventName, db.formatInstruction(rawInst, uid));
      }
    }
  });
}

// Get all review items (filtered by recipient if employee)
app.get('/api/dashboard/items', authMiddleware, (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const items = db.getReviewItems(req.user.id, includeArchived);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin creates new image review item with questionnaire and knowledge base
app.post('/api/dashboard/items', authMiddleware, (req, res) => {
  try {
    const adminUser = db.findUserById(req.user.id);
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    const { title, description, imageUrl, questions, knowledgeBase, targetUserIds } = req.body;
    const newItem = db.createReviewItem({
      title,
      description,
      imageUrl,
      questions,
      knowledgeBase,
      targetUserIds,
      createdBy: req.user.id
    });

    broadcastReviewItem(newItem.id, 'new_review_item');

    res.status(201).json({ item: db.formatReviewItem(newItem, req.user.id, true) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Employee responds to questionnaire / votes on a review item
const handleVoteResponse = (req, res) => {
  try {
    const { vote, answers, comment } = req.body;
    const userResultItem = db.submitReviewVote({
      itemId: req.params.id,
      userId: req.user.id,
      vote,
      answers,
      comment
    });

    // ⚡ Fast HTTP response: Reply immediately so client UI feels instantaneous
    res.json({ item: userResultItem });

    // Asynchronously broadcast to other rooms on next tick
    setImmediate(() => {
      broadcastReviewItem(req.params.id, 'review_vote_updated');

      const submittingUser = db.findUserById(req.user.id);
      if (submittingUser && !submittingUser.isAdmin) {
        io.to('admin_room').emit('employee_review_submitted', {
          itemId: req.params.id,
          itemTitle: userResultItem.title,
          userId: submittingUser.id,
          userName: submittingUser.displayName || submittingUser.username,
          userAvatar: submittingUser.avatar,
          vote: vote || (userResultItem.votes?.[req.user.id]?.vote) || null,
          timestamp: new Date().toISOString()
        });
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

app.post('/api/dashboard/items/:id/vote', authMiddleware, handleVoteResponse);
app.post('/api/dashboard/items/:id/respond', authMiddleware, handleVoteResponse);

// Admin updates knowledge base / decision guidelines for an item
app.put('/api/dashboard/items/:id/knowledge-base', authMiddleware, (req, res) => {
  try {
    const updatedItem = db.updateReviewItemKnowledgeBase(req.params.id, req.user.id, req.body.knowledgeBase);
    broadcastReviewItem(req.params.id, 'review_vote_updated');
    res.json({ item: updatedItem });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin updates simulated data mixer / custom stats for an item
app.put('/api/dashboard/items/:id/data-mixer', authMiddleware, (req, res) => {
  try {
    const updatedItem = db.updateReviewItemDataMixer(req.params.id, req.user.id, req.body.dataMixer);
    broadcastReviewItem(req.params.id, 'review_vote_updated');
    res.json({ item: updatedItem });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin starts or configures a live vote drip campaign
app.post('/api/dashboard/items/:id/drip/start', authMiddleware, (req, res) => {
  try {
    const updatedItem = dripEngine.startCampaign(req.params.id, req.user.id, req.body);
    res.json({ success: true, item: updatedItem });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin pauses an active vote drip campaign
app.post('/api/dashboard/items/:id/drip/pause', authMiddleware, (req, res) => {
  try {
    const updatedItem = dripEngine.pauseCampaign(req.params.id, req.user.id);
    res.json({ success: true, item: updatedItem });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin stops or resets a vote drip campaign
app.post('/api/dashboard/items/:id/drip/stop', authMiddleware, (req, res) => {
  try {
    const resetNumbers = !!req.body.resetNumbers;
    const updatedItem = dripEngine.stopCampaign(req.params.id, req.user.id, resetNumbers);
    res.json({ success: true, item: updatedItem });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin updates questionnaire / questions for an item
app.put('/api/dashboard/items/:id/questions', authMiddleware, (req, res) => {
  try {
    const { questions, imageUrl, title, description, targetUserIds } = req.body;
    const updatedItem = db.updateReviewItemQuestions(req.params.id, req.user.id, questions, imageUrl, title, description, targetUserIds);
    broadcastReviewItem(req.params.id, 'review_vote_updated');
    res.json({ item: updatedItem });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin assigns or updates correct answer for a question
app.put('/api/dashboard/items/:id/questions/:questionId/correct-answer', authMiddleware, (req, res) => {
  try {
    const { correctAnswer } = req.body;
    const updatedItem = db.setQuestionCorrectAnswer(req.params.id, req.params.questionId, correctAnswer, req.user.id);
    broadcastReviewItem(req.params.id, 'review_vote_updated');
    res.json({ success: true, item: updatedItem });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update user's checklist checks for a review item
app.post('/api/dashboard/items/:id/checklist', authMiddleware, (req, res) => {
  try {
    const { checks } = req.body;
    const updatedItem = db.updateItemChecklist(req.params.id, req.user.id, checks);
    broadcastReviewItem(req.params.id, 'review_vote_updated');
    res.json({ item: updatedItem, success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin deletes a review item
app.delete('/api/dashboard/items/:id', authMiddleware, (req, res) => {
  try {
    dripEngine.cancelTimer(req.params.id);
    db.deleteReviewItem(req.params.id, req.user.id);
    io.emit('review_item_deleted', { itemId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Month-End Reset Preview
app.get('/api/dashboard/admin/month-end-preview', authMiddleware, (req, res) => {
  try {
    const adminUser = db.findUserById(req.user.id);
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required' });
    }
    const preview = db.getMonthEndResetPreview(req.user.id);
    res.json(preview);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Month-End Reset Execution
app.post('/api/dashboard/admin/month-end-reset', authMiddleware, (req, res) => {
  try {
    const adminUser = db.findUserById(req.user.id);
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required' });
    }
    const { resetCompletedOnly = true, resetAllItems = false, resetUnpinnedInstructions = true } = req.body;
    const result = db.resetMonthEndQueue({
      adminUserId: req.user.id,
      resetCompletedOnly,
      resetAllItems,
      resetUnpinnedInstructions
    });

    // Broadcast reset event so all connected dashboards refresh immediately
    io.emit('month_end_reset', result);
    io.emit('instructions_updated');

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// IMPORTANT INSTRUCTIONS & DIRECTIVES API
// ==========================================

// Get all instructions
app.get('/api/dashboard/instructions', authMiddleware, (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const instructions = db.getInstructions(req.user.id, includeArchived);
    res.json({ instructions });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin creates a new instruction
app.post('/api/dashboard/instructions', authMiddleware, (req, res) => {
  try {
    const { title, content, priority, category, pinned, targetUserIds } = req.body;
    const newInst = db.createInstruction({
      title,
      content,
      priority,
      category,
      pinned,
      targetUserIds,
      createdBy: req.user.id
    });
    broadcastInstruction(newInst.id, 'new_instruction');
    res.status(201).json({ instruction: newInst });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin updates an instruction
app.put('/api/dashboard/instructions/:id', authMiddleware, (req, res) => {
  try {
    const updated = db.updateInstruction(req.params.id, req.user.id, req.body);
    broadcastInstruction(req.params.id, 'instruction_updated');
    res.json({ instruction: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin deletes an instruction
app.delete('/api/dashboard/instructions/:id', authMiddleware, (req, res) => {
  try {
    db.deleteInstruction(req.params.id, req.user.id);
    io.emit('instruction_deleted', { instructionId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// User acknowledges an instruction
app.post('/api/dashboard/instructions/:id/acknowledge', authMiddleware, (req, res) => {
  try {
    const updated = db.acknowledgeInstruction(req.params.id, req.user.id);
    broadcastInstruction(req.params.id, 'instruction_updated');

    // If urgent directive, schedule immediate broadcast when its 1-hour lifespan expires
    if (updated.priority === 'urgent') {
      const lifetimeMs = parseInt(process.env.URGENT_DIRECTIVE_LIFETIME_MS, 10) || (60 * 60 * 1000);
      setTimeout(() => {
        try {
          const deletedIds = db.purgeExpiredUrgentInstructions();
          if (deletedIds && deletedIds.length > 0) {
            deletedIds.forEach(delId => {
              io.emit('instruction_deleted', { instructionId: delId });
              console.log(`[Urgent Directives] Auto-deleted urgent directive ${delId} 1 hour after acknowledgment.`);
            });
          }
        } catch (timerErr) {
          console.error('[Urgent Directives] Timer deletion error:', timerErr);
        }
      }, lifetimeMs + 500);
    }

    res.json({ instruction: updated, success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin sends real-time sound notification / ping to employee(s) for an important directive
app.post('/api/dashboard/instructions/:id/ping', authMiddleware, (req, res) => {
  try {
    const adminUser = db.findUserById(req.user.id);
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Only Admin can send directive sound pings' });
    }

    const currentDB = db.loadDB();
    const inst = (currentDB.instructions || []).find(i => i.id === req.params.id);
    if (!inst) {
      return res.status(404).json({ error: 'Instruction not found' });
    }

    const { targetUserId } = req.body;
    let recipientIds = [];

    if (targetUserId) {
      // Ping a specific employee
      recipientIds = [targetUserId];
    } else {
      // Ping all pending employees who haven't acknowledged yet
      const allEmployees = (currentDB.users || []).filter(u => !u.isAdmin).map(u => u.id);
      const targetPool = Array.isArray(inst.targetUserIds) && inst.targetUserIds.length > 0
        ? inst.targetUserIds
        : allEmployees;
      
      recipientIds = targetPool.filter(uid => !(inst.acknowledgedBy || []).includes(uid));
    }

    const pingPayload = {
      instructionId: inst.id,
      title: inst.title,
      priority: inst.priority || 'urgent',
      category: inst.category,
      senderId: adminUser.id,
      senderName: adminUser.displayName || adminUser.username || 'Admin',
      senderAvatar: adminUser.avatar,
      timestamp: new Date().toISOString()
    };

    recipientIds.forEach(uid => {
      // Emit to recipient's private user socket room
      io.to(`user:${uid}`).emit('directive_ping', pingPayload);
    });

    // Also broadcast to admin room so active admin clients know a ping was dispatched
    io.to('admin_room').emit('directive_ping_dispatched', {
      instructionId: inst.id,
      pingedUserIds: recipientIds,
      senderId: adminUser.id,
      timestamp: pingPayload.timestamp
    });

    console.log(`[Directive Ping] Admin ${adminUser.username} sent sound ping for directive "${inst.title}" to ${recipientIds.length} employee(s).`);

    res.json({
      success: true,
      pingedCount: recipientIds.length,
      pingedUserIds: recipientIds
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ADMIN EMPLOYEE MANAGEMENT API
// ==========================================

// Get all employees
app.get('/api/admin/employees', authMiddleware, (req, res) => {
  try {
    const adminUser = db.findUserById(req.user.id);
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    const employees = db.getEmployees();
    const enriched = employees.map(emp => ({
      ...emp,
      isOnline: isUserOnline(emp.id)
    }));
    res.json({ employees: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin creates new employee
app.post('/api/admin/employees', authMiddleware, (req, res) => {
  try {
    const adminUser = db.findUserById(req.user.id);
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const { username, password, displayName, email, role, bio, avatar } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = db.createEmployee({
      username,
      password,
      displayName,
      email,
      role,
      bio,
      avatar,
      adminId: req.user.id
    });

    const host = req.get('host') || 'localhost:5173';
    const protocol = req.protocol || 'http';
    const loginUrl = `${protocol}://${host}`;

    // Broadcast strictly to admin room so non-admins cannot track employee changes
    io.to('admin_room').emit('employee_created', {
      employee: {
        ...result.employee,
        isOnline: false
      }
    });

    res.status(201).json({
      success: true,
      employee: result.employee,
      credentials: {
        username: result.employee.username,
        password: result.initialPassword,
        loginUrl
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin updates / resets employee password
app.put('/api/admin/employees/:id/password', authMiddleware, (req, res) => {
  try {
    const adminUser = db.findUserById(req.user.id);
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'New password is required' });
    }

    const result = db.updateEmployeePassword(req.params.id, password, req.user.id);
    io.to('admin_room').emit('employee_updated', { employee: result.employee });

    // Invalidate active sockets for this user so they must re-authenticate with new password
    const userSockets = onlineUsers.get(req.params.id);
    if (userSockets) {
      userSockets.forEach(sockId => {
        const s = io.sockets.sockets.get(sockId);
        if (s) {
          s.emit('auth_error', { message: 'Password updated. Please log in again.' });
          s.disconnect(true);
        }
      });
    }

    const host = req.get('host') || 'localhost:5173';
    const protocol = req.protocol || 'http';
    const loginUrl = `${protocol}://${host}`;

    res.json({
      success: true,
      employee: result.employee,
      credentials: {
        username: result.employee.username,
        password: result.newPassword,
        loginUrl
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin deletes employee
app.delete('/api/admin/employees/:id', authMiddleware, (req, res) => {
  try {
    const adminUser = db.findUserById(req.user.id);
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    db.deleteEmployee(req.params.id, req.user.id);
    telemetry.deleteUser(req.params.id);
    io.to('admin_room').emit('employee_deleted', { employeeId: req.params.id });

    // Disconnect any active sockets for the deleted employee immediately
    const userSockets = onlineUsers.get(req.params.id);
    if (userSockets) {
      userSockets.forEach(sockId => {
        const s = io.sockets.sockets.get(sockId);
        if (s) {
          s.emit('auth_error', { message: 'Account deleted.' });
          s.disconnect(true);
        }
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin User Telemetry & Screen Tracking
app.get('/api/admin/telemetry', authMiddleware, (req, res) => {
  try {
    const adminUser = db.findUserById(req.user.id);
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    const data = telemetry.getFullData();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin resets user activity & screen tracking metrics (activeScreenSeconds, backgroundSeconds, clicks) to 0
app.post('/api/admin/telemetry/reset', authMiddleware, (req, res) => {
  try {
    const adminUser = db.findUserById(req.user.id);
    if (!adminUser || !adminUser.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    const { userId } = req.body || {};
    telemetry.resetMetrics(userId);
    const data = telemetry.getFullData();
    res.json({ success: true, message: 'Activity metrics reset to 0', ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Telemetry beacon / event fallback endpoint
app.post('/api/telemetry/event', authMiddleware, telemetryLimiter, (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === 'ping') {
      telemetry.recordPing(req.user.id, data);
    } else if (type === 'click') {
      telemetry.recordClick(req.user.id, data);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    onlineUsersCount: getOnlineUserIds().length
  });
});

// Serve frontend in production build if present
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.use((req, res) => {
  const indexPath = path.join(clientDist, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).send('QuantumPropAI API running. Frontend dev server active on port 5173.');
    }
  });
});

server.listen(PORT, async () => {
  console.log(`===========================================`);
  console.log(`🚀 QuantumPropAI Server running on port ${PORT}`);
  console.log(`🌐 Real-time WebSocket enabled with Socket.IO`);
  console.log(`===========================================`);

  // Connect to MongoDB if MONGODB_URI is provided
  await db.initMongoDB();

  // Initialize live vote drip simulation engine
  dripEngine.init(io, db, broadcastReviewItem);

  // Initialize telemetry & tracking engine
  telemetry.init(io, db);

  // Recurring auto-deletion worker: purges urgent directives 1 hour after being read and acknowledged
  setInterval(() => {
    try {
      const deletedIds = db.purgeExpiredUrgentInstructions();
      if (deletedIds && deletedIds.length > 0) {
        deletedIds.forEach(id => {
          console.log(`[Urgent Directives] Auto-deleted urgent directive ${id} 1 hour after acknowledgment.`);
          io.emit('instruction_deleted', { instructionId: id });
        });
      }
    } catch (err) {
      console.error('[Urgent Directives] Auto-delete interval check error:', err);
    }
  }, 30 * 1000);
});
