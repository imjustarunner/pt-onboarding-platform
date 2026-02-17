import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import multer from 'multer';
import StorageService from '../services/storage.service.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { notifyPaperworkReceived } from '../services/clientNotifications.service.js';
import DocumentEncryptionService from '../services/documentEncryption.service.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import { generateUniqueSixDigitClientCode } from '../utils/clientCode.js';
import { resolvePaperworkStatusId, seedClientAffiliations, seedClientPaperworkItems } from '../utils/clientProvisioning.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';

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

const QUARANTINE_PREFIX = 'referrals_quarantine/';

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

      // Check if organization is a school or program
      const orgType = String(organization.organization_type || 'agency').toLowerCase();
      if (orgType !== 'school' && orgType !== 'program') {
        return res.status(403).json({ 
          error: { message: 'Referral upload is only available for school or program organizations' } 
        });
      }

      // Upload file to GCS
      const sanitizedFilename = StorageService.sanitizeFilename(req.file.originalname);
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(7);
      const quarantinePath = `referrals_quarantine/${organization.id}/${timestamp}-${randomId}-${sanitizedFilename}`;

      const encryptionAad = JSON.stringify({
        organizationId: organization.id,
        uploadType: 'referral_packet',
        filename: sanitizedFilename
      });
      const encryptionResult = await DocumentEncryptionService.encryptBuffer(req.file.buffer, {
        aad: encryptionAad
      });
      
      const bucket = await StorageService.getGCSBucket();
      const file = bucket.file(quarantinePath);
      
      await file.save(encryptionResult.encryptedBuffer, {
        contentType: 'application/octet-stream',
        metadata: {
          organizationId: organization.id.toString(),
          uploadedBy: 'public',
          uploadType: 'referral_packet',
          uploadedAt: new Date().toISOString(),
          originalName: sanitizedFilename,
          originalContentType: req.file.mimetype,
          isEncrypted: 'true',
          encryptionKeyId: encryptionResult.encryptionKeyId,
          encryptionWrappedKey: encryptionResult.encryptionWrappedKeyB64,
          encryptionIv: encryptionResult.encryptionIvB64,
          encryptionAuthTag: encryptionResult.encryptionAuthTagB64,
          encryptionAlg: encryptionResult.encryptionAlg,
          encryptionAad
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

      const isInternalUpload = !!req.user?.id;
      const source = isInternalUpload ? 'SCHOOL_UPLOAD_INTERNAL' : 'SCHOOL_UPLOAD';
      const uploaderId = isInternalUpload ? req.user.id : null;
      const uploaderLabel = isInternalUpload
        ? `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email || `User ${req.user.id}`
        : 'public_upload';

      const identifierCode = await generateUniqueSixDigitClientCode({ agencyId });
      const paperworkStatusId = await resolvePaperworkStatusId({ agencyId });
      const clientStatusId = await getClientStatusIdByKey({ agencyId, statusKey: 'packet' });
      const clientType = orgType === 'school' ? 'school' : 'clinical';

      // Use client-provided submission date (user's local date) to avoid timezone drift.
      // Server UTC date can be a day off for users in US timezones (e.g. evening upload = next day UTC).
      let submissionDate = req.body?.submissionDate || req.body?.submission_date;
      if (typeof submissionDate === 'string') submissionDate = submissionDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(submissionDate)) {
        submissionDate = new Date().toISOString().split('T')[0];
      }

      // Create client record with status = PACKET
      // Note: initials will need to be extracted from OCR or provided separately
      // For now, we'll use a placeholder
      const client = await Client.create({
        organization_id: organization.id,
        agency_id: agencyId,
        provider_id: null, // No provider assigned yet
        initials: 'TBD', // Placeholder - should be extracted from OCR or form
        identifier_code: identifierCode,
        client_type: clientType,
        status: 'PACKET',
        submission_date: submissionDate,
        document_status: 'PACKET',
        paperwork_status_id: paperworkStatusId,
        client_status_id: clientStatusId,
        source,
        created_by_user_id: uploaderId
      });

      await seedClientAffiliations({
        clientId: client.id,
        agencyId,
        organizationId: organization.id
      });
      await seedClientPaperworkItems({ clientId: client.id, agencyId });

      // Log to status history
      await ClientStatusHistory.create({
        client_id: client.id,
        changed_by_user_id: uploaderId,
        field_changed: 'created',
        from_value: null,
        to_value: JSON.stringify({ source, status: 'PACKET', document_status: 'PACKET' }),
        note: `Client created via referral packet upload (${uploaderLabel})`
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
          storagePath: quarantinePath,
          originalName: req.file.originalname || null,
          mimeType: req.file.mimetype || null,
          uploadedByUserId: uploaderId,
          quarantinePath,
          isEncrypted: true,
          encryptionKeyId: encryptionResult.encryptionKeyId,
          encryptionWrappedKey: encryptionResult.encryptionWrappedKeyB64,
          encryptionIv: encryptionResult.encryptionIvB64,
          encryptionAuthTag: encryptionResult.encryptionAuthTagB64,
          encryptionAlg: encryptionResult.encryptionAlg
        });
        try {
          const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
          await PhiDocumentAuditLog.create({
            documentId: phiDoc.id,
            clientId: client.id,
            action: 'uploaded',
            actorUserId: uploaderId,
            actorLabel: uploaderLabel,
            ipAddress: ip,
            metadata: { source, organizationId: organization.id }
          });
        } catch {
          // best-effort logging
        }
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
        clientId: client.id,
        agencyId
      });
    } catch (error) {
      console.error('Referral upload error:', error);
      next(error);
    }
  }
];
