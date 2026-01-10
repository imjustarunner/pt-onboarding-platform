import DocumentTemplate from '../models/DocumentTemplate.model.js';
import DocumentVariableService from '../services/documentVariable.service.js';
import pool from '../config/database.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { validationResult } from 'express-validator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/templates');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `template-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

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

export const uploadTemplate = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'PDF file is required' } });
    }

    const { name, description, agencyId, documentType, documentActionType, iconId, signatureX, signatureY, signatureWidth, signatureHeight, signaturePage } = req.body;
    const createdByUserId = req.user.id;

    if (!documentActionType || !['signature', 'review'].includes(documentActionType)) {
      return res.status(400).json({ error: { message: 'documentActionType is required and must be "signature" or "review"' } });
    }

    const template = await DocumentTemplate.create({
      name,
      description,
      templateType: 'pdf',
      filePath: req.file.filename,
      htmlContent: null,
      agencyId: agencyId || null,
      createdByUserId: createdByUserId,
      documentType: documentType || 'administrative',
      documentActionType: documentActionType,
      isUserSpecific: false, // Templates are not user-specific
      userId: null, // Templates don't have userId
      iconId: iconId ? parseInt(iconId) : null,
      signatureX: signatureX ? parseFloat(signatureX) : null,
      signatureY: signatureY ? parseFloat(signatureY) : null,
      signatureWidth: signatureWidth ? parseFloat(signatureWidth) : null,
      signatureHeight: signatureHeight ? parseFloat(signatureHeight) : null,
      signaturePage: signaturePage ? parseInt(signaturePage) : null
    });

    res.status(201).json(template);
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

export const createTemplate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { name, description, htmlContent, agencyId, documentType, documentActionType, isUserSpecific, userId, iconId } = req.body;
    const createdByUserId = req.user.id;

    if (!documentActionType || !['signature', 'review'].includes(documentActionType)) {
      return res.status(400).json({ error: { message: 'documentActionType is required and must be "signature" or "review"' } });
    }

    const template = await DocumentTemplate.create({
      name,
      description,
      templateType: 'html',
      filePath: null,
      htmlContent,
      agencyId: agencyId || null,
      createdByUserId,
      documentType: documentType || 'administrative',
      documentActionType: documentActionType,
      isUserSpecific: false, // Templates are not user-specific
      userId: null, // Templates don't have userId
      iconId: iconId ? parseInt(iconId) : null
    });

    res.status(201).json(template);
  } catch (error) {
    next(error);
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

    // User-specific filtering - by default, exclude user-specific documents (they're in a separate table now)
    // Only include them if explicitly requested
    if (isUserSpecific !== undefined) {
      filters.isUserSpecific = isUserSpecific === 'true' || isUserSpecific === true;
    } else {
      // Default: exclude user-specific documents (they're now in user_specific_documents table)
      filters.isUserSpecific = false;
    }

    // User ID filtering (for user-specific documents) - only if isUserSpecific is true
    if (userId && filters.isUserSpecific) {
      filters.userId = parseInt(userId);
    }

    // Status filter - only apply if explicitly provided
    // If not provided, show all (both active and inactive)
    if (isActive !== undefined && isActive !== null && isActive !== 'all') {
      // Convert string/boolean to actual boolean
      if (isActive === 'true' || isActive === true || isActive === '1' || isActive === 1) {
        filters.isActive = true;
      } else if (isActive === 'false' || isActive === false || isActive === '0' || isActive === 0) {
        filters.isActive = false;
      }
    }
    // If isActive is undefined/null/'all', don't set the filter (show all)

    // Pagination
    if (limit) {
      filters.limit = parseInt(limit) || 20;
    } else {
      filters.limit = 20; // Default limit
    }
    
    if (page) {
      const pageNum = parseInt(page) || 1;
      filters.offset = (pageNum - 1) * filters.limit;
    }

    // Sorting
    if (sortBy) {
      filters.sortBy = sortBy;
    }
    if (sortOrder) {
      filters.sortOrder = sortOrder;
    }

    const result = await DocumentTemplate.findAll(filters);
    res.json(result);
  } catch (error) {
    next(error);
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

    res.json(template);
  } catch (error) {
    next(error);
  }
};

export const getTemplateForTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get template
    const template = await DocumentTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Verify user has access to this template via an assigned task
    const Task = (await import('../models/Task.model.js')).default;
    const userTasks = await Task.findByUser(userId, { taskType: 'document' });
    const hasAccess = userTasks.some(task => task.reference_id === parseInt(id));

    if (!hasAccess) {
      return res.status(403).json({ error: { message: 'Access denied. You do not have a task assigned for this template.' } });
    }

    res.json(template);
  } catch (error) {
    next(error);
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
    const sanitizedBody = {};
    Object.keys(req.body).forEach(key => {
      if (req.body[key] === undefined) {
        console.warn(`⚠️ Found undefined in req.body.${key}, converting to null`);
        sanitizedBody[key] = null;
      } else {
        sanitizedBody[key] = req.body[key];
      }
    });
    
    const { name, description, htmlContent, isActive, iconId, agencyId, signatureX, signatureY, signatureWidth, signatureHeight, signaturePage } = sanitizedBody;

    // Check permissions: Support can only edit their own documents
    if (req.user.role === 'support') {
      const template = await DocumentTemplate.findById(id);
      if (!template) {
        return res.status(404).json({ error: { message: 'Template not found' } });
      }
      if (template.created_by_user_id !== req.user.id) {
        return res.status(403).json({ error: { message: 'You can only edit documents you created' } });
      }
    }

    // Build updateData object, ensuring no undefined values
    const updateData = {};
    
    // Only include fields that are explicitly provided (not undefined)
    if (name !== undefined) {
      updateData.name = name !== null && name !== '' ? name : null;
    }
    if (description !== undefined) {
      updateData.description = description !== null && description !== '' ? description : null;
    }
    if (htmlContent !== undefined) {
      updateData.htmlContent = htmlContent !== null && htmlContent !== '' ? htmlContent : null;
    }
    if (isActive !== undefined) {
      updateData.isActive = isActive === true || isActive === 1 || isActive === '1' || isActive === 'true';
    }

    // Handle iconId - allow null to remove icon, or a number to set it
    if (iconId !== undefined) {
      if (iconId === null || iconId === 'null' || iconId === '') {
        updateData.iconId = null;
      } else {
        const parsedIconId = typeof iconId === 'string' ? parseInt(iconId) : iconId;
        updateData.iconId = isNaN(parsedIconId) ? null : parsedIconId;
        console.log('Parsed iconId:', parsedIconId, 'from:', iconId, 'type:', typeof iconId);
      }
    }

    // Handle agencyId - allow null for platform, or a number for specific agency
    if (agencyId !== undefined) {
      if (agencyId === null || agencyId === 'null' || agencyId === '') {
        updateData.agencyId = null;
      } else {
        const parsedAgencyId = typeof agencyId === 'string' ? parseInt(agencyId) : agencyId;
        updateData.agencyId = isNaN(parsedAgencyId) ? null : parsedAgencyId;
      }
    }

    // Handle signature coordinates - allow null to clear, or numbers to set them
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
        console.error(`❌ CRITICAL: updateData.${key} is undefined, converting to null`);
        updateData[key] = null;
      }
    });

    console.log('=== UPDATE TEMPLATE REQUEST ===');
    console.log('Template ID:', id);
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Request body values:', req.body);
    console.log('Sanitized body keys:', Object.keys(sanitizedBody));
    console.log('Sanitized body signature fields:', {
      signatureX: sanitizedBody.signatureX,
      signatureY: sanitizedBody.signatureY,
      signatureWidth: sanitizedBody.signatureWidth,
      signatureHeight: sanitizedBody.signatureHeight,
      signaturePage: sanitizedBody.signaturePage
    });
    console.log('UpdateData object:', updateData);
    console.log('UpdateData keys:', Object.keys(updateData));
    console.log('UpdateData values check:');
    Object.keys(updateData).forEach(key => {
      console.log(`  ${key}: ${updateData[key]} (type: ${typeof updateData[key]}, undefined: ${updateData[key] === undefined})`);
    });
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

    console.log('Updated template returned from model:', {
      id: template.id,
      name: template.name,
      icon_id: template.icon_id,
      icon_file_path: template.icon_file_path,
      icon_name: template.icon_name,
      hasIconColumn: template.icon_id !== undefined
    });
    
    res.json(template);
  } catch (error) {
    console.error('Error in updateTemplate:', error);
    console.error('Error stack:', error.stack);
    console.error('Error message:', error.message);
    console.error('Error SQL message:', error.sqlMessage);
    console.error('Error code:', error.code);
    // Pass error to error handler middleware
    next(error);
  }
};

export const archiveTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check permissions: Support can only archive their own documents
    if (req.user.role === 'support') {
      const template = await DocumentTemplate.findById(id);
      if (!template) {
        return res.status(404).json({ error: { message: 'Template not found' } });
      }
      if (template.created_by_user_id !== req.user.id) {
        return res.status(403).json({ error: { message: 'You can only archive documents you created' } });
      }
    }
    
    // Get user's agency ID (use first agency for admins, null for super_admin)
    let archivedByAgencyId = null;
    if (req.user.role !== 'super_admin' && req.user.role !== 'support' && req.user.id) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) {
        archivedByAgencyId = userAgencies[0].id;
      }
    }
    
    const archived = await DocumentTemplate.archive(id, req.user.id, archivedByAgencyId);
    
    if (!archived) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    res.json({ message: 'Template archived successfully' });
  } catch (error) {
    next(error);
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
      return res.status(404).json({ error: { message: 'Template not found, not archived, or you do not have permission to restore it' } });
    }

    res.json({ message: 'Template restored successfully' });
  } catch (error) {
    next(error);
  }
};

export const getArchivedTemplates = async (req, res, next) => {
  try {
    // Get selected agency ID from query params (if user selected a specific agency)
    const selectedAgencyId = req.query.archivedByAgencyId ? parseInt(req.query.archivedByAgencyId) : null;
    
    // Get user's agency IDs for filtering
    let userAgencyIds = [];
    if (req.user.role !== 'super_admin' && req.user.id) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      userAgencyIds = userAgencies.map(a => a.id);
      
      // If a specific agency is selected, verify user has access to it
      if (selectedAgencyId && !userAgencyIds.includes(selectedAgencyId)) {
        return res.status(403).json({ error: { message: 'You do not have access to this agency' } });
      }
    }
    
    // If a specific agency is selected, filter by that agency only
    // Otherwise, filter by all user's agencies (or all for super_admin)
    const filterAgencyIds = selectedAgencyId ? [selectedAgencyId] : (req.user.role === 'super_admin' ? null : userAgencyIds);
    
    const templates = await DocumentTemplate.findAllArchived({ 
      agencyIds: filterAgencyIds,
      userRole: req.user.role
    });
    
    // Fetch archived_by_user_name for each template
    const templatesWithNames = await Promise.all(templates.map(async (template) => {
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
          // Continue without the name if there's an error
        }
      }
      return template;
    }));
    
    res.json(templatesWithNames);
  } catch (error) {
    console.error('Error in getArchivedTemplates:', error);
    next(error);
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
      return res.status(404).json({ error: { message: 'Template not found, not archived, or you do not have permission to delete it' } });
    }

    res.json({ message: 'Template permanently deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getVersionHistory = async (req, res, next) => {
  try {
    const { name, agencyId } = req.query;
    if (!name) {
      return res.status(400).json({ error: { message: 'Template name is required' } });
    }

    // Parse agencyId if provided (can be 'null' string for platform)
    const parsedAgencyId = agencyId && agencyId !== 'null' && agencyId !== '' 
      ? parseInt(agencyId) 
      : null;

    const versions = await DocumentTemplate.getVersionHistory(name, parsedAgencyId);
    res.json(versions);
  } catch (error) {
    next(error);
  }
};

/**
 * Get available template variables
 */
export const getTemplateVariables = async (req, res, next) => {
  try {
    const variables = DocumentVariableService.getAvailableVariables();
    res.json(variables);
  } catch (error) {
    next(error);
  }
};

export const duplicateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const createdByUserId = req.user.id;

    // Get source template
    const sourceTemplate = await DocumentTemplate.findById(id);
    if (!sourceTemplate) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }

    // Support can duplicate any document (no restriction)

    let newFilePath = null;
    let newHtmlContent = sourceTemplate.html_content;

    // If PDF, copy the file
    if (sourceTemplate.template_type === 'pdf' && sourceTemplate.file_path) {
      const templatesDir = path.join(__dirname, '../../uploads/templates');
      const sourcePath = path.join(templatesDir, sourceTemplate.file_path);
      
      // Check if source file exists
      try {
        await fs.access(sourcePath);
      } catch (err) {
        return res.status(404).json({ error: { message: 'Source PDF file not found' } });
      }

      // Generate new filename
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(sourceTemplate.file_path);
      const newFileName = `template-${uniqueSuffix}${ext}`;
      newFilePath = newFileName;

      // Copy the file
      const destPath = path.join(templatesDir, newFileName);
      await fs.copyFile(sourcePath, destPath);
    }

    // Create new template with "Copy of [name]" and all copied fields
    // Ensure all fields are explicitly set to null if they don't exist (never undefined)
    const newTemplate = await DocumentTemplate.create({
      name: `Copy of ${sourceTemplate.name}`,
      description: sourceTemplate.description !== undefined && sourceTemplate.description !== null ? sourceTemplate.description : null,
      templateType: sourceTemplate.template_type || 'pdf',
      filePath: newFilePath,
      htmlContent: newHtmlContent !== undefined && newHtmlContent !== null ? newHtmlContent : null,
      agencyId: null, // Initially null, user can change in modal
      createdByUserId: createdByUserId,
      documentType: sourceTemplate.document_type !== undefined && sourceTemplate.document_type !== null ? sourceTemplate.document_type : 'administrative',
      documentActionType: sourceTemplate.document_action_type !== undefined && sourceTemplate.document_action_type !== null ? sourceTemplate.document_action_type : 'signature',
      isUserSpecific: false,
      userId: null,
      iconId: sourceTemplate.icon_id !== undefined && sourceTemplate.icon_id !== null ? sourceTemplate.icon_id : null,
      signatureX: sourceTemplate.signature_x !== undefined && sourceTemplate.signature_x !== null ? sourceTemplate.signature_x : null,
      signatureY: sourceTemplate.signature_y !== undefined && sourceTemplate.signature_y !== null ? sourceTemplate.signature_y : null,
      signatureWidth: sourceTemplate.signature_width !== undefined && sourceTemplate.signature_width !== null ? sourceTemplate.signature_width : null,
      signatureHeight: sourceTemplate.signature_height !== undefined && sourceTemplate.signature_height !== null ? sourceTemplate.signature_height : null,
      signaturePage: sourceTemplate.signature_page !== undefined && sourceTemplate.signature_page !== null ? sourceTemplate.signature_page : null
    });

    res.status(201).json(newTemplate);
  } catch (error) {
    next(error);
  }
};

