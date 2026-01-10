import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables from .env file, but don't override existing env vars
// By default, dotenv.config() does NOT override existing environment variables
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'onboarding_user',
  password: process.env.DB_PASSWORD || 'onboarding_pass',
  database: process.env.DB_NAME || 'onboarding_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000, // 60 seconds connection timeout
  acquireTimeout: 60000, // 60 seconds to acquire connection from pool
  timeout: 60000, // 60 seconds query timeout
  timezone: '+00:00' // Force UTC timezone for all connections
});

// Set timezone to UTC for all connections
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

// Test connection
pool.getConnection()
  .then(connection => {
    console.log('✅ Database connected successfully');
    // Ensure timezone is set
    connection.query("SET time_zone = '+00:00'");
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
  });

export default pool;

