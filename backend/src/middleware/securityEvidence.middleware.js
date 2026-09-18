import crypto from 'node:crypto';
import { appendSecurityEvidence, evidenceFailure } from '../services/securityEvidence.service.js';
import { networkEvidence, routeEvidence, resourceEvidence, safeRequestPath, sessionReference, classifyResponse, containsSignedLink, responseHasBody, responseEvidence } from '../utils/securityEvidence.js';
import { evidenceRequestContext } from '../utils/evidenceRequestContext.js';
import { recordAccountSession } from '../services/personalSessionHistory.service.js';

const noise = new Set(['/api/presence/heartbeat', '/api/auth/platform-session/heartbeat', '/api/auth/session-activity']);

export function createSecurityEvidenceMiddleware({ append = appendSecurityEvidence, failure = evidenceFailure } = {}) {
  return async function securityEvidence(req, res, next) {
    const path = String(req.originalUrl || req.path || '').split('?')[0];
    // Include rejected requests with no credentials as well as alternate portal
    // authentication. An attacker must not opt out of evidence by omitting a cookie.
    const eligible = (path.startsWith('/api/') || path.startsWith('/uploads/')) && req.method !== 'OPTIONS'
      && !/^\/api\/health-check(?:\/|$)/.test(path);
    // Heartbeats do not read business data. Explicit resume/logout remain audited.
    if (!eligible || (noise.has(path) && !['resume', 'logout'].includes(req.body?.action))) return next();
    const requestId = crypto.randomUUID();
    const start = Date.now();
    const base = { requestId, method: req.method, route: safeRequestPath(path), ...networkEvidence(req), userAgent: String(req.headers['user-agent'] || '').replace(/[\r\n]/g, '').slice(0, 512) };
    let identity = {};
    let identityDetails = {};
    let identified = '';
    let finalized = false;
    let bytes = 0;
    req.evidenceContext = base;
    res.setHeader('X-Request-ID', requestId);
    req.auditIdentify = async (user, phase = 'authenticated') => {
      const ref = sessionReference(user.sessionId);
      const role = String(user.effectiveRole || user.role || user.type || '').slice(0, 64);
      const key = `${user.id || user.email}:${ref}:${role}:${phase}`;
      if (key === identified) return;
      identity = { userId: user.id || null, email: String(user.email || '').slice(0, 255) || null, role, sessionRef: ref };
      identityDetails = Number.isSafeInteger(user.switchedFromUserId) ? { switchedFromUserId: user.switchedFromUserId } : {};
      req.evidenceIdentity = { ...identity, sessionId: user.sessionId || null };
      if (phase === 'session_issued') req.evidenceAction = 'login';
      try {
        if (phase === 'session_issued') await recordAccountSession(user, req);
        await append({ ...base, ...identity, phase, action: phase === 'session_issued' ? 'login' : 'request', outcome: 'started', route: routeEvidence(req), details: { ...identityDetails, ...resourceEvidence(req) } });
      } catch (error) {
        failure(error, requestId, phase);
        throw Object.assign(new Error('Activity recording is unavailable. Please retry shortly.'), { status: 503, statusCode: 503, code: 'EVIDENCE_UNAVAILABLE' });
      }
      identified = key;
    };
    req.auditLinkIssued = async ({ documentId, clientId } = {}) => {
      req.evidenceAction = 'download_link_issued';
      await durableHook({ ...base, ...identity, phase: 'link_issued', action: 'download_link_issued', outcome: 'issued', route: routeEvidence(req), details: { ...resourceEvidence(req), ...(Number.isInteger(documentId) ? { documentId } : {}), ...(Number.isInteger(clientId) ? { clientId } : {}) } });
    };
    const durableHook = async event => {
      try { await append(event); }
      catch (error) { failure(error, requestId, event.phase); throw Object.assign(new Error('Activity recording is unavailable. Please retry shortly.'), { code: 'EVIDENCE_UNAVAILABLE', status: 503 }); }
    };
    req.auditStorageGrant = async ({ storageRef, expiresAt, grantId }) => {
      if (finalized) return;
      await durableHook({ ...base, ...identity, phase: 'link_prepared', action: 'file_link_prepared', outcome: 'prepared', route: routeEvidence(req), details: { ...resourceEvidence(req), storageRef, expiresAt, ...(grantId ? { grantId } : {}) } });
    };
    try {
      await append({ ...base, phase: 'received', action: 'request', outcome: 'started' });
    } catch (error) {
      failure(error, requestId, 'received');
      return res.status(503).json({ error: { code: 'EVIDENCE_UNAVAILABLE', message: 'Activity recording is unavailable. Please retry shortly.' }, requestId });
    }
    const count = (chunk, encoding) => { if (chunk) bytes += ArrayBuffer.isView(chunk) ? chunk.byteLength : Buffer.byteLength(String(chunk), typeof encoding === 'string' ? encoding : 'utf8'); };
    const originalWrite = res.write;
    const originalEnd = res.end;
    const originalJson = res.json;
    res.json = function(body) {
      if (containsSignedLink(body)) req.evidenceAction = 'download_link_issued';
      return originalJson.call(this, body);
    };
    res.write = function(chunk, ...args) { count(chunk, args[0]); return originalWrite.call(this, chunk, ...args); };
    res.end = function(chunk, ...args) { count(chunk, args[0]); return originalEnd.call(this, chunk, ...args); };
    const finish = async interrupted => {
      if (finalized) return;
      finalized = true;
      try {
        await append({ ...base, ...identity, phase: 'completed', ...classifyResponse(req, res, interrupted), route: routeEvidence(req), statusCode: res.statusCode, responseBytes: responseHasBody(req, res) ? bytes : 0, durationMs: Math.min(Date.now() - start, 4294967295), details: { ...identityDetails, ...resourceEvidence(req), ...responseEvidence(req, res) } });
      } catch (error) { failure(error, requestId, 'completed'); }
    };
    res.once('finish', () => { void finish(false); });
    res.once('close', () => { if (!res.writableFinished) void finish(true); });
    evidenceRequestContext.run(req, next);
  };
}

export default createSecurityEvidenceMiddleware();
