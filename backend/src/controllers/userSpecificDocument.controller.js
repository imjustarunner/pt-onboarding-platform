import UserSpecificDocument from '../models/UserSpecificDocument.model.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import StorageService from '../services/storage.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for user-specific document uploads - use memory storage for GCS
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new Error('Only PDF files are allowed for user-specific documents'), false);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

/**
 * Create a user-specific document (non-template)
 * Accepts either:
 * - PDF upload (req.file)
 * - HTML content (req.body.htmlContent)
 */
export const createUserSpecificDocument = async (req, res, next) => {
  try {
    const {
      userId,
      taskId,
      name,
      description,
      documentActionType,
      iconId,
      signatureX,
      signatureY,
      signatureWidth,
      signatureHeight,
      signaturePage,
      htmlContent
    } = req.body;

    const createdByUserId = req.user?.id;

    if (!userId || !taskId || !name) {
      return res.status(400).json({
        error: { message: 'userId, taskId, and name are required' }
      });
    }

    // Only admins can create user-specific documents
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Determine type
    let filePath = null;
    let templateType = 'pdf';
    let finalHtmlContent = null;

    if (req.file) {
      // PDF uploaded -> upload to GCS
      const fileBuffer = req.file.buffer;
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const filename = `user-specific-${uniqueSuffix}${path.extname(req.file.originalname || '.pdf')}`;

      const storageResult = await StorageService.saveUserSpecificDocument(fileBuffer, filename);
      filePath = storageResult.relativePath;

      console.log('User-specific document uploaded to GCS:', filePath);
      templateType = 'pdf';
      finalHtmlContent = null;
    } else if (htmlContent) {
      // HTML document
      templateType = 'html';
      finalHtmlContent = htmlContent;
      filePath = null;
    } else {
      return res.status(400).json({
        error: { message: 'Either a PDF file upload or htmlContent is required' }
      });
    }

    const document = await UserSpecificDocument.create({
      userId: parseInt(userId),
      taskId: parseInt(taskId),
      name,
      description: description ?? null,
      templateType,
      filePath,
      htmlContent: finalHtmlContent,
      documentActionType: documentActionType || 'signature',
      iconId: iconId ? parseInt(iconId) : null,
      signatureX: signatureX !== undefined && signatureX !== '' ? parseFloat(signatureX) : null,
      signatureY: signatureY !== undefined && signatureY !== '' ? parseFloat(signatureY) : null,
      signatureWidth: signatureWidth !== undefined && signatureWidth !== '' ? parseFloat(signatureWidth) : null,
      signatureHeight: signatureHeight !== undefined && signatureHeight !== '' ? parseFloat(signatureHeight) : null,
      signaturePage: signaturePage !== undefined && signaturePage !== '' ? parseInt(signaturePage) : null,
      createdByUserId
    });

    return res.status(201).json(document);
  } catch (error) {
    // With memoryStorage, no local file cleanup needed
    return next(error);
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

    // Permissions: user can see their own docs unless admin/support/supervisor/CPA
    if (
      req.user.role !== 'super_admin' &&
      req.user.role !== 'admin' &&
      req.user.role !== 'support' &&
      req.user.role !== 'clinical_practice_assistant' &&
      document.user_id !== req.user.id
    ) {
      // Supervisor access check
      const User = (await import('../models/User.model.js')).default;
      const requestingUser = await User.findById(req.user.id);
      const isSupervisor = requestingUser && User.isSupervisor(requestingUser);

      if (isSupervisor) {
        const hasAccess = await User.supervisorHasAccess(req.user.id, document.user_id, null);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    return res.json(document);
  } catch (error) {
    return next(error);
  }
};

/**
 * Get all user-specific documents for a user
 */
export const getUserSpecificDocuments = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: { message: 'userId is required' } });
    }

    // Permissions
    if (
      req.user.role !== 'super_admin' &&
      req.user.role !== 'admin' &&
      req.user.role !== 'support' &&
      req.user.role !== 'clinical_practice_assistant' &&
      parseInt(userId) !== req.user.id
    ) {
      const User = (await import('../models/User.model.js')).default;
      const requestingUser = await User.findById(req.user.id);
      const isSupervisor = requestingUser && User.isSupervisor(requestingUser);

      if (isSupervisor) {
        const hasAccess = await User.supervisorHasAccess(req.user.id, parseInt(userId), null);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const documents = await UserSpecificDocument.findByUser(userId);
    return res.json(documents);
  } catch (error) {
    return next(error);
  }
};

/**
 * Update user-specific document
 * Allows updating metadata + optionally:
 * - uploading a new PDF (req.file)
 * - updating htmlContent (req.body.htmlContent)
 */
export const updateUserSpecificDocument = async (req, res, next) => {
  try {
    const { id } = req.params;

    const document = await UserSpecificDocument.findById(id);
    if (!document) {
      return res.status(404).json({ error: { message: 'User-specific document not found' } });
    }

    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const updateData = {};

    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.documentActionType !== undefined) updateData.documentActionType = req.body.documentActionType;

    if (req.body.iconId !== undefined) updateData.iconId = req.body.iconId ? parseInt(req.body.iconId) : null;

    if (req.body.signatureX !== undefined) updateData.signatureX = req.body.signatureX !== '' ? parseFloat(req.body.signatureX) : null;
    if (req.body.signatureY !== undefined) updateData.signatureY = req.body.signatureY !== '' ? parseFloat(req.body.signatureY) : null;
    if (req.body.signatureWidth !== undefined) updateData.signatureWidth = req.body.signatureWidth !== '' ? parseFloat(req.body.signatureWidth) : null;
    if (req.body.signatureHeight !== undefined) updateData.signatureHeight = req.body.signatureHeight !== '' ? parseFloat(req.body.signatureHeight) : null;
    if (req.body.signaturePage !== undefined) updateData.signaturePage = req.body.signaturePage !== '' ? parseInt(req.body.signaturePage) : null;

    // If a new PDF is uploaded
    if (req.file) {
      const fileBuffer = req.file.buffer;
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const filename = `user-specific-${uniqueSuffix}${path.extname(req.file.originalname || '.pdf')}`;

      const storageResult = await StorageService.saveUserSpecificDocument(fileBuffer, filename);
      const newFilePath = storageResult.relativePath;

      console.log('User-specific document updated and uploaded to GCS:', newFilePath);

      // Delete old file from GCS if exists
      if (document.file_path) {
        try {
          const oldFilename = document.file_path.includes('/')
            ? document.file_path.split('/').pop()
            : document.file_path.replace('user_specific_documents/', '');

          await StorageService.deleteUserSpecificDocument(oldFilename);
          console.log('Deleted old user-specific document file:', document.file_path);
        } catch (err) {
          console.warn('Could not delete old file:', err);
        }
      }

      updateData.filePath = newFilePath;
      updateData.templateType = 'pdf';
      updateData.htmlContent = null;
    }

    // If HTML content is updated
    if (req.body.htmlContent !== undefined) {
      updateData.htmlContent = req.body.htmlContent;
      updateData.templateType = 'html';
      updateData.filePath = null;
    }

    const updated = await UserSpecificDocument.update(id, updateData);
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
};

/**
 * Delete user-specific document (and its file in GCS if present)
 */
export const deleteUserSpecificDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const document = await UserSpecificDocument.findById(id);

    if (!document) {
      return res.status(404).json({ error: { message: 'User-specific document not found' } });
    }

    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    if (document.file_path) {
      try {
        const filename = document.file_path.includes('/')
          ? document.file_path.split('/').pop()
          : document.file_path.replace('user_specific_documents/', '');

        await StorageService.deleteUserSpecificDocument(filename);
        console.log('User-specific document file deleted:', document.file_path);
      } catch (err) {
        console.warn('Could not delete file:', err);
      }
    }

    await UserSpecificDocument.delete(id);
    return res.json({ message: 'User-specific document deleted successfully' });
  } catch (error) {
    return next(error);
  }
};
