import { billingWorkspace } from '../services/claimMdWorkspace.service.js';

export async function getBillingWorkspace(req, res, next) {
  try { res.json(await billingWorkspace(req.user, req.query)); }
  catch (error) { next(error); }
}
