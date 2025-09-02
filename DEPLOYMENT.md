# Deployment Guide for Render.com

## Prerequisites
- Render.com account
- PostgreSQL database (can be created on Render.com)
- Domain name (optional)

## Step 1: Prepare Your Repository

1. **Push your code to GitHub/GitLab**
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push origin main
   ```

2. **Ensure these files are in your repository:**
   - `render.yaml` ✅
   - `package.json` ✅
   - `src/server.js` ✅
   - `prisma/schema.prisma` ✅

## Step 2: Create Database on Render.com

1. **Go to Render.com Dashboard**
2. **Click "New +" → "PostgreSQL"**
3. **Configure:**
   - **Name**: `seengroup-database`
   - **Database**: `seengroup_prod`
   - **User**: `seengroup_user`
   - **Region**: Choose closest to your users
   - **Plan**: Starter (free tier available)

4. **Copy the connection string** - you'll need this for the next step

## Step 3: Deploy Your Backend

1. **Go to Render.com Dashboard**
2. **Click "New +" → "Web Service"**
3. **Connect your GitHub/GitLab repository**
4. **Configure the service:**

   **Basic Settings:**
   - **Name**: `seengroup-backend`
   - **Environment**: `Node`
   - **Region**: Same as your database
   - **Branch**: `main`
   - **Build Command**: `npm install && npx prisma generate`
   - **Start Command**: `npm run start`

   **Environment Variables:**
   ```
   NODE_ENV=production
   PORT=10000
   DATABASE_URL=<your-postgresql-connection-string>
   JWT_SECRET=<generate-a-strong-random-string>
   ADMIN_EMAIL=admin@yourdomain.com
   ADMIN_PASSWORD=<secure-admin-password>
   CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
   ```

5. **Click "Create Web Service"**

## Step 4: Run Database Migrations

1. **Wait for your service to deploy**
2. **Go to your service logs**
3. **Run migrations manually:**
   ```bash
   # In Render.com shell or locally with DATABASE_URL set
   npx prisma migrate deploy
   npx prisma generate
   ```

## Step 5: Verify Deployment

1. **Check your service URL** (e.g., `https://seengroup-backend.onrender.com`)
2. **Test the health endpoint**: `https://your-service.onrender.com/health`
3. **Check logs for any errors**

## Step 6: Update Frontend Configuration

Update your frontend environment variables to point to your new backend:
```env
NEXT_PUBLIC_API_URL=https://your-service.onrender.com
```

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:port/db` |
| `JWT_SECRET` | Secret for JWT tokens | `your-super-secret-key-here` |
| `ADMIN_EMAIL` | Default admin email | `admin@yourdomain.com` |
| `ADMIN_PASSWORD` | Default admin password | `secure-password-123` |
| `CORS_ORIGIN` | Allowed origins for CORS | `https://yourdomain.com` |
| `SMTP_HOST` | Email server host | `smtp.gmail.com` |
| `SMTP_USER` | Email username | `your-email@gmail.com` |
| `SMTP_PASS` | Email password/app password | `your-app-password` |

## Troubleshooting

### Common Issues:

1. **Build fails with Prisma error:**
   - Ensure `@prisma/client` is in dependencies (not devDependencies)
   - Check that `prisma generate` runs during build

2. **Database connection fails:**
   - Verify `DATABASE_URL` is correct
   - Check if database is accessible from Render.com
   - Ensure database is not paused (free tier pauses after inactivity)

3. **CORS errors:**
   - Update `CORS_ORIGIN` with your frontend domain
   - Check if frontend is making requests to correct backend URL

4. **File uploads not working:**
   - Render.com has ephemeral storage - files will be lost on restart
   - Consider using external storage (AWS S3, Cloudinary, etc.)

### Performance Tips:

1. **Database Connection Pooling:** Already configured in your code
2. **Rate Limiting:** Adjust based on your needs
3. **Caching:** Consider adding Redis for session storage
4. **File Storage:** Use external storage for production

## Monitoring

1. **Health Checks:** Your `/health` endpoint is configured
2. **Logs:** Available in Render.com dashboard
3. **Metrics:** Basic metrics available in free tier
4. **Alerts:** Set up notifications for downtime

## Security Checklist

- [ ] Strong JWT secrets
- [ ] Secure admin credentials
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] HTTPS enforced (automatic on Render.com)
- [ ] Environment variables secured
- [ ] Database access restricted

## Next Steps

1. **Set up custom domain** (optional)
2. **Configure SSL certificates** (automatic on Render.com)
3. **Set up monitoring and alerts**
4. **Configure backup strategies**
5. **Set up CI/CD pipeline**

Your backend should now be successfully deployed on Render.com! 🚀
