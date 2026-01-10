import dotenv from 'dotenv';

dotenv.config();

export default {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
  }
};

