# 🚀 Render.com Deployment Checklist

## Pre-Deployment Checklist

### ✅ Code Preparation
- [ ] All code committed and pushed to GitHub/GitLab
- [ ] `render.yaml` file created
- [ ] `env.example` file created
- [ ] Production server file created (`server-production.js`)
- [ ] Package.json updated with build scripts
- [ ] No sensitive data in code (passwords, API keys, etc.)

### ✅ Database Setup
- [ ] PostgreSQL database created on Render.com
- [ ] Database connection string copied
- [ ] Database region matches your service region

### ✅ Environment Variables Ready
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `JWT_SECRET` - Strong random string (32+ characters)
- [ ] `ADMIN_EMAIL` - Admin user email
- [ ] `ADMIN_PASSWORD` - Secure admin password
- [ ] `CORS_ORIGIN` - Your frontend domain(s)
- [ ] `NODE_ENV` - Set to "production"
- [ ] `PORT` - Set to 10000

## Deployment Steps

### 1. Create Web Service
- [ ] Go to Render.com Dashboard
- [ ] Click "New +" → "Web Service"
- [ ] Connect your repository
- [ ] Set environment to "Node"
- [ ] Set build command: `npm install && npx prisma generate`
- [ ] Set start command: `npm run start`
- [ ] Add all environment variables
- [ ] Click "Create Web Service"

### 2. Database Migration
- [ ] Wait for service to deploy
- [ ] Run database migrations:
  ```bash
  npx prisma migrate deploy
  npx prisma generate
  ```

### 3. Verification
- [ ] Test health endpoint: `/health`
- [ ] Check service logs for errors
- [ ] Test API endpoints
- [ ] Verify admin user creation

## Post-Deployment

### ✅ Update Frontend
- [ ] Update frontend API URL to new backend URL
- [ ] Test frontend-backend communication
- [ ] Update CORS settings if needed

### ✅ Monitoring Setup
- [ ] Check health endpoint regularly
- [ ] Monitor service logs
- [ ] Set up alerts for downtime
- [ ] Monitor database performance

### ✅ Security Verification
- [ ] HTTPS is working (automatic on Render.com)
- [ ] JWT tokens are secure
- [ ] Rate limiting is active
- [ ] CORS is properly configured
- [ ] Admin credentials are secure

## Troubleshooting

### Common Issues
- [ ] Build fails → Check Prisma dependencies
- [ ] Database connection fails → Verify DATABASE_URL
- [ ] CORS errors → Check CORS_ORIGIN setting
- [ ] File uploads fail → Remember ephemeral storage

### Performance
- [ ] Database connection pooling active
- [ ] Rate limiting configured
- [ ] Compression enabled
- [ ] Static file serving working

## Final Checklist

- [ ] Backend accessible via HTTPS
- [ ] All API endpoints responding
- [ ] Database migrations complete
- [ ] Admin user created successfully
- [ ] Frontend can communicate with backend
- [ ] Health checks passing
- [ ] Logs showing no errors
- [ ] Performance acceptable

## 🎉 Ready to Deploy!

Your backend is now ready for Render.com deployment. Follow the checklist above and refer to `DEPLOYMENT.md` for detailed instructions.

**Remember**: Render.com free tier will pause your service after 15 minutes of inactivity. Consider upgrading to a paid plan for production use.
