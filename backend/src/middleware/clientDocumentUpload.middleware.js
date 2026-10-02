import multer from 'multer';
import { CLIENT_DOCUMENT_MAX_BYTES, CLIENT_DOCUMENT_MIME_TYPES, CLIENT_DOCUMENT_SIZE_MESSAGE } from '../utils/clientDocumentUpload.js';

const receive = multer({
  storage: multer.memoryStorage(),
  // Busboy emits its size-limit event at equality; allow exactly 25 MB.
  limits: { fileSize: CLIENT_DOCUMENT_MAX_BYTES + 1 },
  fileFilter: (req, file, cb) => {
    if (CLIENT_DOCUMENT_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Only PDF, JPG, and PNG files are allowed.'), { status: 400 }));
  }
}).single('file');

export function receiveClientDocument(req, res, next) {
  receive(req, res, error => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: CLIENT_DOCUMENT_SIZE_MESSAGE } });
    }
    next(error);
  });
}
