import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// Test auth endpoint
app.post('/api/auth/login', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Auth endpoint working',
    data: req.body
  });
});

// Test admin endpoint
app.get('/api/admin/dashboard/stats', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin endpoint working',
    data: {
      totalProducts: 0,
      totalMessages: 0,
      unreadMessages: 0,
      totalJobs: 0,
      totalApplications: 0,
      pendingApplications: 0,
      pageViews: 1000
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Simple server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});
