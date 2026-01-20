import express from 'express';
import {
  getAllIcons,
  getIconById,
  uploadIcon,
  bulkUploadIcons,
  updateIcon,
  deleteIcon,
  bulkEditIcons,
  bulkDeleteIcons,
  upload,
  uploadMultiple
} from '../controllers/icon.controller.js';
import { authenticate, requireBackofficeAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { body } from 'express-validator';

const router = express.Router();

// All routes require authentication and admin role (admin or super_admin)
router.use(authenticate);
router.use(requireBackofficeAdmin);

router.get('/', getAllIcons);
router.get('/:id', getIconById);

// Upload route - multer must process form first, then validation
router.post(
  '/upload',
  upload.single('icon'),
  (req, res, next) => {
    // Validation runs after multer processes the form
    console.log('=== VALIDATION MIDDLEWARE ===');
    console.log('req.body:', JSON.stringify(req.body, null, 2));
    console.log('req.body.name:', req.body.name, 'type:', typeof req.body.name);
    console.log('req.body.agencyId:', req.body.agencyId, 'type:', typeof req.body.agencyId);
    console.log('req.body keys:', Object.keys(req.body));
    console.log('req.file:', req.file ? 'exists' : 'missing');
    
    const errors = [];
    const name = req.body.name;
    
    if (!name) {
      errors.push({ msg: 'Icon name is required', param: 'name', location: 'body' });
    } else if (typeof name === 'string' && name.trim() === '') {
      errors.push({ msg: 'Icon name cannot be empty', param: 'name', location: 'body' });
    } else if (typeof name === 'string' && name.trim().length > 255) {
      errors.push({ msg: 'Icon name must be 255 characters or less', param: 'name', location: 'body' });
    }
    
    console.log('Validation errors:', errors);
    
    if (errors.length > 0) {
      console.log('Returning 400 with errors:', errors);
      return res.status(400).json({ error: { message: 'Validation failed', errors } });
    }
    next();
  },
  uploadIcon
);

// Bulk upload route - multiple files at once
router.post(
  '/bulk-upload',
  uploadMultiple.array('icons', 50), // Allow up to 50 files
  (req, res, next) => {
    // Basic validation - files are required
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: { message: 'No files uploaded. Please select at least one icon file.' } });
    }
    next();
  },
  bulkUploadIcons
);

// Update route - supports both metadata-only updates and file uploads
router.put(
  '/:id',
  upload.single('icon'), // Allow optional file upload
  [
    body('name').optional().trim().notEmpty().withMessage('Icon name cannot be empty'),
    body('name').optional().isLength({ min: 1, max: 255 }).withMessage('Icon name must be between 1 and 255 characters')
  ],
  updateIcon
);

router.delete('/:id', deleteIcon);

export default router;

