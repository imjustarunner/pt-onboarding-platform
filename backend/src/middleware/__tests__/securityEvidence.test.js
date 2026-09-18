import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
vi.mock('../../services/securityEvidence.service.js', () => ({ appendSecurityEvidence: vi.fn(), evidenceFailure: vi.fn() }));
vi.mock('../../services/personalSessionHistory.service.js', () => ({ recordAccountSession: vi.fn() }));
import { createSecurityEvidenceMiddleware } from '../securityEvidence.middleware.js';

function response() {
  const res = new EventEmitter(); res.headers = {}; res.statusCode = 200;
  res.setHeader = (k,v) => { res.headers[k.toLowerCase()] = v; }; res.getHeader = k => res.headers[k.toLowerCase()];
  res.status = n => { res.statusCode = n; return res; };
  res.write = () => true; res.end = () => { res.writableFinished = true; res.emit('finish'); }; res.json = body => { res.body = body; res.end(JSON.stringify(body)); return res; };
  return res;
}
const request = () => ({ method: 'GET', originalUrl: '/api/documents/8/download?token=secret', headers: { authorization: 'Bearer NEVER-LOG', 'user-agent': 'Browser' }, cookies: {}, socket: { remoteAddress: '127.0.0.1' }, params: { id: '8' }, route: { path: '/:id/download' }, baseUrl: '/api/documents' });
let events, append, failure;
beforeEach(() => { events = []; append = vi.fn(async e => { events.push(e); }); failure = vi.fn(); });
describe('durable request evidence', () => {
  it('persists received then verified identity before the action and records file completion once', async () => {
    const req = request(), res = response(); let ran = false;
    await createSecurityEvidenceMiddleware({ append, failure })(req, res, () => { ran = true; });
    expect(ran).toBe(true); expect(events.map(e => e.phase)).toEqual(['received']);
    await req.auditIdentify({ id: 507, email: 'rachel@example.com', role: 'admin', sessionId: 'session-123' });
    res.setHeader('Content-Disposition', 'attachment; filename="private.pdf"'); res.write('abc'); res.end('de'); res.emit('close');
    await Promise.resolve();
    expect(events.map(e => e.phase)).toEqual(['received','authenticated','completed']);
    expect(events[2]).toMatchObject({ userId: 507, action: 'file_response', outcome: 'response_sent', responseBytes: 5 });
    expect(events[2].sessionRef).toHaveLength(64);
    const serialized = JSON.stringify(events); for (const secret of ['NEVER-LOG','token=secret','private.pdf','session-123']) expect(serialized).not.toContain(secret);
  });
  it('does not run protected operations when initial evidence cannot be persisted', async () => {
    append.mockRejectedValue(Object.assign(new Error('sensitive SQL'), { code: 'ER_NO_SUCH_TABLE' }));
    const next = vi.fn(), res = response(); await createSecurityEvidenceMiddleware({ append, failure })(request(), res, next);
    expect(next).not.toHaveBeenCalled(); expect(res.statusCode).toBe(503); expect(res.body.error.code).toBe('EVIDENCE_UNAVAILABLE'); expect(failure).toHaveBeenCalled();
  });
  it('fails authentication closed if identity recording fails', async () => {
    const req = request(); await createSecurityEvidenceMiddleware({ append, failure })(req, response(), () => {});
    append.mockRejectedValue(new Error('DB down'));
    await expect(req.auditIdentify({ id: 507 })).rejects.toMatchObject({ code: 'EVIDENCE_UNAVAILABLE', status: 503 });
  });
  it('retains start evidence and raises a diagnostic when completion writing fails', async () => {
    const req = request(), res = response(); await createSecurityEvidenceMiddleware({ append, failure })(req, res, () => {});
    append.mockRejectedValue(new Error('DB down')); res.end('data'); await Promise.resolve(); await Promise.resolve();
    expect(events).toHaveLength(1); expect(failure).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'completed');
  });
  it('records a disconnected response as interrupted rather than a successful download', async () => {
    const res = response(); await createSecurityEvidenceMiddleware({ append, failure })(request(), res, () => {});
    res.write('abc'); res.emit('close'); await Promise.resolve(); expect(events.at(-1)).toMatchObject({ outcome: 'interrupted', responseBytes: 3 });
  });
  it('labels signed links returned by any JSON handler and never logs the URL', async () => {
    const res = response(); await createSecurityEvidenceMiddleware({ append, failure })(request(), res, () => {});
    res.json({ bundles: [{ downloadUrl: 'https://bucket.example/a?X-Goog-Signature=SECRET' }] }); await Promise.resolve();
    expect(events.at(-1)).toMatchObject({ action: 'download_link_issued', outcome: 'issued' }); expect(JSON.stringify(events)).not.toContain('SECRET');
  });
  it('audits login issuance with the issued identity', async () => {
    const req = request(), res = response(); await createSecurityEvidenceMiddleware({ append, failure })(req,res,()=>{});
    await req.auditIdentify({ id: 507, sessionId: 'new-session' }, 'session_issued'); res.json({ ok: true });
    expect(events.at(-1)).toMatchObject({ userId: 507, action: 'login', outcome: 'succeeded' });
  });
  it('records zero body bytes for HEAD even when a handler supplies a body', async () => {
    const req = { ...request(), method: 'HEAD' }, res = response();
    await createSecurityEvidenceMiddleware({ append, failure })(req, res, () => {});
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Length', '500');
    res.end('not transmitted for HEAD');
    expect(events.at(-1)).toMatchObject({ action: 'file_metadata', outcome: 'metadata_only', responseBytes: 0, details: { transfer: { bodyPermitted: false, declaredBytes: 500 } } });
  });
});
