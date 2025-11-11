const jwt = require('jsonwebtoken');
const { logger } = require('./logger');

// In-memory voice session store (use Redis in production)
const voiceSessions = new Map();

// Clean up expired sessions every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of voiceSessions.entries()) {
    if (session.expiresAt < now) {
      voiceSessions.delete(token);
      logger.info('[Voice Auth] Cleaned up expired session:', token);
    }
  }
}, 3600000); // 1 hour

/**
 * Create a voice session token for authenticated user
 * @param {Object} user - User object
 * @param {Object} voicePermissions - Voice control permissions from RolePermissions
 */
function createVoiceSession(user, voicePermissions = {}) {
  const voiceToken = jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      type: 'voice_session',
      permissions: voicePermissions,
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
    },
    process.env.JWT_SECRET
  );

  // Store session metadata including permissions
  voiceSessions.set(voiceToken, {
    userId: user._id.toString(),
    userName: user.name,
    role: user.role,
    permissions: voicePermissions,
    createdAt: new Date(),
    lastUsed: new Date(),
    expiresAt: Date.now() + (60 * 60 * 1000), // 1 hour
    commandCount: 0
  });

  logger.info('[Voice Auth] Created voice session for user:', user.name, 'with permissions:', voicePermissions);

  return {
    voiceToken,
    expiresIn: 3600,
    user: {
      id: user._id,
      name: user.name,
      role: user.role
    },
    permissions: voicePermissions
  };
}

/**
 * Validate voice session token
 */
async function validateVoiceSession(voiceToken) {
  try {
    // Verify JWT token
    const decoded = jwt.verify(voiceToken, process.env.JWT_SECRET);

    // Check token type
    if (decoded.type !== 'voice_session') {
      throw new Error('Invalid token type');
    }

    // Check if session exists in memory
    const session = voiceSessions.get(voiceToken);
    if (!session) {
      throw new Error('Voice session not found or expired');
    }

    // Update last used timestamp
    session.lastUsed = new Date();
    session.commandCount++;
    voiceSessions.set(voiceToken, session);

    return {
      valid: true,
      userId: decoded.userId,
      role: decoded.role,
      session
    };
  } catch (error) {
    logger.error('[Voice Auth] Validation error:', error.message);
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Middleware to validate voice session
 */
const voiceAuth = async (req, res, next) => {
  try {
    const voiceToken = req.body.voiceToken || req.query.voiceToken || req.headers['x-voice-token'];

    if (!voiceToken) {
      return res.status(401).json({
        success: false,
        message: 'Voice authentication required',
        code: 'NO_VOICE_TOKEN'
      });
    }

    const validation = await validateVoiceSession(voiceToken);

    if (!validation.valid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired voice session',
        code: 'INVALID_VOICE_SESSION',
        error: validation.error
      });
    }

    // Check if voice session matches the authenticated user
    if (req.user && req.user.id !== validation.userId) {
      return res.status(403).json({
        success: false,
        message: 'Voice session does not match authenticated user',
        code: 'SESSION_MISMATCH'
      });
    }

    // Attach voice session info to request
    req.voiceSession = validation.session;
    next();
  } catch (error) {
    logger.error('[Voice Auth] Middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Voice authentication error',
      error: error.message
    });
  }
};

/**
 * Revoke voice session
 */
function revokeVoiceSession(voiceToken) {
  if (voiceSessions.has(voiceToken)) {
    voiceSessions.delete(voiceToken);
    logger.info('[Voice Auth] Revoked voice session:', voiceToken);
    return true;
  }
  return false;
}

/**
 * Get all active voice sessions for a user
 */
function getUserVoiceSessions(userId) {
  const sessions = [];
  for (const [token, session] of voiceSessions.entries()) {
    if (session.userId === userId) {
      sessions.push({
        token: token.substring(0, 20) + '...',
        createdAt: session.createdAt,
        lastUsed: session.lastUsed,
        commandCount: session.commandCount
      });
    }
  }
  return sessions;
}

/**
 * Revoke all voice sessions for a user
 */
function revokeAllUserSessions(userId) {
  let count = 0;
  for (const [token, session] of voiceSessions.entries()) {
    if (session.userId === userId) {
      voiceSessions.delete(token);
      count++;
    }
  }
  logger.info(`[Voice Auth] Revoked ${count} sessions for user:`, userId);
  return count;
}

/**
 * Rate limiting for voice commands
 */
const voiceRateLimit = (maxCommands = 100, windowMs = 15 * 60 * 1000) => {
  const userCommandCounts = new Map();

  // Clean up old entries
  setInterval(() => {
    userCommandCounts.clear();
  }, windowMs);

  return (req, res, next) => {
    const userId = req.user?.id || req.voiceSession?.userId;

    if (!userId) {
      return next();
    }

    const now = Date.now();
    const userRecord = userCommandCounts.get(userId) || { count: 0, resetTime: now + windowMs };

    if (now > userRecord.resetTime) {
      userRecord.count = 0;
      userRecord.resetTime = now + windowMs;
    }

    userRecord.count++;
    userCommandCounts.set(userId, userRecord);

    if (userRecord.count > maxCommands) {
      return res.status(429).json({
        success: false,
        message: 'Too many voice commands. Please slow down.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((userRecord.resetTime - now) / 1000)
      });
    }

    next();
  };
};

module.exports = {
  createVoiceSession,
  validateVoiceSession,
  voiceAuth,
  revokeVoiceSession,
  getUserVoiceSessions,
  revokeAllUserSessions,
  voiceRateLimit
};
