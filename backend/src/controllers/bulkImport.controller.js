/**
 * Bulk Import Controller
 * 
 * Handles bulk import of clients from CSV files with smart matching and deduplication
 */

import multer from 'multer';
import CSVParserService from '../services/csvParser.service.js';
import ClientMatchingService from '../services/clientMatching.service.js';
import User from '../models/User.model.js';

// Configure multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV files are allowed.'), false);
    }
  }
});

/**
 * Bulk import clients from CSV
 * POST /api/bulk-import/clients
 */
export const bulkImportClients = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          error: { message: 'No CSV file uploaded' } 
        });
      }

      const userId = req.user.id;
      const userRole = req.user.role;

      // Permission check: Only admin or super_admin can bulk import
      if (!['super_admin', 'admin'].includes(userRole)) {
        return res.status(403).json({ 
          error: { message: 'Only admins can perform bulk imports' } 
        });
      }

      const updateExisting = req.body.updateExisting === 'true' || req.body.updateExisting === true;

      // Get user's primary agency ID
      let agencyId = req.body.agency_id || req.user.agencyId;
      
      if (!agencyId && userRole !== 'super_admin') {
        // Get user's first agency
        const userAgencies = await User.getAgencies(userId);
        if (userAgencies.length === 0) {
          return res.status(400).json({ 
            error: { message: 'You must be associated with an agency to import clients' } 
          });
        }
        agencyId = userAgencies[0].id;
      }

      if (!agencyId) {
        return res.status(400).json({ 
          error: { message: 'Agency ID is required for bulk import' } 
        });
      }

      // Parse CSV
      const rows = await CSVParserService.parseCSV(req.file.buffer);

      if (rows.length === 0) {
        return res.status(400).json({ 
          error: { message: 'CSV file is empty or contains no valid rows' } 
        });
      }

      // Process bulk import
      const results = await ClientMatchingService.processBulkImport(
        rows,
        agencyId,
        updateExisting,
        userId
      );

      res.json({
        success: true,
        totalRows: rows.length,
        created: results.created,
        updated: results.updated,
        errors: results.errors,
        message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`
      });
    } catch (error) {
      console.error('Bulk import error:', error);
      
      // Handle CSV parsing errors
      if (error.message.includes('Row') || error.message.includes('CSV')) {
        return res.status(400).json({ 
          error: { message: error.message } 
        });
      }
      
      next(error);
    }
  }
];
