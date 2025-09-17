import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import prisma from '../config/database.js';
import { 
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
} from '../utils/twoFactor-fallback.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for 2FA operations
const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: {
    success: false,
    error: 'Too many 2FA attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
router.use(twoFactorLimiter);

// @desc    Get 2FA status
// @route   GET /api/2fa/status
// @access  Private
router.get('/status', protect, asyncHandler(async (req, res) => {
  const user = await prisma.users.findUnique({
    where: { id: req.user.id },
    select: {
      twoFactorEnabled: true,
      twoFactorSecret: true
    }
  });
  
  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }
  
  res.status(200).json({
    success: true,
    data: {
      enabled: user.twoFactorEnabled,
      configured: is2FAConfigured(user),
      timeRemaining: getTimeRemaining()
    }
  });
}));

// @desc    Start 2FA setup
// @route   POST /api/2fa/setup
// @access  Private
router.post('/setup', protect, asyncHandler(async (req, res) => {
  try {
    // Check if 2FA is already enabled
    const user = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: { twoFactorEnabled: true }
    });
    
    if (user?.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        error: '2FA is already enabled for this account'
      });
    }
    
    // Generate new 2FA secret
    const secretData = generate2FASecret(req.user.email);
    
    // Generate QR code
    const qrCodeUrl = await generateQRCode(secretData.qrCodeUrl);
    
    // Store temporary secret in database (will be confirmed later)
    await prisma.users.update({
      where: { id: req.user.id },
      data: {
        twoFactorSecret: secretData.secret
      }
    });
    
    res.status(200).json({
      success: true,
      data: {
        secret: secretData.secret,
        qrCode: qrCodeUrl,
        manualEntryKey: secretData.manualEntryKey,
        timeRemaining: getTimeRemaining()
      }
    });
    
  } catch (error) {
    logger.error('2FA setup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start 2FA setup'
    });
  }
}));

// @desc    Verify and enable 2FA
// @route   POST /api/2fa/verify
// @access  Private
router.post('/verify', protect, [
  body('token').isLength({ min: 6, max: 6 }).withMessage('Token must be 6 digits'),
  body('token').isNumeric().withMessage('Token must contain only numbers')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  
  const { token } = req.body;
  
  try {
    // Get user with current secret
    const user = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        error: '2FA is already enabled'
      });
    }
    
    if (!user.twoFactorSecret) {
      return res.status(400).json({
        success: false,
        error: 'No 2FA secret found. Please start 2FA setup first.'
      });
    }
    
    // Verify the token
    const isValid = verify2FAToken(token, user.twoFactorSecret);
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification token'
      });
    }
    
    // Generate backup codes
    const backupCodes = generateBackupCodes();
    const recoveryCodes = generateRecoveryCodes();
    
    // Enable 2FA and store backup codes
    await prisma.users.update({
      where: { id: req.user.id },
      data: {
        twoFactorEnabled: true,
        backupCodes: JSON.stringify(backupCodes)
      }
    });
    
    logger.info(`2FA enabled for user: ${req.user.email}`);
    
    res.status(200).json({
      success: true,
      message: '2FA has been enabled successfully',
      data: {
        backupCodes,
        recoveryCodes,
        timeRemaining: getTimeRemaining()
      }
    });
    
  } catch (error) {
    logger.error('2FA verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify 2FA token'
    });
  }
}));

// @desc    Disable 2FA
// @route   POST /api/2fa/disable
// @access  Private
router.post('/disable', protect, [
  body('token').isLength({ min: 6, max: 6 }).withMessage('Token must be 6 digits'),
  body('token').isNumeric().withMessage('Token must contain only numbers')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  
  const { token } = req.body;
  
  try {
    // Get user
    const user = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: { 
        twoFactorEnabled: true, 
        twoFactorSecret: true,
        backupCodes: true
      }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (!user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        error: '2FA is not enabled for this account'
      });
    }
    
    // Verify token or backup code
    let isValid = false;
    let updatedBackupCodes = null;
    
    // First try TOTP token
    if (user.twoFactorSecret) {
      isValid = verify2FAToken(token, user.twoFactorSecret);
    }
    
    // If TOTP fails, try backup codes
    if (!isValid && user.backupCodes) {
      try {
        const backupCodes = JSON.parse(user.backupCodes);
        const backupResult = verifyBackupCode(token, backupCodes);
        if (backupResult.valid) {
          isValid = true;
          updatedBackupCodes = backupResult.updatedBackupCodes;
        }
      } catch (error) {
        logger.warn('Error checking backup codes:', error);
      }
    }
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token or backup code'
      });
    }
    
    // Disable 2FA
    await prisma.users.update({
      where: { id: req.user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        backupCodes: updatedBackupCodes ? JSON.stringify(updatedBackupCodes) : null
      }
    });
    
    logger.info(`2FA disabled for user: ${req.user.email}`);
    
    res.status(200).json({
      success: true,
      message: '2FA has been disabled successfully'
    });
    
  } catch (error) {
    logger.error('2FA disable error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable 2FA'
    });
  }
}));

// @desc    Verify 2FA token for login
// @route   POST /api/2fa/verify-login
// @access  Public (but requires valid session)
router.post('/verify-login', [
  body('token').isLength({ min: 6, max: 6 }).withMessage('Token must be 6 digits'),
  body('token').isNumeric().withMessage('Token must contain only numbers'),
  body('userId').notEmpty().withMessage('User ID is required')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  
  const { token, userId } = req.body;
  
  try {
    // Get user
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { 
        twoFactorEnabled: true, 
        twoFactorSecret: true,
        backupCodes: true,
        email: true
      }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (!user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        error: '2FA is not enabled for this account'
      });
    }
    
    // Verify token or backup code
    let isValid = false;
    let updatedBackupCodes = null;
    
    // First try TOTP token
    if (user.twoFactorSecret) {
      isValid = verify2FAToken(token, user.twoFactorSecret);
    }
    
    // If TOTP fails, try backup codes
    if (!isValid && user.backupCodes) {
      try {
        const backupCodes = JSON.parse(user.backupCodes);
        const backupResult = verifyBackupCode(token, backupCodes);
        if (backupResult.valid) {
          isValid = true;
          updatedBackupCodes = backupResult.updatedBackupCodes;
          
          // Update backup codes in database
          await prisma.users.update({
            where: { id: userId },
            data: {
              backupCodes: JSON.stringify(updatedBackupCodes)
            }
          });
        }
      } catch (error) {
        logger.warn('Error checking backup codes:', error);
      }
    }
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid 2FA token or backup code'
      });
    }
    
    logger.info(`2FA login verified for user: ${user.email}`);
    
    res.status(200).json({
      success: true,
      message: '2FA verification successful'
    });
    
  } catch (error) {
    logger.error('2FA login verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify 2FA token'
    });
  }
}));

// @desc    Get backup codes
// @route   GET /api/2fa/backup-codes
// @access  Private
router.get('/backup-codes', protect, asyncHandler(async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: { backupCodes: true, twoFactorEnabled: true }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (!user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        error: '2FA is not enabled for this account'
      });
    }
    
    const backupCodes = user.backupCodes ? JSON.parse(user.backupCodes) : [];
    
    res.status(200).json({
      success: true,
      data: {
        backupCodes,
        count: backupCodes.length
      }
    });
    
  } catch (error) {
    logger.error('Get backup codes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve backup codes'
    });
  }
}));

// @desc    Regenerate backup codes
// @route   POST /api/2fa/regenerate-backup-codes
// @access  Private
router.post('/regenerate-backup-codes', protect, [
  body('token').isLength({ min: 6, max: 6 }).withMessage('Token must be 6 digits'),
  body('token').isNumeric().withMessage('Token must contain only numbers')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  
  const { token } = req.body;
  
  try {
    // Get user
    const user = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: { 
        twoFactorEnabled: true, 
        twoFactorSecret: true
      }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (!user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        error: '2FA is not enabled for this account'
      });
    }
    
    // Verify current token
    const isValid = verify2FAToken(token, user.twoFactorSecret);
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification token'
      });
    }
    
    // Generate new backup codes
    const newBackupCodes = generateBackupCodes();
    
    // Update backup codes in database
    await prisma.users.update({
      where: { id: req.user.id },
      data: {
        backupCodes: JSON.stringify(newBackupCodes)
      }
    });
    
    logger.info(`Backup codes regenerated for user: ${req.user.email}`);
    
    res.status(200).json({
      success: true,
      message: 'Backup codes regenerated successfully',
      data: {
        backupCodes: newBackupCodes
      }
    });
    
  } catch (error) {
    logger.error('Regenerate backup codes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate backup codes'
    });
  }
}));

export default router;
