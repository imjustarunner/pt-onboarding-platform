import { readPhoneWorkflow, storePhoneWorkflow } from '../services/phoneWorkflowStorage.service.js';
import pool from '../config/database.js';
import { isCommunicationStaffActive } from '../utils/communicationReceptionPolicy.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import { getFocusMusicCatalog } from '../services/focusMusic.service.js';
import { normalizePhoneWorkflow, phoneWorkflowIssues, previewPhoneWorkflow } from '../services/phoneWorkflow.service.js';

export const requirePhoneWorkflowAdmin = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId);
    if (!Number.isSafeInteger(agencyId) || agencyId < 1) return res.status(400).json({error:{message:'Invalid agency.'}});
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const actor = rows[0];
    if (!isCommunicationStaffActive(actor) || !['admin','super_admin'].includes(actor.role)) return res.status(403).json({error:{message:'Phone setup requires a current agency administrator.'}});
    if (actor.role !== 'super_admin') {
      const [membership] = await pool.execute('SELECT user_id FROM user_agencies WHERE user_id = ? AND agency_id = ? AND is_active = TRUE LIMIT 1', [actor.id, agencyId]);
      if (!membership.length) return res.status(403).json({error:{message:'Access denied for this agency.'}});
    }
    res.set('Cache-Control', 'no-store');
    next();
  } catch (e) { next(e); }
};
function readiness(config) {
  return {status:'preparation', live:false, issues:phoneWorkflowIssues(config), remaining:[
    'Connect Vonage calling on a separate test number.',
    'Test ringing, staff acceptance, voicemail, music, and call history before using the main line.',
    'Confirm the healthcare calling setup before taking patient calls.',
    'Keep the existing carrier until tests pass and the administrator schedules a port.'
  ]};
}
export const getPhoneWorkflow = async (req,res,next) => {
  try {
    const data = await readPhoneWorkflow(Number(req.params.agencyId));
    const tracks = await getFocusMusicCatalog();
    res.json({...data, readiness:readiness(data.config), tracks:tracks.map(({id,title}) => ({id,title}))});
  } catch (e) { next(e); }
};
export const savePhoneWorkflow = async (req,res,next) => {
  try {
    const agencyId = Number(req.params.agencyId);
    const revision = req.body?.revision;
    if (!Number.isSafeInteger(revision) || revision < 0) return res.status(400).json({error:{message:'Reload phone setup before saving.'}});
    const config = normalizePhoneWorkflow(req.body.config);
    if (config.holdMusicId && !(await getFocusMusicCatalog()).some((t) => t.id === config.holdMusicId)) return res.status(400).json({error:{message:'Choose an available focus music track.'}});
    const nextRevision = await storePhoneWorkflow({agencyId,userId:req.user.id,config,revision});
    await logAuditEvent(req,{actionType:'phone_workflow_saved',agencyId,metadata:{revision:nextRevision,enabledOptions:config.menu.filter((o)=>o.enabled).length,live:false}});
    res.json({config, revision:nextRevision, readiness:readiness(config)});
  } catch (e) { next(e); }
};
export const previewPhoneWorkflowRoute = async (req,res,next) => {
  try {
    const config = normalizePhoneWorkflow(req.body?.config);
    res.json(previewPhoneWorkflow(config,{digit:req.body?.digit,hours:req.body?.hours}));
  } catch (e) { next(e); }
};
