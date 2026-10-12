import { listCompanyDocuments, assignCompanyDocument } from '../services/workplaceDocumentLibrary.service.js';

export async function listLibrary(req, res, next) {
  try { res.set('Cache-Control', 'private, no-store'); res.json(await listCompanyDocuments(req.user, { organizationSlug: req.query.organizationSlug, agencyId: req.query.agencyId })); }
  catch (error) { next(error); }
}
export async function assignDocument(req, res, next) {
  try { res.status(201).json(await assignCompanyDocument(req.user, req.body)); }
  catch (error) { next(error); }
}
