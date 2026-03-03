import IntakeSubmissionDocument from '../models/IntakeSubmissionDocument.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import StorageService from '../services/storage.service.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';

/**
 * GET /api/unassigned-documents
 * List intake submission documents with client_id IS NULL (from public forms).
 */
export const listUnassignedDocuments = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    const isSuperAdmin = req.user?.role === 'super_admin';
    let hasMedicalRecordsReleaseAccess = false;
    if (!isSuperAdmin && req.user?.id) {
      const fullUser = await User.findById(req.user.id);
      hasMedicalRecordsReleaseAccess = !!(fullUser?.has_medical_records_release_access === 1 || fullUser?.has_medical_records_release_access === true);
    }
    const excludeMedicalRecords = !isSuperAdmin && !hasMedicalRecordsReleaseAccess;

    const rows = await IntakeSubmissionDocument.listUnassigned({
      agencyId: Number.isFinite(agencyId) ? agencyId : null,
      limit,
      offset,
      excludeMedicalRecords
    });

    res.json(rows);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/unassigned-documents/:id/assign
 * Assign an unassigned document to a client. Creates ClientPhiDocument and updates intake_submission_document.
 */
export const assignToClient = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const clientId = parseInt(req.body.clientId, 10);
    if (!id || !clientId) {
      return res.status(400).json({ error: { message: 'id and clientId are required' } });
    }

    const doc = await IntakeSubmissionDocument.findById(id);
    if (!doc) {
      return res.status(404).json({ error: { message: 'Document not found' } });
    }
    if (doc.client_id) {
      return res.status(400).json({ error: { message: 'Document is already assigned to a client' } });
    }
    const submission = await IntakeSubmission.findById(doc.intake_submission_id);
    const link = submission ? await IntakeLink.findById(submission.intake_link_id) : null;
    if (link && link.requires_assignment === false) {
      return res.status(400).json({ error: { message: 'This document is not assignable; it is view-only in the submitted documents section.' } });
    }
    if (!doc.signed_pdf_path) {
      return res.status(400).json({ error: { message: 'Document has no signed PDF' } });
    }

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) {
      return res.status(404).json({ error: { message: 'Client not found' } });
    }

    const agencyId = client.agency_id || null;
    const orgId = client.organization_id || client.school_organization_id || agencyId;

    const phiDoc = await ClientPhiDocument.create({
      clientId,
      agencyId,
      schoolOrganizationId: orgId || agencyId,
      intakeSubmissionId: doc.intake_submission_id,
      storagePath: doc.signed_pdf_path,
      originalName: `intake-${doc.document_template_name || 'document'}.pdf`,
      documentTitle: doc.document_template_name || 'Intake Document',
      documentType: 'intake',
      mimeType: 'application/pdf',
      uploadedByUserId: null,
      scanStatus: 'clean'
    });

    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || null;
    await PhiDocumentAuditLog.create({
      documentId: phiDoc.id,
      clientId,
      action: 'assigned_from_unassigned',
      actorUserId: req.user?.id || null,
      actorLabel: req.user?.email || req.user?.name || null,
      ipAddress: ip,
      metadata: { intakeSubmissionDocumentId: id }
    });

    await IntakeSubmissionDocument.updateClientId(id, clientId);

    res.json({
      success: true,
      clientPhiDocument: phiDoc,
      intakeSubmissionDocument: await IntakeSubmissionDocument.findById(id)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/unassigned-documents/:id/download
 * Download the signed PDF for an unassigned document.
 */
export const downloadDocument = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const doc = await IntakeSubmissionDocument.findById(id);
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });
    if (doc.client_id) return res.status(400).json({ error: { message: 'Document is assigned; use client documents to download.' } });
    if (!doc.signed_pdf_path) return res.status(400).json({ error: { message: 'No signed PDF available' } });

    const submission = await IntakeSubmission.findById(doc.intake_submission_id);
    const link = submission ? await IntakeLink.findById(submission.intake_link_id) : null;

    if (link?.form_type === 'medical_records_request') {
      const isSuperAdmin = req.user?.role === 'super_admin';
      let hasMedicalRecordsReleaseAccess = false;
      if (req.user?.id) {
        const fullUser = await User.findById(req.user.id);
        hasMedicalRecordsReleaseAccess = !!(fullUser?.has_medical_records_release_access === 1 || fullUser?.has_medical_records_release_access === true);
      }
      if (!isSuperAdmin && !hasMedicalRecordsReleaseAccess) {
        return res.status(403).json({ error: { message: 'Medical records release access required to download this document.' } });
      }
    }

    const userAgencies = await User.getAgencies(req.user?.id);
    const userOrgIds = (userAgencies || []).map((a) => Number(a.id)).filter(Boolean);

    let canAccess = req.user?.role === 'super_admin';
    if (!canAccess && link) {
      const orgId = Number(link.organization_id);
      if (link.scope_type === 'agency' && userOrgIds.includes(orgId)) canAccess = true;
      if (!canAccess && orgId) {
        const placeholders = userOrgIds.length ? userOrgIds.map(() => '?').join(',') : '0';
        const [[schoolRow]] = await pool.execute(
          `SELECT agency_id FROM agency_schools WHERE school_organization_id = ? AND agency_id IN (${placeholders}) AND is_active = TRUE LIMIT 1`,
          [orgId, ...(userOrgIds.length ? userOrgIds : [0])]
        );
        const [[affilRow]] = await pool.execute(
          `SELECT agency_id FROM organization_affiliations WHERE organization_id = ? AND agency_id IN (${placeholders}) AND is_active = TRUE LIMIT 1`,
          [orgId, ...(userOrgIds.length ? userOrgIds : [0])]
        );
        if (schoolRow?.agency_id || affilRow?.agency_id) canAccess = true;
      }
    }
    if (!canAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    const buffer = await StorageService.readIntakeSignedDocument(doc.signed_pdf_path);
    const [[dtRow]] = await pool.execute('SELECT name FROM document_templates WHERE id = ? LIMIT 1', [doc.document_template_id]);
    const safeName = ((dtRow?.name || 'document') + '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'document';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-${id}.pdf"`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/unassigned-documents/:id/guardian-clients
 * If the signer email matches a guardian, return their linked clients for quick-assign.
 */
export const getGuardianClients = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const doc = await IntakeSubmissionDocument.findById(id);
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });

    const submission = await IntakeSubmission.findById(doc.intake_submission_id);
    const signerEmail = String(submission?.signer_email || '').trim().toLowerCase();
    if (!signerEmail) {
      return res.json({ clients: [], guardian: null });
    }

    const user = await User.findByEmail(signerEmail);
    if (!user) return res.json({ clients: [], guardian: null });

    const clients = await ClientGuardian.listClientsForGuardian({ guardianUserId: user.id });
    res.json({
      clients: clients || [],
      guardian: { id: user.id, email: user.email, name: `${user.first_name || ''} ${user.last_name || ''}`.trim() }
    });
  } catch (error) {
    next(error);
  }
};
