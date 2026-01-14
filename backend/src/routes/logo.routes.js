import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { uploadLogo, upload } from '../controllers/logo.controller.js';

const router = express.Router();

// Upload logo route
router.post('/upload', authenticate, upload.single('logo'), uploadLogo);

export default router;
