/**
 * Bootstrap: Listen on PORT immediately so Cloud Run's startup probe succeeds,
 * then load the full Express app. Heavy route imports (payroll, budget, etc.)
 * can take 60+ seconds; Cloud Run would fail before we reach app.listen().
 */
console.log('[bootstrap] Starting...');
import http from 'http';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = '0.0.0.0';

const placeholder = (req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/health' || path === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Server is loading...' }));
  } else {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'starting', message: 'Server is loading...' }));
  }
};

const server = http.createServer(placeholder);
server.listen(PORT, HOST, () => {
  console.log(`🚀 Listening on http://${HOST}:${PORT} (bootstrap)`);
  // Load full app and replace handler
  import('./server.js')
    .then(({ app }) => {
      server.removeAllListeners('request');
      server.on('request', app);
      console.log('📝 Full application loaded');
    })
    .catch((err) => {
      console.error('❌ Failed to load application:', err);
      process.exit(1);
    });
});
server.on('error', (err) => {
  console.error('❌ Bootstrap server error:', err);
  process.exit(1);
});
