import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Optimized for Aiven PostgreSQL
  __internal: {
    engine: {
      connectionLimit: 20, // Optimized for Aiven's connection limits
      pool: {
        min: 2, // Minimum connections for Aiven
        max: 10, // Maximum connections (Aiven free tier usually allows 10-20)
        acquireTimeoutMillis: 5000, // Faster timeout for Aiven
        createTimeoutMillis: 5000, // Faster connection creation
        destroyTimeoutMillis: 1000, // Faster cleanup
        idleTimeoutMillis: 30000, // Shorter idle time for Aiven
        reapIntervalMillis: 1000, // Less frequent cleanup
        createRetryIntervalMillis: 100, // Retry interval
      },
    },
  },
  // Query optimization
  errorFormat: 'minimal',
});

// Create default admin function
const createDefaultAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@seengroup.com';
    
    const existingAdmin = await prisma.User.findUnique({
      where: { email: adminEmail }
    });

    if (!existingAdmin) {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.default.hash(
        process.env.ADMIN_PASSWORD || 'admin123', 
        12
      );

      await prisma.User.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          name: 'Admin User',
          role: 'ADMIN',
          isActive: true,
        }
      });

      logger.info('✅ Default admin user created');
    }
  } catch (error) {
    logger.error('❌ Failed to create default admin:', error);
  }
};

// Connection health monitoring
let connectionHealth = {
  lastCheck: Date.now(),
  isHealthy: true,
  consecutiveFailures: 0,
};

// Health check function
const checkConnectionHealth = async () => {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - start;
    
    if (responseTime > 1000) { // Alert if response > 1 second
      logger.warn(`⚠️ Slow database response: ${responseTime}ms`);
    }
    
    connectionHealth.isHealthy = true;
    connectionHealth.consecutiveFailures = 0;
    connectionHealth.lastCheck = Date.now();
    
    return { healthy: true, responseTime };
  } catch (error) {
    connectionHealth.consecutiveFailures++;
    connectionHealth.isHealthy = false;
    logger.error('❌ Database health check failed:', error);
    return { healthy: false, error: error.message };
  }
};

// Periodic health check
setInterval(checkConnectionHealth, 30000); // Check every 30 seconds

export const connectDB = async () => {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
    
    // Initial health check
    await checkConnectionHealth();
    
    // Check if admin user exists, if not create default admin
    await createDefaultAdmin();
    
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
};

export const disconnectDB = async () => {
  try {
    await prisma.$disconnect();
    logger.info('✅ Database disconnected successfully');
  } catch (error) {
    logger.error('❌ Database disconnection failed:', error);
  }
};

// Get connection health status
export const getConnectionHealth = () => connectionHealth;

// Optimized query wrapper with timeout
export const executeQuery = async (queryFn, timeoutMs = 5000) => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Query timeout')), timeoutMs);
  });
  
  try {
    const result = await Promise.race([queryFn(), timeoutPromise]);
    return result;
  } catch (error) {
    if (error.message === 'Query timeout') {
      logger.error('⏰ Database query timed out');
      throw new Error('Database query timed out - please try again');
    }
    throw error;
  }
};

export default prisma;
