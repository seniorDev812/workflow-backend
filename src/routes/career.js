import express from 'express';
import { body, validationResult, query } from 'express-validator';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import prisma from '../config/database.js';
import { logger } from '../utils/logger.js';
import { uploadResume, handleResumeUploadError } from '../middleware/resumeUpload.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Simple in-memory cache for job listings
const jobCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Smart cache invalidation - only clear job-related entries
const invalidateJobCache = () => {
  const beforeSize = jobCache.size;
  // Only clear entries that contain job data, keep other cached data
  for (const [key, value] of jobCache.entries()) {
    if (key.includes('jobs-') || key.includes('career-')) {
      jobCache.delete(key);
    }
  }
  const afterSize = jobCache.size;
  logger.info(`Job cache invalidated. Cleared ${beforeSize - afterSize} job-related entries.`);
};

// Public routes - Get all active jobs with caching
router.get('/jobs', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('type').optional().isString().withMessage('Job type must be a string'),
  query('location').optional().isString().withMessage('Location must be a string'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { page = 1, limit = 10, search, type, location } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Generate cache key
  const cacheKey = `jobs-${page}-${limit}-${search || ''}-${type || ''}-${location || ''}`;
  
  // Check cache first
  const cached = jobCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    logger.info(`Serving jobs from cache for key: ${cacheKey}`);
    return res.status(200).json(cached.data);
  }

  try {
    // Build where clause
    const where = {
      isActive: true,
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { requirements: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(type && { type }),
      ...(location && { location: { contains: location, mode: 'insensitive' } })
    };

    // Get jobs with pagination
    const [jobs, total] = await Promise.all([
      prisma.jobs.findMany({
        where,
        include: {
          _count: {
            select: {
              career_applications: true
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.jobs.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    // Parse JSON strings back to arrays for response
    const transformedJobs = jobs.map(job => ({
      ...job,
      skills: job.skills ? JSON.parse(job.skills) : [],
      benefits: job.benefits ? JSON.parse(job.benefits) : []
    }));

    const response = {
      success: true,
      data: transformedJobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    };

    // Cache the response
    jobCache.set(cacheKey, {
      data: response,
      timestamp: Date.now()
    });

    // Clean up old cache entries
    const now = Date.now();
    for (const [key, value] of jobCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        jobCache.delete(key);
      }
    }

    res.status(200).json(response);
  } catch (error) {
    logger.error('Jobs fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch jobs'
    });
  }
}));

// Get single job by ID
router.get('/jobs/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const job = await prisma.jobs.findUnique({
      where: { id },
      include: {
        career_applications: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            career_applications: true
          }
        }
      }
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Parse JSON strings back to arrays for response
    const transformedJob = {
      ...job,
      skills: job.skills ? JSON.parse(job.skills) : [],
      benefits: job.benefits ? JSON.parse(job.benefits) : []
    };

    res.status(200).json({
      success: true,
      data: transformedJob
    });
  } catch (error) {
    logger.error('Job fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job'
    });
  }
}));

// Submit job application
router.post('/apply', [
  body('jobId').isString().withMessage('Job ID is required'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('phone').optional().isString().withMessage('Phone must be a string'),
  body('coverLetter').optional().isString().withMessage('Cover letter must be a string'),
  body('resumeUrl').optional().isURL().withMessage('Resume URL must be valid'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { jobId, name, email, phone, coverLetter, resumeUrl } = req.body;

  try {
    // Check if job exists and is active
    const job = await prisma.jobs.findUnique({
      where: { id: jobId }
    });

    if (!job || !job.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Job not found or not available'
      });
    }

    // Create application
    const application = await prisma.career_applications.create({
      data: {
        jobId,
        name,
        email,
        phone,
        coverLetter,
        resumeUrl
      },
      include: {
        jobs: {
          select: {
            title: true
          }
        }
      }
    });

    logger.info(`New job application received for: ${job.title} from: ${email}`);

    // Invalidate cache when new application is submitted
    invalidateJobCache();

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      data: {
        id: application.id,
        name: application.name,
        email: application.email,
        jobTitle: application.job.title,
        status: application.status,
        createdAt: application.createdAt
      }
    });
  } catch (error) {
    logger.error('Application creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit application'
    });
  }
}));

// Submit resume application (General resume submission) - Public route
router.post('/resume-submission', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('phone').optional().isString().withMessage('Phone must be a string'),
  body('position').optional().isString().withMessage('Position must be a string'),
  body('message').optional().isString().withMessage('Message must be a string'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { name, email, phone, position, message } = req.body;
  const resumeUrl = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    // Create a general application record
    const application = await prisma.career_applications.create({
      data: {
        name,
        email,
        phone,
        coverLetter: message,
        resumeUrl,
        status: 'PENDING'
      }
    });

    logger.info(`General resume submission received from: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Resume submitted successfully',
      data: {
        id: application.id,
        name: application.name,
        email: application.email,
        status: application.status,
        createdAt: application.createdAt
      }
    });
  } catch (error) {
    logger.error('Resume submission error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit resume'
    });
  }
}));

// Submit job application with file upload
router.post('/applications', uploadResume, handleResumeUploadError, [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('phone').optional().isString().withMessage('Phone must be a string'),
  body('position').optional().isString().withMessage('Position must be a string'),
  body('message').optional().isString().withMessage('Message must be a string'),
  body('jobId').optional().isString().withMessage('Job ID must be a string'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { 
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array() 
    });
  }

  const { name, email, phone, position, message, jobId } = req.body;
  const resumeFile = req.file;

  try {
    // Validate that resume file is uploaded
    if (!resumeFile) {
      return res.status(400).json({
        success: false,
        error: 'Resume file is required'
      });
    }

    // Create resume URL
    const resumeUrl = `/uploads/resumes/${resumeFile.filename}`;

    let targetJobId;

    if (jobId) {
      // Check if the specific job exists and is active
      const job = await prisma.jobs.findUnique({
        where: { id: jobId }
      });

      if (!job || !job.isActive) {
        return res.status(400).json({
          success: false,
          error: 'Job not found or not available'
        });
      }

      targetJobId = jobId;
    } else {
      // Find or create a general job entry for applications without specific job
      let generalJob = await prisma.jobs.findFirst({
        where: { title: 'General Application' }
      });

      if (!generalJob) {
        generalJob = await prisma.jobs.create({
          data: {
            title: 'General Application',
            description: 'General job application for positions not currently listed',
            type: 'FULL_TIME',
            isActive: true
          }
        });
      }

      targetJobId = generalJob.id;
    }

    // Create application
    const application = await prisma.career_applications.create({
      data: {
        jobId: targetJobId,
        name,
        email,
        phone,
        coverLetter: message,
        resumeUrl,
      }
    });

    // Get job title for logging
    const job = await prisma.jobs.findUnique({
      where: { id: targetJobId },
      select: { title: true }
    });

    logger.info(`New job application received from: ${email} for position: ${job?.title || position}`);

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      data: {
        id: application.id,
        name: application.name,
        email: application.email,
        jobTitle: job?.title || 'General Application',
        status: application.status,
        createdAt: application.createdAt
      }
    });
  } catch (error) {
    logger.error('Application creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit application'
    });
  }
}));

// Download resume file (Public route for testing)
router.get('/applications/:id/resume', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    logger.info(`Resume download requested for application: ${id}`);
    
    const application = await prisma.career_applications.findUnique({
      where: { id },
      select: { resumeUrl: true, name: true }
    });

    if (!application) {
      logger.warn(`Application not found: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    if (!application.resumeUrl) {
      logger.warn(`No resume URL for application: ${id}`);
      return res.status(404).json({
        success: false,
        error: 'No resume file found for this application'
      });
    }

    // Construct the full file path
    const filePath = path.join(__dirname, '../../uploads/resumes/', path.basename(application.resumeUrl));
    logger.info(`Attempting to download file: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      logger.error(`File not found on server: ${filePath}`);
      return res.status(404).json({
        success: false,
        error: 'Resume file not found on server'
      });
    }

    // Get file stats for headers
    const stats = fs.statSync(filePath);
    const fileName = path.basename(application.resumeUrl);
    
    logger.info(`Serving file: ${fileName}, size: ${stats.size} bytes`);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${application.name}_resume_${fileName}"`);
    res.setHeader('Content-Length', stats.size);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    logger.error('Resume download error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download resume'
    });
  }
}));

// @desc    Bulk operations on applications
// @route   PATCH /api/career/applications/bulk
// @access  Private (Admin only)
router.patch('/applications/bulk', protect, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const { applicationIds, action } = req.body;

  if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Application IDs array is required'
    });
  }

  if (!action || !['approve', 'reject', 'review', 'delete'].includes(action)) {
    return res.status(400).json({
      success: false,
      error: 'Valid action is required (approve, reject, review, delete)'
    });
  }

  try {
    let updateData = {};
    
    switch (action) {
      case 'approve':
        updateData = { status: 'APPROVED' };
        break;
      case 'reject':
        updateData = { status: 'REJECTED' };
        break;
      case 'review':
        updateData = { status: 'REVIEWING' };
        break;
      case 'delete':
        // Delete applications
        await prisma.career_applications.deleteMany({
          where: { id: { in: applicationIds } }
        });
        
        logger.info(`Bulk deleted ${applicationIds.length} applications by admin: ${req.user.email}`);
        
        return res.status(200).json({
          success: true,
          message: `Successfully deleted ${applicationIds.length} applications`
        });
    }

    // Update applications
    const result = await prisma.career_applications.updateMany({
      where: { id: { in: applicationIds } },
      data: updateData
    });

    logger.info(`Bulk ${action} ${result.count} applications by admin: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: `Successfully updated ${result.count} applications`
    });
  } catch (error) {
    logger.error('Bulk operations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform bulk operations'
    });
  }
}));

// Protected routes - Admin only
router.use(protect);
router.use(authorize('ADMIN'));

// Get all applications with filtering and pagination
router.get('/applications', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isString().withMessage('Status must be a string'),
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

  const { page = 1, limit = 10, status, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Build where clause with optimized conditions
    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { coverLetter: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    // Use optimized queries with specific field selection
    const [applications, total] = await Promise.all([
      prisma.career_applications.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          resumeUrl: true,
          coverLetter: true,
          jobs: {
            select: {
              id: true,
              title: true,
              type: true,
              location: true
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.career_applications.count({ where })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.status(200).json({
      success: true,
      data: applications,
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
    logger.error('Applications fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch applications'
    });
  }
}));

// Get single application by ID
router.get('/applications/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const application = await prisma.career_applications.findUnique({
      where: { id },
      include: {
        jobs: {
          select: {
            id: true,
            title: true,
            description: true,
            requirements: true,
            type: true,
            location: true
          }
        }
      }
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    res.status(200).json({
      success: true,
      data: application
    });
  } catch (error) {
    logger.error('Application fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch application'
    });
  }
}));

// Update application status
router.patch('/applications/:id/status', [
  body('status').isIn(['PENDING', 'REVIEWING', 'APPROVED', 'REJECTED', 'HIRED']).withMessage('Invalid status'),
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
  const { status } = req.body;

  try {
    const application = await prisma.career_applications.findUnique({
      where: { id },
      include: {
        jobs: {
          select: {
            title: true
          }
        }
      }
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    const updatedApplication = await prisma.career_applications.update({
      where: { id },
      data: { status },
      include: {
        jobs: {
          select: {
            title: true
          }
        }
      }
    });

    logger.info(`Application status updated: ${id} to ${status} by admin: ${req.user.email}`);

    res.status(200).json({
      success: true,
      data: updatedApplication,
      message: 'Application status updated successfully'
    });
  } catch (error) {
    logger.error('Application status update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update application status'
    });
  }
}));

// Delete application
router.delete('/applications/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const application = await prisma.career_applications.findUnique({
      where: { id }
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    await prisma.career_applications.delete({
      where: { id }
    });

    logger.info(`Application deleted: ${id} by admin: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'Application deleted successfully'
    });
  } catch (error) {
    logger.error('Application deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete application'
    });
  }
}));

// Create job (Admin only)
router.post('/jobs', [
  body('title').trim().notEmpty().withMessage('Job title is required'),
  body('description').trim().notEmpty().withMessage('Job description is required'),
  body('requirements').optional().isString().withMessage('Requirements must be a string'),
  body('location').optional().isString().withMessage('Location must be a string'),
  body('type').isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE']).withMessage('Invalid job type'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { title, description, requirements, location, type } = req.body;

  try {
    const job = await prisma.jobs.create({
      data: {
        title,
        description,
        requirements,
        location,
        type
      }
    });

    logger.info(`Job created: ${job.title} by admin: ${req.user.email}`);

    // Invalidate cache when new job is created
    invalidateJobCache();

    res.status(201).json({
      success: true,
      data: job,
      message: 'Job created successfully'
    });
  } catch (error) {
    logger.error('Job creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create job'
    });
  }
}));

// Update job (Admin only)
router.put('/jobs/:id', [
  body('title').optional().trim().notEmpty().withMessage('Job title cannot be empty'),
  body('description').optional().trim().notEmpty().withMessage('Job description cannot be empty'),
  body('requirements').optional().isString().withMessage('Requirements must be a string'),
  body('location').optional().isString().withMessage('Location must be a string'),
  body('type').optional().isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE']).withMessage('Invalid job type'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
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
  const { title, description, requirements, location, type, isActive } = req.body;

  try {
    const existingJob = await prisma.jobs.findUnique({
      where: { id }
    });

    if (!existingJob) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (requirements !== undefined) updateData.requirements = requirements;
    if (location !== undefined) updateData.location = location;
    if (type !== undefined) updateData.type = type;
    if (isActive !== undefined) updateData.isActive = isActive;

    const job = await prisma.jobs.update({
      where: { id },
      data: updateData
    });

    logger.info(`Job updated: ${job.title} by admin: ${req.user.email}`);

    // Invalidate cache when job is updated
    invalidateJobCache();

    res.status(200).json({
      success: true,
      data: job,
      message: 'Job updated successfully'
    });
  } catch (error) {
    logger.error('Job update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update job'
    });
  }
}));

// Delete job (Admin only)
router.delete('/jobs/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const job = await prisma.jobs.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            applications: true
          }
        }
      }
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Check if job has applications
    if (job._count.career_applications > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete job with existing applications'
      });
    }

    await prisma.jobs.delete({
      where: { id }
    });

    logger.info(`Job deleted: ${job.title} by admin: ${req.user.email}`);

    // Invalidate cache when job is deleted
    invalidateJobCache();

    res.status(200).json({
      success: true,
      message: 'Job deleted successfully'
    });
  } catch (error) {
    logger.error('Job deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete job'
    });
  }
}));

// Get all career applications (Admin only)
router.get('/applications', protect, authorize('ADMIN'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isString().withMessage('Status must be a string'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { page = 1, limit = 10, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where = {};
    if (status) {
      where.status = status;
    }

    const [applications, total] = await Promise.all([
      prisma.career_applications.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          resumeUrl: true,
          coverLetter: true,
          jobs: {
            select: {
              id: true,
              title: true,
              type: true,
              location: true
            }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.career_applications.count({ where })
    ]);

    res.status(200).json({
      success: true,
      data: applications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNext: skip + parseInt(limit) < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    logger.error('Applications fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch applications'
    });
  }
}));

// Get single career application (Admin only)
router.get('/applications/:id', protect, authorize('ADMIN'), asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const application = await prisma.career_applications.findUnique({
      where: { id },
      include: {
        jobs: {
          select: {
            id: true,
            title: true,
            type: true,
            location: true,
            description: true
          }
        }
      }
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    res.status(200).json({
      success: true,
      data: application
    });
  } catch (error) {
    logger.error('Application fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch application'
    });
  }
}));

// Update application status (Admin only)
router.patch('/applications/:id/status', protect, authorize('ADMIN'), [
  body('status').isIn(['PENDING', 'REVIEWED', 'ACCEPTED', 'REJECTED']).withMessage('Invalid status'),
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
    const { status } = req.body;

    const application = await prisma.career_applications.update({
      where: { id },
      data: { 
        status,
        updatedAt: new Date()
      },
      include: {
        jobs: {
          select: {
            title: true
          }
        }
      }
    });

    logger.info(`Application status updated to ${status} for: ${application.email}`);

    res.status(200).json({
      success: true,
      data: application,
      message: 'Application status updated successfully'
    });
  } catch (error) {
    logger.error('Application status update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update application status'
    });
  }
}));

// Delete career application (Admin only)
router.delete('/applications/:id', protect, authorize('ADMIN'), asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const application = await prisma.career_applications.findUnique({
      where: { id }
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found'
      });
    }

    await prisma.career_applications.delete({
      where: { id }
    });

    logger.info(`Application deleted: ${application.email}`);

    res.status(200).json({
      success: true,
      message: 'Application deleted successfully'
    });
  } catch (error) {
    logger.error('Application deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete application'
    });
  }
}));


export default router;
