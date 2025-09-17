import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import prisma from '../config/database.js';
import { passwordPolicyValidation, passwordPolicies, generatePasswordSuggestions } from '../middleware/passwordPolicy.js';
import { sanitizeEmail, sanitizeText, sanitizeUserData } from '../utils/sanitizer-fallback.js';
import { hashPassword } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting for user management operations
const userManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 operations per window
  message: {
    success: false,
    error: 'Too many user management operations, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
router.use(userManagementLimiter);

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin only)
router.get('/', protect, authorize('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search = '', role = '', isActive = '' } = req.query;
  
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;
  
  // Build where clause
  const where = {};
  
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }
    ];
  }
  
  if (role) {
    where.role = role;
  }
  
  if (isActive !== '') {
    where.isActive = isActive === 'true';
  }
  
  // Get users with pagination
  const [users, total] = await Promise.all([
    prisma.users.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        loginAttempts: true,
        lockedUntil: true
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limitNum
    }),
    prisma.users.count({ where })
  ]);
  
  res.status(200).json({
    success: true,
    data: {
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    }
  });
}));

// @desc    Get user by ID
// @route   GET /api/admin/users/:id
// @access  Private (Admin only)
router.get('/:id', protect, authorize('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const user = await prisma.users.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      loginAttempts: true,
      lockedUntil: true,
      twoFactorEnabled: true
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
    data: { user }
  });
}));

// @desc    Create new user
// @route   POST /api/admin/users
// @access  Private (Admin only)
router.post('/', protect, authorize('ADMIN', 'SUPER_ADMIN'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').isIn(['USER', 'ADMIN', 'SUPER_ADMIN']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
], passwordPolicyValidation(passwordPolicies.admin), asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  
  const { name, email, password, role, isActive = true } = req.body;
  
  try {
    // Sanitize input data
    const sanitizedData = sanitizeUserData({ name, email, role, isActive });
    
    // Check if user already exists
    const existingUser = await prisma.users.findUnique({
      where: { email: sanitizedData.email }
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user
    const user = await prisma.users.create({
      data: {
        name: sanitizedData.name,
        email: sanitizedData.email,
        password: hashedPassword,
        role: sanitizedData.role,
        isActive: sanitizedData.isActive,
        backupCodes: JSON.stringify([]) // Empty backup codes initially
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    logger.info(`User created: ${user.email} by admin: ${req.user.email}`);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user }
    });
    
  } catch (error) {
    logger.error('User creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create user'
    });
  }
}));

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private (Admin only)
router.put('/:id', protect, authorize('ADMIN', 'SUPER_ADMIN'), [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('email').optional().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('role').optional().isIn(['USER', 'ADMIN', 'SUPER_ADMIN']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  
  const { id } = req.params;
  const { name, email, role, isActive } = req.body;
  
  try {
    // Check if user exists
    const existingUser = await prisma.users.findUnique({
      where: { id }
    });
    
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Sanitize input data
    const sanitizedData = sanitizeUserData({ name, email, role, isActive });
    
    // Check if email is already taken by another user
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.users.findUnique({
        where: { email: sanitizedData.email }
      });
      
      if (emailExists) {
        return res.status(400).json({
          success: false,
          error: 'Email is already taken by another user'
        });
      }
    }
    
    // Update user
    const user = await prisma.users.update({
      where: { id },
      data: {
        ...(name && { name: sanitizedData.name }),
        ...(email && { email: sanitizedData.email }),
        ...(role && { role: sanitizedData.role }),
        ...(isActive !== undefined && { isActive: sanitizedData.isActive })
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    logger.info(`User updated: ${user.email} by admin: ${req.user.email}`);
    
    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });
    
  } catch (error) {
    logger.error('User update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
}));

// @desc    Change user password
// @route   PUT /api/admin/users/:id/password
// @access  Private (Admin only)
router.put('/:id/password', protect, authorize('ADMIN', 'SUPER_ADMIN'), [
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], passwordPolicyValidation(passwordPolicies.admin), asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  
  const { id } = req.params;
  const { password } = req.body;
  
  try {
    // Check if user exists
    const user = await prisma.users.findUnique({
      where: { id }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Hash new password
    const hashedPassword = await hashPassword(password);
    
    // Update password
    await prisma.users.update({
      where: { id },
      data: {
        password: hashedPassword,
        loginAttempts: 0, // Reset login attempts
        lockedUntil: null // Unlock account
      }
    });
    
    logger.info(`Password changed for user: ${user.email} by admin: ${req.user.email}`);
    
    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
    
  } catch (error) {
    logger.error('Password change error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update password'
    });
  }
}));

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Super Admin only)
router.delete('/:id', protect, authorize('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if user exists
    const user = await prisma.users.findUnique({
      where: { id }
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Prevent self-deletion
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }
    
    // Delete user
    await prisma.users.delete({
      where: { id }
    });
    
    logger.info(`User deleted: ${user.email} by admin: ${req.user.email}`);
    
    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
    
  } catch (error) {
    logger.error('User deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
}));

// @desc    Generate password suggestions
// @route   GET /api/admin/users/password-suggestions
// @access  Private (Admin only)
router.get('/password-suggestions', protect, authorize('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const { length = 12 } = req.query;
  const lengthNum = parseInt(length);
  
  if (lengthNum < 8 || lengthNum > 128) {
    return res.status(400).json({
      success: false,
      error: 'Password length must be between 8 and 128 characters'
    });
  }
  
  const suggestions = generatePasswordSuggestions(lengthNum);
  
  res.status(200).json({
    success: true,
    data: { suggestions }
  });
}));

export default router;
