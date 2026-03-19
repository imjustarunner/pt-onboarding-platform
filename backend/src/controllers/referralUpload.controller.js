import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import multer from 'multer';
import StorageService from '../services/storage.service.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import ReferralPacketDraft from '../models/ReferralPacketDraft.model.js';
import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { notifyNewPacketUploaded } from '../services/clientNotifications.service.js';
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

const normalizeNamePart = (value) => {
  const raw = String(value || '').replace(/[^A-Za-z]/g, '');
  if (!raw) return '';
  const part = raw.slice(0, 3);
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
};

const buildAbbreviatedName = (firstName, lastName) => {
  const first = normalizeNamePart(firstName);
  const last = normalizeNamePart(lastName);
  return `${first}${last}`.trim();
};

const resolveAgencyIdForOrganization = async (organizationId) => {
  let agencyId =
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(organizationId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(organizationId)) ||
    null;
  if (!agencyId) {
    const allAgencies = await Agency.findAll(true, false, 'agency');
    agencyId = allAgencies?.[0]?.id || organizationId;
  }
  return agencyId;
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

      const agencyId = await resolveAgencyIdForOrganization(organization.id);

      const isInternalUpload = !!req.user?.id;
      const uploaderId = isInternalUpload ? req.user.id : null;

      // Use client-provided submission date (user's local date) to avoid timezone drift.
      // Server UTC date can be a day off for users in US timezones (e.g. evening upload = next day UTC).
      let submissionDate = req.body?.submissionDate || req.body?.submission_date;
      if (typeof submissionDate === 'string') submissionDate = submissionDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(submissionDate)) {
        submissionDate = new Date().toISOString().split('T')[0];
      }

      const uploadNote = String(req.body?.uploadNote || '').trim();
      const firstName = String(req.body?.firstName || '').trim();
      const lastName = String(req.body?.lastName || '').trim();
      const computedInitials = buildAbbreviatedName(firstName, lastName);
      const draft = await ReferralPacketDraft.create({
        organizationId: organization.id,
        agencyId,
        uploadedByUserId: uploaderId,
        submissionDate,
        uploadNote: uploadNote || null,
        firstName: firstName || null,
        lastName: lastName || null,
        initials: computedInitials || null,
        status: 'draft'
      });

      // Track packet as PHI and store metadata for secure access + auditing
      let phiDoc = null;
      try {
        phiDoc = await ClientPhiDocument.create({
          clientId: null,
          agencyId,
          schoolOrganizationId: organization.id,
          referralDraftId: draft.id,
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
            clientId: null,
            action: 'uploaded',
            actorUserId: uploaderId,
            actorLabel: isInternalUpload
              ? `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email || `User ${req.user.id}`
              : 'public_upload',
            ipAddress: ip,
            metadata: { source: 'REFERRAL_DRAFT_UPLOAD', organizationId: organization.id, draftId: draft.id }
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

      if (phiDoc?.id) {
        await ReferralPacketDraft.updateById(draft.id, { phi_document_id: phiDoc.id });
      }

      res.json({
        success: true,
        message: 'Referral packet uploaded successfully. Review and submit to create the client.',
        draftId: draft.id,
        phiDocumentId: phiDoc?.id || null,
        organizationId: organization.id,
        agencyId
      });
    } catch (error) {
      console.error('Referral upload error:', error);
      next(error);
    }
  }
];

export const getLatestReferralPacketDraft = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const organization = await Agency.findBySlug(slug);
    if (!organization) {
      return res.status(404).json({ error: { message: 'Organization not found' } });
    }

    const orgType = String(organization.organization_type || 'agency').toLowerCase();
    if (orgType !== 'school' && orgType !== 'program') {
      return res.status(403).json({
        error: { message: 'Referral upload is only available for school or program organizations' }
      });
    }

    if (!req.user?.id) {
      return res.json({ draft: null });
    }

    const draft = await ReferralPacketDraft.findLatestOpenDraft({
      organizationId: organization.id,
      uploadedByUserId: req.user.id
    });

    return res.json({
      draft: draft
        ? {
            id: draft.id,
            organizationId: draft.organization_id,
            agencyId: draft.agency_id,
            phiDocumentId: draft.phi_document_id || null,
            submissionDate: draft.submission_date || null,
            uploadNote: draft.upload_note || '',
            firstName: draft.first_name || '',
            lastName: draft.last_name || '',
            initials: draft.initials || '',
            status: draft.status
          }
        : null
    });
  } catch (error) {
    next(error);
  }
};

export const submitReferralPacketDraft = async (req, res, next) => {
  try {
    const { slug, draftId: draftIdParam } = req.params;
    const draftId = parseInt(draftIdParam, 10);
    if (!draftId) {
      return res.status(400).json({ error: { message: 'draftId is required' } });
    }

    const organization = await Agency.findBySlug(slug);
    if (!organization) {
      return res.status(404).json({ error: { message: 'Organization not found' } });
    }

    const orgType = String(organization.organization_type || 'agency').toLowerCase();
    if (orgType !== 'school' && orgType !== 'program') {
      return res.status(403).json({
        error: { message: 'Referral upload is only available for school or program organizations' }
      });
    }

    const draft = await ReferralPacketDraft.findById(draftId);
    if (!draft || Number(draft.organization_id) !== Number(organization.id)) {
      return res.status(404).json({ error: { message: 'Referral packet draft not found' } });
    }

    if (draft.status === 'submitted' && draft.created_client_id) {
      return res.json({
        success: true,
        message: 'Referral packet draft already submitted.',
        draftId: draft.id,
        clientId: draft.created_client_id,
        alreadySubmitted: true
      });
    }

    const claimed = await ReferralPacketDraft.claimForSubmit(draft.id);
    if (!claimed) {
      const latest = await ReferralPacketDraft.findById(draft.id);
      if (latest?.status === 'submitted' && latest.created_client_id) {
        return res.json({
          success: true,
          message: 'Referral packet draft already submitted.',
          draftId: latest.id,
          clientId: latest.created_client_id,
          alreadySubmitted: true
        });
      }
      return res.status(409).json({ error: { message: 'This draft is already being submitted. Please wait.' } });
    }

    const isInternalUpload = !!req.user?.id;
    const source = isInternalUpload ? 'SCHOOL_UPLOAD_INTERNAL' : 'SCHOOL_UPLOAD';
    const uploaderId = draft.uploaded_by_user_id || (isInternalUpload ? req.user.id : null);
    const uploaderLabel = isInternalUpload
      ? `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email || `User ${req.user.id}`
      : 'public_upload';

    const agencyId = draft.agency_id || (await resolveAgencyIdForOrganization(organization.id));
    const identifierCode = await generateUniqueSixDigitClientCode({ agencyId });
    const paperworkStatusId = await resolvePaperworkStatusId({ agencyId });
    const clientStatusId = await getClientStatusIdByKey({ agencyId, statusKey: 'packet' });
    const clientType = orgType === 'school' ? 'school' : 'clinical';

    let submissionDate = req.body?.submissionDate || req.body?.submission_date || draft.submission_date;
    if (typeof submissionDate === 'string') submissionDate = submissionDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(submissionDate || ''))) {
      submissionDate = new Date().toISOString().split('T')[0];
    }

    const firstName = String(req.body?.firstName || draft.first_name || '').trim();
    const lastName = String(req.body?.lastName || draft.last_name || '').trim();
    const computedInitials = buildAbbreviatedName(firstName, lastName);
    const initials = computedInitials || String(draft.initials || '').trim() || 'TBD';
    const noteFromRequest = String(req.body?.uploadNote || '').trim();
    const uploadNote = noteFromRequest || String(draft.upload_note || '').trim();

    const client = await Client.create({
      organization_id: organization.id,
      agency_id: agencyId,
      provider_id: null,
      initials,
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

    if (uploaderId && String(req.user?.role || '').toLowerCase() === 'school_staff') {
      await ClientSchoolStaffRoiAccess.resetForNewPacket({
        clientId: client.id,
        schoolOrganizationId: organization.id,
        uploaderUserId: uploaderId,
        actorUserId: req.user?.id || uploaderId
      });
    }

    await ClientStatusHistory.create({
      client_id: client.id,
      changed_by_user_id: uploaderId,
      field_changed: 'created',
      from_value: null,
      to_value: JSON.stringify({ source, status: 'PACKET', document_status: 'PACKET' }),
      note: `Client created via referral packet submit (${uploaderLabel})`
    });

    if (draft.phi_document_id) {
      await ReferralPacketDraft.updateById(draft.id, {
        first_name: firstName || null,
        last_name: lastName || null,
        initials: initials || null
      });
      await ClientPhiDocument.updateById(draft.phi_document_id, {
        client_id: client.id,
        referral_draft_id: null
      });
    }

    notifyNewPacketUploaded({
      agencyId,
      schoolOrganizationId: organization.id,
      clientId: client.id,
      clientNameOrIdentifier: client.identifier_code || client.initials || `ID ${client.id}`,
      clientInitials: client.initials || null,
      mode: 'paper_upload',
      schoolStaffName: String(req.user?.role || '').toLowerCase() === 'school_staff' ? uploaderLabel : null
    }).catch(() => {});

    if (uploadNote && uploadNote.length <= 500 && uploaderId) {
      try {
        await ClientNotes.create(
          {
            client_id: client.id,
            author_id: uploaderId,
            message: uploadNote,
            is_internal_only: false,
            category: 'comment',
            urgency: 'low'
          },
          { hasAgencyAccess: false, canViewInternalNotes: false }
        );
      } catch (e) {
        console.warn('Failed to save upload note as comment:', e.message);
      }
    }

    await ReferralPacketDraft.updateById(draft.id, {
      status: 'submitted',
      created_client_id: client.id,
      submitted_at: new Date(),
      upload_note: uploadNote || null,
      first_name: firstName || null,
      last_name: lastName || null,
      initials: initials || null,
      last_error: null
    });

    res.json({
      success: true,
      message: 'Client created from referral packet.',
      draftId: draft.id,
      clientId: client.id,
      agencyId,
      organizationId: organization.id
    });
  } catch (error) {
    try {
      const draftId = parseInt(req.params?.draftId, 10);
      if (draftId) {
        await ReferralPacketDraft.updateById(draftId, {
          status: 'failed',
          last_error: error?.message || 'Submission failed'
        });
      }
    } catch {
      // best effort
    }
    console.error('Referral submit error:', error);
    next(error);
  }
};
