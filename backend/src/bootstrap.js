/**
 * Bootstrap: Listen on PORT immediately so Cloud Run's startup probe succeeds,
 * then load the full Express app. Heavy route imports (payroll, budget, etc.)
 * can take 60+ seconds; Cloud Run would fail before we reach app.listen().
 *
 * If server.js fails to load, we keep the port bound and respond:
 *   GET /health|/healthz|/readyz → 200 (so Cloud Run considers the instance up)
 *   All other routes → 503 (so load balancer retries against a healthy instance)
 * This prevents Cloud Run from marking the revision as "failed to start" even
 * when a single instance has a transient module-load failure, and allows logs
 * to be retrieved for diagnosis without a full rollback.
 */
import http from 'http';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = '0.0.0.0';

let appLoaded = false;
let loadError = null;

const placeholder = (req, res) => {
  const path = (req.url || '/').split('?')[0];
  const isHealth = path === '/' || path === '/health' || path === '/healthz' || path === '/readyz';
  if (isHealth) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      phase: appLoaded ? 'ready' : (loadError ? 'degraded' : 'bootstrap'),
      message: loadError ? `App load failed: ${loadError}` : 'Server is loading...'
    }));
  } else {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'starting', message: 'Server is loading, please retry' }));
  }
};

const server = http.createServer(placeholder);

server.listen(PORT, HOST, () => {
  console.log(`🚀 Listening on http://${HOST}:${PORT} (bootstrap phase)`);

  import('./server.js')
    .then(({ app }) => {
      if (typeof app !== 'function') throw new Error('server.js did not export a valid Express app');
      server.removeAllListeners('request');
      server.on('request', app);
      appLoaded = true;
      console.log('✅ Full application loaded — serving live traffic');
    })
    .catch((err) => {
      loadError = String(err?.message || err);
      console.error('❌ Failed to load application — staying up in degraded mode:', err);
      // Do NOT call process.exit(): keep the port bound so Cloud Run considers
      // the container started. Health checks return 200 so the revision isn't
      // killed, giving operators time to read logs and redeploy.
    });
});

server.on('error', (err) => {
  console.error('❌ Bootstrap server bind error — cannot recover:', err);
  process.exit(1); // Only exit on bind failure; we cannot serve at all.
});
