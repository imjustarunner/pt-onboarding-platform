import Icon from '../models/Icon.model.js';
import { validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for icon uploads - use memory storage for GCS
// Files are uploaded directly to GCS, not saved to local filesystem
// This is required for Cloud Run which has ephemeral filesystem
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/jpg'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only SVG, PNG, and JPG are allowed.'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  }
});

// Multer instance for multiple files
export const uploadMultiple = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit per file
    files: 50 // Maximum 50 files at once
  }
});

export const getAllIcons = async (req, res, next) => {
  try {
    const { category, search, includeInactive, agencyId, sortBy, sortOrder, includePlatform } = req.query;
    
    // Build filters
    // agencyId handling:
    // - undefined/not provided = show all icons (both agency and platform, unless filtered by role)
    // - 'null' (string) = show only platform icons (agency_id IS NULL)
    // - number (agency ID) = show only icons for that agency (agency_id = number)
    // - empty string = treat as undefined (show all)
    let parsedAgencyId = undefined;
    if (agencyId !== undefined && agencyId !== '') {
      if (agencyId === 'null') {
        parsedAgencyId = null; // Platform icons only
      } else {
        const parsed = parseInt(agencyId, 10);
        if (!isNaN(parsed)) {
          parsedAgencyId = parsed; // Specific agency
        } else {
          console.warn('getAllIcons: Invalid agencyId, could not parse:', agencyId);
        }
      }
    }
    // If agencyId is undefined or empty string, parsedAgencyId stays undefined (show all)
    
    const filters = {
      category: category || null,
      search: search || null,
      agencyId: parsedAgencyId,
      sortBy: sortBy || 'name',
      sortOrder: sortOrder || 'asc'
    };

    console.log('getAllIcons: Request params:', { 
      agencyId, 
      parsedAgencyId, 
      filters,
      includePlatform,
      userRole: req.user.role,
      agencyIdType: typeof agencyId,
      parsedAgencyIdType: typeof parsedAgencyId
    });
    let icons = await Icon.findAll(includeInactive === 'true', filters);
    
    // For non-super_admin users: exclude platform icons unless explicitly requested via includePlatform=true
    // This allows IconSelector to still access platform icons (by passing includePlatform=true)
    // while IconLibraryView will not show platform icons for admins
    if (req.user.role !== 'super_admin' && includePlatform !== 'true' && parsedAgencyId === undefined) {
      // Filter out platform icons (agency_id IS NULL) for admins when viewing icon library
      icons = icons.filter(icon => icon.agency_id !== null);
      console.log('getAllIcons: Filtered out platform icons for admin user');
    }
    
    console.log('getAllIcons: Returning', icons.length, 'icons');
    if (parsedAgencyId !== undefined && parsedAgencyId !== null) {
      const agencyIcons = icons.filter(i => i.agency_id === parsedAgencyId);
      const platformIcons = icons.filter(i => i.agency_id === null);
      console.log('getAllIcons: Agency icons:', agencyIcons.length, 'Platform icons:', platformIcons.length);
      if (platformIcons.length > 0) {
        console.warn('getAllIcons: WARNING - Platform icons found when filtering by agency! This should not happen.');
        console.warn('getAllIcons: Platform icon IDs:', platformIcons.map(i => ({ id: i.id, name: i.name, agency_id: i.agency_id })));
      }
    } else if (parsedAgencyId === null) {
      // Filtering for platform icons only
      const platformIcons = icons.filter(i => i.agency_id === null);
      const agencyIcons = icons.filter(i => i.agency_id !== null);
      console.log('getAllIcons: Platform icons:', platformIcons.length, 'Agency icons (should be 0):', agencyIcons.length);
      if (agencyIcons.length > 0) {
        console.warn('getAllIcons: WARNING - Agency icons found when filtering for platform only! This should not happen.');
      }
    }

    // Add URL to each icon
    const iconsWithUrls = icons.map(icon => ({
      ...icon,
      url: Icon.getIconUrl(icon)
    }));

    res.json(iconsWithUrls);
  } catch (error) {
    next(error);
  }
};

export const getIconById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const icon = await Icon.findById(id);

    if (!icon) {
      return res.status(404).json({ error: { message: 'Icon not found' } });
    }

    res.json({
      ...icon,
      url: Icon.getIconUrl(icon)
    });
  } catch (error) {
    next(error);
  }
};

export const uploadIcon = async (req, res, next) => {
  try {
    console.log('=== UPLOAD ICON REQUEST ===');
    console.log('Full req.body:', JSON.stringify(req.body, null, 2));
    console.log('req.body keys:', Object.keys(req.body));
    console.log('req.body.agencyId:', req.body.agencyId);
    console.log('req.body.agencyId type:', typeof req.body.agencyId);
    console.log('req.body.agencyId === "14":', req.body.agencyId === '14');
    console.log('req.body.agencyId === 14:', req.body.agencyId === 14);
    console.log('Upload icon request file:', req.file ? { filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype } : 'No file');
    
    // Check for file first
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No file uploaded. Please select an icon file.' } });
    }

    // Get and validate name field (validation already done in route middleware, but double-check)
    const { name, category, description, agencyId } = req.body;
    
    // Use sanitized body to prevent sensitive data leakage
    const sanitizedBody = req.sanitizedBody || (await import('../utils/sanitizeRequest.js')).sanitizeRequestBody(req.body);
    console.log('=== PARSING BODY FIELDS ===');
    console.log('Full req.body:', JSON.stringify(sanitizedBody, null, 2));
    console.log('Destructured fields:', { name, category, description, agencyId });
    console.log('agencyId value:', agencyId, 'type:', typeof agencyId);
    console.log('agencyId === "14":', agencyId === '14');
    console.log('agencyId === 14:', agencyId === 14);
    console.log('Number(agencyId):', Number(agencyId));
    console.log('parseInt(agencyId):', parseInt(agencyId));
    
    if (!name || (typeof name === 'string' && name.trim() === '')) {
      return res.status(400).json({ error: { message: 'Icon name is required' } });
    }
    
    const trimmedName = typeof name === 'string' ? name.trim() : String(name).trim();

    // Determine agency assignment first
    let finalAgencyId = null;
    const userRole = req.user.role;
    
    console.log('User role:', userRole, 'AgencyId received:', agencyId);
    
    // Super admin can assign to any agency or platform (null)
    if (userRole === 'super_admin') {
      console.log('Super admin path - agencyId check:', {
        agencyId,
        type: typeof agencyId,
        isNull: agencyId === null,
        isUndefined: agencyId === undefined,
        isStringNull: agencyId === 'null',
        isEmpty: agencyId === '',
        truthy: !!agencyId
      });
      
      // If agencyId is explicitly 'null', empty string, null, or undefined, set to null (platform)
      // Handle both string and number types
      if (agencyId === 'null' || agencyId === '' || agencyId === null || agencyId === undefined) {
        console.log('Super admin: Setting to platform (null) because agencyId is falsy');
        finalAgencyId = null;
      } else {
        // Handle both string and number inputs
        let parsed;
        if (typeof agencyId === 'number') {
          parsed = agencyId;
        } else if (typeof agencyId === 'string') {
          // Trim whitespace before parsing
          const trimmed = agencyId.trim();
          if (trimmed === '' || trimmed === 'null') {
            console.log('Super admin: Trimmed agencyId is empty or "null", setting to platform');
            finalAgencyId = null;
          } else {
            parsed = parseInt(trimmed, 10);
          }
        } else {
          parsed = parseInt(agencyId, 10);
        }
        
        console.log('Super admin: Parsing agencyId', agencyId, 'to', parsed, 'isNaN:', isNaN(parsed));
        if (isNaN(parsed) || parsed <= 0) {
          console.error('Super admin: Invalid agencyId, defaulting to null');
          finalAgencyId = null;
        } else {
          finalAgencyId = parsed;
          console.log('Super admin: Setting agencyId to', finalAgencyId, 'type:', typeof finalAgencyId);
        }
      }
    } else {
      // Regular admins can only assign to their agencies or platform
      // Get user's agencies
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      
      console.log('Regular admin: User agencies:', userAgencies.map(a => a.id));
      
      // If agencyId is explicitly 'null' or empty, set to null (platform)
      if (agencyId === 'null' || agencyId === '' || agencyId === null || agencyId === undefined) {
        console.log('Regular admin: Setting to platform (null)');
        finalAgencyId = null;
      } else {
        // User specified an agency - validate they have access
        const requestedAgencyId = parseInt(agencyId);
        console.log('Regular admin: Parsed agencyId:', requestedAgencyId, 'isNaN:', isNaN(requestedAgencyId));
        
        if (isNaN(requestedAgencyId)) {
          // No need to clean up - file is in memory, not on disk
          return res.status(400).json({ error: { message: 'Invalid agency ID' } });
        }
        
        // Check if user is affiliated with this agency
        const hasAccess = userAgencies.some(agency => agency.id === requestedAgencyId);
        console.log('Regular admin: Has access to agency', requestedAgencyId, ':', hasAccess);
        
        if (!hasAccess) {
          // No need to clean up - file is in memory, not on disk
          return res.status(403).json({ error: { message: 'You can only assign icons to agencies you are affiliated with' } });
        }
        finalAgencyId = requestedAgencyId;
        console.log('Regular admin: Setting agencyId to', finalAgencyId);
      }
    }
    
    console.log('Final agencyId determined:', finalAgencyId);
    console.log('About to create icon with agencyId:', finalAgencyId);

    // Check if name already exists (within the same agency scope)
    // Icons can have the same name if they're in different agencies or one is platform
    const existing = await Icon.findByName(trimmedName, finalAgencyId);
    if (existing) {
      // If findByName found a match, it means there's a conflict (same name and same agency)
      // No need to clean up - file is in memory, not on disk
      return res.status(400).json({ 
        error: { 
          message: `Icon with name "${trimmedName}" already exists${finalAgencyId ? ' for this agency' : ' for platform'}` 
        } 
      });
    }

    console.log('=== CREATING ICON ===');
    console.log('finalAgencyId value:', finalAgencyId, 'type:', typeof finalAgencyId);
    
    // Upload directly to GCS from memory buffer
    // req.file.buffer contains the file data (multer.memoryStorage)
    const fileBuffer = req.file.buffer;
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(req.file.originalname);
    const filename = `icon-${uniqueSuffix}${ext}`;
    
    // Upload to GCS using StorageService
    const storageResult = await StorageService.saveIcon(
      fileBuffer,
      filename,
      req.file.mimetype
    );
    
    const filePath = storageResult.relativePath;
    console.log('Icon uploaded to GCS:', filePath);
    
    console.log('Creating icon with data:', {
      name,
      filePath: filePath,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      category: category || null,
      description: description || null,
      createdByUserId: req.user.id,
      agencyId: finalAgencyId,
      agencyIdType: typeof finalAgencyId
    });

    const createData = {
      name: trimmedName,
      filePath: filePath,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      category: category || null,
      description: description || null,
      createdByUserId: req.user.id,
      agencyId: finalAgencyId
    };
    
    console.log('Icon.create() called with agencyId:', createData.agencyId, 'type:', typeof createData.agencyId);

    const icon = await Icon.create(createData);

    console.log('Icon created successfully:', icon);
    console.log('Created icon agencyId:', icon?.agencyId, 'type:', typeof icon?.agencyId);
    
    // Verify the agency_id was saved correctly by querying the database
    if (icon?.id) {
      try {
        const [rows] = await pool.execute('SELECT id, name, agency_id FROM icons WHERE id = ?', [icon.id]);
        if (rows.length > 0) {
          console.log('=== DATABASE VERIFICATION ===');
          console.log('Icon ID:', rows[0].id);
          console.log('Icon Name:', rows[0].name);
          console.log('Database agency_id:', rows[0].agency_id, 'type:', typeof rows[0].agency_id);
          console.log('Expected agency_id:', finalAgencyId, 'type:', typeof finalAgencyId);
          console.log('Match:', rows[0].agency_id === finalAgencyId);
        }
      } catch (verifyError) {
        console.error('Error verifying icon in database:', verifyError);
      }
    }

    res.status(201).json({
      ...icon,
      url: Icon.getIconUrl(icon)
    });
  } catch (error) {
    console.error('Error uploading icon:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      stack: error.stack
    });
    
    // Clean up uploaded file on error
    if (req.file) {
      try {
        // No cleanup needed - file is in memory
      } catch (err) {
        console.error('Failed to clean up uploaded file:', err);
      }
    }
    next(error);
  }
};

export const updateIcon = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Handle both JSON and FormData requests
    // If file is uploaded, body fields come as strings from FormData
    // If no file, body fields come as JSON
    let name, category, description, isActive, agencyId;
    
    if (req.file) {
      // FormData request - fields are strings
      name = req.body.name;
      category = req.body.category || null;
      description = req.body.description || null;
      isActive = req.body.isActive === 'true' || req.body.isActive === true || req.body.isActive === '1' || req.body.isActive === 1;
      agencyId = req.body.agencyId;
    } else {
      // JSON request
      ({ name, category, description, isActive, agencyId } = req.body);
    }
    
    console.log('Update icon request:', { id, body: req.body, hasFile: !!req.file, parsedFields: { name, category, description, isActive, agencyId } });

    const icon = await Icon.findById(id);
    if (!icon) {
      // Clean up uploaded file if icon not found
      if (req.file) {
        try {
          // No cleanup needed - file is in memory
        } catch (err) {
          console.error('Failed to clean up uploaded file:', err);
        }
      }
      return res.status(404).json({ error: { message: 'Icon not found' } });
    }

    // Validate name is provided (required field)
    if (name === undefined || name === null || (typeof name === 'string' && name.trim() === '')) {
      // Clean up uploaded file if provided
      if (req.file) {
        try {
          // No cleanup needed - file is in memory
        } catch (err) {
          console.error('Failed to clean up uploaded file:', err);
        }
      }
      return res.status(400).json({ error: { message: 'Icon name is required' } });
    }
    
    // Check permissions: non-super_admin users can only update icons from their agencies
    if (req.user.role !== 'super_admin') {
      // Platform icons (agency_id is null) can only be updated by super_admin
      if (icon.agency_id === null) {
        // Clean up uploaded file if provided
        if (req.file) {
          try {
            // No cleanup needed - file is in memory
          } catch (err) {
            console.error('Failed to clean up uploaded file:', err);
          }
        }
        return res.status(403).json({ error: { message: 'Only super admins can update platform icons' } });
      }
      
      // Check if user is affiliated with this agency
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(agency => agency.id === icon.agency_id);
      
      if (!hasAccess) {
        // Clean up uploaded file if provided
        if (req.file) {
          try {
            // No cleanup needed - file is in memory
          } catch (err) {
            console.error('Failed to clean up uploaded file:', err);
          }
        }
        return res.status(403).json({ error: { message: 'You can only update icons from agencies you are affiliated with' } });
      }
    }

    // Handle agency assignment first to determine the final agency_id
    let finalAgencyId = icon.agency_id; // Keep existing if not provided
    if (agencyId !== undefined && agencyId !== null) {
      const userRole = req.user.role;
      
      if (userRole === 'super_admin') {
        // If agencyId is explicitly 'null' or empty string, set to null (platform)
        // Otherwise, parse the agencyId (handle both string and number from FormData)
        if (agencyId === 'null' || agencyId === '' || agencyId === null) {
          finalAgencyId = null;
        } else {
          // Handle both string and number types
          const parsed = typeof agencyId === 'string' ? parseInt(agencyId.trim(), 10) : parseInt(agencyId, 10);
          finalAgencyId = isNaN(parsed) ? icon.agency_id : parsed;
        }
      } else {
        // Regular admins can only assign to their agencies
        // They cannot change agency icons to platform icons (null)
        const User = (await import('../models/User.model.js')).default;
        const userAgencies = await User.getAgencies(req.user.id);
        
        // If trying to set to platform (null), deny unless it's already platform
        if (agencyId === 'null' || agencyId === '' || agencyId === null) {
          if (icon.agency_id !== null) {
            // Clean up uploaded file if provided
            if (req.file) {
              try {
                // No cleanup needed - file is in memory
              } catch (err) {
                console.error('Failed to clean up uploaded file:', err);
              }
            }
            return res.status(403).json({ error: { message: 'Only super admins can change agency icons to platform icons' } });
          }
          finalAgencyId = null;
        } else {
          // User specified an agency - validate they have access
          // Handle both string and number types from FormData
          const requestedAgencyId = typeof agencyId === 'string' ? parseInt(agencyId.trim(), 10) : parseInt(agencyId, 10);
          if (isNaN(requestedAgencyId)) {
            // Clean up uploaded file if provided
            if (req.file) {
              try {
                // No cleanup needed - file is in memory
              } catch (err) {
                console.error('Failed to clean up uploaded file:', err);
              }
            }
            return res.status(400).json({ error: { message: 'Invalid agency ID' } });
          }
          
          const hasAccess = userAgencies.some(agency => agency.id === requestedAgencyId);
          if (!hasAccess) {
            // Clean up uploaded file if provided
            if (req.file) {
              try {
                // No cleanup needed - file is in memory
              } catch (err) {
                console.error('Failed to clean up uploaded file:', err);
              }
            }
            return res.status(403).json({ error: { message: 'You can only assign icons to agencies you are affiliated with' } });
          }
          finalAgencyId = requestedAgencyId;
        }
      }
    }

    // If name is not provided in update, use existing name
    const finalName = name !== undefined ? name : icon.name;
    
    // Check if new name conflicts with existing icon (within same agency scope)
    // Use finalAgencyId (which may have been updated) for the conflict check
    if (name && name !== icon.name) {
      const existing = await Icon.findByName(name, finalAgencyId);
      if (existing && existing.id !== parseInt(id)) {
        // Clean up uploaded file if provided
        if (req.file) {
          try {
            // No cleanup needed - file is in memory
          } catch (err) {
            console.error('Failed to clean up uploaded file:', err);
          }
        }
        return res.status(400).json({ error: { message: `Icon with name "${name}" already exists${finalAgencyId ? ' for this agency' : ' for platform'}` } });
      }
    }

    // Handle file upload if provided
    let newFilePath = null;
    let oldFilePath = null;
    if (req.file) {
      // New file uploaded - upload directly to GCS from memory buffer
      const fileBuffer = req.file.buffer;
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(req.file.originalname);
      const filename = `icon-${uniqueSuffix}${ext}`;
      
      // Upload to GCS using StorageService
      const storageResult = await StorageService.saveIcon(
        fileBuffer,
        filename,
        req.file.mimetype
      );
      
      newFilePath = storageResult.relativePath;
      console.log('Icon updated and uploaded to GCS:', newFilePath);
      
      oldFilePath = icon.file_path;
      
      // Delete old file from GCS if it exists
      if (oldFilePath) {
        try {
          // Extract filename from path (handles both "icons/filename" and full paths)
          const oldFilename = oldFilePath.includes('/') 
            ? oldFilePath.split('/').pop() 
            : oldFilePath.replace('icons/', '');
          
          await StorageService.deleteIcon(oldFilename);
          console.log('Deleted old icon file:', oldFilePath);
        } catch (err) {
          console.warn('Could not delete old icon file (may not exist):', err.message);
        }
      }
    }

    console.log('Updating icon with data:', {
      id,
      name: finalName,
      category,
      description,
      isActive,
      agencyId: finalAgencyId,
      hasNewFile: !!req.file,
      newFilePath
    });

    // Build update object - only include fields that are provided
    const updateData = {};
    if (name !== undefined) updateData.name = finalName;
    if (category !== undefined) updateData.category = category || null;
    if (description !== undefined) updateData.description = description || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (agencyId !== undefined) updateData.agencyId = finalAgencyId;
    if (newFilePath) {
      // Update file information
      updateData.filePath = newFilePath;
      updateData.fileName = req.file.originalname;
      updateData.fileSize = req.file.size;
      updateData.mimeType = req.file.mimetype;
    }

    console.log('Icon.update called with:', updateData);

    const updated = await Icon.update(id, updateData);
    
    console.log('Icon updated successfully:', updated);

    res.json({
      ...updated,
      url: Icon.getIconUrl(updated)
    });
  } catch (error) {
    console.error('Error updating icon:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      stack: error.stack,
      body: req.body
    });
    next(error);
  }
};

export const deleteIcon = async (req, res, next) => {
  try {
    console.log('Delete icon request for ID:', req.params.id);
    const { id } = req.params;
    const icon = await Icon.findById(id);

    if (!icon) {
      console.log('Icon not found:', id);
      return res.status(404).json({ error: { message: 'Icon not found' } });
    }
    
    console.log('Icon found:', icon.name, icon.file_path);

    // Check permissions: non-super_admin users can only delete icons from their agencies
    if (req.user.role !== 'super_admin') {
      // Platform icons (agency_id is null) can only be deleted by super_admin
      if (icon.agency_id === null) {
        return res.status(403).json({ error: { message: 'Only super admins can delete platform icons' } });
      }
      
      // Check if user is affiliated with this agency
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(agency => agency.id === icon.agency_id);
      
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You can only delete icons from agencies you are affiliated with' } });
      }
    }

    // Check if icon is in use - use dynamic queries to check for icon_id column existence
    let inUseCount = 0;
    const inUseItems = [];
    
    // Check modules
    try {
      const [modules] = await pool.execute('SELECT COUNT(*) as count FROM modules WHERE icon_id = ?', [id]);
      if (modules && modules[0] && modules[0].count > 0) {
        inUseCount += parseInt(modules[0].count);
        inUseItems.push(`${modules[0].count} module(s)`);
      }
    } catch (err) {
      // Column might not exist, skip
      console.log('Could not check modules for icon usage:', err.message);
      // Don't throw - just continue
    }
    
    // Check training_tracks
    try {
      const [tracks] = await pool.execute('SELECT COUNT(*) as count FROM training_tracks WHERE icon_id = ?', [id]);
      if (tracks && tracks[0] && tracks[0].count > 0) {
        inUseCount += parseInt(tracks[0].count);
        inUseItems.push(`${tracks[0].count} training focus(es)`);
      }
    } catch (err) {
      console.log('Could not check training_tracks for icon usage:', err.message);
      // Don't throw - just continue
    }
    
    // Check agencies
    try {
      const [agencies] = await pool.execute('SELECT COUNT(*) as count FROM agencies WHERE icon_id = ?', [id]);
      if (agencies && agencies[0] && agencies[0].count > 0) {
        inUseCount += parseInt(agencies[0].count);
        inUseItems.push(`${agencies[0].count} agency(ies)`);
      }
    } catch (err) {
      console.log('Could not check agencies for icon usage:', err.message);
      // Don't throw - just continue
    }
    
    // Check document_templates (if column exists)
    try {
      const [docs] = await pool.execute('SELECT COUNT(*) as count FROM document_templates WHERE icon_id = ?', [id]);
      if (docs && docs[0] && docs[0].count > 0) {
        inUseCount += parseInt(docs[0].count);
        inUseItems.push(`${docs[0].count} document template(s)`);
      }
    } catch (err) {
      // Column might not exist, skip
      console.log('Could not check document_templates for icon usage:', err.message);
      // Don't throw - just continue
    }
    
    // Check platform_branding default icons
    try {
      const [platform] = await pool.execute(
        'SELECT COUNT(*) as count FROM platform_branding WHERE training_focus_default_icon_id = ? OR module_default_icon_id = ? OR user_default_icon_id = ? OR document_default_icon_id = ?',
        [id, id, id, id]
      );
      if (platform && platform[0] && platform[0].count > 0) {
        inUseCount += parseInt(platform[0].count);
        inUseItems.push('platform branding default icon(s)');
      }
    } catch (err) {
      console.log('Could not check platform_branding for icon usage:', err.message);
    }
    
    // Check agency default icons
    try {
      const [agencyDefaults] = await pool.execute(
        'SELECT COUNT(*) as count FROM agencies WHERE training_focus_default_icon_id = ? OR module_default_icon_id = ? OR user_default_icon_id = ? OR document_default_icon_id = ?',
        [id, id, id, id]
      );
      if (agencyDefaults && agencyDefaults[0] && agencyDefaults[0].count > 0) {
        inUseCount += parseInt(agencyDefaults[0].count);
        inUseItems.push(`${agencyDefaults[0].count} agency default icon(s)`);
      }
    } catch (err) {
      console.log('Could not check agency defaults for icon usage:', err.message);
    }

    // Instead of blocking deletion, we'll clear all references to this icon
    // Set icon_id to NULL in all tables that reference it
    if (inUseCount > 0) {
      console.log(`Icon is in use by ${inUseItems.join(', ')}. Clearing references before deletion...`);
      
      // Clear icon references from modules
      try {
        await pool.execute('UPDATE modules SET icon_id = NULL WHERE icon_id = ?', [id]);
        console.log('Cleared icon references from modules');
      } catch (err) {
        console.log('Could not clear icon references from modules:', err.message);
      }
      
      // Clear icon references from training_tracks
      try {
        await pool.execute('UPDATE training_tracks SET icon_id = NULL WHERE icon_id = ?', [id]);
        console.log('Cleared icon references from training_tracks');
      } catch (err) {
        console.log('Could not clear icon references from training_tracks:', err.message);
      }
      
      // Clear icon references from agencies
      try {
        await pool.execute('UPDATE agencies SET icon_id = NULL WHERE icon_id = ?', [id]);
        console.log('Cleared icon references from agencies');
      } catch (err) {
        console.log('Could not clear icon references from agencies:', err.message);
      }
      
      // Clear icon references from document_templates
      try {
        await pool.execute('UPDATE document_templates SET icon_id = NULL WHERE icon_id = ?', [id]);
        console.log('Cleared icon references from document_templates');
      } catch (err) {
        console.log('Could not clear icon references from document_templates:', err.message);
      }
      
      // Clear default icon references from platform_branding
      try {
        await pool.execute(
          'UPDATE platform_branding SET training_focus_default_icon_id = NULL WHERE training_focus_default_icon_id = ?',
          [id]
        );
        await pool.execute(
          'UPDATE platform_branding SET module_default_icon_id = NULL WHERE module_default_icon_id = ?',
          [id]
        );
        await pool.execute(
          'UPDATE platform_branding SET user_default_icon_id = NULL WHERE user_default_icon_id = ?',
          [id]
        );
        await pool.execute(
          'UPDATE platform_branding SET document_default_icon_id = NULL WHERE document_default_icon_id = ?',
          [id]
        );
        console.log('Cleared default icon references from platform_branding');
      } catch (err) {
        console.log('Could not clear default icon references from platform_branding:', err.message);
      }
      
      // Clear default icon references from agencies
      try {
        await pool.execute(
          'UPDATE agencies SET training_focus_default_icon_id = NULL WHERE training_focus_default_icon_id = ?',
          [id]
        );
        await pool.execute(
          'UPDATE agencies SET module_default_icon_id = NULL WHERE module_default_icon_id = ?',
          [id]
        );
        await pool.execute(
          'UPDATE agencies SET user_default_icon_id = NULL WHERE user_default_icon_id = ?',
          [id]
        );
        await pool.execute(
          'UPDATE agencies SET document_default_icon_id = NULL WHERE document_default_icon_id = ?',
          [id]
        );
        console.log('Cleared default icon references from agencies');
      } catch (err) {
        console.log('Could not clear default icon references from agencies:', err.message);
      }
    }

    console.log('Calling Icon.delete for ID:', id);
    const deleted = await Icon.delete(id);
    console.log('Icon.delete result:', deleted);
    
    if (!deleted) {
      return res.status(500).json({ error: { message: 'Failed to delete icon from database' } });
    }
    
    res.json({ message: 'Icon deleted successfully' });
  } catch (error) {
    console.error('Error deleting icon:', error);
    console.error('Error stack:', error.stack);
    next(error);
  }
};

export const bulkUploadIcons = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: { message: 'No files uploaded. Please select at least one icon file.' } });
    }

    const { category, description, agencyId } = req.body;
    const userRole = req.user.role;
    
    // Determine agency assignment (same logic as single upload)
    let finalAgencyId = null;
    
    if (userRole === 'super_admin') {
      if (agencyId === 'null' || agencyId === '' || agencyId === null || agencyId === undefined) {
        finalAgencyId = null;
      } else {
        const parsed = typeof agencyId === 'number' ? agencyId : parseInt(agencyId?.trim() || '0', 10);
        finalAgencyId = isNaN(parsed) || parsed <= 0 ? null : parsed;
      }
    } else {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      
      if (agencyId === 'null' || agencyId === '' || agencyId === null || agencyId === undefined) {
        finalAgencyId = null;
      } else {
        const requestedAgencyId = parseInt(agencyId);
        if (isNaN(requestedAgencyId)) {
          // Clean up all uploaded files
          for (const file of req.files) {
            try {
              // No cleanup needed - file is in memory
            } catch (err) {
              console.error('Failed to clean up file:', err);
            }
          }
          return res.status(400).json({ error: { message: 'Invalid agency ID' } });
        }
        
        const hasAccess = userAgencies.some(agency => agency.id === requestedAgencyId);
        if (!hasAccess) {
          // Clean up all uploaded files
          for (const file of req.files) {
            try {
              // No cleanup needed - file is in memory
            } catch (err) {
              console.error('Failed to clean up file:', err);
            }
          }
          return res.status(403).json({ error: { message: 'You can only assign icons to agencies you are affiliated with' } });
        }
        finalAgencyId = requestedAgencyId;
      }
    }

    const results = [];
    const errors = [];

    for (const file of req.files) {
      try {
        // Generate name from filename if not provided
        const baseName = path.parse(file.originalname).name;
        const iconName = baseName.replace(/[^a-zA-Z0-9\s-_]/g, '').trim() || `icon-${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        
        // Check if name already exists
        const existing = await Icon.findByName(iconName, finalAgencyId);
        if (existing) {
          errors.push({
            file: file.originalname,
            error: `Icon with name "${iconName}" already exists${finalAgencyId ? ' for this agency' : ' for platform'}`
          });
          // No cleanup needed - file is in memory
          continue;
        }

        // Upload directly to GCS from memory buffer
        const fileBuffer = file.buffer;
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const filename = `icon-${uniqueSuffix}${ext}`;
        
        const storageResult = await StorageService.saveIcon(
          fileBuffer,
          filename,
          file.mimetype
        );
        
        const filePath = storageResult.relativePath;

        const createData = {
          name: iconName,
          filePath: filePath,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          category: category || null,
          description: description || null,
          createdByUserId: req.user.id,
          agencyId: finalAgencyId
        };

        const icon = await Icon.create(createData);
        results.push({
          ...icon,
          url: Icon.getIconUrl(icon),
          originalFileName: file.originalname
        });
      } catch (error) {
        console.error(`Error processing file ${file.originalname}:`, error);
        errors.push({
          file: file.originalname,
          error: error.message || 'Failed to process file'
        });
        // Clean up file on error
        try {
          // No cleanup needed - file is in memory
        } catch (err) {
          console.error('Failed to clean up file:', err);
        }
      }
    }

    res.status(201).json({
      message: `Successfully uploaded ${results.length} icon(s)`,
      successCount: results.length,
      errorCount: errors.length,
      icons: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in bulk icon upload:', error);
    // Clean up all uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          // No cleanup needed - file is in memory
        } catch (err) {
          console.error('Failed to clean up file:', err);
        }
      }
    }
    next(error);
  }
};

export const bulkEditIcons = async (req, res, next) => {
  try {
    const { iconIds, name, category, agencyId, description } = req.body;

    if (!iconIds || !Array.isArray(iconIds) || iconIds.length === 0) {
      return res.status(400).json({ error: { message: 'iconIds array is required and must not be empty' } });
    }

    // Build update data object (only include fields that are provided)
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category || null;
    if (agencyId !== undefined) updateData.agencyId = agencyId || null;
    if (description !== undefined) updateData.description = description || null;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: { message: 'At least one field must be provided for update' } });
    }

    // Validate all icons exist
    const Icon = (await import('../models/Icon.model.js')).default;
    for (const iconId of iconIds) {
      const icon = await Icon.findById(iconId);
      if (!icon) {
        return res.status(404).json({ error: { message: `Icon with ID ${iconId} not found` } });
      }
    }

    // Perform bulk update
    const updatedIcons = await Icon.bulkUpdate(iconIds, updateData);

    res.json({
      message: `Successfully updated ${updatedIcons.length} icon(s)`,
      updatedCount: updatedIcons.length,
      icons: updatedIcons
    });
  } catch (error) {
    console.error('Error in bulk icon edit:', error);
    next(error);
  }
};

export const bulkDeleteIcons = async (req, res, next) => {
  try {
    const { iconIds } = req.body;

    if (!iconIds || !Array.isArray(iconIds) || iconIds.length === 0) {
      return res.status(400).json({ error: { message: 'iconIds array is required and must not be empty' } });
    }

    const Icon = (await import('../models/Icon.model.js')).default;

    // Validate all icons exist
    for (const iconId of iconIds) {
      const icon = await Icon.findById(iconId);
      if (!icon) {
        return res.status(404).json({ error: { message: `Icon with ID ${iconId} not found` } });
      }
    }

    // Perform bulk delete (this will also delete files from GCS)
    const deletedCount = await Icon.bulkDelete(iconIds);

    res.json({
      message: `Successfully deleted ${deletedCount} icon(s)`,
      deletedCount: deletedCount
    });
  } catch (error) {
    console.error('Error in bulk icon delete:', error);
    next(error);
  }
};


