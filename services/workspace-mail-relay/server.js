import http from 'node:http';
import nodemailer from 'nodemailer';
import addressparser from 'nodemailer/lib/addressparser/index.js';
import { Storage } from '@google-cloud/storage';
import { dispatchMessage, failure, prepareMessage } from './relay.js';
import { smtpOptions } from './smtpOptions.js';

const domains = String(process.env.WORKSPACE_EMAIL_RELAY_DOMAINS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const bucketName = process.env.WORKSPACE_EMAIL_RELAY_BUCKET;
if (!bucketName || !domains.length || domains.some(d => !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(d))) throw new Error('Configure the relay bucket and approved domains.');
const bucket = new Storage().bucket(bucketName);
const store = {
  async read(key) {
    const file = bucket.file(`deliveries/${key}.json`);
    try {
      // Download with a generation condition so concurrent state changes cannot
      // pair stale bytes with a newer generation during a retry.
      const [metadata] = await file.getMetadata();
      const [bytes] = await bucket.file(file.name, { generation: metadata.generation }).download();
      return { value: JSON.parse(bytes.toString()), generation: metadata.generation };
    } catch (error) { if (Number(error.code) === 404) return null; throw error; }
  },
  async write(key, value, generation) {
    const file = bucket.file(`deliveries/${key}.json`);
    await file.save(JSON.stringify(value), { resumable: false, contentType: 'application/json', preconditionOpts: { ifGenerationMatch: generation } });
    const [metadata] = await file.getMetadata();
    return { value, generation: metadata.generation };
  }
};
const smtp = nodemailer.createTransport(smtpOptions);

// Cloud Run IAM, not a public shared secret, authenticates the app's service
// account. Deployment must use --no-allow-unauthenticated and a narrow invoker.
const server = http.createServer(async (req, res) => {
  const respond = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  if (req.method === 'GET' && req.url === '/health') return respond(200, { ready: true, enabled: process.env.WORKSPACE_EMAIL_RELAY_ENABLED === 'true' });
  if (req.method === 'GET' && req.url === '/readiness') {
    try {
      // Fixed public-IP check, with no patient data, app credentials or headers.
      const response = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('IP check unavailable');
      const { ip } = await response.json();
      if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) throw new Error('Invalid public IP');
      const matchesExpectedIp = ip === process.env.WORKSPACE_EMAIL_RELAY_EXPECTED_IP;
      if (!matchesExpectedIp) return respond(503, { ready: false, ip, matchesExpectedIp });
      await smtp.verify(); // EHLO/STARTTLS only; does not submit an email.
      return respond(200, { ready: true, ip, matchesExpectedIp, smtpTlsVerified: true, administratorRuleVerified: false, enabled: process.env.WORKSPACE_EMAIL_RELAY_ENABLED === 'true' });
    } catch { return respond(503, { ready: false, error: 'relay_readiness_unconfirmed' }); }
  }
  if (req.method !== 'POST' || req.url !== '/send') return respond(404, { error: 'not_found' });
  if (process.env.WORKSPACE_EMAIL_RELAY_ENABLED !== 'true') return respond(503, { error: 'relay_disabled' });
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return respond(415, { error: 'json_required' });
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 14 * 1024 * 1024) throw failure(413, 'message_too_large');
      chunks.push(chunk);
    }
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw failure(400, 'invalid_json'); }
    const message = prepareMessage(input, { domains, parseAddresses: addressparser });
    return respond(200, await dispatchMessage(message, { store, smtp }));
  } catch (error) {
    // Never log message bodies, addresses, MIME, tokens or provider response text.
    return respond(error.status || 503, { error: error.code && error.status ? error.code : 'relay_unavailable' });
  }
});
server.requestTimeout = 30000;
server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
process.on('SIGTERM', () => server.close(() => { smtp.close(); process.exit(0); }));
