import { validationResult } from 'express-validator';
import IntakeLink from '../models/IntakeLink.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeSubmissionDocument from '../models/IntakeSubmissionDocument.model.js';
import DocumentTemplate from '../models/DocumentTemplate.model.js';
import PublicIntakeSigningService from '../services/publicIntakeSigning.service.js';
import DocumentSigningService from '../services/documentSigning.service.js';
import PublicIntakeClientService from '../services/publicIntakeClient.service.js';
import { getClientIpAddress } from '../utils/ipAddress.util.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import Client from '../models/Client.model.js';
import StorageService from '../services/storage.service.js';
import EmailService from '../services/email.service.js';

const normalizeName = (name) => String(name || '').trim();

const buildSignerFromSubmission = (submission) => {
  const name = normalizeName(submission.signer_name);
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'Signer';
  const lastName = parts.slice(1).join(' ') || '';
  return {
    firstName,
    lastName,
    email: submission.signer_email || 'unknown@example.com',
    userId: `Public-${submission.id}`
  };
};

const buildWorkflowData = ({ submission }) => ({
  consent_given_at: submission.consent_given_at,
  intent_to_sign_at: submission.submitted_at,
  identity_verified_at: null,
  finalized_at: submission.submitted_at,
  consent_ip: submission.ip_address || null,
  intent_ip: submission.ip_address || null
});

const buildAuditTrail = ({ link, submission }) => ({
  intakeLinkId: link.id,
  submissionId: submission.id,
  signerRole: submission.signer_role || 'guardian',
  signerName: submission.signer_name,
  signerInitials: submission.signer_initials,
  clientName: submission.client_name || null,
  consentGivenAt: submission.consent_given_at,
  submittedAt: submission.submitted_at,
  ipAddress: submission.ip_address,
  userAgent: submission.user_agent
});

const loadAllowedTemplates = async (link) => {
  const allowedIds = Array.isArray(link.allowed_document_template_ids)
    ? link.allowed_document_template_ids
    : [];
  if (!allowedIds.length) return [];

  const templates = [];
  for (const id of allowedIds) {
    const t = await DocumentTemplate.findById(id);
    if (t && t.is_active) templates.push(t);
  }
  return templates;
};

export const getPublicIntakeLink = async (req, res, next) => {
  try {
    const publicKey = String(req.params.publicKey || '').trim();
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const templates = await loadAllowedTemplates(link);
    res.json({
      link: {
        id: link.id,
        title: link.title,
        description: link.description,
        scope_type: link.scope_type,
        organization_id: link.organization_id,
        program_id: link.program_id,
        create_client: link.create_client,
        create_guardian: link.create_guardian,
        intake_fields: link.intake_fields
      },
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        template_type: t.template_type,
        html_content: t.template_type === 'html' ? t.html_content : null,
        file_path: t.template_type === 'pdf' ? t.file_path : null,
        signature_x: t.signature_x,
        signature_y: t.signature_y,
        signature_width: t.signature_width,
        signature_height: t.signature_height,
        signature_page: t.signature_page
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const createPublicConsent = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const ipAddress = getClientIpAddress(req);
    const userAgent = req.get('user-agent');
    const now = new Date();

    const submission = await IntakeSubmission.create({
      intakeLinkId: link.id,
      status: 'consented',
      signerName: normalizeName(req.body.signerName),
      signerInitials: normalizeName(req.body.signerInitials),
      signerEmail: normalizeName(req.body.signerEmail) || null,
      signerPhone: normalizeName(req.body.signerPhone) || null,
      consentGivenAt: now,
      ipAddress,
      userAgent
    });

    res.status(201).json({ submission });
  } catch (error) {
    next(error);
  }
};

export const submitPublicIntake = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const publicKey = String(req.params.publicKey || '').trim();
    const link = await IntakeLink.findByPublicKey(publicKey);
    if (!link || !link.is_active) {
      return res.status(404).json({ error: { message: 'Intake link not found' } });
    }

    const submissionId = parseInt(req.body.submissionId, 10);
    if (!submissionId) {
      return res.status(400).json({ error: { message: 'submissionId is required' } });
    }

    const submission = await IntakeSubmission.findById(submissionId);
    if (!submission || submission.intake_link_id !== link.id) {
      return res.status(404).json({ error: { message: 'Submission not found' } });
    }

    if (link.create_client) {
      const fullName = String(req.body?.client?.fullName || '').trim();
      if (!fullName) {
        return res.status(400).json({ error: { message: 'Client full name is required.' } });
      }
    }
    if (link.create_guardian) {
      const gEmail = String(req.body?.guardian?.email || '').trim();
      const gFirst = String(req.body?.guardian?.firstName || '').trim();
      if (!gEmail || !gFirst) {
        return res.status(400).json({ error: { message: 'Guardian name and email are required.' } });
      }
    }

    const signatureData = String(req.body.signatureData || '').trim();
    if (!signatureData) {
      return res.status(400).json({ error: { message: 'signatureData is required' } });
    }

    const now = new Date();
    const intakeData = req.body?.intakeData || null;
    let updatedSubmission = await IntakeSubmission.updateById(submissionId, {
      status: 'submitted',
      submitted_at: now,
      intake_data: intakeData
    });

    if (link.create_client) {
      const { client, guardianUser } = await PublicIntakeClientService.createClientAndGuardian({
        link,
        payload: req.body
      });
      updatedSubmission = await IntakeSubmission.updateById(submissionId, {
        client_id: client?.id || null,
        guardian_user_id: guardianUser?.id || null
      });
    }

    const templates = await loadAllowedTemplates(link);
    if (!templates.length) {
      return res.status(400).json({ error: { message: 'No documents are configured for this intake link.' } });
    }

    const signer = buildSignerFromSubmission(updatedSubmission);
    const clientName = String(req.body?.client?.fullName || '').trim() || null;
    const workflowData = buildWorkflowData({ submission: { ...updatedSubmission, submitted_at: now } });
    const auditTrail = buildAuditTrail({
      link,
      submission: { ...updatedSubmission, submitted_at: now, client_name: clientName }
    });

    const signedDocs = [];
    const pdfBuffers = [];
    for (const template of templates) {
      const result = await PublicIntakeSigningService.generateSignedDocument({
        template,
        signatureData,
        signer,
        auditTrail,
        workflowData,
        submissionId
      });

      const doc = await IntakeSubmissionDocument.create({
        intakeSubmissionId: submissionId,
        documentTemplateId: template.id,
        signedPdfPath: result.storagePath,
        pdfHash: result.pdfHash,
        signedAt: now,
        auditTrail
      });

      pdfBuffers.push(result.pdfBytes);

      if (updatedSubmission.client_id) {
        try {
          const clientRow = await Client.findById(updatedSubmission.client_id, { includeSensitive: true });
          const agencyId = clientRow?.agency_id || null;
          const orgId = clientRow?.organization_id || null;
          const phiDoc = await ClientPhiDocument.create({
            clientId: updatedSubmission.client_id,
            agencyId,
            schoolOrganizationId: orgId,
            storagePath: result.storagePath,
            originalName: `${template.name || 'Document'} (Signed)`,
            mimeType: 'application/pdf',
            uploadedByUserId: null,
            scanStatus: 'clean'
          });
          await PhiDocumentAuditLog.create({
            documentId: phiDoc.id,
            clientId: updatedSubmission.client_id,
            action: 'uploaded',
            actorUserId: null,
            actorLabel: 'public_intake',
            ipAddress: updatedSubmission.ip_address || null,
            metadata: { submissionId, templateId: template.id }
          });
        } catch {
          // best-effort; do not block public intake
        }
      }

      signedDocs.push(doc);
    }

    let downloadUrl = null;
    if (pdfBuffers.length > 0) {
      const mergedPdf = await PublicIntakeSigningService.mergeSignedPdfs(pdfBuffers);
      const bundleHash = DocumentSigningService.calculatePDFHash(mergedPdf);
      const bundleResult = await StorageService.saveIntakeBundle({
        submissionId,
        fileBuffer: mergedPdf,
        filename: `intake-bundle-${submissionId}.pdf`
      });
      await IntakeSubmission.updateById(submissionId, {
        combined_pdf_path: bundleResult.relativePath,
        combined_pdf_hash: bundleHash
      });
      downloadUrl = await StorageService.getSignedUrl(bundleResult.relativePath, 60 * 24 * 3);

      if (updatedSubmission.signer_email && EmailService.isConfigured()) {
        const subject = 'Your signed intake packet';
        const summaryLine = clientName ? `Client: ${clientName}\n\n` : '';
        const text = `${summaryLine}Your intake packet is ready. Download here:\n\n${downloadUrl}\n\nThis link expires in 3 days.`;
        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            ${clientName ? `<p><strong>Client:</strong> ${clientName}</p>` : ''}
            <p>Your intake packet is ready.</p>
            <p><a href="${downloadUrl}" style="display:inline-block;padding:10px 14px;background:#2c3e50;color:#fff;text-decoration:none;border-radius:6px;">Download Signed Packet</a></p>
            <p style="color:#777;">This link expires in 3 days.</p>
          </div>
        `.trim();
        try {
          await EmailService.sendEmail({
            to: updatedSubmission.signer_email,
            subject,
            text,
            html,
            fromName: process.env.GOOGLE_WORKSPACE_FROM_NAME || 'People Operations',
            fromAddress: process.env.GOOGLE_WORKSPACE_FROM_ADDRESS || process.env.GOOGLE_WORKSPACE_DEFAULT_FROM || null,
            replyTo: process.env.GOOGLE_WORKSPACE_REPLY_TO || null
          });
        } catch {
          // best-effort email
        }
      }
    }

    res.json({
      success: true,
      submission: updatedSubmission,
      documents: signedDocs,
      downloadUrl
    });
  } catch (error) {
    next(error);
  }
};

export const getSchoolIntakeLink = async (req, res, next) => {
  try {
    const orgId = parseInt(req.params.organizationId, 10);
    if (!orgId) return res.status(400).json({ error: { message: 'organizationId is required' } });
    const links = await IntakeLink.findByScope({ scopeType: 'school', organizationId: orgId, programId: null });
    const link = links[0] || null;
    if (!link) return res.status(404).json({ error: { message: 'No intake link configured for school' } });
    res.json({ link });
  } catch (error) {
    next(error);
  }
};
