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

// Get products with filtering
router.get('/', [
  query('categoryId').optional().isString().withMessage('Category ID must be a string'),
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

  const { categoryId, search } = req.query;

  try {
    const where = {
      isActive: true, // Only return active products
      ...(categoryId && { categoryId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    const products = await prisma.Product.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({
      success: true,
      data: products
    });
  } catch (error) {
    logger.error('Products fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products'
    });
  }
}));

// Create product
router.post('/', [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('price').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
  }).withMessage('Price must be a positive number'),
  body('categoryId').isString().withMessage('Category ID is required'),
  body('imageUrl').optional().isString().withMessage('Image URL must be a string'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { name, description, price, categoryId, imageUrl } = req.body;

  try {
    // Check if category exists
    const category = await prisma.Category.findUnique({
      where: { id: categoryId }
    });

    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'Category not found'
      });
    }

    const product = await prisma.Product.create({
      data: {
        name,
        description,
        price: price ? parseFloat(price) : null,
        categoryId,
        imageUrl
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    logger.info(`Product created: ${product.name} by admin: ${req.user.email}`);

    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully'
    });
  } catch (error) {
    logger.error('Product creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create product'
    });
  }
}));

// Update product
router.put('/', [
  body('id').isString().withMessage('Product ID is required'),
  body('name').optional().trim().notEmpty().withMessage('Product name cannot be empty'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('price').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
  }).withMessage('Price must be a positive number'),
  body('categoryId').optional().isString().withMessage('Category ID must be a string'),
  body('imageUrl').optional().isString().withMessage('Image URL must be a string'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { id, name, description, price, categoryId, imageUrl } = req.body;

  try {
    // Check if product exists
    const existingProduct = await prisma.Product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check if category exists if categoryId is provided
    if (categoryId) {
      const category = await prisma.Category.findUnique({
        where: { id: categoryId }
      });

      if (!category) {
        return res.status(400).json({
          success: false,
          error: 'Category not found'
        });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = price ? parseFloat(price) : null;
    if (categoryId !== undefined) updateData.categoryId = categoryId;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

    const product = await prisma.Product.update({
      where: { id },
      data: updateData,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      }
    });

    logger.info(`Product updated: ${product.name} by admin: ${req.user.email}`);

    res.status(200).json({
      success: true,
      data: product,
      message: 'Product updated successfully'
    });
  } catch (error) {
    logger.error('Product update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update product'
    });
  }
}));

// Delete product
router.delete('/', [
  query('id').isString().withMessage('Product ID is required'),
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
    const product = await prisma.Product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Hard delete - completely remove from database

    await prisma.Product.delete({
      where: { id }
    });

    logger.info(`Product deleted: ${product.name} by admin: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    logger.error('Product deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete product'
    });
  }
}));

export default router;
