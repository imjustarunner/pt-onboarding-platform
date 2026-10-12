import multer from 'multer';

export const LIBRARY_FILE_LIMIT = 40 * 1024 * 1024;
export const LIBRARY_BATCH_LIMIT = 100 * 1024 * 1024;
export const LIBRARY_BATCH_FILES = 50;
const receivedBytes = Symbol('libraryUploadBytes');
const videoFile = file => /^video\//i.test(file.mimetype || '') || /\.(mp4|mov|m4v|webm|avi|mkv|wmv|mpeg|mpg)$/i.test(file.originalname || '');
const allowedExtension = /\.(pdf|docx?|xlsx?|csv|pptx?|jpe?g|png|gif|webp|txt)$/i;
const invalid = message => Object.assign(new Error(message), { status: 400 });

// Bound the whole multipart upload while receiving it, before all buffers are
// allocated. Multer separately enforces each file's size and the file count.
export function boundedLibraryStorage(maxBytes = LIBRARY_BATCH_LIMIT) {
  return {
    _handleFile(req, file, callback) {
      let chunks = [], size = 0, finished = false;
      const finish = (error, value) => { if (finished) return; finished = true; chunks = []; callback(error, value); };
      file.stream.on('data', chunk => {
        if (finished) return;
        req[receivedBytes] = (req[receivedBytes] || 0) + chunk.length;
        if (req[receivedBytes] > maxBytes) return finish(invalid('Upload up to 100 MB at a time. Split this folder into smaller uploads.'));
        size += chunk.length; chunks.push(chunk);
      });
      file.stream.on('error', error => finish(error));
      file.stream.on('end', () => { if (!finished) finish(null, { buffer: Buffer.concat(chunks), size }); });
    },
    _removeFile(req, file, callback) {
      const buffer = file.buffer;
      delete file.buffer;
      // Multer copies stored metadata into its public request file entries.
      // Release those references too when a later file aborts the batch.
      const entries = Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
      for (const entry of [req.file, ...entries]) if (entry && entry.buffer === buffer) delete entry.buffer;
      callback(null);
    }
  };
}

export const uploadLibraryFile = multer({
  storage: boundedLibraryStorage(),
  limits: { fileSize: LIBRARY_FILE_LIMIT + 1, files: LIBRARY_BATCH_FILES, fields: 100, fieldSize: 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (videoFile(file)) return callback(invalid('For videos, choose Video link and paste a YouTube, Vimeo, Loom, Google Drive, or other hosted video link.'));
    if (!allowedExtension.test(file.originalname || '')) return callback(invalid('Use a PDF, Word, Excel, PowerPoint, image, CSV, or text file. For videos, add a Video link.'));
    callback(null, true);
  }
});

export function libraryUploadError(error) {
  if (error.code === 'LIMIT_FILE_SIZE') return 'Each file must be 40 MB or smaller. For videos, use Video link.';
  if (['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(error.code)) return 'Upload up to 50 files at a time.';
  return error.message || 'Upload failed';
}
