import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { logger } from './logger.js';

/**
 * Two-Factor Authentication utilities
 * Provides TOTP (Time-based One-Time Password) functionality
 */

/**
 * Generate a new 2FA secret for a user
 * @param {string} userEmail - User's email for identification
 * @returns {Object} Secret and QR code data
 */
export const generate2FASecret = (userEmail) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `Seen Group (${userEmail})`,
      issuer: 'Seen Group',
      length: 32
    });
    
    return {
      secret: secret.base32,
      qrCodeUrl: secret.otpauth_url,
      manualEntryKey: secret.base32
    };
  } catch (error) {
    logger.error('Error generating 2FA secret:', error);
    throw new Error('Failed to generate 2FA secret');
  }
};

/**
 * Generate QR code for 2FA setup
 * @param {string} otpauthUrl - OTP auth URL
 * @returns {Promise<string>} QR code data URL
 */
export const generateQRCode = async (otpauthUrl) => {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    return qrCodeDataUrl;
  } catch (error) {
    logger.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
};

/**
 * Verify a TOTP token
 * @param {string} token - The token to verify
 * @param {string} secret - The user's 2FA secret
 * @param {number} window - Time window for verification (default: 1)
 * @returns {boolean} True if token is valid
 */
export const verify2FAToken = (token, secret, window = 1) => {
  try {
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window
    });
    
    return verified;
  } catch (error) {
    logger.error('Error verifying 2FA token:', error);
    return false;
  }
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
