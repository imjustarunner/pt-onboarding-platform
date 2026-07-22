import express from 'express';
import { body } from 'express-validator';
import {
  listMedia,
  uploadMedia,
  uploadTrainingMedia,
  addExternalMedia,
  deleteMedia
} from '../controllers/trainingMediaLibrary.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticate, requireBackofficeAdmin, listMedia);
router.post(
  '/upload',
  authenticate,
  requireBackofficeAdmin,
  (req, res, next) => {
    uploadTrainingMedia.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: { message: err.message || 'Upload failed' } });
      }
      return next();
    });
  },
  uploadMedia
);
router.post('/external', authenticate, requireBackofficeAdmin, [
  body('title').trim().notEmpty(),
  body('externalUrl').trim().notEmpty()
], addExternalMedia);
router.delete('/:id', authenticate, requireBackofficeAdmin, deleteMedia);

export default router;
