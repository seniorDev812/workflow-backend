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

// Get all categories
router.get('/', asyncHandler(async (req, res) => {
  try {
    console.log('GET categories request received');
    const categories = await prisma.categories.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: {
            products: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log('Found categories:', categories.length);
    console.log('Category IDs:', categories.map(c => c.id));
    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Categories fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    });
  }
}));

// Create category
router.post('/', [
  body('name').trim().notEmpty().withMessage('Category name is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { name } = req.body;

  try {
    // Generate slug from name
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if category with same name already exists
    const existingCategory = await prisma.categories.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { slug: { equals: slug, mode: 'insensitive' } }
        ]
      }
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        error: 'Category with this name already exists'
      });
    }

    const category = await prisma.categories.create({
      data: {
        name,
        slug
      }
    });

    logger.info(`Category created: ${category.name} by admin: ${req.user.email}`);

    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully'
    });
  } catch (error) {
    logger.error('Category creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create category'
    });
  }
}));

// Update category
router.patch('/', [
  body('id').isString().withMessage('Category ID is required'),
  body('name').trim().notEmpty().withMessage('Category name is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id, name } = req.body;

  try {
    // Check if category exists
    const existingCategory = await prisma.categories.findUnique({
      where: { id }
    });

    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    // Generate new slug
    const slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if new name conflicts with existing category
    const conflictingCategory = await prisma.categories.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { slug: { equals: slug, mode: 'insensitive' } }
        ],
        NOT: { id }
      }
    });

    if (conflictingCategory) {
      return res.status(400).json({
        success: false,
        error: 'Category with this name already exists'
      });
    }

    const category = await prisma.categories.update({
      where: { id },
      data: {
        name,
        slug
      }
    });

    logger.info(`Category updated: ${category.name} by admin: ${req.user.email}`);

    res.status(200).json({
      success: true,
      data: category,
      message: 'Category updated successfully'
    });
  } catch (error) {
    logger.error('Category update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update category'
    });
  }
}));

// Delete category
router.delete('/', [
  query('id').optional().isString().withMessage('Category ID must be a string'),
  body('id').optional().isString().withMessage('Category ID must be a string'),
], asyncHandler(async (req, res) => {
  console.log('Delete category request:', {
    query: req.query,
    params: req.params,
    body: req.body
  });

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  // Get ID from either query or body
  const id = req.query.id || req.body.id;
  
  // Additional validation
  if (!id || typeof id !== 'string' || id.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Invalid category ID provided'
    });
  }

  try {
    const category = await prisma.categories.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true
          }
        }
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    // Check if category has products
    if (category._count.products > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete category with existing products'
      });
    }

          // Hard delete - completely remove from database
      await prisma.categories.delete({
        where: { id }
      });

    logger.info(`Category deleted: ${category.name} by admin: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    logger.error('Category deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete category'
    });
  }
}));

export default router;
