import { readFileSync } from 'node:fs';
import express from 'express';
import { expect, it, vi } from 'vitest';

// Exercise the actual route declarations with isolated middleware and handler.
// This covers the PUT/PATCH mismatch without booting unrelated client features.
const source = readFileSync(new URL('../client.routes.js', import.meta.url), 'utf8');
function setup(role) {
  const router = express.Router();
  const handler = vi.fn((_req, res) => res.json({ ok: true }));
  const guard = (_req, res, next) => role === 'admin' ? next() : res.status(403).json({ denied: true });
  const declarations = source.split('\n').filter(line => ['put', 'patch'].some(method => line.startsWith(`router.${method}('/:id/guardians/:guardianUserId',`)) || line.startsWith("router.post('/:id/guardians/:guardianUserId/restore',")).join('\n');
  new Function('router', 'requireBackofficeAdmin', 'updateClientGuardian', 'restoreClientGuardian', declarations)(router, guard, handler, handler);
  const request = (method, url = '/4/guardians/20') => new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
    router.handle({ method, url, headers: {} }, res, error => error ? reject(error) : resolve({ status: 404 }));
  });
  return { handler, request };
}
it.each(['PUT', 'PATCH'])('accepts %s guardian contact edits on the same protected handler', async method => {
  const { handler, request } = setup('admin');
  expect(await request(method)).toEqual({ status: 200, body: { ok: true } });
  expect(handler).toHaveBeenCalledOnce();
});
it.each(['PUT', 'PATCH'])('protects %s against unauthorized edits', async method => {
  const { handler, request } = setup('provider');
  expect(await request(method)).toEqual({ status: 403, body: { denied: true } });
  expect(handler).not.toHaveBeenCalled();
});

it.each(['admin','provider'])('protects relationship restoration for %s',async role=>{
 const {handler,request}=setup(role);
 expect((await request('POST','/4/guardians/20/restore')).status).toBe(role==='admin'?200:403);
 expect(handler).toHaveBeenCalledTimes(role==='admin'?1:0);
});
