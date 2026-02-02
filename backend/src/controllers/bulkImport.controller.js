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

      // Resolve target agency ID:
      // - super_admin must provide agency_id/agencyId explicitly
      // - admin may omit and we’ll default to their first agency
      const rawAgencyId = req.body.agency_id ?? req.body.agencyId ?? req.user.agencyId;
      let agencyId = rawAgencyId ? parseInt(rawAgencyId, 10) : null;

      if (userRole === 'super_admin') {
        if (!agencyId) {
          return res.status(400).json({
            error: { message: 'Agency ID is required for bulk import (super admin must select an agency)' }
          });
        }
      } else {
        const userAgencies = await User.getAgencies(userId);
        if (!agencyId) {
          if (userAgencies.length === 0) {
            return res.status(400).json({
              error: { message: 'You must be associated with an agency to import clients' }
            });
          }
          agencyId = userAgencies[0].id;
        } else {
          const allowed = userAgencies.some((a) => a.id === agencyId);
          if (!allowed) {
            return res.status(403).json({
              error: { message: 'You do not have access to import clients for the selected agency' }
            });
          }
        }
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
          error: {
            message: error.message,
            row: error.rowNumber || null,
            missingFields: error.missingFields || null,
            foundHeaders: error.foundHeaders || null,
            expectedHeaders: error.expectedHeaders || null
          } 
        });
      }
      
      next(error);
    }
  }
];
