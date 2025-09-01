# Seen Group Backend API

A robust Node.js backend API for the Seen Group admin panel and website.

## 🚀 Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **Database**: PostgreSQL with Prisma ORM
- **Security**: Rate limiting, CORS, Helmet, input validation
- **Logging**: Winston logger with file and console output
- **File Upload**: Multer for handling file uploads
- **Email**: Nodemailer for email notifications
- **API Documentation**: RESTful API endpoints

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL database
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   PORT=5000
   DATABASE_URL="postgresql://username:password@localhost:5432/seengroup_db"
   JWT_SECRET="your-super-secret-jwt-key"
   JWT_REFRESH_SECRET="your-refresh-secret-key"
   ```

4. **Database Setup**
   ```bash
   # Generate Prisma client
   npm run generate
   
   # Run database migrations
   npm run migrate
   ```

5. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # Database configuration
│   ├── controllers/             # Route controllers
│   ├── middleware/
│   │   ├── auth.js             # Authentication middleware
│   │   └── errorHandler.js     # Error handling
│   ├── routes/
│   │   ├── auth.js             # Authentication routes
│   │   ├── admin.js            # Admin routes
│   │   ├── products.js         # Product routes
│   │   ├── messages.js         # Message routes
│   │   ├── career.js           # Career routes
│   │   └── public.js           # Public routes
│   ├── utils/
│   │   └── logger.js           # Logging utility
│   └── server.js               # Main server file
├── prisma/
│   └── schema.prisma           # Database schema
├── logs/                       # Log files
├── uploads/                    # File uploads
├── package.json
└── README.md
```

## 🔐 Authentication

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@seengroup.com",
  "password": "admin123"
}
```

### Protected Routes
Include the JWT token in the Authorization header:
```http
Authorization: Bearer <your-jwt-token>
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user
- `POST /api/auth/refresh` - Refresh token
- `PUT /api/auth/change-password` - Change password

### Admin Dashboard
- `GET /api/admin/dashboard/stats` - Dashboard statistics
- `GET /api/admin/dashboard/recent-activity` - Recent activity
- `GET /api/admin/settings` - Get system settings
- `PUT /api/admin/settings` - Update system settings

### Products (To be implemented)
- `GET /api/products` - Get all products
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Messages (To be implemented)
- `POST /api/messages` - Send message
- `GET /api/messages` - Get all messages (admin)
- `PUT /api/messages/:id/read` - Mark as read

### Career (To be implemented)
- `GET /api/career/jobs` - Get all jobs
- `POST /api/career/apply` - Submit application

## 🗄️ Database Schema

### Users
- Authentication and user management
- Role-based access control (USER, ADMIN, MODERATOR)

### Products
- Product catalog management
- Category relationships

### Messages
- Contact form submissions
- Read/unread status

### Career
- Job postings
- Application submissions

### Settings
- System configuration
- Key-value storage

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt for password security
- **Rate Limiting**: Prevent abuse with express-rate-limit
- **CORS**: Cross-origin resource sharing configuration
- **Helmet**: Security headers
- **Input Validation**: express-validator for request validation
- **Error Handling**: Comprehensive error handling middleware

## 📝 Logging

The application uses Winston for logging:
- Console logging in development
- File logging in production
- Error tracking and monitoring

## 🚀 Deployment

### Environment Variables
Make sure to set all required environment variables in production:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL="your-production-database-url"
JWT_SECRET="your-production-jwt-secret"
JWT_REFRESH_SECRET="your-production-refresh-secret"
SMTP_HOST="your-smtp-host"
SMTP_USER="your-smtp-user"
SMTP_PASS="your-smtp-password"
```

### Production Commands
```bash
npm run generate  # Generate Prisma client
npm run migrate   # Run database migrations
npm start         # Start production server
```

## 🧪 Testing

```bash
npm test
```

## 📞 Support

For support and questions, please contact the development team.

## 📄 License

This project is licensed under the MIT License.
