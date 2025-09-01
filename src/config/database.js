import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'], // Reduced logging for performance
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Optimized connection pooling for cloud databases
  __internal: {
    engine: {
      connectionLimit: 50, // Increased for cloud
      pool: {
        min: 5, // Increased minimum connections
        max: 20, // Increased maximum connections
        acquireTimeoutMillis: 10000, // Reduced timeout for faster failure detection
        createTimeoutMillis: 10000, // Faster connection creation
        destroyTimeoutMillis: 2000, // Faster cleanup
        idleTimeoutMillis: 60000, // Keep connections alive longer
        reapIntervalMillis: 500, // More frequent cleanup
        createRetryIntervalMillis: 50, // Faster retry
      },
    },
  },
  // Query optimization
  errorFormat: 'minimal', // Reduced error details for performance
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
