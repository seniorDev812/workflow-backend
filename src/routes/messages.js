import express from 'express';
import { body, validationResult, query } from 'express-validator';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import prisma from '../config/database.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Public routes - Submit contact message
router.post('/', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('subject').optional().trim().isString().withMessage('Subject must be a string'),
  body('message').trim().notEmpty().withMessage('Message is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { name, email, subject, message } = req.body;

  try {
    // Create message
    const newMessage = await prisma.Message.create({
      data: {
        name,
        email,
        subject: subject || 'Contact Form Submission',
        message
      }
    });

    logger.info(`New message received from: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        id: newMessage.id,
        name: newMessage.name,
        email: newMessage.email,
        subject: newMessage.subject,
        createdAt: newMessage.createdAt
      }
    });
  } catch (error) {
    logger.error('Message creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
}));

// Protected routes - Admin only
router.use(protect);
router.use(authorize('ADMIN'));

// Get all messages with filtering and pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('read').optional().isBoolean().withMessage('Read filter must be a boolean'),
  query('search').optional().isString().withMessage('Search must be a string'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { page = 1, limit = 10, read, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Build where clause
    const where = {
      ...(read !== undefined && { read: read === 'true' }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } },
          { message: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    // Get messages with pagination
    const [messages, total] = await Promise.all([
      prisma.Message.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
              prisma.Message.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.status(200).json({
      success: true,
      data: messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    logger.error('Messages fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages'
    });
  }
}));

// Get single message by ID
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const message = await prisma.Message.findUnique({
      where: { id }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    res.status(200).json({
      success: true,
      data: message
    });
  } catch (error) {
    logger.error('Message fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch message'
    });
  }
}));

// Mark message as read
router.patch('/:id/read', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const message = await prisma.Message.findUnique({
      where: { id }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    const updatedMessage = await prisma.Message.update({
      where: { id },
      data: { read: true }
    });

    logger.info(`Message marked as read: ${id} by admin: ${req.user.email}`);

    res.status(200).json({
      success: true,
      data: updatedMessage,
      message: 'Message marked as read'
    });
  } catch (error) {
    logger.error('Message read update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update message'
    });
  }
}));

// Mark message as unread
router.patch('/:id/unread', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const message = await prisma.Message.findUnique({
      where: { id }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    const updatedMessage = await prisma.Message.update({
      where: { id },
      data: { read: false }
    });

    logger.info(`Message marked as unread: ${id} by admin: ${req.user.email}`);

    res.status(200).json({
      success: true,
      data: updatedMessage,
      message: 'Message marked as unread'
    });
  } catch (error) {
    logger.error('Message unread update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update message'
    });
  }
}));

// Delete message
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const message = await prisma.message.findUnique({
      where: { id }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    await prisma.message.delete({
      where: { id }
    });

    logger.info(`Message deleted: ${id} by admin: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    logger.error('Message deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete message'
    });
  }
}));

export default router;
