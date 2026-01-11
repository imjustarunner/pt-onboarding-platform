import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbHost = process.env.DB_HOST || 'localhost';
const isUnixSocket = dbHost.startsWith('/cloudsql/') || dbHost.startsWith('/');

const poolConfig = {
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: 'mysql', // Connect to mysql system database to grant permissions
  waitForConnections: true,
  connectionLimit: 1,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000
};

if (isUnixSocket) {
  poolConfig.socketPath = dbHost;
} else {
  poolConfig.host = dbHost;
  poolConfig.port = parseInt(process.env.DB_PORT) || 3307;
}

async function grantPermissions() {
  const pool = mysql.createPool(poolConfig);
  const dbName = process.env.DB_NAME || 'onboarding_stage';
  const dbUser = process.env.DB_USER || 'appuser';

  try {
    const connection = await pool.getConnection();
    console.log('Connected to database');

    // Grant all privileges on the database
    await connection.query(`GRANT ALL PRIVILEGES ON ${dbName}.* TO ?@'%'`, [dbUser]);
    await connection.query('FLUSH PRIVILEGES');
    
    console.log(`Granted all privileges on ${dbName}.* to ${dbUser}@'%'`);
    console.log('Permissions granted successfully!');
    
    connection.release();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error granting permissions:', error);
    process.exit(1);
  }
}

grantPermissions();
