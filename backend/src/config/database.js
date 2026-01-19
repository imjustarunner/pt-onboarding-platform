import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables from .env file, but don't override existing env vars
// By default, dotenv.config() does NOT override existing environment variables
dotenv.config();

// Detect if DB_HOST is a Unix socket path (Cloud SQL) or TCP host
const dbHost = process.env.DB_HOST || 'localhost';
const isUnixSocket = dbHost.startsWith('/cloudsql/') || dbHost.startsWith('/');

// Build connection configuration
const poolConfig = {
  user: process.env.DB_USER || 'onboarding_user',
  password: process.env.DB_PASSWORD || 'onboarding_pass',
  database: process.env.DB_NAME || 'onboarding_stage',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000, // 60 seconds connection timeout
  timezone: '+00:00', // Force UTC timezone for all connections
  enableKeepAlive: true, // Keep connections alive
  keepAliveInitialDelay: 0 // Start keep-alive immediately
};

// Use socketPath for Unix socket connections (Cloud SQL), host/port for TCP
if (isUnixSocket) {
  poolConfig.socketPath = dbHost;
} else {
  poolConfig.host = dbHost;
  poolConfig.port = parseInt(process.env.DB_PORT) || 3307;
}

// Debug logging: Log connection configuration (password masked)
const maskedPassword = poolConfig.password ? '*'.repeat(Math.min(poolConfig.password.length, 8)) : 'not set';
console.log('🔍 Database connection configuration:');
console.log('  - Database name:', poolConfig.database);
console.log('  - Database user:', poolConfig.user);
console.log('  - Database password:', maskedPassword);
if (isUnixSocket) {
  console.log('  - Connection type: Unix socket');
  console.log('  - Socket path:', poolConfig.socketPath);
} else {
  console.log('  - Connection type: TCP');
  console.log('  - Host:', poolConfig.host);
  console.log('  - Port:', poolConfig.port);
}
console.log('  - Connection timeout:', poolConfig.connectTimeout, 'ms');

const pool = mysql.createPool(poolConfig);

// Track connection readiness
let isConnectionReady = false;
export const waitForConnection = () => {
  return new Promise((resolve) => {
    if (isConnectionReady) {
      resolve();
      return;
    }
    const checkInterval = setInterval(() => {
      if (isConnectionReady) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);
    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve(); // Resolve anyway to not block forever
    }, 30000);
  });
};

// Handle pool-level errors
pool.on('error', (err) => {
  console.error('❌ Database pool error:');
  console.error('  - Error message:', err.message);
  console.error('  - Error code:', err.code);
  console.error('  - SQL state:', err.sqlState);
  if (err.stack) {
    console.error('  - Stack trace:', err.stack);
  }
});

// Set timezone to UTC for all connections and handle connection errors
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
  
  // Handle connection-level errors (e.g., connection lost)
  connection.on('error', (err) => {
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      console.warn('⚠️  Database connection lost, will be recreated by pool');
    } else {
      console.error('❌ Database connection error:', err.message);
    }
  });
});

// Test connection with retry logic
let connectionRetries = 0;
const maxRetries = 5;
const retryDelay = 2000; // 2 seconds

const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    console.log('  - Connected to database:', poolConfig.database);
    // Ensure timezone is set
    await connection.query("SET time_zone = '+00:00'");
    connection.release();
    connectionRetries = 0; // Reset retry counter on success
    isConnectionReady = true; // Mark connection as ready
  } catch (err) {
    connectionRetries++;
    if (connectionRetries < maxRetries) {
      console.warn(`⚠️  Database connection attempt ${connectionRetries}/${maxRetries} failed, retrying in ${retryDelay}ms...`);
      console.warn(`  - Error: ${err.message}`);
      setTimeout(testConnection, retryDelay);
    } else {
      console.error('❌ Database connection error after', maxRetries, 'attempts:');
      console.error('  - Error message:', err.message);
      console.error('  - Error code:', err.code);
      console.error('  - SQL state:', err.sqlState);
      console.error('  - SQL message:', err.sqlMessage);
      console.error('  - Attempted database:', poolConfig.database);
      console.error('  - Connection config:', {
        user: poolConfig.user,
        host: poolConfig.host || poolConfig.socketPath,
        port: poolConfig.port || 'N/A (Unix socket)',
        database: poolConfig.database
      });
      if (err.stack) {
        console.error('  - Stack trace:', err.stack);
      }
      console.error('\n💡 Make sure Cloud SQL Proxy is running:');
      console.error('   cloud-sql-proxy ptonboard-dev:us-west3:ptonboard-mysql --port 3307');
    }
  }
};

// Start connection test (skip during unit tests)
if (process.env.NODE_ENV !== 'test' && process.env.SKIP_DB_CONNECT !== '1') {
  testConnection();
}

export default pool;

