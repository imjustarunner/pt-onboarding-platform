import UserSpecificDocument from '../models/UserSpecificDocument.model.js';
import { authenticate } from '../middleware/auth.middleware.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for user-specific document uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/user_specific_documents');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `user-doc-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed for user-specific documents'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

/**
 * Create a user-specific document (non-template)
 */
export const createUserSpecificDocument = async (req, res, next) => {
  try {
    const { userId, taskId, name, description, documentActionType, iconId, signatureX, signatureY, signatureWidth, signatureHeight, signaturePage } = req.body;
    const createdByUserId = req.user.id;

    if (!userId || !taskId || !name) {
      return res.status(400).json({ 
        error: { message: 'userId, taskId, and name are required' } 
      });
    }

    // Check permissions - only admins can create user-specific documents
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    let filePath = null;
    let htmlContent = null;
    let templateType = 'pdf';

    if (req.file) {
      // PDF file uploaded
      filePath = `user_specific_documents/${req.file.filename}`;
      templateType = 'pdf';
    } else if (req.body.htmlContent) {
      // HTML content provided
      htmlContent = req.body.htmlContent;
      templateType = 'html';
    } else {
      return res.status(400).json({ 
        error: { message: 'Either a PDF file or HTML content is required' } 
      });
    }

    const document = await UserSpecificDocument.create({
      userId: parseInt(userId),
      taskId: parseInt(taskId),
      name,
      description: description || null,
      templateType,
      filePath,
      htmlContent,
      documentActionType: documentActionType || 'signature',
      iconId: iconId ? parseInt(iconId) : null,
      signatureX: signatureX ? parseFloat(signatureX) : null,
      signatureY: signatureY ? parseFloat(signatureY) : null,
      signatureWidth: signatureWidth ? parseFloat(signatureWidth) : null,
      signatureHeight: signatureHeight ? parseFloat(signatureHeight) : null,
      signaturePage: signaturePage ? parseInt(signaturePage) : null,
      createdByUserId
    });

    res.status(201).json(document);
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (e) {
        console.error('Error cleaning up file:', e);
      }
    }
    next(error);
  }
};

/**
 * Get user-specific document by ID
 */
export const getUserSpecificDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const document = await UserSpecificDocument.findById(id);

    if (!document) {
      return res.status(404).json({ error: { message: 'User-specific document not found' } });
    }

    // Check permissions - user can only see their own documents unless admin/supervisor/CPA
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin' && req.user.role !== 'support' && document.user_id !== req.user.id) {
      // Check if supervisor/CPA has access to this user
      const User = (await import('../models/User.model.js')).default;
      const requestingUser = await User.findById(req.user.id);
      const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
      
      if (isSupervisor || req.user.role === 'clinical_practice_assistant') {
        const hasAccess = await User.supervisorHasAccess(req.user.id, document.user_id, null);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    res.json(document);
  } catch (error) {
    next(error);
  }
};

/**
 * Get all user-specific documents for a user
 */
export const getUserSpecificDocuments = async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Check permissions
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin' && req.user.role !== 'support' && parseInt(userId) !== req.user.id) {
      // Check if supervisor/CPA has access to this user
      const User = (await import('../models/User.model.js')).default;
      const requestingUser = await User.findById(req.user.id);
      const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
      
      if (isSupervisor || req.user.role === 'clinical_practice_assistant') {
        const hasAccess = await User.supervisorHasAccess(req.user.id, parseInt(userId), null);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const documents = await UserSpecificDocument.findByUser(userId);
    res.json(documents);
  } catch (error) {
    next(error);
  }
};

/**
 * Update user-specific document
 */
export const updateUserSpecificDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const document = await UserSpecificDocument.findById(id);

    if (!document) {
      return res.status(404).json({ error: { message: 'User-specific document not found' } });
    }

    // Check permissions
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updateData = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.documentActionType !== undefined) updateData.documentActionType = req.body.documentActionType;
    if (req.body.iconId !== undefined) updateData.iconId = req.body.iconId ? parseInt(req.body.iconId) : null;
    if (req.body.signatureX !== undefined) updateData.signatureX = req.body.signatureX ? parseFloat(req.body.signatureX) : null;
    if (req.body.signatureY !== undefined) updateData.signatureY = req.body.signatureY ? parseFloat(req.body.signatureY) : null;
    if (req.body.signatureWidth !== undefined) updateData.signatureWidth = req.body.signatureWidth ? parseFloat(req.body.signatureWidth) : null;
    if (req.body.signatureHeight !== undefined) updateData.signatureHeight = req.body.signatureHeight ? parseFloat(req.body.signatureHeight) : null;
    if (req.body.signaturePage !== undefined) updateData.signaturePage = req.body.signaturePage ? parseInt(req.body.signaturePage) : null;

    // Handle file upload if provided
    if (req.file) {
      // Delete old file if exists
      if (document.file_path) {
        try {
          const oldPath = path.join(__dirname, '../../uploads', document.file_path);
          await fs.unlink(oldPath);
        } catch (err) {
          console.warn('Could not delete old file:', err);
        }
      }
      updateData.filePath = `user_specific_documents/${req.file.filename}`;
      updateData.templateType = 'pdf';
    }

    // Handle HTML content update
    if (req.body.htmlContent !== undefined) {
      updateData.htmlContent = req.body.htmlContent;
      updateData.templateType = 'html';
    }

    const updated = await UserSpecificDocument.update(id, updateData);
    res.json(updated);
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (e) {
        console.error('Error cleaning up file:', e);
      }
    }
    next(error);
  }
};

/**
 * Delete user-specific document
 */
export const deleteUserSpecificDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const document = await UserSpecificDocument.findById(id);

    if (!document) {
      return res.status(404).json({ error: { message: 'User-specific document not found' } });
    }

    // Check permissions
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Delete file if exists
    if (document.file_path) {
      try {
        const filePath = path.join(__dirname, '../../uploads', document.file_path);
        await fs.unlink(filePath);
      } catch (err) {
        console.warn('Could not delete file:', err);
      }
    }

    await UserSpecificDocument.delete(id);
    res.json({ message: 'User-specific document deleted successfully' });
  } catch (error) {
    next(error);
  }
};

