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
import MalwareScanService from '../services/malwareScan.service.js';

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
const CLEAN_PREFIX = 'referrals/';

const scanAndUpdateDocument = async ({ phiDoc, rawBuffer }) => {
  if (!phiDoc?.id) return;
  if (!rawBuffer) return;
  try {
    if (!MalwareScanService.isConfigured()) {
      await ClientPhiDocument.updateScanStatusById({
        id: phiDoc.id,
        scanStatus: 'error',
        scanResult: 'VirusTotal API key not configured',
        scannedAt: new Date()
      });
      return;
    }

    const scanResult = await MalwareScanService.scanBuffer(rawBuffer);
    const scannedAt = new Date();
    let updatedStoragePath = phiDoc.storage_path;

    if (scanResult.status === 'clean') {
      if (updatedStoragePath.startsWith(QUARANTINE_PREFIX)) {
        updatedStoragePath = updatedStoragePath.replace(QUARANTINE_PREFIX, CLEAN_PREFIX);
        await StorageService.moveObject(phiDoc.storage_path, updatedStoragePath);
      }
    } else if (scanResult.status === 'infected') {
      await StorageService.deleteObject(phiDoc.storage_path);
    }

    await ClientPhiDocument.updateScanStatusById({
      id: phiDoc.id,
      scanStatus: scanResult.status,
      scanResult: scanResult.details || null,
      scannedAt,
      storagePath: updatedStoragePath
    });
  } catch (error) {
    await ClientPhiDocument.updateScanStatusById({
      id: phiDoc.id,
      scanStatus: 'error',
      scanResult: error?.message || 'Scan failed',
      scannedAt: new Date()
    });
  }
};

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

      const encryptionResult = await DocumentEncryptionService.encryptBuffer(req.file.buffer, {
        aad: JSON.stringify({
          organizationId: organization.id,
          uploadType: 'referral_packet',
          filename: sanitizedFilename
        })
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
          scanStatus: 'pending',
          isEncrypted: 'true'
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
        document_status: 'PACKET',
        source,
        created_by_user_id: uploaderId
      });

      // Log to status history
      await ClientStatusHistory.create({
        client_id: client.id,
        changed_by_user_id: uploaderId,
        field_changed: 'created',
        from_value: null,
        to_value: JSON.stringify({ source, document_status: 'PACKET' }),
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
          scanStatus: 'pending',
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

      if (phiDoc) {
        setImmediate(() => {
          scanAndUpdateDocument({ phiDoc, rawBuffer: req.file?.buffer });
        });
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
        scanStatus: phiDoc?.scan_status || 'pending',
        organizationId: organization.id,
        clientId: client.id
      });
    } catch (error) {
      console.error('Referral upload error:', error);
      next(error);
    }
  }
];
