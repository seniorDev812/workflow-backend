import express from 'express';
import { body, validationResult, query } from 'express-validator';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import prisma from '../config/database.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Protect all routes
router.use(protect);
router.use(authorize('ADMIN'));

// Get all jobs
router.get('/', asyncHandler(async (req, res) => {
  try {
    const jobs = await prisma.Job.findMany({
      where: { isActive: true }, // Only return active jobs
      include: {
        _count: {
          select: {
            applications: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({
      success: true,
      data: jobs
    });
  } catch (error) {
    logger.error('Jobs fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch jobs'
    });
  }
}));

// Create job
router.post('/', [
  body('title').trim().notEmpty().withMessage('Job title is required'),
  body('description').trim().notEmpty().withMessage('Job description is required'),
  body('requirements').optional().isString().withMessage('Requirements must be a string'),
  body('location').optional().isString().withMessage('Location must be a string'),
  body('type').isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE']).withMessage('Invalid job type'),
  // New optional fields
  body('department').optional().isString().withMessage('Department must be a string'),
  body('salary').optional().isString().withMessage('Salary must be a string'),
  body('responsibilities').optional().isString().withMessage('Responsibilities must be a string'),
  body('postedDate').optional().isISO8601().toDate().withMessage('postedDate must be a valid date'),
  body('skills').optional().isArray().withMessage('Skills must be an array of strings'),
  body('skills.*').optional().isString().withMessage('Each skill must be a string'),
  body('benefits').optional().isArray().withMessage('Benefits must be an array of strings'),
  body('benefits.*').optional().isString().withMessage('Each benefit must be a string'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { title, description, requirements, location, type, department, salary, responsibilities, postedDate, skills, benefits } = req.body;

  try {
    const job = await prisma.Job.create({
      data: {
        title,
        description,
        requirements,
        location,
        type,
        department,
        salary,
        responsibilities,
        postedDate: postedDate ?? undefined,
        skills: skills ?? [],
        benefits: benefits ?? []
      }
    });

    logger.info(`Job created: ${job.title} by admin: ${req.user.email}`);

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

// Update job
router.put('/', [
  body('id').isString().withMessage('Job ID is required'),
  body('title').optional().trim().notEmpty().withMessage('Job title cannot be empty'),
  body('description').optional().trim().notEmpty().withMessage('Job description cannot be empty'),
  body('requirements').optional().isString().withMessage('Requirements must be a string'),
  body('location').optional().isString().withMessage('Location must be a string'),
  body('type').optional().isIn(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE']).withMessage('Invalid job type'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  // New optional fields
  body('department').optional().isString().withMessage('Department must be a string'),
  body('salary').optional().isString().withMessage('Salary must be a string'),
  body('responsibilities').optional().isString().withMessage('Responsibilities must be a string'),
  body('postedDate').optional().isISO8601().toDate().withMessage('postedDate must be a valid date'),
  body('skills').optional().isArray().withMessage('Skills must be an array of strings'),
  body('skills.*').optional().isString().withMessage('Each skill must be a string'),
  body('benefits').optional().isArray().withMessage('Benefits must be an array of strings'),
  body('benefits.*').optional().isString().withMessage('Each benefit must be a string'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id, title, description, requirements, location, type, isActive, department, salary, responsibilities, postedDate, skills, benefits } = req.body;

  try {
    const existingJob = await prisma.Job.findUnique({
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
    if (department !== undefined) updateData.department = department;
    if (salary !== undefined) updateData.salary = salary;
    if (responsibilities !== undefined) updateData.responsibilities = responsibilities;
    if (postedDate !== undefined) updateData.postedDate = postedDate;
    if (skills !== undefined) updateData.skills = skills;
    if (benefits !== undefined) updateData.benefits = benefits;

    const job = await prisma.Job.update({
      where: { id },
      data: updateData
    });

    logger.info(`Job updated: ${job.title} by admin: ${req.user.email}`);

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

// Delete job
router.delete('/', [
  query('id').isString().withMessage('Job ID is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id } = req.query;

  try {
    const job = await prisma.Job.findUnique({
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
    if (job._count.applications > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete job with existing applications'
      });
    }

          await prisma.Job.delete({
      where: { id }
    });

    logger.info(`Job deleted: ${job.title} by admin: ${req.user.email}`);

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

export default router;
