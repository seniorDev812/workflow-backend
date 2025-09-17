import { validatePasswordStrength } from '../utils/sanitizer-fallback.js';
import { logger } from '../utils/logger.js';

/**
 * Password policy enforcement middleware
 * Ensures all passwords meet security requirements
 */

// Password history tracking (in production, this should be stored in database)
const passwordHistory = new Map();

/**
 * Check if password has been used recently
 * @param {string} userId - User ID
 * @param {string} password - Password to check
 * @param {number} historyCount - Number of recent passwords to check
 * @returns {boolean} True if password is not in recent history
 */
const isPasswordNotInHistory = (userId, password, historyCount = 5) => {
  const userHistory = passwordHistory.get(userId) || [];
  
  // Check against recent passwords
  for (let i = 0; i < Math.min(historyCount, userHistory.length); i++) {
    if (userHistory[i] === password) {
      return false;
    }
  }
  
  return true;
};

/**
 * Add password to history
 * @param {string} userId - User ID
 * @param {string} password - Password to add
 * @param {number} maxHistory - Maximum history to keep
 */
const addPasswordToHistory = (userId, password, maxHistory = 10) => {
  const userHistory = passwordHistory.get(userId) || [];
  
  // Add new password to front of array
  userHistory.unshift(password);
  
  // Keep only the most recent passwords
  if (userHistory.length > maxHistory) {
    userHistory.splice(maxHistory);
  }
  
  passwordHistory.set(userId, userHistory);
};

/**
 * Password policy validation middleware
 * @param {Object} options - Validation options
 * @returns {Function} Express middleware function
 */
export const passwordPolicyValidation = (options = {}) => {
  const {
    minLength = 8,
    maxLength = 128,
    requireUppercase = true,
    requireLowercase = true,
    requireNumbers = true,
    requireSpecialChars = true,
    checkHistory = true,
    historyCount = 5,
    customRules = []
  } = options;

  return (req, res, next) => {
    const { password, userId } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Password is required'
      });
    }

    // Validate password strength
    const validation = validatePasswordStrength(password);
    
    if (!validation.isValid) {
      logger.warn('Password policy violation', {
        userId: userId || 'unknown',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        errors: validation.errors
      });

      return res.status(400).json({
        success: false,
        error: 'Password does not meet security requirements',
        details: validation.errors,
        strength: validation.strength
      });
    }

    // Check password history if user ID provided
    if (checkHistory && userId) {
      if (!isPasswordNotInHistory(userId, password, historyCount)) {
        logger.warn('Password reuse attempt', {
          userId,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });

        return res.status(400).json({
          success: false,
          error: `Password cannot be one of your last ${historyCount} passwords`
        });
      }
    }

    // Apply custom rules
    for (const rule of customRules) {
      if (typeof rule === 'function') {
        const result = rule(password, req);
        if (result !== true) {
          return res.status(400).json({
            success: false,
            error: result || 'Password does not meet custom requirements'
          });
        }
      }
    }

    // Add password to history if user ID provided
    if (userId) {
      addPasswordToHistory(userId, password);
    }

    next();
  };
};

/**
 * Password strength indicator
 * @param {string} password - Password to analyze
 * @returns {Object} Strength analysis
 */
export const getPasswordStrength = (password) => {
  return validatePasswordStrength(password);
};

/**
 * Generate secure password suggestions
 * @param {number} length - Desired password length
 * @returns {Array} Array of password suggestions
 */
export const generatePasswordSuggestions = (length = 12) => {
  const suggestions = [];
  
  for (let i = 0; i < 3; i++) {
    const password = generateSecurePassword(length);
    suggestions.push({
      password,
      strength: validatePasswordStrength(password).strength
    });
  }
  
  return suggestions;
};

/**
 * Generate a secure password
 * @param {number} length - Password length
 * @returns {string} Generated password
 */
const generateSecurePassword = (length = 12) => {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const allChars = lowercase + uppercase + numbers + special;
  
  let password = '';
  
  // Ensure at least one character from each category
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest with random characters
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Password policy configuration for different user types
 */
export const passwordPolicies = {
  // Standard user password policy
  user: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    checkHistory: true,
    historyCount: 5
  },
  
  // Admin password policy (stricter)
  admin: {
    minLength: 12,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    checkHistory: true,
    historyCount: 10,
    customRules: [
      // No common admin patterns
      (password) => {
        const adminPatterns = ['admin', 'password', 'root', 'administrator'];
        const hasAdminPattern = adminPatterns.some(pattern => 
          password.toLowerCase().includes(pattern)
        );
        return !hasAdminPattern || 'Password cannot contain common admin patterns';
      }
    ]
  },
  
  // Super admin password policy (most strict)
  superAdmin: {
    minLength: 16,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    checkHistory: true,
    historyCount: 15,
    customRules: [
      // No common patterns
      (password) => {
        const commonPatterns = ['admin', 'password', 'root', 'administrator', 'super', 'master'];
        const hasCommonPattern = commonPatterns.some(pattern => 
          password.toLowerCase().includes(pattern)
        );
        return !hasCommonPattern || 'Password cannot contain common patterns';
      },
      // Must have at least 2 special characters
      (password) => {
        const specialCharCount = (password.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length;
        return specialCharCount >= 2 || 'Password must contain at least 2 special characters';
      }
    ]
  }
};

export default {
  passwordPolicyValidation,
  getPasswordStrength,
  generatePasswordSuggestions,
  passwordPolicies
};
