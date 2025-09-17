import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import prisma from '../config/database.js';

/**
 * Enhanced session management utilities
 * Provides secure session handling with proper cleanup and monitoring
 */

// Session storage (in production, use Redis or database)
const activeSessions = new Map();

/**
 * Create a new session
 * @param {string} userId - User ID
 * @param {Object} sessionData - Additional session data
 * @returns {Object} Session information
 */
export const createSession = (userId, sessionData = {}) => {
  const sessionId = generateSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  
  const session = {
    id: sessionId,
    userId,
    createdAt: now,
    expiresAt,
    lastActivity: now,
    ip: sessionData.ip,
    userAgent: sessionData.userAgent,
    isActive: true,
    data: sessionData.data || {}
  };
  
  // Store session
  activeSessions.set(sessionId, session);
  
  // Clean up expired sessions
  cleanupExpiredSessions();
  
  logger.info(`Session created for user: ${userId}`, {
    sessionId,
    ip: sessionData.ip,
    userAgent: sessionData.userAgent
  });
  
  return session;
};

/**
 * Get session by ID
 * @param {string} sessionId - Session ID
 * @returns {Object|null} Session data or null if not found
 */
export const getSession = (sessionId) => {
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return null;
  }
  
  // Check if session is expired
  if (new Date() > session.expiresAt) {
    activeSessions.delete(sessionId);
    return null;
  }
  
  // Update last activity
  session.lastActivity = new Date();
  
  return session;
};

/**
 * Update session data
 * @param {string} sessionId - Session ID
 * @param {Object} data - Data to update
 * @returns {boolean} Success status
 */
export const updateSession = (sessionId, data) => {
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return false;
  }
  
  // Check if session is expired
  if (new Date() > session.expiresAt) {
    activeSessions.delete(sessionId);
    return false;
  }
  
  // Update session data
  session.data = { ...session.data, ...data };
  session.lastActivity = new Date();
  
  return true;
};

/**
 * Destroy a session
 * @param {string} sessionId - Session ID
 * @returns {boolean} Success status
 */
export const destroySession = (sessionId) => {
  const session = activeSessions.get(sessionId);
  
  if (session) {
    logger.info(`Session destroyed for user: ${session.userId}`, {
      sessionId,
      ip: session.ip,
      userAgent: session.userAgent
    });
  }
  
  return activeSessions.delete(sessionId);
};

/**
 * Destroy all sessions for a user
 * @param {string} userId - User ID
 * @returns {number} Number of sessions destroyed
 */
export const destroyUserSessions = (userId) => {
  let destroyedCount = 0;
  
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.userId === userId) {
      activeSessions.delete(sessionId);
      destroyedCount++;
    }
  }
  
  logger.info(`Destroyed ${destroyedCount} sessions for user: ${userId}`);
  
  return destroyedCount;
};

/**
 * Get all active sessions for a user
 * @param {string} userId - User ID
 * @returns {Array} Array of active sessions
 */
export const getUserSessions = (userId) => {
  const userSessions = [];
  
  for (const session of activeSessions.values()) {
    if (session.userId === userId && session.isActive) {
      userSessions.push({
        id: session.id,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        ip: session.ip,
        userAgent: session.userAgent
      });
    }
  }
  
  return userSessions;
};

/**
 * Clean up expired sessions
 * @returns {number} Number of sessions cleaned up
 */
export const cleanupExpiredSessions = () => {
  const now = new Date();
  let cleanedCount = 0;
  
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now > session.expiresAt) {
      activeSessions.delete(sessionId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    logger.info(`Cleaned up ${cleanedCount} expired sessions`);
  }
  
  return cleanedCount;
};

/**
 * Generate a secure session ID
 * @returns {string} Session ID
 */
const generateSessionId = () => {
  return jwt.sign(
    { 
      timestamp: Date.now(),
      random: Math.random().toString(36).substring(2)
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

/**
 * Session middleware for Express
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
export const sessionMiddleware = (options = {}) => {
  const {
    maxSessionsPerUser = 5,
    sessionTimeout = 24 * 60 * 60 * 1000, // 24 hours
    cleanupInterval = 60 * 60 * 1000 // 1 hour
  } = options;
  
  // Set up periodic cleanup
  setInterval(cleanupExpiredSessions, cleanupInterval);
  
  return (req, res, next) => {
    // Extract session ID from cookies or headers
    const sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
    
    if (sessionId) {
      const session = getSession(sessionId);
      
      if (session) {
        req.session = session;
        
        // Check if user has too many sessions
        const userSessions = getUserSessions(session.userId);
        if (userSessions.length > maxSessionsPerUser) {
          // Remove oldest sessions
          const sortedSessions = userSessions.sort((a, b) => 
            new Date(a.lastActivity) - new Date(b.lastActivity)
          );
          
          const sessionsToRemove = sortedSessions.slice(0, userSessions.length - maxSessionsPerUser + 1);
          sessionsToRemove.forEach(s => destroySession(s.id));
        }
      } else {
        req.session = null;
      }
    } else {
      req.session = null;
    }
    
    next();
  };
};

/**
 * Require active session middleware
 * @returns {Function} Express middleware
 */
export const requireSession = (req, res, next) => {
  if (!req.session) {
    return res.status(401).json({
      success: false,
      error: 'Session required'
    });
  }
  
  next();
};

/**
 * Session security middleware
 * @returns {Function} Express middleware
 */
export const sessionSecurity = (req, res, next) => {
  if (req.session) {
    // Check for session hijacking indicators
    const currentIP = req.ip;
    const currentUserAgent = req.get('User-Agent');
    
    if (req.session.ip !== currentIP) {
      logger.warn(`Session IP mismatch for user: ${req.session.userId}`, {
        sessionId: req.session.id,
        originalIP: req.session.ip,
        currentIP,
        userAgent: currentUserAgent
      });
      
      // Destroy session for security
      destroySession(req.session.id);
      
      return res.status(401).json({
        success: false,
        error: 'Session security violation'
      });
    }
    
    // Update session with current request info
    updateSession(req.session.id, {
      lastIP: currentIP,
      lastUserAgent: currentUserAgent
    });
  }
  
  next();
};

/**
 * Session monitoring and analytics
 * @returns {Object} Session statistics
 */
export const getSessionStats = () => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  let totalSessions = 0;
  let activeSessions = 0;
  let expiredSessions = 0;
  let recentSessions = 0;
  let userCount = new Set();
  
  for (const session of activeSessions.values()) {
    totalSessions++;
    userCount.add(session.userId);
    
    if (session.isActive) {
      activeSessions++;
    }
    
    if (now > session.expiresAt) {
      expiredSessions++;
    }
    
    if (session.createdAt > oneHourAgo) {
      recentSessions++;
    }
  }
  
  return {
    totalSessions,
    activeSessions,
    expiredSessions,
    recentSessions,
    uniqueUsers: userCount.size,
    lastCleanup: new Date()
  };
};

export default {
  createSession,
  getSession,
  updateSession,
  destroySession,
  destroyUserSessions,
  getUserSessions,
  cleanupExpiredSessions,
  sessionMiddleware,
  requireSession,
  sessionSecurity,
  getSessionStats
};
