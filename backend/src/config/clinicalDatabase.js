import mysql from 'mysql2/promise';

function resolvePoolConfig() {
  const host = process.env.CLINICAL_DB_HOST || process.env.DB_HOST || 'localhost';
  const isUnixSocket = host.startsWith('/cloudsql/') || host.startsWith('/');

  const cfg = {
    user: process.env.CLINICAL_DB_USER || process.env.DB_USER || 'onboarding_user',
    password: process.env.CLINICAL_DB_PASSWORD || process.env.DB_PASSWORD || 'onboarding_pass',
    database: process.env.CLINICAL_DB_NAME || 'onboarding_stage_clinical',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.CLINICAL_DB_CONNECTION_LIMIT || '10', 10),
    queueLimit: 0,
    connectTimeout: 60000,
    timezone: '+00:00',
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  };

  if (isUnixSocket) {
    cfg.socketPath = host;
  } else {
    cfg.host = host;
    cfg.port = parseInt(process.env.CLINICAL_DB_PORT || process.env.DB_PORT || '3307', 10);
  }

  return cfg;
}

const clinicalPool = mysql.createPool(resolvePoolConfig());

clinicalPool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

clinicalPool.on('error', (err) => {
  console.error('[clinicalDatabase] Pool error:', err?.message || err);
});

export default clinicalPool;

