import Font from '../models/Font.model.js';
import { validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import StorageService from '../services/storage.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for font uploads - use memory storage for GCS
// Files are uploaded directly to GCS, not saved to local filesystem
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'font/woff2',
    'font/woff',
    'application/font-woff2',
    'application/font-woff',
    'application/x-font-woff',
    'font/ttf',
    'application/x-font-ttf',
    'font/otf',
    'application/x-font-opentype'
  ];
  
  const allowedExts = ['.woff2', '.woff', '.ttf', '.otf'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only WOFF2, WOFF, TTF, and OTF fonts are allowed.'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for font files
  }
});

export const getAllFonts = async (req, res, next) => {
  try {
    const { includeInactive, agencyId, familyName } = req.query;
    const includeMissing = String(req.query.includeMissing || 'false') === 'true';
    
    const filters = {};
    if (agencyId !== undefined && agencyId !== '') {
      if (agencyId === 'null') {
        filters.agencyId = null;
      } else {
        const parsed = parseInt(agencyId, 10);
        if (!isNaN(parsed)) {
          filters.agencyId = parsed;
        }
      }
    }
    
    if (familyName) {
      filters.familyName = familyName;
    }
    
    let fonts = await Font.findAll(includeInactive === 'true', filters);
    
    // For non-super_admin users: exclude platform fonts unless explicitly requested
    if (req.user.role !== 'super_admin' && filters.agencyId === undefined) {
      fonts = fonts.filter(font => font.agency_id !== null);
    }
    
    // Hide “seeded”/missing fonts by default (only show fonts whose files actually exist)
    if (!includeMissing) {
      const checks = await Promise.all(
        fonts.map(async (font) => {
          const fp = font?.file_path ? String(font.file_path) : '';
          const filename = fp ? path.basename(fp) : null;
          const exists = filename ? await StorageService.fontExists(filename) : false;
          return { font, exists };
        })
      );
      fonts = checks.filter(x => x.exists).map(x => x.font);
    }

    // Add URL to each font
    const fontsWithUrls = fonts.map(font => ({
      ...font,
      url: `/uploads/fonts/${path.basename(font.file_path)}`
    }));
    
    res.json(fontsWithUrls);
  } catch (error) {
    next(error);
  }
};

export const getFontById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const font = await Font.findById(id);
    
    if (!font) {
      return res.status(404).json({ error: { message: 'Font not found' } });
    }
    
    res.json({
      ...font,
      url: `/uploads/fonts/${path.basename(font.file_path)}`
    });
  } catch (error) {
    next(error);
  }
};

export const getFontFamilies = async (req, res, next) => {
  try {
    const { agencyId } = req.query;
    const parsedAgencyId = agencyId && agencyId !== 'null' ? parseInt(agencyId, 10) : null;

    // Only include families that have at least one available font file.
    const filters = {};
    if (agencyId !== undefined) {
      if (agencyId === 'null') filters.agencyId = null;
      else if (!Number.isNaN(parsedAgencyId)) filters.agencyId = parsedAgencyId;
    }
    let fonts = await Font.findAll(false, filters);
    const checks = await Promise.all(
      fonts.map(async (font) => {
        const fp = font?.file_path ? String(font.file_path) : '';
        const filename = fp ? path.basename(fp) : null;
        const exists = filename ? await StorageService.fontExists(filename) : false;
        return exists ? font.family_name : null;
      })
    );
    const families = Array.from(new Set(checks.filter(Boolean))).sort();
    res.json(families);
  } catch (error) {
    next(error);
  }
};

export const uploadFont = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No file uploaded. Please select a font file.' } });
    }
    
    const { name, familyName, agencyId } = req.body;
    
    if (!name || !familyName) {
      // Delete uploaded file if validation fails
      try {
        // No cleanup needed - file is in memory
      } catch (e) {
        console.error('Error deleting file after validation failure:', e);
      }
      return res.status(400).json({ error: { message: 'Font name and family name are required' } });
    }
    
    // Determine agency assignment
    let finalAgencyId = null;
    const userRole = req.user.role;
    
    if (userRole === 'super_admin') {
      if (agencyId === 'null' || agencyId === null || agencyId === undefined || agencyId === '') {
        finalAgencyId = null; // Platform font
      } else {
        const parsed = parseInt(agencyId, 10);
        if (!isNaN(parsed)) {
          finalAgencyId = parsed;
        }
      }
    } else if (userRole === 'admin') {
      finalAgencyId = req.user.agency_id || null;
    } else {
      // Delete uploaded file
      try {
        // No cleanup needed - file is in memory
      } catch (e) {
        console.error('Error deleting file:', e);
      }
      return res.status(403).json({ error: { message: 'Only admins can upload fonts' } });
    }
    
    // Determine file type from extension
    const ext = path.extname(req.file.originalname).toLowerCase();
    let fileType = 'woff2';
    if (ext === '.woff') fileType = 'woff';
    else if (ext === '.ttf') fileType = 'ttf';
    else if (ext === '.otf') fileType = 'otf';
    
    // Upload directly to GCS from memory buffer
    const fileBuffer = req.file.buffer;
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `font-${uniqueSuffix}-${sanitizedName}`;
    
    // Determine content type based on file type
    const contentType = fileType === 'woff2' ? 'font/woff2' :
                       fileType === 'woff' ? 'font/woff' :
                       fileType === 'ttf' ? 'font/ttf' :
                       'font/otf';
    
    // Upload to GCS using StorageService
    const storageResult = await StorageService.saveFont(
      fileBuffer,
      filename,
      contentType
    );
    
    const relativePath = storageResult.relativePath;
    console.log('Font uploaded to GCS:', relativePath);
    
    const font = await Font.create({
      name: name.trim(),
      familyName: familyName.trim(),
      filePath: relativePath,
      fileType,
      agencyId: finalAgencyId
    });
    
    res.status(201).json({
      ...font,
      url: `/uploads/${relativePath}`
    });
  } catch (error) {
    // Delete uploaded file on error
    if (req.file) {
      try {
        // No cleanup needed - file is in memory
      } catch (e) {
        console.error('Error deleting file after upload error:', e);
      }
    }
    next(error);
  }
};

export const updateFont = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { id } = req.params;
    const { name, familyName, isActive, agencyId } = req.body;
    
    const font = await Font.findById(id);
    if (!font) {
      return res.status(404).json({ error: { message: 'Font not found' } });
    }
    
    // Permission check
    if (req.user.role === 'admin' && font.agency_id !== req.user.agency_id) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Handle file upload if provided
    let newFilePath = null;
    if (req.file) {
      // Determine file type from extension
      const ext = path.extname(req.file.originalname).toLowerCase();
      const fileType = ext.replace('.', '');
      
      if (!['woff2', 'woff', 'ttf', 'otf'].includes(fileType)) {
        // Delete uploaded file
        try {
          // No cleanup needed - file is in memory
        } catch (e) {
          console.error('Error deleting invalid file:', e);
        }
        return res.status(400).json({ error: { message: 'Invalid file type. Only WOFF2, WOFF, TTF, and OTF files are allowed.' } });
      }
      
      // Upload directly to GCS from memory buffer
      const fileBuffer = req.file.buffer;
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const sanitizedName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = `font-${uniqueSuffix}-${sanitizedName}`;
      
      const contentType = fileType === 'woff2' ? 'font/woff2' :
                         fileType === 'woff' ? 'font/woff' :
                         fileType === 'ttf' ? 'font/ttf' :
                         'font/otf';
      
      const storageResult = await StorageService.saveFont(
        fileBuffer,
        filename,
        contentType
      );
      
      newFilePath = storageResult.relativePath;
      console.log('Font updated and uploaded to GCS:', newFilePath);
      
      // Delete old file if it exists (works for both local and GCS)
      if (font.file_path) {
        try {
          const oldFilename = font.file_path.includes('/') 
            ? font.file_path.split('/').pop() 
            : font.file_path.replace('fonts/', '');
          
          await StorageService.deleteFont(oldFilename);
          console.log('Deleted old font file:', font.file_path);
        } catch (e) {
          console.warn('Could not delete old font file (may not exist):', e.message);
        }
      }
    }
    
    // Determine agency assignment (only for super_admin)
    let finalAgencyId = font.agency_id; // Keep existing by default
    if (req.user.role === 'super_admin' && agencyId !== undefined) {
      if (agencyId === 'null' || agencyId === null || agencyId === '') {
        finalAgencyId = null;
      } else {
        const parsed = parseInt(agencyId, 10);
        if (!isNaN(parsed)) {
          finalAgencyId = parsed;
        }
      }
    }
    
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (familyName !== undefined) updateData.familyName = familyName.trim();
    if (isActive !== undefined) updateData.isActive = isActive === 'true' || isActive === true;
    if (newFilePath) updateData.filePath = newFilePath;
    if (req.user.role === 'super_admin' && agencyId !== undefined) {
      updateData.agencyId = finalAgencyId;
    }
    
    const updated = await Font.update(id, updateData);
    res.json({
      ...updated,
      url: `/uploads/fonts/${path.basename(updated.file_path)}`
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        // No cleanup needed - file is in memory
      } catch (e) {
        console.error('Error deleting file after upload error:', e);
      }
    }
    next(error);
  }
};

export const deleteFont = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const font = await Font.findById(id);
    if (!font) {
      return res.status(404).json({ error: { message: 'Font not found' } });
    }
    
    // Permission check
    if (req.user.role === 'admin' && font.agency_id !== req.user.agency_id) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Check if font is in use
    const pool = (await import('../config/database.js')).default;
    const [platformUsage] = await pool.execute(
      'SELECT COUNT(*) as count FROM platform_branding WHERE header_font_id = ? OR body_font_id = ? OR numeric_font_id = ? OR display_font_id = ?',
      [id, id, id, id]
    );
    
    if (platformUsage[0].count > 0) {
      return res.status(400).json({ 
        error: { message: 'Cannot delete font. It is currently in use in platform branding.' } 
      });
    }
    
    await Font.delete(id);
    res.json({ message: 'Font deleted successfully' });
  } catch (error) {
    next(error);
  }
};
