import mysql from 'mysql2/promise';

function resolveClinicalHost() {
  const mainHost = String(process.env.DB_HOST || 'localhost').trim();
  const clinicalHostRaw = process.env.CLINICAL_DB_HOST
    ? String(process.env.CLINICAL_DB_HOST).trim()
    : '';

  if (clinicalHostRaw) {
    const clinicalLower = clinicalHostRaw.toLowerCase();
    const clinicalIsLoopback =
      clinicalLower === 'localhost' || clinicalLower === '127.0.0.1' || clinicalLower === '::1';
    const mainIsSocket = mainHost.startsWith('/cloudsql/') || mainHost.startsWith('/');
    const mainIsRemote =
      mainIsSocket || (mainHost !== 'localhost' && mainHost !== '127.0.0.1' && mainHost !== '::1');
    // Common deploy misconfig: CLINICAL_DB_HOST=127.0.0.1 while main DB uses Cloud SQL socket/host.
    if (clinicalIsLoopback && mainIsRemote) {
      console.warn(
        '[clinicalDatabase] CLINICAL_DB_HOST points at loopback but DB_HOST is remote — using DB_HOST for clinical plane'
      );
      return mainHost;
    }
    return clinicalHostRaw;
  }
  return mainHost;
}

function resolvePoolConfig() {
  const host = resolveClinicalHost();
  const isUnixSocket = host.startsWith('/cloudsql/') || host.startsWith('/');

  const cfg = {
    user: process.env.CLINICAL_DB_USER || process.env.DB_USER || 'onboarding_user',
    password: process.env.CLINICAL_DB_PASSWORD || process.env.DB_PASSWORD || 'onboarding_pass',
    database: process.env.CLINICAL_DB_NAME || 'onboarding_stage_clinical',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.CLINICAL_DB_CONNECTION_LIMIT || '10', 10),
    maxIdle: parseInt(process.env.CLINICAL_DB_MAX_IDLE || '5', 10),
    idleTimeout: parseInt(process.env.CLINICAL_DB_IDLE_TIMEOUT_MS || '60000', 10),
    maxPreparedStatements: parseInt(process.env.CLINICAL_DB_MAX_PREPARED_STATEMENTS || '200', 10),
    queueLimit: 0,
    connectTimeout: 60000,
    timezone: '+00:00',
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: 'utf8mb4_unicode_ci'
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
