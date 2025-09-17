import crypto from 'crypto';
import { logger } from './logger.js';

/**
 * Fallback Two-Factor Authentication utilities
 * Basic TOTP implementation without external dependencies
 * Used when speakeasy and qrcode are not available
 */

/**
 * Generate a new 2FA secret for a user
 * @param {string} userEmail - User's email for identification
 * @returns {Object} Secret and QR code data
 */
export const generate2FASecret = (userEmail) => {
  try {
    // Generate a random base32 secret
    const secret = crypto.randomBytes(20).toString('base64').replace(/[+/=]/g, '');
    
    return {
      secret: secret,
      qrCodeUrl: `otpauth://totp/Seen%20Group%20(${encodeURIComponent(userEmail)})?secret=${secret}&issuer=Seen%20Group`,
      manualEntryKey: secret
    };
  } catch (error) {
    logger.error('Error generating 2FA secret:', error);
    throw new Error('Failed to generate 2FA secret');
  }
};

/**
 * Generate QR code for 2FA setup (fallback - returns URL)
 * @param {string} otpauthUrl - OTP auth URL
 * @returns {Promise<string>} QR code data URL (fallback to URL)
 */
export const generateQRCode = async (otpauthUrl) => {
  try {
    // Fallback: return a simple text-based QR code representation
    // In production, you might want to use a different QR code service
    return `data:text/plain;base64,${Buffer.from(`QR Code for: ${otpauthUrl}`).toString('base64')}`;
  } catch (error) {
    logger.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
};

/**
 * Basic TOTP token verification
 * @param {string} token - The token to verify
 * @param {string} secret - The user's 2FA secret
 * @param {number} window - Time window for verification (default: 1)
 * @returns {boolean} True if token is valid
 */
export const verify2FAToken = (token, secret, window = 1) => {
  try {
    // Basic TOTP implementation
    const timeStep = 30; // 30 seconds
    const currentTime = Math.floor(Date.now() / 1000);
    const timeCounter = Math.floor(currentTime / timeStep);
    
    // Generate tokens for current and previous/next time windows
    for (let i = -window; i <= window; i++) {
      const testTime = timeCounter + i;
      const expectedToken = generateTOTP(secret, testTime);
      if (expectedToken === token) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    logger.error('Error verifying 2FA token:', error);
    return false;
  }
};

/**
 * Generate TOTP token for given time
 * @param {string} secret - Base32 secret
 * @param {number} timeCounter - Time counter
 * @returns {string} 6-digit token
 */
const generateTOTP = (secret, timeCounter) => {
  // Convert base32 to buffer
  const key = base32Decode(secret);
  
  // Create HMAC-SHA1
  const hmac = crypto.createHmac('sha1', key);
  hmac.update(Buffer.alloc(8));
  hmac.writeUInt32BE(timeCounter, 4);
  const hash = hmac.digest();
  
  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0xf;
  const code = ((hash[offset] & 0x7f) << 24) |
              ((hash[offset + 1] & 0xff) << 16) |
              ((hash[offset + 2] & 0xff) << 8) |
              (hash[offset + 3] & 0xff);
  
  return (code % 1000000).toString().padStart(6, '0');
};

/**
 * Base32 decode function
 * @param {string} str - Base32 string
 * @returns {Buffer} Decoded buffer
 */
const base32Decode = (str) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const padding = '=';
  
  str = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  
  let bits = 0;
  let value = 0;
  let index = 0;
  const output = [];
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === padding) break;
    
    const charIndex = alphabet.indexOf(char);
    if (charIndex === -1) continue;
    
    value = (value << 5) | charIndex;
    bits += 5;
    
    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  
  return Buffer.from(output);
};

/**
 * Generate backup codes for 2FA
 * @param {number} count - Number of backup codes to generate (default: 10)
 * @returns {Array<string>} Array of backup codes
 */
export const generateBackupCodes = (count = 10) => {
  const codes = [];
  
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  
  return codes;
};

/**
 * Verify a backup code
 * @param {string} code - The backup code to verify
 * @param {Array<string>} backupCodes - Array of valid backup codes
 * @returns {Object} Verification result
 */
export const verifyBackupCode = (code, backupCodes) => {
  try {
    if (!Array.isArray(backupCodes)) {
      return { valid: false, error: 'Invalid backup codes format' };
    }
    
    const normalizedCode = code.toUpperCase().trim();
    const index = backupCodes.indexOf(normalizedCode);
    
    if (index === -1) {
      return { valid: false, error: 'Invalid backup code' };
    }
    
    // Remove used backup code
    backupCodes.splice(index, 1);
    
    return { 
      valid: true, 
      remainingCodes: backupCodes.length,
      updatedBackupCodes: backupCodes
    };
  } catch (error) {
    logger.error('Error verifying backup code:', error);
    return { valid: false, error: 'Failed to verify backup code' };
  }
};

/**
 * Check if 2FA is properly configured for a user
 * @param {Object} user - User object from database
 * @returns {boolean} True if 2FA is configured
 */
export const is2FAConfigured = (user) => {
  return !!(user.twoFactorEnabled && user.twoFactorSecret);
};

/**
 * Generate recovery codes for 2FA
 * @param {number} count - Number of recovery codes (default: 8)
 * @returns {Array<string>} Array of recovery codes
 */
export const generateRecoveryCodes = (count = 8) => {
  const codes = [];
  
  for (let i = 0; i < count; i++) {
    // Generate 12-character alphanumeric code with dashes for readability
    const part1 = crypto.randomBytes(3).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(3).toString('hex').toUpperCase();
    const part3 = crypto.randomBytes(3).toString('hex').toUpperCase();
    codes.push(`${part1}-${part2}-${part3}`);
  }
  
  return codes;
};

/**
 * Verify a recovery code
 * @param {string} code - The recovery code to verify
 * @param {Array<string>} recoveryCodes - Array of valid recovery codes
 * @returns {Object} Verification result
 */
export const verifyRecoveryCode = (code, recoveryCodes) => {
  try {
    if (!Array.isArray(recoveryCodes)) {
      return { valid: false, error: 'Invalid recovery codes format' };
    }
    
    const normalizedCode = code.toUpperCase().trim();
    const index = recoveryCodes.indexOf(normalizedCode);
    
    if (index === -1) {
      return { valid: false, error: 'Invalid recovery code' };
    }
    
    // Remove used recovery code
    recoveryCodes.splice(index, 1);
    
    return { 
      valid: true, 
      remainingCodes: recoveryCodes.length,
      updatedRecoveryCodes: recoveryCodes
    };
  } catch (error) {
    logger.error('Error verifying recovery code:', error);
    return { valid: false, error: 'Failed to verify recovery code' };
  }
};

/**
 * Get time remaining until next TOTP token
 * @returns {number} Seconds until next token
 */
export const getTimeRemaining = () => {
  const epoch = Math.round(new Date().getTime() / 1000.0);
  const timeStep = 30; // 30 seconds
  return timeStep - (epoch % timeStep);
};

/**
 * Validate 2FA setup data
 * @param {Object} setupData - 2FA setup data
 * @returns {Object} Validation result
 */
export const validate2FASetup = (setupData) => {
  const errors = [];
  
  if (!setupData.secret) {
    errors.push('2FA secret is required');
  }
  
  if (!setupData.token) {
    errors.push('Verification token is required');
  }
  
  if (setupData.token && setupData.secret) {
    if (!verify2FAToken(setupData.token, setupData.secret)) {
      errors.push('Invalid verification token');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export default {
  generate2FASecret,
  generateQRCode,
  verify2FAToken,
  generateBackupCodes,
  verifyBackupCode,
  is2FAConfigured,
  generateRecoveryCodes,
  verifyRecoveryCode,
  getTimeRemaining,
  validate2FASetup
};
