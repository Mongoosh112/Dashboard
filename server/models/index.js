const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String },
  password: { type: String },
  displayName: { type: String, default: '' },
  avatar: { type: String, default: '' },
  role: { type: String, default: 'Employee' },
  isAdmin: { type: Boolean, default: false },
  bio: { type: String, default: '' },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true, strict: false });

// Conversation Schema
const conversationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  participantIds: [{ type: String, index: true }],
  lastMessage: { type: mongoose.Schema.Types.Mixed, default: null },
  unreadCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true, strict: false });

// Message Schema
const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  conversationId: { type: String, required: true, index: true },
  senderId: { type: String, required: true, index: true },
  senderName: { type: String, default: '' },
  senderAvatar: { type: String, default: '' },
  text: { type: String, default: '' },
  mediaUrl: { type: String, default: null },
  mediaType: { type: String, default: null },
  fileUrl: { type: String, default: null },
  fileName: { type: String, default: null },
  fileSize: { type: mongoose.Schema.Types.Mixed, default: null },
  timestamp: { type: Date, default: Date.now },
  reactions: { type: mongoose.Schema.Types.Mixed, default: {} },
  readBy: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true, strict: false });

// Review Item Schema
const reviewItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  questions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  votes: { type: mongoose.Schema.Types.Mixed, default: {} },
  questionStats: { type: [mongoose.Schema.Types.Mixed], default: [] },
  knowledgeBase: { type: mongoose.Schema.Types.Mixed, default: null },
  dataMixer: { type: mongoose.Schema.Types.Mixed, default: null },
  dripCampaign: { type: mongoose.Schema.Types.Mixed, default: null },
  targetUserIds: { type: [String], default: null },
  isArchived: { type: Boolean, default: false },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true, strict: false });

// Important Instruction Schema
const instructionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  priority: { type: String, default: 'important' },
  category: { type: String, default: 'General Notice' },
  pinned: { type: Boolean, default: false },
  targetUserIds: { type: [String], default: null },
  acknowledgedBy: [{ type: String }],
  acknowledgments: { type: mongoose.Schema.Types.Mixed, default: {} },
  acknowledgedAt: { type: String, default: null },
  autoDeleteAt: { type: String, default: null, index: true },
  createdBy: { type: String, required: true },
  createdByName: { type: String, default: 'Admin' },
  createdByAvatar: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true, strict: false });

// Telemetry Schema
const telemetrySchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  users: { type: mongoose.Schema.Types.Mixed, default: {} },
  summary: { type: mongoose.Schema.Types.Mixed, default: {} },
  userStates: { type: mongoose.Schema.Types.Mixed, default: {} },
  clickStream: { type: [mongoose.Schema.Types.Mixed], default: [] }
}, { timestamps: true, strict: false });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);
const ReviewItem = mongoose.models.ReviewItem || mongoose.model('ReviewItem', reviewItemSchema);
const Instruction = mongoose.models.Instruction || mongoose.model('Instruction', instructionSchema);
const Telemetry = mongoose.models.Telemetry || mongoose.model('Telemetry', telemetrySchema);

module.exports = {
  User,
  Conversation,
  Message,
  ReviewItem,
  Instruction,
  Telemetry
};
