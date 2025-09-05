import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import prisma from '../config/database.js';

const router = express.Router();

// Submit contact form with product requirements
router.post('/', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('company').trim().notEmpty().withMessage('Company name is required'),
  body('country').trim().notEmpty().withMessage('Country is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('requirements').isJSON().withMessage('Requirements must be valid JSON'),
  body('productContext').optional().isJSON().withMessage('Product context must be valid JSON'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { 
    firstName, 
    lastName, 
    company, 
    country, 
    phone, 
    email, 
    requirements, 
    productContext 
  } = req.body;
  console.log(req.body);
  try {
    // Parse requirements and product context
    let parsedRequirements = [];
    let parsedProductContext = null;

    try {
      parsedRequirements = JSON.parse(requirements);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid requirements format'
      });
    }

    if (productContext) {
      try {
        parsedProductContext = JSON.parse(productContext);
      } catch (error) {
        logger.warn('Invalid product context format:', error);
      }
    }

    // Validate requirements structure
    if (!Array.isArray(parsedRequirements) || parsedRequirements.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one product requirement is required'
      });
    }
    
    // Save the contact submission to database
    const newSubmission = await prisma.contact_submissions.create({
      data: {
        firstName,
        lastName,
        company,
        country,
        phone,
        email,
        requirements: parsedRequirements,
        productContext: parsedProductContext
      }
    });
     
    // Log the contact submission
    logger.info(`New contact form submission from: ${email}`, {
      contact: { firstName, lastName, company, country, phone, email },
      requirements: parsedRequirements,
      productContext: parsedProductContext,
      submissionId: newSubmission.id
    });

    res.status(201).json({
      success: true,
      message: 'Your request has been submitted successfully. We will contact you within 24 hours.',
      data: {
        id: newSubmission.id,
        submittedAt: newSubmission.createdAt
      }
    });

  } catch (error) {
    logger.error('Contact form submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit contact form. Please try again later.'
    });
  }
}));

// Get all contact submissions (admin only)
router.get('/submissions', protect, authorize('ADMIN'), asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 10, status, read, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const where = {
      ...(status && { status }),
      ...(read !== undefined && { read: read === 'true' }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
          { country: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    // Get submissions with pagination
    const [submissions, total] = await Promise.all([
      prisma.contact_submissions.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
        include: {
          users: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }),
              prisma.contact_submissions.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        submissions,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('Contact submissions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get contact submissions'
    });
  }
}));

// Get contact form statistics (admin only)
router.get('/stats', protect, authorize('ADMIN'), asyncHandler(async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [totalSubmissions, recentSubmissions, countryStats, statusStats] = await Promise.all([
      prisma.contact_submissions.count(),
      prisma.contact_submissions.count({
        where: {
          createdAt: {
            gte: weekAgo
          }
        }
      }),
      // Get country statistics grouped by country
      prisma.contact_submissions.groupBy({
        by: ['country'],
        _count: {
          country: true
        },
        orderBy: {
          _count: {
            country: 'desc'
          }
        }
      }),
      prisma.contact_submissions.groupBy({
        by: ['status'],
        _count: {
          status: true
        },
        orderBy: {
          _count: {
            status: 'desc'
          }
        }
      })
    ]);

    // Convert country stats to object format
    const countryStatsObj = {};
    countryStats.forEach(stat => {
      countryStatsObj[stat.country] = stat._count.country;
    });

    // Convert status stats to object format
    const statusStatsObj = {};
    statusStats.forEach(stat => {
      statusStatsObj[stat.status] = stat._count.status;
    });

    res.json({
      success: true,
      data: {
        totalSubmissions,
        recentSubmissions,
        countryStats: countryStatsObj,
        statusStats: statusStatsObj
      }
    });

  } catch (error) {
    logger.error('Contact stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get contact statistics'
    });
  }
}));

// Get a single contact submission by ID
router.get('/submissions/:id', protect, authorize('ADMIN'), asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const submission = await prisma.contact_submissions.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Contact submission not found'
      });
    }

    res.json({
      success: true,
      data: submission
    });

  } catch (error) {
    logger.error('Contact submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get contact submission'
    });
  }
}));

// Update contact submission status
router.patch('/submissions/:id', protect, authorize('ADMIN'), [
  body('status').optional().isIn(['NEW', 'PROCESSING', 'CONTACTED', 'CLOSED']),
  body('read').optional().isBoolean(),
  body('notes').optional().isString()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  try {
    const { id } = req.params;
    const { status, read, notes } = req.body;

    const submission = await prisma.contact_submissions.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(read !== undefined && { read }),
        ...(notes && { notes })
      }
    });

    res.json({
      success: true,
      data: submission
    });

  } catch (error) {
    logger.error('Contact submission update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update contact submission'
    });
  }
}));

// Delete contact submission
router.delete('/submissions/:id', protect, authorize('ADMIN'), asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const submission = await prisma.contact_submissions.findUnique({
      where: { id }
    });

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Contact submission not found'
      });
    }

          await prisma.contact_submissions.delete({
      where: { id }
    });

    logger.info(`Contact submission deleted: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Contact submission deleted successfully'
    });

  } catch (error) {
    logger.error('Contact submission deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete contact submission'
    });
  }
}));

// Bulk delete contact submissions
router.delete('/submissions/bulk', protect, authorize('ADMIN'), asyncHandler(async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Submission IDs array is required'
      });
    }

    // Delete multiple submissions
    const result = await prisma.contact_submissions.deleteMany({
      where: { id: { in: ids } }
    });

    logger.info(`Bulk deleted ${result.count} contact submissions`);

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.count} submissions`
    });

  } catch (error) {
    logger.error('Bulk deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete submissions'
    });
  }
}));

export default router;
