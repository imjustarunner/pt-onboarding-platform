import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import multer from 'multer';
import StorageService from '../services/storage.service.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { notifyPaperworkReceived } from '../services/clientNotifications.service.js';

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
      
      // Note: referral packets are PHI. Do not return a public URL here.

      // Determine agency_id
      let agencyId = null;
      
      // Prefer the active affiliated agency for this school.
      agencyId =
        (await OrganizationAffiliation.getActiveAgencyIdForOrganization(organization.id)) ||
        (await AgencySchool.getActiveAgencyIdForSchool(organization.id)) ||
        null;
      if (!agencyId) {
        const allAgencies = await Agency.findAll(true, false, 'agency');
        agencyId = allAgencies?.[0]?.id || organization.id;
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

      // Track packet as PHI and store metadata for secure access + auditing
      let phiDoc = null;
      try {
        phiDoc = await ClientPhiDocument.create({
          clientId: client.id,
          agencyId,
          schoolOrganizationId: organization.id,
          storagePath: fileName,
          originalName: req.file.originalname || null,
          mimeType: req.file.mimetype || null,
          uploadedByUserId: null
        });
      } catch (e) {
        // Don't fail upload if PHI tracking table isn't available yet.
        if (e.code !== 'ER_NO_SUCH_TABLE') {
          console.warn('Failed to create PHI document record:', e.message);
        }
        phiDoc = null;
      }

      // Notify support/admin team that paperwork was received (best-effort).
      // This satisfies the spec requirement to notify support so they can finalize the placeholder client.
      notifyPaperworkReceived({
        agencyId,
        schoolOrganizationId: organization.id,
        clientId: client.id,
        clientNameOrIdentifier: client.identifier_code || client.initials || `ID ${client.id}`
      }).catch(() => {});

      res.json({
        success: true,
        message: 'Referral packet uploaded successfully. Client record created.',
        phiDocumentId: phiDoc?.id || null,
        organizationId: organization.id,
        clientId: client.id
      });
    } catch (error) {
      console.error('Referral upload error:', error);
      next(error);
    }
  }
];
