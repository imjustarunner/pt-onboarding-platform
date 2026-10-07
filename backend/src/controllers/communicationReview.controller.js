import pool from '../config/database.js';
import { isCommunicationStaffActive } from '../utils/communicationReceptionPolicy.js';
import { listCommunicationReview, reviewCommunication } from '../services/communicationReview.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

export const requireCommunicationReviewer = async (req,res,next) => {
  try {
    if (!['admin','super_admin','support','clinical_practice_assistant'].includes(req.user?.role)) {
      return res.status(403).json({error:{message:'Communication review requires agency support or administrator access.'}});
    }
    const agencyId=Number(req.params.agencyId);
    if (!Number.isSafeInteger(agencyId) || agencyId < 1) return res.status(400).json({error:{message:'Invalid agency'}});
    // The legacy requireAgencyAccess middleware allows admins/support globally.
    // This clinical queue always checks their actual, current tenant membership.
    const [rows]=await pool.execute(`SELECT u.* FROM users u WHERE u.id=?
      ${req.user.role === 'super_admin' ? '' : 'AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=TRUE)'} LIMIT 1`,
      [req.user.id,...(req.user.role === 'super_admin' ? [] : [agencyId])]);
    if (!isCommunicationStaffActive(rows[0])) return res.status(403).json({error:{message:'Access denied for this agency'}});
    next();
  } catch(e) { next(e); }
};
export const listReview = async (req,res,next) => {
  try {
    const status=req.query.status || 'review';
    if (!['review','spam','resolved'].includes(status)) return res.status(400).json({error:{message:'Invalid review status'}});
    const beforeId=Number(req.query.beforeId) || null;
    const items=await listCommunicationReview(Number(req.params.agencyId),{status,beforeId});
    await logAuditEvent(req,{actionType:'communication_review_viewed',agencyId:Number(req.params.agencyId),metadata:{status,count:items.length}});
    res.json({items,nextBeforeId:items.length===100 ? items.at(-1).id : null});
  } catch(e) { next(e); }
};
export const updateReview = async (req,res,next) => {
  try {
    const action=req.body?.action;
    if (!['block','restore','resolve'].includes(action)) return res.status(400).json({error:{message:'Invalid review action'}});
    const result=await reviewCommunication({agencyId:Number(req.params.agencyId),id:Number(req.params.id),action,userId:req.user.id});
    await logAuditEvent(req,{actionType:'communication_review_updated',agencyId:Number(req.params.agencyId),metadata:{id:result.id,action}});
    res.json(result);
  } catch(e) { next(e); }
};
