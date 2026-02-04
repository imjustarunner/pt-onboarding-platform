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

    const parseNullablePositiveInt = (value) => {
      if (value === null || value === undefined) return null;
      const s = String(value).trim();
      if (!s || s === 'null' || s === 'all') return null;
      const n = parseInt(s, 10);
      if (Number.isNaN(n) || n <= 0) return undefined; // explicit invalid
      return n;
    };

    const {
      name,
      description,
      agencyId,
      organizationId,
      documentType,
      documentActionType,
      iconId,
      signatureX,
      signatureY,
      signatureWidth,
      signatureHeight,
      signaturePage,
      fieldDefinitions
    } = req.body;

    const createdByUserId = req.user?.id;

    if (!name) {
      return res.status(400).json({ error: { message: 'name is required' } });
    }

    if (!documentActionType || !['signature', 'review', 'acroform'].includes(documentActionType)) {
      return res.status(400).json({
        error: { message: 'documentActionType is required and must be "signature", "review", or "acroform"' }
      });
    }

    const parsedAgencyId = parseNullablePositiveInt(agencyId);
    if (parsedAgencyId === undefined) {
      return res.status(400).json({ error: { message: 'agencyId must be null or a positive integer' } });
    }

    let parsedOrganizationId = parseNullablePositiveInt(organizationId);
    if (parsedOrganizationId === undefined) {
      return res.status(400).json({ error: { message: 'organizationId must be null or a positive integer' } });
    }
    // If they picked the agency itself in the org dropdown, treat it as "no specific org"
    if (parsedOrganizationId !== null && parsedAgencyId !== null && parsedOrganizationId === parsedAgencyId) {
      parsedOrganizationId = null;
    }
    if (parsedAgencyId === null && parsedOrganizationId !== null) {
      return res.status(400).json({ error: { message: 'organizationId cannot be set for platform templates (agencyId is null)' } });
    }

    // Permissions:
    // - Only super_admin can create platform templates (agencyId null)
    // - Non-super-admins must create templates scoped to an organization they belong to
    if (parsedAgencyId === null && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only platform admins can create platform templates' } });
    }
    if (parsedAgencyId !== null && req.user?.role !== 'super_admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      if (!agencyIds.includes(parsedAgencyId)) {
        return res.status(403).json({ error: { message: 'Not authorized to create templates for this organization' } });
      }
    }

    if (parsedAgencyId !== null) {
      const [rows] = await pool.execute('SELECT id FROM agencies WHERE id = ? LIMIT 1', [parsedAgencyId]);
      if (rows.length === 0) {
        return res.status(400).json({ error: { message: `Invalid agencyId: ${parsedAgencyId} (agency not found)` } });
      }
    }

    if (parsedOrganizationId !== null) {
      // Validate org exists
      const [orgRows] = await pool.execute('SELECT id FROM agencies WHERE id = ? LIMIT 1', [parsedOrganizationId]);
      if (orgRows.length === 0) {
        return res.status(400).json({ error: { message: `Invalid organizationId: ${parsedOrganizationId} (organization not found)` } });
      }
      // Validate affiliation to agency
      const [aff] = await pool.execute(
        'SELECT id FROM organization_affiliations WHERE agency_id = ? AND organization_id = ? AND is_active = TRUE LIMIT 1',
        [parsedAgencyId, parsedOrganizationId]
      );
      if (!aff || aff.length === 0) {
        return res.status(400).json({
          error: { message: `organizationId ${parsedOrganizationId} is not affiliated with agencyId ${parsedAgencyId}` }
        });
      }
    }

    const parsedIconId = parseNullablePositiveInt(iconId);
    if (parsedIconId === undefined) {
      return res.status(400).json({ error: { message: 'iconId must be null or a positive integer' } });
    }

    let parsedFieldDefinitions = null;
    if (fieldDefinitions !== undefined) {
      try {
        parsedFieldDefinitions = typeof fieldDefinitions === 'string'
          ? JSON.parse(fieldDefinitions)
          : fieldDefinitions;
      } catch (e) {
        return res.status(400).json({ error: { message: 'fieldDefinitions must be valid JSON' } });
      }
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
      agencyId: parsedAgencyId,
      organizationId: parsedOrganizationId,
      createdByUserId,
      documentType: documentType || 'administrative',
      documentActionType,
      isUserSpecific: false,
      userId: null,
      iconId: parsedIconId,
      signatureX: signatureX !== undefined && signatureX !== '' ? parseFloat(signatureX) : null,
      signatureY: signatureY !== undefined && signatureY !== '' ? parseFloat(signatureY) : null,
      signatureWidth: signatureWidth !== undefined && signatureWidth !== '' ? parseFloat(signatureWidth) : null,
      signatureHeight: signatureHeight !== undefined && signatureHeight !== '' ? parseFloat(signatureHeight) : null,
      signaturePage: signaturePage !== undefined && signaturePage !== '' ? parseInt(signaturePage) : null,
      fieldDefinitions: parsedFieldDefinitions
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

    const parseNullablePositiveInt = (value) => {
      if (value === null || value === undefined) return null;
      const s = String(value).trim();
      if (!s || s === 'null' || s === 'all') return null;
      const n = parseInt(s, 10);
      if (Number.isNaN(n) || n <= 0) return undefined; // explicit invalid
      return n;
    };

    const {
      name,
      description,
      htmlContent,
      agencyId,
      organizationId,
      layoutType,
      letterheadTemplateId,
      letterHeaderHtml,
      letterFooterHtml,
      documentType,
      documentActionType,
      iconId,
      fieldDefinitions
      // isUserSpecific, userId intentionally ignored here (templates are not user-specific)
    } = req.body;

    const createdByUserId = req.user?.id;

    if (!name) {
      return res.status(400).json({ error: { message: 'name is required' } });
    }

    if (!documentActionType || !['signature', 'review', 'acroform'].includes(documentActionType)) {
      return res.status(400).json({
        error: { message: 'documentActionType is required and must be "signature", "review", or "acroform"' }
      });
    }
    
    // AcroForm workflows require PDF templates, not HTML templates
    if (documentActionType === 'acroform') {
      return res.status(400).json({
        error: { message: 'AcroForm templates must be uploaded as PDF templates (not HTML templates).' }
      });
    }

    const parsedLayoutType = layoutType ? String(layoutType).trim().toLowerCase() : 'standard';
    if (!['standard', 'letter'].includes(parsedLayoutType)) {
      return res.status(400).json({ error: { message: 'layoutType must be "standard" or "letter"' } });
    }

    const parsedAgencyId = parseNullablePositiveInt(agencyId);
    if (parsedAgencyId === undefined) {
      return res.status(400).json({ error: { message: 'agencyId must be null or a positive integer' } });
    }

    let parsedOrganizationId = parseNullablePositiveInt(organizationId);
    if (parsedOrganizationId === undefined) {
      return res.status(400).json({ error: { message: 'organizationId must be null or a positive integer' } });
    }
    if (parsedOrganizationId !== null && parsedAgencyId !== null && parsedOrganizationId === parsedAgencyId) {
      parsedOrganizationId = null;
    }
    if (parsedAgencyId === null && parsedOrganizationId !== null) {
      return res.status(400).json({ error: { message: 'organizationId cannot be set for platform templates (agencyId is null)' } });
    }

    // Permissions:
    // - Only super_admin can create platform templates (agencyId null)
    // - Non-super-admins must create templates scoped to an organization they belong to
    if (parsedAgencyId === null && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only platform admins can create platform templates' } });
    }
    if (parsedAgencyId !== null && req.user?.role !== 'super_admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      if (!agencyIds.includes(parsedAgencyId)) {
        return res.status(403).json({ error: { message: 'Not authorized to create templates for this organization' } });
      }
    }

    if (parsedAgencyId !== null) {
      const [rows] = await pool.execute('SELECT id FROM agencies WHERE id = ? LIMIT 1', [parsedAgencyId]);
      if (rows.length === 0) {
        return res.status(400).json({ error: { message: `Invalid agencyId: ${parsedAgencyId} (agency not found)` } });
      }
    }

    if (parsedOrganizationId !== null) {
      const [orgRows] = await pool.execute('SELECT id FROM agencies WHERE id = ? LIMIT 1', [parsedOrganizationId]);
      if (orgRows.length === 0) {
        return res.status(400).json({ error: { message: `Invalid organizationId: ${parsedOrganizationId} (organization not found)` } });
      }
      const [aff] = await pool.execute(
        'SELECT id FROM organization_affiliations WHERE agency_id = ? AND organization_id = ? AND is_active = TRUE LIMIT 1',
        [parsedAgencyId, parsedOrganizationId]
      );
      if (!aff || aff.length === 0) {
        return res.status(400).json({
          error: { message: `organizationId ${parsedOrganizationId} is not affiliated with agencyId ${parsedAgencyId}` }
        });
      }
    }

    const parsedIconId = parseNullablePositiveInt(iconId);
    if (parsedIconId === undefined) {
      return res.status(400).json({ error: { message: 'iconId must be null or a positive integer' } });
    }

    let parsedFieldDefinitions = null;
    if (fieldDefinitions !== undefined) {
      try {
        parsedFieldDefinitions = typeof fieldDefinitions === 'string'
          ? JSON.parse(fieldDefinitions)
          : fieldDefinitions;
      } catch (e) {
        return res.status(400).json({ error: { message: 'fieldDefinitions must be valid JSON' } });
      }
    }

    let parsedLetterheadTemplateId = parseNullablePositiveInt(letterheadTemplateId);
    if (parsedLetterheadTemplateId === undefined) {
      return res.status(400).json({ error: { message: 'letterheadTemplateId must be null or a positive integer' } });
    }

    if (parsedLayoutType === 'letter') {
      if (!parsedLetterheadTemplateId) {
        return res.status(400).json({ error: { message: 'letterheadTemplateId is required for letter layout templates' } });
      }
      const [lhRows] = await pool.execute(
        'SELECT id, is_active FROM letterhead_templates WHERE id = ? LIMIT 1',
        [parsedLetterheadTemplateId]
      );
      if (!lhRows || lhRows.length === 0) {
        return res.status(400).json({ error: { message: `Invalid letterheadTemplateId: ${parsedLetterheadTemplateId}` } });
      }
      const isActive = lhRows[0].is_active !== false && lhRows[0].is_active !== 0;
      if (!isActive) {
        return res.status(400).json({ error: { message: 'Selected letterhead is inactive' } });
      }
    } else {
      // Standard layout should not bind a letterhead
      parsedLetterheadTemplateId = null;
    }

    const template = await DocumentTemplate.create({
      name,
      description: description ?? null,
      templateType: 'html',
      filePath: null,
      htmlContent: htmlContent ?? null,
      agencyId: parsedAgencyId,
      organizationId: parsedOrganizationId,
      layoutType: parsedLayoutType,
      letterheadTemplateId: parsedLetterheadTemplateId,
      letterHeaderHtml: letterHeaderHtml ?? null,
      letterFooterHtml: letterFooterHtml ?? null,
      createdByUserId,
      documentType: documentType || 'administrative',
      documentActionType,
      isUserSpecific: false,
      userId: null,
      iconId: parsedIconId,
      fieldDefinitions: parsedFieldDefinitions
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

export const previewTemplate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Template ID is required' } });
    const template = await DocumentTemplate.findById(id);
    if (!template) return res.status(404).json({ error: { message: 'Template not found' } });

    if (template.template_type !== 'pdf' || !template.file_path) {
      return res.status(400).json({ error: { message: 'Template preview is only available for PDF templates' } });
    }

    const StorageService = (await import('../services/storage.service.js')).default;
    let filePath = String(template.file_path || '').trim();
    if (filePath.startsWith('/')) filePath = filePath.substring(1);
    const templateFilename = filePath.includes('/')
      ? filePath.split('/').pop()
      : filePath.replace('templates/', '');
    const buffer = await StorageService.readTemplate(templateFilename);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
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
      layoutType,
      letterheadTemplateId,
      letterHeaderHtml,
      letterFooterHtml,
      isActive,
      iconId,
      agencyId,
      signatureX,
      signatureY,
      signatureWidth,
      signatureHeight,
      signaturePage,
      fieldDefinitions
    } = sanitizedInputBody;

    // Check permissions: Support can only edit their own documents
    let existing = null;
    if (req.user.role === 'support') {
      existing = await DocumentTemplate.findById(id);
      if (!existing) {
        return res.status(404).json({ error: { message: 'Template not found' } });
      }
      if (existing.created_by_user_id !== req.user.id) {
        return res.status(403).json({ error: { message: 'You can only edit documents you created' } });
      }
    }
    if (!existing) {
      existing = await DocumentTemplate.findById(id);
      if (!existing) {
        return res.status(404).json({ error: { message: 'Template not found' } });
      }
    }

    // Build updateData object, ensuring no undefined values
    const updateData = {};

    if (name !== undefined) updateData.name = name !== null && name !== '' ? name : null;
    if (description !== undefined) updateData.description = description !== null && description !== '' ? description : null;
    if (htmlContent !== undefined) updateData.htmlContent = htmlContent !== null && htmlContent !== '' ? htmlContent : null;

    if (layoutType !== undefined) {
      const lt = layoutType === null ? null : String(layoutType).trim().toLowerCase();
      if (lt && !['standard', 'letter'].includes(lt)) {
        return res.status(400).json({ error: { message: 'layoutType must be "standard" or "letter"' } });
      }
      updateData.layoutType = lt || 'standard';
    }

    if (letterheadTemplateId !== undefined) {
      if (letterheadTemplateId === null || letterheadTemplateId === 'null' || letterheadTemplateId === '') {
        updateData.letterheadTemplateId = null;
      } else {
        const parsed = typeof letterheadTemplateId === 'string' ? parseInt(letterheadTemplateId, 10) : letterheadTemplateId;
        updateData.letterheadTemplateId = isNaN(parsed) ? null : parsed;
      }
    }

    if (letterHeaderHtml !== undefined) {
      updateData.letterHeaderHtml = letterHeaderHtml !== null && letterHeaderHtml !== '' ? letterHeaderHtml : null;
    }
    if (letterFooterHtml !== undefined) {
      updateData.letterFooterHtml = letterFooterHtml !== null && letterFooterHtml !== '' ? letterFooterHtml : null;
    }

    // Letter layout validations (HTML only + letterhead required)
    if (updateData.layoutType === 'letter') {
      if (String(existing.template_type) !== 'html') {
        return res.status(400).json({ error: { message: 'Letter layout is only supported for HTML templates' } });
      }
      const effectiveLetterheadId =
        updateData.letterheadTemplateId !== undefined ? updateData.letterheadTemplateId : existing.letterhead_template_id;
      if (!effectiveLetterheadId) {
        return res.status(400).json({ error: { message: 'letterheadTemplateId is required for letter layout templates' } });
      }
      const [lhRows] = await pool.execute(
        'SELECT id, is_active FROM letterhead_templates WHERE id = ? LIMIT 1',
        [effectiveLetterheadId]
      );
      if (!lhRows || lhRows.length === 0) {
        return res.status(400).json({ error: { message: `Invalid letterheadTemplateId: ${effectiveLetterheadId}` } });
      }
      const isActive = lhRows[0].is_active !== false && lhRows[0].is_active !== 0;
      if (!isActive) {
        return res.status(400).json({ error: { message: 'Selected letterhead is inactive' } });
      }
    }
    if (updateData.layoutType === 'standard') {
      // If explicitly switching back to standard, clear letter-only fields.
      updateData.letterheadTemplateId = null;
      if (!('letterHeaderHtml' in updateData)) updateData.letterHeaderHtml = null;
      if (!('letterFooterHtml' in updateData)) updateData.letterFooterHtml = null;
    }

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

    if (fieldDefinitions !== undefined) {
      try {
        updateData.fieldDefinitions =
          typeof fieldDefinitions === 'string' ? JSON.parse(fieldDefinitions) : fieldDefinitions;
      } catch (e) {
        return res.status(400).json({ error: { message: 'fieldDefinitions must be valid JSON' } });
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

    const template = await DocumentTemplate.findById(id);
    if (!template) return res.status(404).json({ error: { message: 'Template not found' } });

    // Non-super-admin users can only archive agency-scoped templates.
    // This keeps archive visibility consistent with the agency-scoped Archive view in the UI.
    if (req.user.role !== 'super_admin') {
      if (!template.agency_id) {
        return res.status(403).json({ error: { message: 'Only platform admins can archive platform templates' } });
      }
    }

    // Archive attribution: use the template's agency_id so it appears in that agency's archive view.
    let archivedByAgencyId = null;
    if (req.user.role !== 'super_admin') {
      archivedByAgencyId = template.agency_id;
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

export const getAcroFormFields = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await DocumentTemplate.findById(parseInt(id));
    if (!template) {
      return res.status(404).json({ error: { message: 'Template not found' } });
    }
    if (template.template_type !== 'pdf' || !template.file_path) {
      return res.status(400).json({ error: { message: 'Template must be a PDF template with file_path' } });
    }

    const StorageService = (await import('../services/storage.service.js')).default;
    const filename = template.file_path.includes('/')
      ? template.file_path.split('/').pop()
      : template.file_path.replace('templates/', '');
    const pdfBuffer = await StorageService.readTemplate(filename);

    const I9AcroformService = (await import('../services/acroforms/i9.service.js')).default;
    const fields = await I9AcroformService.listAcroFormFields(pdfBuffer);
    res.json({ templateId: template.id, fields });
  } catch (error) {
    next(error);
  }
};
