// Read-only: no migrations, key generation, traffic, or maintenance jobs.
process.env.SKIP_DB_CONNECT = '1';
const { default: pool } = await import('../config/database.js');
try {
  const { requireSecurityReadiness } = await import('../services/securityEvidence.service.js');
  await requireSecurityReadiness();
  console.log('Security readiness passed: schema, append-only triggers, MFA key configuration, and proxy configuration.');
  console.log('This check does not verify historical evidence coverage, key decryption, or cloud log retention.');
} catch (error) {
  console.error('Security readiness failed. Review the component and error code above.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
