import { billingWorkspace, billingWorkspaceTransactions } from '../services/claimMdWorkspace.service.js';

export async function getBillingWorkspace(req, res, next) {
  try { res.json(await billingWorkspace(req.auricwellPreview ? { ...req.user, auricwellPreviewAgencyId: req.auricwellPreview.agencyId } : req.user, req.query)); }
  catch (error) { next(error); }
}

export async function getBillingWorkspaceTransactions(req,res,next) {
  try { res.json(await billingWorkspaceTransactions(req.auricwellPreview ? { ...req.user, auricwellPreviewAgencyId: req.auricwellPreview.agencyId } : req.user,req.query)); }
  catch(error) { next(error); }
}
