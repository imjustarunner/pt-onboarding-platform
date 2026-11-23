import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { readFax, suggestFaxFields, FAX_FIELDS } from '../services/faxExtraction.service.js';
import { assertInboundFaxIntakeAccess, attachFaxReferralToClient, getFaxDraft, saveFaxDraft } from '../services/faxIntake.service.js';
import { getFaxReferral, listFaxReferralReview, readFaxReferralDocument, reviewFaxReferral } from '../services/inboundFaxReferral.service.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import DocumentEncryptionService from '../services/documentEncryption.service.js';
import { isDemographicsEncryptionConfigured } from '../services/demographicsImport.service.js';
import { isGuardianIntakeEncryptionConfigured } from '../services/guardianIntakeEncryption.service.js';

export const referralStaffRoles = new Set(['super_admin', 'admin', 'support', 'staff', 'provider', 'provider_plus']);
export async function requireReferralAgency(req, res, next) {
  try {
    if (!referralStaffRoles.has(String(req.user?.role))) return res.status(403).json({ error: { message: 'Staff access required.' } });
    const id = Number(req.query.agencyId || req.body?.agencyId);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: { message: 'Select an agency.' } });
    const agencies = req.user.role === 'super_admin' ? null : await User.getAgencies(req.user.id);
    if (agencies && !agencies.some(a => Number(a.id) === id)) return res.status(403).json({ error: { message: 'Agency access denied.' } });
    req.referralAgencyId = id;
    next();
  } catch { res.status(503).json({ error: { message: 'Unable to verify agency access.' } }); }
}

const router = express.Router();
router.use(authenticate, requireReferralAgency);
const receiptId = /^[0-9a-f-]{36}$/i;
const staffFax = handler => async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    await assertInboundFaxIntakeAccess(req.user.id, req.referralAgencyId);
    if (req.params.id && !receiptId.test(req.params.id)) return res.status(404).json({ error: { message: 'Fax not found.' } });
    await handler(req, res);
  } catch (error) {
    res.status(error.safe ? error.status : 503).json({ error: { message: error.safe ? error.message : 'Could not complete secure fax intake. Please try again.' } });
  }
};

function auditFaxDocument(id, userId, action) {
  return pool.execute('INSERT INTO fax_referral_document_access (fax_referral_id, user_id, action) VALUES (?, ?, ?)', [id, userId, action]);
}

router.get('/inbox', staffFax(async (req, res) => {
  res.json({ rows: await listFaxReferralReview(req.referralAgencyId) });
}));
router.get('/inbox/ticket/:ticketId', staffFax(async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  if (!Number.isSafeInteger(ticketId) || ticketId <= 0) return res.sendStatus(404);
  const receipt = await getFaxReferral(req.referralAgencyId, { ticketId });
  const [organizations] = await pool.execute(`SELECT a.id, a.name, a.organization_type FROM agencies a
    WHERE a.is_active = 1 AND COALESCE(a.is_archived,0) = 0 AND
      (a.id = ? OR (a.organization_type = 'school' AND EXISTS (
        SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id = a.id AND oa.agency_id = ? AND oa.is_active = 1
      ))) ORDER BY a.name`, [req.referralAgencyId, req.referralAgencyId]);
  res.json({ receipt, organizations });
}));
router.get('/inbox/:id/document', staffFax(async (req, res) => {
  const receipt = await getFaxReferral(req.referralAgencyId, { id: req.params.id, document: true });
  const buffer = await readFaxReferralDocument(receipt);
  await auditFaxDocument(receipt.id, req.user.id, 'document');
  res.set('X-Content-Type-Options', 'nosniff');
  res.attachment('referral-fax.pdf').type('application/pdf').send(buffer);
}));
router.post('/inbox/:id/review', staffFax(async (req, res) => {
  res.json(await reviewFaxReferral({ agencyId: req.referralAgencyId, id: req.params.id, userId: req.user.id, action: req.body?.action }));
}));
router.post('/inbox/:id/draft', rateLimit({ windowMs: 60000, max: 6 }), staffFax(async (req, res) => {
  const organizationId = Number(req.body?.organizationId);
  const [[organization]] = await pool.execute(`SELECT a.id FROM agencies a WHERE a.id = ? AND a.is_active = 1 AND
    (a.id = ? OR EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id = a.id AND oa.agency_id = ? AND oa.is_active = 1))`,
  [organizationId || 0, req.referralAgencyId, req.referralAgencyId]);
  if (!organization) return res.status(400).json({ error: { message: 'Choose an organization affiliated with this agency.' } });
  if (!isDemographicsEncryptionConfigured() || !isGuardianIntakeEncryptionConfigured()) {
    return res.status(503).json({ error: { message: 'Fax chart encryption must be configured before filing.' } });
  }
  const receipt = await getFaxReferral(req.referralAgencyId, { id: req.params.id, document: true });
  if (receipt.state !== 'referral') return res.status(409).json({ error: { message: 'This fax is not awaiting chart filing.' } });
  const buffer = await readFaxReferralDocument(receipt);
  await auditFaxDocument(receipt.id, req.user.id, 'review_draft');
  let pages = [], candidates = [], warning = null;
  try { ({ pages } = await readFax(buffer)); }
  catch (error) {
    if (!error.safe) throw error;
    warning = 'The text could not be read automatically. Review the original fax and enter the fields.';
  }
  if (pages.length) {
    try { candidates = await suggestFaxFields(pages); }
    catch (error) {
      if (error.safe && /multiple clients/i.test(error.message)) throw error;
      warning = 'Automatic suggestions are unavailable. Verify and enter the fields from the original fax.';
    }
  }
  const draftId = await saveFaxDraft({ buffer, mimeType: 'application/pdf', pages, candidates, agencyId: req.referralAgencyId,
    organizationId, userId: req.user.id, faxReferralId: receipt.id });
  res.status(201).json({ draftId, candidates, fields: FAX_FIELDS, pages: pages.map(({ page, text }) => ({ page, text })), warning });
}));
router.post('/inbox/:id/link', staffFax(async (req, res) => {
  const access = await resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId: Number(req.body?.clientId) });
  if (!access.ok || Number(access.client.agency_id) !== req.referralAgencyId || access.client.status === 'ARCHIVED') {
    return res.status(404).json({ error: { message: 'Active client chart not found in this agency.' } });
  }
  const fax = req.body.fax;
  const draft = await getFaxDraft(fax?.draftId, req.user.id);
  if (draft.fax_referral_id !== req.params.id) return res.status(409).json({ error: { message: 'The review belongs to a different fax.' } });
  res.json(await attachFaxReferralToClient({ client: access.client, fax, userId: req.user.id }));
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
router.post('/extract', rateLimit({ windowMs: 60000, max: 6 }), (req, res) => {
  res.set('Cache-Control', 'no-store');
  upload.single('file')(req, res, async uploadError => {
    if (uploadError) return res.status(400).json({ error: { message: 'Upload one PDF, PNG, or JPEG up to 10 MB.' } });
    try {
      if (!req.file) return res.status(400).json({ error: { message: 'Select a fax file.' } });
      if (!DocumentEncryptionService.isConfigured() || !isDemographicsEncryptionConfigured() || !isGuardianIntakeEncryptionConfigured()) {
        return res.status(503).json({ error: { message: 'Fax intake encryption must be configured before uploading.' } });
      }
      const orgId = Number(req.query.organizationId);
      const [orgs] = await pool.execute(`SELECT a.id FROM agencies a WHERE a.id = ? AND
        (a.id = ? OR EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id = a.id AND oa.agency_id = ? AND oa.is_active = TRUE))`,
      [orgId || 0, req.referralAgencyId, req.referralAgencyId]);
      if (!orgs.length) return res.status(400).json({ error: { message: 'Choose an organization affiliated with this agency.' } });
      const { mimeType, pages } = await readFax(req.file.buffer);
      let candidates = [], warning = null;
      try { candidates = await suggestFaxFields(pages); }
      catch (error) {
        if (error.safe && /multiple clients/i.test(error.message)) throw error;
        warning = 'Automatic suggestions are unavailable. Map the extracted text manually or retry.';
      }
      const draftId = await saveFaxDraft({ buffer: req.file.buffer, mimeType, pages, candidates,
        agencyId: req.referralAgencyId, organizationId: orgId, userId: req.user.id });
      res.status(201).json({ draftId, candidates, fields: FAX_FIELDS, pages: pages.map(({ page, text }) => ({ page, text })), warning });
    } catch (error) {
      res.status(error.safe ? error.status : 503).json({ error: { message: error.safe ? error.message : 'Fax extraction is unavailable. Check the OCR and encryption configuration, then retry.' } });
    } finally { if (req.file) req.file.buffer = null; }
  });
});
router.delete('/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM fax_intake_drafts WHERE id = ? AND agency_id = ? AND created_by_user_id = ? AND client_id IS NULL', [req.params.id, req.referralAgencyId, req.user.id]);
    res.sendStatus(204);
  } catch { res.status(503).json({ error: { message: 'Could not discard the fax review.' } }); }
});
export default router;
