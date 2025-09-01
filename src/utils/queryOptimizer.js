import { logger } from './logger.js';

// Simple in-memory cache for frequently accessed data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache wrapper for database queries
export const withCache = async (key, queryFn, ttl = CACHE_TTL) => {
  const now = Date.now();
  const cached = cache.get(key);
  
  if (cached && (now - cached.timestamp) < ttl) {
    logger.info(`📦 Cache hit for: ${key}`);
    return cached.data;
  }
  
  try {
    const data = await queryFn();
    cache.set(key, { data, timestamp: now });
    logger.info(`💾 Cached: ${key}`);
    return data;
  } catch (error) {
    logger.error(`❌ Cache miss for: ${key}`, error);
    throw error;
  }
};

// Clear cache
export const clearCache = () => {
  cache.clear();
  logger.info('🧹 Cache cleared');
};

// Get cache stats
export const getCacheStats = () => {
  const now = Date.now();
  const entries = Array.from(cache.entries());
  const validEntries = entries.filter(([_, value]) => (now - value.timestamp) < CACHE_TTL);
  
  return {
    total: entries.length,
    valid: validEntries.length,
    expired: entries.length - validEntries.length,
    size: JSON.stringify(validEntries).length,
  };
};

// Query optimization helpers
export const optimizeQuery = {
  // Pagination helper
  paginate: (page = 1, limit = 10) => {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    return { skip, take: parseInt(limit) };
  },
  
  // Search optimization
  searchFields: (search, fields) => {
    if (!search) return {};
    
    return {
      OR: fields.map(field => ({
        [field]: {
          contains: search,
          mode: 'insensitive',
        },
      })),
    };
  },
  
  // Select only needed fields
  selectFields: (fields) => {
    return fields.reduce((acc, field) => {
      acc[field] = true;
      return acc;
    }, {});
  },
  
  // Order by with fallback
  orderBy: (field, direction = 'desc') => {
    return { [field]: direction };
  },
};

// Batch operations for better performance
export const batchOperation = async (items, operation, batchSize = 100) => {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => operation(item))
    );
    results.push(...batchResults);
    
    // Small delay to prevent overwhelming the database
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  
  return results;
};

// Connection pooling optimization
export const optimizeConnectionPool = {
  // Warm up connection pool
  warmup: async (prisma) => {
    try {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(prisma.$queryRaw`SELECT 1`);
      }
      await Promise.all(promises);
      logger.info('🔥 Connection pool warmed up');
    } catch (error) {
      logger.error('❌ Failed to warm up connection pool:', error);
    }
  },
  
  // Health check with performance metrics
  healthCheck: async (prisma) => {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - start;
      
      return {
        healthy: true,
        responseTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
};
