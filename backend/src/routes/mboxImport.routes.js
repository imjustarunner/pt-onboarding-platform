import express from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { importMbox, mboxUploadMiddleware } from '../controllers/mboxImport.controller.js';

const router = express.Router();

router.use(authenticate, requireSuperAdmin);

// Multipart — multer runs first so body fields are available on req.body
router.post('/', (req, res, next) => {
  mboxUploadMiddleware(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: { message: err.message || 'Upload failed' } });
    }
    return importMbox(req, res).catch(next);
  });
});

export default router;
