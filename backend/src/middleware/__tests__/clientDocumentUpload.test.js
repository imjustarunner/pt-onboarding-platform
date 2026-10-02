import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { receiveClientDocument } from '../clientDocumentUpload.middleware.js';

async function upload(size, type = 'application/pdf') {
  const boundary = 'synthetic-upload-boundary';
  const data = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.pdf"\r\nContent-Type: ${type}\r\n\r\n`),
    Buffer.alloc(size, 32), Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const req = Readable.from([data]);
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(data.length) };
  return new Promise(resolve => {
    const res = { status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
    receiveClientDocument(req, res, error => resolve({ error, file: req.file }));
  });
}
describe('client packet upload size', () => {
  it('accepts the reported 16 MB PDF intact', async () => {
    const result = await upload(16 * 1024 * 1024);
    expect(result.error).toBeUndefined();
    expect(result.file.size).toBe(16 * 1024 * 1024);
    expect(result.file.buffer.length).toBe(result.file.size);
  });
  it('rejects a PDF larger than 25 MB with the displayed limit', async () => {
    expect(await upload(25 * 1024 * 1024 + 1)).toMatchObject({ status: 413, body: { error: { code: 'FILE_TOO_LARGE', message: 'Each file must be 25 MB or smaller.' } } });
  });
  it('accepts exactly the advertised 25 MB maximum', async () => {
    expect((await upload(25 * 1024 * 1024)).file.size).toBe(25 * 1024 * 1024);
  });
  it('continues to reject unsupported file types', async () => {
    expect((await upload(100, 'text/html')).error).toMatchObject({ status: 400 });
  });
});
