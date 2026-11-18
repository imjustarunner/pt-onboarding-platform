import pool from '../config/database.js';
import { readTransitionWeek, saveTransitionWeek } from '../services/transitionWeek.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

import { transitionPractices, transitionWorkspaceData, transitionClients, transitionMeetings, transitionEmailRecipients } from '../services/transitionWorkspace.service.js';

export function requireTransitionPractice(req,res,next) {
  if (![2,6,377].includes(req.transitionAgencyId)) return res.status(404).json({error:{message:'This workspace is for ITSCO, Next Level Up and Inner Strength.'}});
  next();
}
export async function getTransitionPractices(req,res,next) {
  try { res.set('Cache-Control','no-store'); res.json({practices:await transitionPractices(req.user)}); } catch(error) { next(error); }
}
export async function getTransitionRoster(req,res,next) {
  try { res.json(await transitionWorkspaceData(req.transitionAgencyId)); } catch(error) { next(error); }
}
export async function getTransitionClients(req,res,next) {
  try {
    const clients=await transitionClients(req.transitionAgencyId,Number(req.query.providerId));
    await logAuditEvent(req,{actionType:'practice_transition_caseload_viewed',agencyId:req.transitionAgencyId,metadata:{providerId:Number(req.query.providerId),count:clients.length}});
    res.json({clients});
  } catch(error) { next(error); }
}
export async function getTransitionEmailRecipients(req,res,next) {
  try { res.json({recipients:await transitionEmailRecipients(req.transitionAgencyId,req.query.userIds)}); } catch(error) { next(error); }
}
export async function getTransitionMeetings(req,res,next) {
  try { res.json({events:await transitionMeetings(req.transitionAgencyId,req.user.id)}); } catch(error) { next(error); }
}

// Check current membership even for legacy roles that have broad agency access.
export async function requireTransitionManager(req, res, next) {
  try {
    const agencyId = Number(req.params?.agencyId || req.query?.agencyId || req.body?.agencyId);
    if (!Number.isSafeInteger(agencyId) || agencyId < 1) return res.status(400).json({ error: { message: 'Choose a practice.' } });
    if (!['admin', 'super_admin'].includes(req.user?.role)) return res.status(403).json({ error: { message: 'A practice administrator must review transition evidence.' } });
    const [[member]] = await pool.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1 AND u.is_active=1
      AND COALESCE(u.is_archived,0)=0 AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED') LIMIT 1`, [req.user.id, agencyId]);
    if (!member) return res.status(403).json({ error: { message: 'Active membership in this practice is required.' } });
    req.transitionAgencyId = agencyId;
    res.set('Cache-Control', 'no-store');
    next();
  } catch (error) { next(error); }
}
export async function getTransitionWeek(req, res, next) {
  try {
    const board = await readTransitionWeek(req.transitionAgencyId);
    await logAuditEvent(req, { actionType: 'practice_transition_viewed', agencyId: req.transitionAgencyId, metadata: { week: board.week, revision: board.revision } });
    res.json(board);
  } catch (error) { next(error); }
}
export async function putTransitionWeek(req, res, next) {
  try { res.json(await saveTransitionWeek({ agencyId: req.transitionAgencyId, actorUserId: req.user.id, input: req.body })); }
  catch (error) { next(error); }
}
