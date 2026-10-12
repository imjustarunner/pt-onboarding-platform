import { describe, expect, it, vi } from 'vitest';
import { PassThrough, Readable } from 'node:stream';
import { boundedLibraryStorage, uploadLibraryFile, libraryUploadError, LIBRARY_FILE_LIMIT, LIBRARY_BATCH_FILES } from '../libraryUploads.js';

// Exercise the actual Multer/Busboy middleware without an HTTP listener or
// allocating a second copy of a large multipart body.
async function multipart(files, middleware = uploadLibraryFile.array('files', LIBRARY_BATCH_FILES)) {
  const boundary = 'library-upload-test-boundary';
  async function* body() {
    for (const file of files) {
      yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name || 'Guide.pdf'}"\r\nContent-Type: ${file.type || 'application/pdf'}\r\n\r\n`);
      const chunk = Buffer.alloc(64 * 1024, 65);
      for (let remaining = file.size ?? 4; remaining > 0; remaining -= chunk.length) yield chunk.subarray(0, Math.min(remaining, chunk.length));
      yield Buffer.from('\r\n');
    }
    yield Buffer.from(`--${boundary}--\r\n`);
  }
  const req = Readable.from(body());
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}`, 'transfer-encoding': 'chunked' };
  const error = await new Promise(resolve => middleware(req, {}, resolve));
  return { req, error };
}

describe('bounded library upload storage', () => {
  it('shares the aggregate byte budget across files and calls the error callback only once', () => {
    const storage = boundedLibraryStorage(10), req = {};
    const first = new PassThrough(), second = new PassThrough();
    const firstDone = vi.fn(), secondDone = vi.fn();
    storage._handleFile(req, { stream: first }, firstDone);
    first.emit('data', Buffer.from('123456')); first.emit('end');
    expect(firstDone).toHaveBeenCalledWith(null, { buffer: Buffer.from('123456'), size: 6 });
    storage._handleFile(req, { stream: second }, secondDone);
    second.emit('data', Buffer.from('1234'));
    expect(secondDone).not.toHaveBeenCalled();
    second.emit('data', Buffer.from('5'));
    second.emit('data', Buffer.from('more bytes'));
    second.emit('error', new Error('late stream error')); second.emit('end');
    expect(secondDone).toHaveBeenCalledTimes(1);
    expect(secondDone).toHaveBeenCalledWith(expect.objectContaining({ status: 400, message: expect.stringContaining('100 MB') }), undefined);
  });
  it('accepts exactly the aggregate limit, releases removed buffers, and propagates stream errors', () => {
    const storage = boundedLibraryStorage(4), stream = new PassThrough(), done = vi.fn();
    storage._handleFile({}, { stream }, done);
    stream.emit('data', Buffer.from('1234')); stream.emit('end');
    const saved = done.mock.calls[0][1]; expect(saved.size).toBe(4);
    const removed = vi.fn(); storage._removeFile({}, saved, removed);
    expect(saved.buffer).toBeUndefined(); expect(removed).toHaveBeenCalledWith(null);
    const broken = new PassThrough(), failed = vi.fn(), error = new Error('Disconnected');
    storage._handleFile({}, { stream: broken }, failed); broken.emit('error', error); broken.emit('end');
    expect(failed).toHaveBeenCalledTimes(1); expect(failed).toHaveBeenCalledWith(error, undefined);
  });
});

describe('library multipart limits', () => {
  it('accepts 50 files and rejects a 51st file with an actionable message', async () => {
    const valid = await multipart(Array.from({ length: 50 }, () => ({ size: 1 })));
    expect(valid.error).toBeUndefined(); expect(valid.req.files).toHaveLength(50);
    const invalid = await multipart(Array.from({ length: 51 }, () => ({ size: 1 })));
    expect(invalid.error.code).toBe('LIMIT_FILE_COUNT');
    expect(libraryUploadError(invalid.error)).toBe('Upload up to 50 files at a time.');
  });
  it('accepts a file at 40 MB and rejects one byte over the limit', async () => {
    const valid = await multipart([{ size: LIBRARY_FILE_LIMIT }]);
    expect(valid.error).toBeUndefined(); expect(valid.req.files[0].size).toBe(LIBRARY_FILE_LIMIT);
    const invalid = await multipart([{ size: LIBRARY_FILE_LIMIT + 1 }]);
    expect(invalid.error.code).toBe('LIMIT_FILE_SIZE');
    expect(libraryUploadError(invalid.error)).toContain('40 MB');
  }, 15000);
  it('rejects the total batch over 100 MB even when every individual file is within 40 MB', async () => {
    const { error, req } = await multipart([{ size: 35 * 1024 * 1024 }, { size: 35 * 1024 * 1024 }, { size: 31 * 1024 * 1024 }]);
    expect(error).toMatchObject({ status: 400, message: expect.stringContaining('100 MB') });
    expect(req.files.every(file => !file.buffer)).toBe(true);
  }, 15000);
  it.each([{ name: 'video.MP4', type: 'application/octet-stream' }, { name: 'guide.pdf', type: 'video/quicktime' }])
    ('directs video uploads to hosted links ($name, $type)', async file => {
      const { error, req } = await multipart([file]);
      expect(error.message).toContain('Video link'); expect(req.files).toHaveLength(0);
    });
  it('rejects unsupported extensions before retaining file contents', async () => {
    const { error, req } = await multipart([{ name: 'active.html', type: 'text/html' }]);
    expect(error.message).toContain('PDF, Word, Excel'); expect(req.files).toHaveLength(0);
  });
});

it.each([
  ['Guide.pdf', 'application/pdf'], ['Photo.jpg', 'image/jpeg'],
  ['Worksheet.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
])('stores %s under the private library prefix', async (filename, contentType) => {
  const {default: StorageService} = await import('../storage.service.js');
  const save = vi.fn().mockResolvedValue(undefined), file = vi.fn(() => ({save}));
  const bucket = vi.spyOn(StorageService, 'getGCSBucket').mockResolvedValue({file});
  try {
    const result = await StorageService.saveLibraryResource({agencyId:2,uploadedByUserId:7,fileBuffer:Buffer.from('test'),filename,contentType});
    expect(result.path).toMatch(/^phi-documents\/library\/agency_2\//);
    expect(file).toHaveBeenCalledWith(result.path);expect(save).toHaveBeenCalled();
  } finally {bucket.mockRestore();}
});
