import pool from '../config/database.js';
import * as documents from '../services/companyReferenceDocuments.service.js';

export const list = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId);
    await documents.assertReferenceAccess(req.user, agencyId);
    const catalog = await documents.referenceCatalogForAgency(agencyId);
    const [rows] = await pool.execute(`SELECT d.document_key, v.version_number, v.published_at FROM company_reference_documents d
      JOIN company_reference_versions v ON v.id = d.published_version_id AND v.document_id = d.id AND v.is_draft = 0 WHERE d.agency_id = ?`, [agencyId]);
    res.set('Cache-Control', 'private, no-store');
    const availability = await Promise.all(catalog.map(async item => ({ ...item, betaAvailable: !!(await documents.sourceForReference(agencyId, item.key)), published: rows.find(r => r.document_key === item.key) || null })));
    res.json({ documents: availability, canManage: ['admin', 'support', 'super_admin', 'superadmin'].includes(req.user.role) });
  } catch (error) { next(error); }
};
const handle = (manage, action) => async (req, res, next) => {
  try {
    const agencyId = Number(req.method === 'GET' ? req.query.agencyId : req.body?.agencyId);
    await documents.assertReferenceAccess(req.user, agencyId, { manage });
    const result = await action(agencyId, req.params.key, req);
    res.set('Cache-Control', 'private, no-store'); res.json(result);
  } catch (error) { next(error); }
};
export const beta = handle(false, (agencyId, key) => documents.betaReference(agencyId, key));
export const published = handle(false, (agencyId, key) => documents.publishedReference(agencyId, key));
export const workspace = handle(true, (agencyId, key) => documents.referenceWorkspace(agencyId, key));
export const draft = handle(true, (agencyId, key, req) => documents.createReferenceDraft(agencyId, key, req.user.id, req.body));
export const save = handle(true, (agencyId, key, req) => documents.changeReferenceSection(agencyId, key, req.body));
export const remove = handle(true, (agencyId, key, req) => documents.changeReferenceSection(agencyId, key, { ...req.body, sectionId: req.params.sectionId }, { remove: true }));
export const publish = handle(true, (agencyId, key, req) => documents.publishReference(agencyId, key, req.user.id, req.body));
export const answer = handle(false, (agencyId, key, req) => documents.answerReference(agencyId, key, req.body, req.user.id));

export const betaAnswer = handle(false, (agencyId, key, req) => documents.answerBetaReference(agencyId, key, req.body));
