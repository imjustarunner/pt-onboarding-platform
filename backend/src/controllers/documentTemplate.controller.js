import DocumentTemplate from '../models/DocumentTemplate.model.js';
import DocumentVariableService from '../services/documentVariable.service.js';
import pool from '../config/database.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { validationResult } from 'express-validator';
import StorageService from '../services/storage.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads - use memory storage for GCS
// Files are uploaded directly to GCS, not saved to local filesystem
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter
});

/**
 * Upload a PDF template to GCS + create a DB record
 */
export const uploadTemplate = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'PDF file is required' } });
    }

    const {
      name,
      description,
      agencyId,
      documentType,
      documentActionType,
      iconId,
      signatureX,
      signatureY,
      signatureWidth,
      signatureHeight,
      signaturePage
    } = req.body;

    const createdByUserId = req.user?.id;

    if (!name) {
      return res.status(400).json({ error: { message: 'name is required' } });
    }

    if (!documentActionType || !['signature', 'review'].includes(documentActionType)) {
      return res.status(400).json({
        error: { message: 'documentActionType is required and must be "signature" or "review"' }
      });
    }

    // Upload directly to GCS from memory buffer
    const fileBuffer = req.file.buffer;
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `template-${uniqueSuffix}${path.extname(req.file.originalname || '.pdf')}`;

    const storageResult = await StorageService.saveTemplate(fileBuffer, filename);
    const filePath = storageResult.relativePath;

    console.log('Template uploaded to GCS:', filePath);

    // Create DB record
    const template = await DocumentTemplate.create({
      name,
      description: description ?? null,
      templateType: 'pdf',
      filePath,
      htmlContent: null,
      agencyId: agencyId ? parseInt(agencyId) : null,
      createdByUserId,
      documentType: documentType || 'administrative',
      documentActionType,
      isUserSpecific: false,
      userId: null,
      iconId: iconId ? parseInt(iconId) : null,
      signatureX: signatureX !== undefined && signatureX !== '' ? parseFloat(signatureX) : null,
      signatureY: signatureY !== undefined && signatureY !== '' ? parseFloat(signatureY) : null,
      signatureWidth: signatureWidth !== undefined && signatureWidth !== '' ? parseFloat(signatureWidth) : null,
      signatureHeight: signatureHeight !== undefined && signatureHeight !== '' ? parseFloat(signatureHeight) : null,
      signaturePage: signaturePage !== undefined && signaturePage !== '' ? parseInt(signaturePage) : null
    });

    return res.status(201).json(template);
  } catch (error) {
    return next(error);
  }
};

export const createTemplate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const {
      name,
      description,
      htmlContent,
      agencyId,
      documentType,
      documentActionType,
      iconId
      // isUserSpecific, userId intentionally ignored here (templates are not user-specific)
    } = req.body;

    const createdByUserId = req.user?.id;

    if (!name) {
      return res.status(400).json({ error: { message: 'name is required' } });
    }

    if (!documentActionType || !['signature', 'review'].includes(documentActionType)) {
      return res.status(400).json({
        error: { message: 'documentActionType is required and must be "signature" or "review"' }
      });
    }

    const template = await DocumentTemplate.create({
      name,
      description: description ?? null,
      templateType: 'html',
      filePath: null,
      htmlContent: htmlContent ?? null,
      agencyId: agencyId ? parseInt(agencyId) : null,
      createdByUserId,
      documentType: documentType || 'administrative',
      documentActionType,
      isUserSpecific: false,
      userId: null,
      iconId: iconId ? parseInt(iconId) : null
    });

    return res.status(201).json(template);
  } catch (error) {
    return next(error);
  }
};

export const getTemplates = async (req, res, next) => {
  try {
    const {
      agencyId,
      documentType,
      isUserSpecific,
      userId,
      page,
      limit,
      sortBy,
      sortOrder,
      isActive
    } = req.query;

    const filters = {};

    // Role-based filtering
    console.log('getTemplates - User role:', req.user.role, 'agencyId query param:', agencyId, 'type:', typeof agencyId);

    if (req.user.role === 'super_admin' || req.user.role === 'support') {
      // Super Admin and Support see all templates
      if (agencyId !== undefined && agencyId !== null && agencyId !== 'all') {
        if (agencyId === 'null' || agencyId === '') {
          filters.agencyId = null;
          console.log('getTemplates - Super admin/support: Setting filters.agencyId = null (platform only)');
        } else {
          filters.agencyId = parseInt(agencyId);
          console.log('getTemplates - Super admin/support: Setting filters.agencyId =', filters.agencyId);
        }
      } else {
        console.log('getTemplates - Super admin/support: No agency filter (showing all)');
      }
    } else if (req.user.role === 'admin') {
      // Agency Admin sees platform templates + their agency templates
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      console.log('getTemplates - Admin user agencies:', agencyIds);

      // Respect the agencyId query parameter if provided
      if (agencyId !== undefined && agencyId !== null && agencyId !== 'all') {
        if (agencyId === 'null' || agencyId === '') {
          // Show only platform templates
          filters.agencyId = null;
          console.log('getTemplates - Admin: Setting filters.agencyId = null (platform only)');
        } else {
          const selectedAgencyId = parseInt(agencyId);
          // Verify admin has access to this agency
          if (agencyIds.includes(selectedAgencyId)) {
            // Show only this specific agency
            filters.agencyId = selectedAgencyId;
            console.log('getTemplates - Admin: Setting filters.agencyId =', filters.agencyId, '(specific agency)');
          } else {
            // Admin doesn't have access - return empty result
            filters.agencyId = -1; // Invalid ID that won't match anything
            console.log('getTemplates - Admin: Setting filters.agencyId = -1 (no access to agency', selectedAgencyId, ')');
          }
        }
      } else {
        // No filter or 'all' - show platform + all their agencies
        filters.agencyIds = [null, ...agencyIds];
        console.log('getTemplates - Admin: Setting filters.agencyIds =', filters.agencyIds, '(platform + all agencies)');
      }
    }

    console.log('getTemplates - Final filters object:', JSON.stringify(filters, null, 2));

    // Document type filtering
    if (documentType && documentType !== 'all') {
      if (documentType.includes(',')) {
        filters.documentType = documentType.split(',').map(t => t.trim());
      } else {
        filters.documentType = documentType;
      }
    }

    // User-specific filtering - default exclude user-specific
    if (isUserSpecific !== undefined) {
      filters.isUserSpecific = isUserSpecific === 'true' || isUserSpecific === true;
    } else {
      filters.isUserSpecific = false;
    }

    // User ID filtering (for user-specific documents) - only if isUserSpecific is true
    if (userId && filters.isUserSpecific) {
      filters.userId = parseInt(userId);
    }

    // Status filter - only apply if explicitly provided
    if (isActive !== undefined && isActive !== null && isActive !== 'all') {
      if (isActive === 'true' || isActive === true || isActive === '1' || isActive === 1) {
        filters.isActive = true;
      } else if (isActive === 'false' || isActive === false || isActive === '0' || isActive === 0) {
        filters.isActive = false;
      }
    }

    // Pagination
    filters.limit = limit ? (parseInt(limit) || 20) : 20;

    if (page) {
      const pageNum = parseInt(page) || 1;
      filters.offset = (pageNum - 1) * filters.limit;
    }

    // Sorting
    if (sortBy) filters.sortBy = sortBy;
    if (sortOrder) filters.sortOrder = sortOrder;

    const result = await DocumentTemplate.findAll(filters);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const getTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { version } = req.query;

    let template;
    if (version) {
      template = await DocumentTemplate.getVersion(id, parseInt(version));
    } else {
      template = await DocumentTemplate.findById(id);
    }

    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    return res.json(template);
  } catch (error) {
    return next(error);
  }
};

export const getTemplateForTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const template = await DocumentTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Verify user has access via an assigned task
    const Task = (await import('../models/Task.model.js')).default;
    const userTasks = await Task.findByUser(userId, { taskType: 'document' });
    const hasAccess = userTasks.some(task => task.reference_id === parseInt(id));

    if (!hasAccess) {
      return res.status(403).json({
        error: { message: 'Access denied. You do not have a task assigned for this template.' }
      });
    }

    return res.json(template);
  } catch (error) {
    return next(error);
  }
};

export const updateTemplate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors in updateTemplate:', errors.array());
      console.error('Request body:', req.body);
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;

    // Sanitize req.body: convert all undefined to null
    const sanitizedInputBody = {};
    Object.keys(req.body).forEach(key => {
      if (req.body[key] === undefined) {
        console.warn(`⚠️ Found undefined in req.body.${key}, converting to null`);
        sanitizedInputBody[key] = null;
      } else {
        sanitizedInputBody[key] = req.body[key];
      }
    });

    const {
      name,
      description,
      htmlContent,
      isActive,
      iconId,
      agencyId,
      signatureX,
      signatureY,
      signatureWidth,
      signatureHeight,
      signaturePage
    } = sanitizedInputBody;

    // Check permissions: Support can only edit their own documents
    if (req.user.role === 'support') {
      const existing = await DocumentTemplate.findById(id);
      if (!existing) {
        return res.status(404).json({ error: { message: 'Template not found' } });
      }
      if (existing.created_by_user_id !== req.user.id) {
        return res.status(403).json({ error: { message: 'You can only edit documents you created' } });
      }
    }

    // Build updateData object, ensuring no undefined values
    const updateData = {};

    if (name !== undefined) updateData.name = name !== null && name !== '' ? name : null;
    if (description !== undefined) updateData.description = description !== null && description !== '' ? description : null;
    if (htmlContent !== undefined) updateData.htmlContent = htmlContent !== null && htmlContent !== '' ? htmlContent : null;

    if (isActive !== undefined) {
      updateData.isActive = isActive === true || isActive === 1 || isActive === '1' || isActive === 'true';
    }

    // iconId
    if (iconId !== undefined) {
      if (iconId === null || iconId === 'null' || iconId === '') {
        updateData.iconId = null;
      } else {
        const parsedIconId = typeof iconId === 'string' ? parseInt(iconId) : iconId;
        updateData.iconId = isNaN(parsedIconId) ? null : parsedIconId;
      }
    }

    // agencyId
    if (agencyId !== undefined) {
      if (agencyId === null || agencyId === 'null' || agencyId === '') {
        updateData.agencyId = null;
      } else {
        const parsedAgencyId = typeof agencyId === 'string' ? parseInt(agencyId) : agencyId;
        updateData.agencyId = isNaN(parsedAgencyId) ? null : parsedAgencyId;
      }
    }

    // signature coords
    if (signatureX !== undefined) {
      if (signatureX === null || signatureX === 'null' || signatureX === '') {
        updateData.signatureX = null;
      } else {
        const parsedX = typeof signatureX === 'string' ? parseFloat(signatureX) : signatureX;
        updateData.signatureX = isNaN(parsedX) ? null : parsedX;
      }
    }

    if (signatureY !== undefined) {
      if (signatureY === null || signatureY === 'null' || signatureY === '') {
        updateData.signatureY = null;
      } else {
        const parsedY = typeof signatureY === 'string' ? parseFloat(signatureY) : signatureY;
        updateData.signatureY = isNaN(parsedY) ? null : parsedY;
      }
    }

    if (signatureWidth !== undefined) {
      if (signatureWidth === null || signatureWidth === 'null' || signatureWidth === '') {
        updateData.signatureWidth = null;
      } else {
        const parsedWidth = typeof signatureWidth === 'string' ? parseFloat(signatureWidth) : signatureWidth;
        updateData.signatureWidth = isNaN(parsedWidth) ? null : parsedWidth;
      }
    }

    if (signatureHeight !== undefined) {
      if (signatureHeight === null || signatureHeight === 'null' || signatureHeight === '') {
        updateData.signatureHeight = null;
      } else {
        const parsedHeight = typeof signatureHeight === 'string' ? parseFloat(signatureHeight) : signatureHeight;
        updateData.signatureHeight = isNaN(parsedHeight) ? null : parsedHeight;
      }
    }

    if (signaturePage !== undefined) {
      if (signaturePage === null || signaturePage === 'null' || signaturePage === '' || signaturePage === 0) {
        updateData.signaturePage = null;
      } else {
        const parsedPage = typeof signaturePage === 'string' ? parseInt(signaturePage) : signaturePage;
        updateData.signaturePage = isNaN(parsedPage) ? null : parsedPage;
      }
    }

    // Final sanitization: ensure no undefined values in updateData
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        updateData[key] = null;
      }
    });

    console.log('=== UPDATE TEMPLATE REQUEST ===');
    console.log('Template ID:', id);

    // IMPORTANT: do NOT redeclare sanitizedBody again (that was crashing before)
    const sanitizedBodyForLog =
      req.sanitizedBody ||
      (await import('../utils/sanitizeRequest.js')).sanitizeRequestBody(req.body);

    console.log('Request body keys:', Object.keys(sanitizedBodyForLog));
    console.log('Sanitized body signature fields:', {
      signatureX: sanitizedBodyForLog.signatureX,
      signatureY: sanitizedBodyForLog.signatureY,
      signatureWidth: sanitizedBodyForLog.signatureWidth,
      signatureHeight: sanitizedBodyForLog.signatureHeight,
      signaturePage: sanitizedBodyForLog.signaturePage
    });

    console.log('UpdateData keys:', Object.keys(updateData));
    console.log('UpdateData signature fields:', {
      signatureX: updateData.signatureX,
      signatureY: updateData.signatureY,
      signatureWidth: updateData.signatureWidth,
      signatureHeight: updateData.signatureHeight,
      signaturePage: updateData.signaturePage
    });

    const template = await DocumentTemplate.update(id, updateData);

    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    return res.json(template);
  } catch (error) {
    console.error('Error in updateTemplate:', error);
    return next(error);
  }
};

export const archiveTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check permissions: Support can only archive their own documents
    if (req.user.role === 'support') {
      const template = await DocumentTemplate.findById(id);
      if (!template) return res.status(404).json({ error: { message: 'Template not found' } });
      if (template.created_by_user_id !== req.user.id) {
        return res.status(403).json({ error: { message: 'You can only archive documents you created' } });
      }
    }

    // Get user's agency ID (use first agency for admins, null for super_admin)
    let archivedByAgencyId = null;
    if (req.user.role !== 'super_admin' && req.user.role !== 'support' && req.user.id) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) archivedByAgencyId = userAgencies[0].id;
    }

    const archived = await DocumentTemplate.archive(id, req.user.id, archivedByAgencyId);
    if (!archived) return res.status(404).json({ error: { message: 'Template not found' } });

    return res.json({ message: 'Template archived successfully' });
  } catch (error) {
    return next(error);
  }
};

export const restoreTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
    }

    const restored = await DocumentTemplate.restore(id, userAgencyIds);
    if (!restored) {
      return res.status(404).json({
        error: { message: 'Template not found, not archived, or you do not have permission to restore it' }
      });
    }

    return res.json({ message: 'Template restored successfully' });
  } catch (error) {
    return next(error);
  }
};

export const getArchivedTemplates = async (req, res, next) => {
  try {
    const selectedAgencyId = req.query.archivedByAgencyId
      ? parseInt(req.query.archivedByAgencyId)
      : null;

    // Get user's agency IDs for filtering
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);

      if (selectedAgencyId && !userAgencyIds.includes(selectedAgencyId)) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }

    const filterAgencyIds = selectedAgencyId
      ? [selectedAgencyId]
      : (req.user.role === 'super_admin' ? null : userAgencyIds);

    const templates = await DocumentTemplate.findAllArchived({
      agencyIds: filterAgencyIds,
      userRole: req.user.role
    });

    // Fetch archived_by_user_name for each template
    const templatesWithNames = await Promise.all(
      templates.map(async (template) => {
        if (template.archived_by_user_id) {
          try {
            const [users] = await pool.execute(
              'SELECT first_name, last_name FROM users WHERE id = ?',
              [template.archived_by_user_id]
            );
            if (users.length > 0) {
              template.archived_by_user_name = `${users[0].first_name || ''} ${users[0].last_name || ''}`.trim();
            }
          } catch (err) {
            console.error('Error fetching archived_by_user_name:', err);
          }
        }
        return template;
      })
    );

    return res.json(templatesWithNames);
  } catch (error) {
    console.error('Error in getArchivedTemplates:', error);
    return next(error);
  }
};

export const deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get user's agency IDs for permission check
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
    }

    const success = await DocumentTemplate.delete(id, userAgencyIds);
    if (!success) {
      return res.status(404).json({
        error: { message: 'Template not found, not archived, or you do not have permission to delete it' }
      });
    }

    return res.json({ message: 'Template permanently deleted successfully' });
  } catch (error) {
    return next(error);
  }
};

export const getVersionHistory = async (req, res, next) => {
  try {
    const { name, agencyId } = req.query;
    if (!name) {
      return res.status(400).json({ error: { message: 'Template name is required' } });
    }

    const parsedAgencyId =
      agencyId && agencyId !== 'null' && agencyId !== ''
        ? parseInt(agencyId)
        : null;

    const versions = await DocumentTemplate.getVersionHistory(name, parsedAgencyId);
    return res.json(versions);
  } catch (error) {
    return next(error);
  }
};

/**
 * Get available template variables
 */
export const getTemplateVariables = async (req, res, next) => {
  try {
    const variables = DocumentVariableService.getAvailableVariables();
    return res.json(variables);
  } catch (error) {
    return next(error);
  }
};

export const duplicateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const createdByUserId = req.user.id;

    const sourceTemplate = await DocumentTemplate.findById(id);
    if (!sourceTemplate) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    let newFilePath = null;
    const newHtmlContent = sourceTemplate.html_content;

    // If PDF, copy file (legacy local path scenario)
    if (sourceTemplate.template_type === 'pdf' && sourceTemplate.file_path) {
      const templatesDir = path.join(__dirname, '../../uploads/templates');
      const sourcePath = path.join(templatesDir, sourceTemplate.file_path);

      try {
        await fs.access(sourcePath);
      } catch (err) {
        return res.status(404).json({ error: { message: 'Source PDF file not found' } });
      }

      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(sourceTemplate.file_path);
      const newFileName = `template-${uniqueSuffix}${ext}`;
      newFilePath = newFileName;

      const destPath = path.join(templatesDir, newFileName);
      await fs.copyFile(sourcePath, destPath);
    }

    const newTemplate = await DocumentTemplate.create({
      name: `Copy of ${sourceTemplate.name}`,
      description: sourceTemplate.description ?? null,
      templateType: sourceTemplate.template_type || 'pdf',
      filePath: newFilePath,
      htmlContent: newHtmlContent ?? null,
      agencyId: null,
      createdByUserId,
      documentType: sourceTemplate.document_type ?? 'administrative',
      documentActionType: sourceTemplate.document_action_type ?? 'signature',
      isUserSpecific: false,
      userId: null,
      iconId: sourceTemplate.icon_id ?? null,
      signatureX: sourceTemplate.signature_x ?? null,
      signatureY: sourceTemplate.signature_y ?? null,
      signatureWidth: sourceTemplate.signature_width ?? null,
      signatureHeight: sourceTemplate.signature_height ?? null,
      signaturePage: sourceTemplate.signature_page ?? null
    });

    return res.status(201).json(newTemplate);
  } catch (error) {
    return next(error);
  }
};
