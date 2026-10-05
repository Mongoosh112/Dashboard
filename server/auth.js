const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Resolve secure JWT secret: prioritize process.env, or generate/load persistent random key
function getOrCreateJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }

  const dataDir = path.join(__dirname, 'data');
  const secretFile = path.join(dataDir, '.jwt_secret');

  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (fs.existsSync(secretFile)) {
      const stored = fs.readFileSync(secretFile, 'utf8').trim();
      if (stored && stored.length >= 32) {
        return stored;
      }
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
    return generated;
  } catch (err) {
    console.warn('[Security] Could not persist secret to .jwt_secret, falling back to process memory key');
    return crypto.randomBytes(48).toString('hex');
  }
}

const JWT_SECRET = getOrCreateJwtSecret();

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      isAdmin: !!user.isAdmin,
      tokenVersion: user.tokenVersion || 0
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  const db = require('./db');
  const dbUser = db.findUserById(decoded.id);
  if (!dbUser) {
    return res.status(401).json({ error: 'Unauthorized: User account not found or removed' });
  }

  // Check tokenVersion to invalidate stale tokens following password reset or logout
  const currentVersion = dbUser.tokenVersion || 0;
  const tokenVersion = decoded.tokenVersion || 0;
  if (tokenVersion < currentVersion) {
    return res.status(401).json({ error: 'Unauthorized: Session invalidated due to password change. Please log in again.' });
  }

  // Strictly enforce identity and admin status from database record, never trusting arbitrary token claims
  req.user = {
    id: dbUser.id,
    username: dbUser.username,
    isAdmin: !!dbUser.isAdmin
  };
  next();
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  authMiddleware
};
