import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { readFax, suggestFaxFields, FAX_FIELDS } from '../services/faxExtraction.service.js';
import { saveFaxDraft } from '../services/faxIntake.service.js';
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
