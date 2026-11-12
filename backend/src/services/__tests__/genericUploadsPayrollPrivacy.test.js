import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, it, vi } from 'vitest';

// Exercise the actual production handler and its two actual registrations while
// replacing only its storage dependency. Importing server.js would boot workers.
const serverUrl = new URL('../../server.js', import.meta.url);
const source = fs.readFileSync(serverUrl, 'utf8');
const start = source.indexOf('const uploadsHandler = async (req, res, next) => {');
const end = source.indexOf('// Serve uploads from both', start);
if (start < 0 || end < 0) throw new Error('The production uploads handler could not be located.');
const productionHandler = source.slice(start, end);
const storageImport = "const StorageService = (await import('./services/storage.service.js')).default;";
if (!productionHandler.includes(storageImport)) throw new Error('Update the storage injection for the production uploads handler.');
const registrations = [...source.matchAll(/^app\.use\('(?:\/api)?\/uploads', uploadsHandler\);$/gm)].map(match => match[0]);
const storage = { getGCSBucket: vi.fn(), getSignedUrl: vi.fn() };
const handler = new Function('__storage', 'config', 'path', '__dirname', 'console',
  productionHandler.replace(storageImport, 'const StorageService = __storage;') + '\nreturn uploadsHandler;')(
  storage, { nodeEnv: 'production' }, path, path.dirname(fileURLToPath(serverUrl)), { log() {}, warn() {}, error() {} }
);
const mounts = new Map();
new Function('app', 'uploadsHandler', registrations.join('\n'))({ use: (prefix, fn) => mounts.set(prefix, fn) }, handler);
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), send: vi.fn(), redirect: vi.fn(), setHeader: vi.fn() });
beforeEach(() => vi.resetAllMocks());

it('covers both production generic-upload mounts', () => {
  expect([...mounts.keys()]).toEqual(['/uploads', '/api/uploads']);
});

it.each(['/uploads', '/api/uploads'].flatMap(mount => [
  [mount, '/ticket_attachments/ticket_70/synthetic-payroll.csv'],
  [mount, '/%74icket_attachments/ticket_70/synthetic-payroll.csv'],
  [mount, '/uploads/ticket_attachments/ticket_70/synthetic-payroll.csv'],
  [mount, '/uploads/uploads/ticket_attachments/ticket_70/synthetic-payroll.csv']
]))('blocks a known payroll-ticket CSV through %s%s before any storage read or signed URL', async (mount, requestPath) => {
  const res = response(), next = vi.fn();
  await mounts.get(mount)({ path: requestPath }, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({ error: { message: 'Access denied for sensitive document path' } });
  expect(storage.getGCSBucket).not.toHaveBeenCalled();
  expect(storage.getSignedUrl).not.toHaveBeenCalled();
  expect(res.send).not.toHaveBeenCalled();
  expect(res.redirect).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

it('keeps public branding assets available through the same handler', async () => {
  const bytes = Buffer.from('<svg>synthetic-public-logo</svg>');
  const download = vi.fn(async () => [bytes]);
  storage.getGCSBucket.mockResolvedValue({ file: () => ({ exists: async () => [true], download,
    getMetadata: async () => [{ contentType: 'image/svg+xml' }] }) });
  const res = response();
  await mounts.get('/uploads')({ path: '/icons/public-logo.svg' }, res, vi.fn());
  expect(download).toHaveBeenCalledOnce();
  expect(res.send).toHaveBeenCalledWith(bytes);
  expect(res.status).not.toHaveBeenCalled();
});
