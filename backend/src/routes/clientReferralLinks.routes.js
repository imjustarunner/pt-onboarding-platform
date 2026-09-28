import express from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../config/database.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireReferralAgency } from './faxIntake.routes.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import { assertReferralEntry } from '../services/faxIntake.service.js';
import { lookupReferralBusiness } from '../services/referralBusinessLookup.service.js';
import { logClientAccess } from '../services/clientAccessLog.service.js';
import ReferralDirectoryEntry from '../models/ReferralDirectoryEntry.model.js';
import { decryptDemographicsPayload } from '../services/demographicsImport.service.js';
import { FAX_FIELDS } from '../services/faxExtraction.service.js';

const router = express.Router();
router.use(authenticate, requireReferralAgency, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const handle = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) { res.status(error.safe ? error.status : 503).json({ error: { message: error.safe ? error.message : 'Unable to load or save referral links.' } }); }
};
router.get('/directory', handle(async (req, res) => {
  res.json({ entries: await ReferralDirectoryEntry.listForAgency(req.referralAgencyId, { search: req.query.search || '' }) });
}));
router.post('/business-lookup', rateLimit({ windowMs: 60000, max: 15 }), handle(async (req, res) => {
  // Explicitly select public fields: never forward request bodies, OCR, or client identifiers.
  res.json(await lookupReferralBusiness({ name: req.body.name, location: req.body.location }));
}));
router.get('/entries/:entryId/clients', handle(async (req, res) => {
  const [links] = await pool.execute(`SELECT l.*, c.initials, c.status FROM client_referral_links l
    JOIN clients c ON c.id = l.client_id AND c.agency_id = l.agency_id
    WHERE l.agency_id = ? AND l.entry_id = ? ORDER BY l.created_at DESC`, [req.referralAgencyId, req.params.entryId]);
  const visible = [];
  for (const link of links) {
    const access = await resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId: link.client_id });
    if (access.ok) { visible.push(link); await logClientAccess(req, link.client_id, 'referral_link_viewed'); }
  }
  res.json({ links: visible });
}));
async function clientAccess(req, res, next) {
  try {
    const access = await resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId: req.params.clientId });
    if (!access.ok || Number(access.client?.agency_id) !== req.referralAgencyId) return res.status(403).json({ error: { message: 'Client access denied.' } });
    req.referralClient = access.client;
    next();
  } catch { res.status(503).json({ error: { message: 'Unable to verify client access.' } }); }
}
router.get('/clients/:clientId', clientAccess, handle(async (req, res) => {
  const [links] = await pool.execute(`SELECT l.*, e.name, e.organization_name, e.phone, e.fax, e.email, e.website
    FROM client_referral_links l JOIN referral_directory_entries e ON e.id = l.entry_id
    WHERE l.client_id = ? AND l.agency_id = ? ORDER BY l.created_at DESC`, [req.params.clientId, req.referralAgencyId]);
  const [documents] = await pool.execute(`SELECT id, document_title, document_type, uploaded_at FROM client_phi_documents
    WHERE client_id = ? AND agency_id = ? AND removed_at IS NULL ORDER BY uploaded_at DESC`, [req.params.clientId, req.referralAgencyId]);
  await logClientAccess(req, req.params.clientId, 'referral_link_viewed');
  let faxFields = null, faxFieldsWarning = null;
  if (req.referralClient?.demographics_phi_enc) {
    try {
      const archive = decryptDemographicsPayload(req.referralClient.demographics_phi_enc);
      if (archive?.faxFields) faxFields = Object.fromEntries(Object.entries(archive.faxFields).filter(([key]) => Object.hasOwn(FAX_FIELDS, key)));
    } catch { faxFieldsWarning = 'Saved intake details could not be decrypted. The original fax is available in Documents.'; }
  }
  res.json({ links, documents, faxFields, fieldLabels: FAX_FIELDS, faxFieldsWarning });
}));
router.post('/clients/:clientId', clientAccess, handle(async (req, res) => {
  const { entryId, direction, referralDate, documentId, linkId } = req.body;
  if (!['incoming', 'outgoing'].includes(direction)) return res.status(400).json({ error: { message: 'Choose a referral direction.' } });
  if (referralDate && (!/^\d{4}-\d{2}-\d{2}$/.test(referralDate) || !Number.isFinite(Date.parse(referralDate)) || new Date(referralDate).toISOString().slice(0, 10) !== referralDate)) return res.status(400).json({ error: { message: 'Enter a valid referral date.' } });
  await assertReferralEntry(pool, Number(entryId) || 0, req.referralAgencyId);
  if (documentId) {
    const [docs] = await pool.execute('SELECT id FROM client_phi_documents WHERE id = ? AND client_id = ? AND agency_id = ? AND removed_at IS NULL', [documentId, req.params.clientId, req.referralAgencyId]);
    if (!docs.length) return res.status(400).json({ error: { message: 'Select a document belonging to this client.' } });
  }
  if (linkId) {
    const [updated] = await pool.execute(`UPDATE client_referral_links SET entry_id = ?, direction = ?, referral_date = ?, phi_document_id = ?
      WHERE id = ? AND client_id = ? AND agency_id = ?`,
    [entryId, direction, referralDate || null, documentId || null, linkId, req.params.clientId, req.referralAgencyId]);
    if (!updated.affectedRows) return res.status(404).json({ error: { message: 'Referral link not found.' } });
  } else await pool.execute(`INSERT INTO client_referral_links (agency_id, client_id, entry_id, direction, referral_date, phi_document_id, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE referral_date = VALUES(referral_date), phi_document_id = VALUES(phi_document_id)`,
  [req.referralAgencyId, req.params.clientId, entryId, direction, referralDate || null, documentId || null, req.user.id]);
  await logClientAccess(req, req.params.clientId, 'referral_link_saved');
  res.status(201).json({ saved: true });
}));
router.delete('/clients/:clientId/:linkId', clientAccess, handle(async (req, res) => {
  await pool.execute('DELETE FROM client_referral_links WHERE id = ? AND client_id = ? AND agency_id = ?', [req.params.linkId, req.params.clientId, req.referralAgencyId]);
  await logClientAccess(req, req.params.clientId, 'referral_link_removed');
  res.sendStatus(204);
}));
export default router;
