import pool from '../config/database.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { positiveId, auditBilling } from '../services/familyBillingPolicy.service.js';
import { STEDI_AGENCIES } from '../services/stediDiscoveryPolicy.js';
import { discoveryWorkspace, startDiscovery, refreshDiscovery, reviewDiscovery, reconcileUncertainDiscovery } from '../services/stediDiscovery.service.js';

export async function stediBillingScope(req) {
  if (req.assistantIdentity || req.user?.role === 'assistant' || [true,1,'1'].includes(req.user?.is_assistant_account)) throw Object.assign(new Error('Insurance investigations require a billing staff member; assistant accounts cannot view or initiate these checks.'),{status:403});
  const agencyId = positiveId(req.body?.agencyId || req.query.agencyId), clientId = positiveId(req.params.clientId);
  await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
  if (!STEDI_AGENCIES.includes(agencyId)) throw Object.assign(new Error('Insurance discovery is unavailable for this agency'),{status:403});
  const [[client]] = await pool.execute('SELECT id FROM clients WHERE id=? AND agency_id=?',[clientId,agencyId]);
  if (!client) throw Object.assign(new Error('Client not found'),{status:404});
  return {agencyId,clientId,actorUserId:req.user.id,...(req.params.id?{id:positiveId(req.params.id)}:{})};
}
export async function getDiscoveryWorkspace(req,res,next) { try {
  const s = await stediBillingScope(req), data = await discoveryWorkspace(s);
  await auditBilling({...s,userId:req.user.id,action:'stedi_discovery_viewed'});
  res.set('Cache-Control','no-store').json(data);
} catch(e) { next(e); } }
export async function createDiscovery(req,res,next) { try {
  const s = await stediBillingScope(req);
  res.set('Cache-Control','no-store').json(await startDiscovery({...req.body,...s}));
} catch(e) { next(e); } }
export async function getDiscoveryResults(req,res,next) { try {
  const s = await stediBillingScope(req);
  await auditBilling({...s,userId:req.user.id,action:'stedi_discovery_viewed',objectId:s.id});
  res.set('Cache-Control','no-store').json(await refreshDiscovery(s));
} catch(e) { next(e); } }
export async function saveDiscoveryReview(req,res,next) { try {
  const s = await stediBillingScope(req);
  res.set('Cache-Control','no-store').json(await reviewDiscovery({...req.body,...s}));
} catch(e) { next(e); } }
export async function reconcileDiscovery(req,res,next) { try {
  const s = await stediBillingScope(req);
  res.set('Cache-Control','no-store').json(await reconcileUncertainDiscovery({...req.body,...s}));
} catch(e) { next(e); } }
