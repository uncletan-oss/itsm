require('dotenv').config();

const env = process.env.NODE_ENV || 'development';
const jwtSecret = process.env.JWT_SECRET;

if (env === 'production' && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error('JWT_SECRET wajib di-set (min. 32 karakter) pada environment production');
}

module.exports = {
  env,
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/itsm',
  jwtSecret: jwtSecret || 'dev-only-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
