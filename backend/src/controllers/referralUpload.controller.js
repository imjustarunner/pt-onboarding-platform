import Agency from '../models/Agency.model.js';
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

      // TODO: Create client record with status = PENDING_REVIEW (Step 2)
      // For now, just return success
      // const client = await Client.create({
      //   organization_id: organization.id,
      //   status: 'PENDING_REVIEW',
      //   document_status: 'UPLOADED',
      //   source: 'SCHOOL_UPLOAD',
      //   referral_packet_url: fileUrl
      // });

      // TODO: Trigger OCR processing (future enhancement)
      // await OCRService.processReferralPacket(client.id, fileUrl);

      res.json({
        success: true,
        message: 'Referral packet uploaded successfully',
        fileUrl: fileUrl,
        organizationId: organization.id,
        // clientId: client.id // Will be available in Step 2
      });
    } catch (error) {
      console.error('Referral upload error:', error);
      next(error);
    }
  }
];
