import express from 'express';
import pool from '../config/database.js';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';

const router = express.Router();

/**
 * Database Audit Health Check Endpoint
 * GET /api/health-check/db-audit
 * 
 * Returns diagnostic information about:
 * - Database tables (to verify migrations ran)
 * - Admin user existence
 * - JWT signing capability
 */
router.get('/db-audit', async (req, res) => {
  const auditResult = {
    database: {
      connected: false,
      tables: [],
      tableCount: 0,
      error: null
    },
    adminUser: {
      found: false,
      email: 'superadmin@plottwistco.com',
      error: null
    },
    jwtSigning: {
      success: false,
      error: null
    }
  };

  try {
    // 1. List all tables in the database
    try {
      const [tables] = await pool.query('SHOW TABLES');
      
      // Extract table names from results
      // MySQL returns results with a dynamic column name like `Tables_in_database_name`
      const tableNames = tables.map(row => {
        // Get the first value (table name) from the row object
        return Object.values(row)[0];
      });
      
      auditResult.database.connected = true;
      auditResult.database.tables = tableNames;
      auditResult.database.tableCount = tableNames.length;
    } catch (dbError) {
      auditResult.database.error = {
        message: dbError.message,
        code: dbError.code,
        sqlState: dbError.sqlState
      };
    }

    // 2. Check for admin user
    try {
      const [users] = await pool.query(
        'SELECT id, email, role FROM users WHERE email = ?',
        ['superadmin@plottwistco.com']
      );
      
      if (users && users.length > 0) {
        auditResult.adminUser.found = true;
      } else {
        auditResult.adminUser.found = false;
      }
    } catch (userError) {
      // Handle case where users table doesn't exist
      if (userError.code === 'ER_NO_SUCH_TABLE') {
        auditResult.adminUser.error = 'users table does not exist (migrations may not have run)';
      } else {
        auditResult.adminUser.error = {
          message: userError.message,
          code: userError.code,
          sqlState: userError.sqlState
        };
      }
    }

    // 3. Test JWT signing
    try {
      const jwtSecret = process.env.JWT_SECRET || config.jwt.secret;
      
      if (!jwtSecret || jwtSecret === 'your-super-secret-jwt-key-change-in-production') {
        auditResult.jwtSigning.error = 'JWT_SECRET is missing or using default value';
      } else {
        // Attempt to sign a test token
        const testPayload = { test: true, timestamp: Date.now() };
        jwt.sign(testPayload, jwtSecret, { expiresIn: '1h' });
        auditResult.jwtSigning.success = true;
      }
    } catch (jwtError) {
      auditResult.jwtSigning.error = {
        message: jwtError.message,
        type: jwtError.name
      };
    }

    // Return the audit results
    res.status(200).json(auditResult);
  } catch (error) {
    // Catch any unexpected errors
    console.error('Error in db-audit endpoint:', error);
    res.status(500).json({
      error: {
        message: 'Unexpected error during database audit',
        details: error.message
      },
      partialResults: auditResult
    });
  }
});

export default router;
