import express from 'express';
import pool from '../config/database.js';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';

const router = express.Router();

/**
 * Video provider status
 * GET /api/health-check/video
 */
router.get('/video', (req, res) => {
  res.json({
    videoConfigured: false,
    provider: null,
    hint: 'Video provider not configured. Wire up Vonage Video (or another provider) in twilioVideo.service.js.'
  });
});

/**
 * SMS / Vonage status
 * GET /api/health-check/vonage
 */
router.get('/vonage', (req, res) => {
  const hasApiKey = !!process.env.VONAGE_API_KEY;
  const hasApiSecret = !!process.env.VONAGE_API_SECRET;
  const hasSmsWebhook = !!(process.env.VONAGE_SMS_WEBHOOK_URL || '').trim();
  res.json({
    vonageConfigured: hasApiKey && hasApiSecret,
    envVarsPresent: { hasApiKey, hasApiSecret, hasSmsWebhook },
    hint: !hasApiKey || !hasApiSecret
      ? 'Set VONAGE_API_KEY and VONAGE_API_SECRET in your environment'
      : !hasSmsWebhook
        ? 'VONAGE_SMS_WEBHOOK_URL is not set — inbound SMS routing may not work'
        : null
  });
});

/**
 * Database Audit Health Check
 * GET /api/health-check/db-audit
 */
router.get('/db-audit', async (req, res) => {
  const auditResult = {
    database: { connected: false, tables: [], tableCount: 0, error: null },
    adminUser: { found: false, email: 'superadmin@plottwistco.com', error: null },
    jwtSigning: { success: false, error: null }
  };

  try {
    try {
      const [tables] = await pool.query('SHOW TABLES');
      const tableNames = tables.map(row => Object.values(row)[0]);
      auditResult.database.connected = true;
      auditResult.database.tables = tableNames;
      auditResult.database.tableCount = tableNames.length;
    } catch (dbError) {
      auditResult.database.error = { message: dbError.message, code: dbError.code, sqlState: dbError.sqlState };
    }

    try {
      const [users] = await pool.query(
        'SELECT id, email, role FROM users WHERE email = ?',
        ['superadmin@plottwistco.com']
      );
      auditResult.adminUser.found = !!(users && users.length > 0);
    } catch (userError) {
      auditResult.adminUser.error = userError.code === 'ER_NO_SUCH_TABLE'
        ? 'users table does not exist (migrations may not have run)'
        : { message: userError.message, code: userError.code, sqlState: userError.sqlState };
    }

    try {
      const jwtSecret = process.env.JWT_SECRET || config.jwt.secret;
      if (!jwtSecret || jwtSecret === 'your-super-secret-jwt-key-change-in-production') {
        auditResult.jwtSigning.error = 'JWT_SECRET is missing or using default value';
      } else {
        jwt.sign({ test: true, timestamp: Date.now() }, jwtSecret, { expiresIn: '1h' });
        auditResult.jwtSigning.success = true;
      }
    } catch (jwtError) {
      auditResult.jwtSigning.error = { message: jwtError.message, type: jwtError.name };
    }

    res.status(200).json(auditResult);
  } catch (error) {
    console.error('Error in db-audit endpoint:', error);
    res.status(500).json({
      error: { message: 'Unexpected error during database audit', details: error.message },
      partialResults: auditResult
    });
  }
});

export default router;
