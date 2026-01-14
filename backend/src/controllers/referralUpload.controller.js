import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import multer from 'multer';
import StorageService from '../services/storage.service.js';

// Configure multer for memory storage (files will be uploaded to GCS)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept PDF and image files
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, and PNG files are allowed.'), false);
    }
  }
});

/**
 * Upload referral packet (no authentication required)
 * POST /api/organizations/:slug/upload-referral
 */
export const uploadReferralPacket = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const { slug } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ 
          error: { message: 'No file uploaded' } 
        });
      }

      // Verify organization exists and is a school
      const organization = await Agency.findBySlug(slug);
      
      if (!organization) {
        return res.status(404).json({ 
          error: { message: 'Organization not found' } 
        });
      }

      // Check if organization is a school (or allow other types if needed)
      const orgType = organization.organization_type || 'agency';
      if (orgType !== 'school') {
        return res.status(403).json({ 
          error: { message: 'Referral upload is only available for school organizations' } 
        });
      }

      // Upload file to GCS
      const sanitizedFilename = StorageService.sanitizeFilename(req.file.originalname);
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const fileName = `referrals/${organization.id}/${timestamp}-${randomId}-${sanitizedFilename}`;
      
      const bucket = await StorageService.getGCSBucket();
      const file = bucket.file(fileName);
      
      await file.save(req.file.buffer, {
        contentType: req.file.mimetype,
        metadata: {
          organizationId: organization.id.toString(),
          uploadedBy: 'public',
          uploadType: 'referral_packet',
          uploadedAt: new Date().toISOString()
        }
      });
      
      // Use signed URL instead of making public (more secure)
      // File will be accessible via /uploads route
      const fileUrl = `/uploads/${fileName}`;

      // Determine agency_id
      // For schools, we need to find the associated agency that manages this school
      // Since schools and agencies are in the same table, we'll use a simplified approach:
      // For now, we'll look for an agency organization that the user might be associated with
      // In a production system, you might have a school_agencies junction table or parent_agency_id field
      let agencyId = null;
      
      // Try to find an agency organization (not a school)
      // This is a simplified approach - in production, you'd have a proper relationship
      const allAgencies = await Agency.findAll(true, false, 'agency');
      if (allAgencies.length > 0) {
        // Use the first agency found (in production, this would be the school's managing agency)
        agencyId = allAgencies[0].id;
      } else {
        // Fallback: use organization id (not ideal, but allows the system to function)
        agencyId = organization.id;
      }

      // Create client record with status = PENDING_REVIEW
      // Note: initials will need to be extracted from OCR or provided separately
      // For now, we'll use a placeholder
      const client = await Client.create({
        organization_id: organization.id,
        agency_id: agencyId,
        provider_id: null, // No provider assigned yet
        initials: 'TBD', // Placeholder - should be extracted from OCR or form
        status: 'PENDING_REVIEW',
        submission_date: new Date().toISOString().split('T')[0],
        document_status: 'UPLOADED',
        source: 'SCHOOL_UPLOAD',
        created_by_user_id: null // Public upload, no user
      });

      // Log to status history
      await ClientStatusHistory.create({
        client_id: client.id,
        changed_by_user_id: null, // Public upload
        field_changed: 'created',
        from_value: null,
        to_value: JSON.stringify({ source: 'SCHOOL_UPLOAD', document_status: 'UPLOADED' }),
        note: 'Client created via referral packet upload'
      });

      // TODO: Trigger OCR processing (future enhancement)
      // await OCRService.processReferralPacket(client.id, fileUrl);
      // After OCR, update client with extracted initials and other data

      res.json({
        success: true,
        message: 'Referral packet uploaded successfully. Client record created.',
        fileUrl: fileUrl,
        organizationId: organization.id,
        clientId: client.id
      });
    } catch (error) {
      console.error('Referral upload error:', error);
      next(error);
    }
  }
];
