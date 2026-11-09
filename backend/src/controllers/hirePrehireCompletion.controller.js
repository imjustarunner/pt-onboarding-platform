import pool from '../config/database.js';
import User from '../models/User.model.js';
import {completePrehireForReview} from '../services/hirePrehireCompletion.service.js';

// The hiring router enforces canManageHiring. Staff close only completed work;
// this endpoint cannot create signatures, activate login or start onboarding.
export async function markPrehireComplete(req,res,next) {
  try {
    const userId=Number(req.params.userId),agencyId=Number(req.query.agencyId || req.body?.agencyId || req.user.agencyId);
    if(!Number.isSafeInteger(userId) || userId<1 || !Number.isSafeInteger(agencyId) || agencyId<1)return res.status(400).json({error:{message:'Select a candidate and agency.'}});
    const [[membership]]=await pool.execute('SELECT agency_id FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[userId,agencyId]);
    if(!membership)return res.status(404).json({error:{message:'Candidate is not affiliated with this agency.'}});
    if(!['support','super_admin'].includes(req.user.role) && !(await User.getAgencies(req.user.id)).some(agency=>Number(agency.id)===agencyId))return res.status(403).json({error:{message:'Agency access required.'}});
    const result=await completePrehireForReview({userId,actorUserId:req.user.id,agencyId});
    res.json(result);
  }catch(error){next(error);}
}


async function prehireOverrideContext(req) {
 const userId=Number(req.params.userId),agencyId=Number(req.query.agencyId || req.body?.agencyId || req.user.agencyId);
 if(!Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(agencyId)||agencyId<1)throw Object.assign(new Error('Select a candidate and agency.'),{status:400});
 if(req.user.role!=='super_admin' && !(await User.getAgencies(req.user.id)).some(a=>Number(a.id)===agencyId))throw Object.assign(new Error('Agency access required.'),{status:403});
 const[[member]]=await pool.execute('SELECT agency_id FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[userId,agencyId]);
 if(!member)throw Object.assign(new Error('Candidate not found in this agency.'),{status:404});
 return{userId,agencyId};
}
export async function getPrehireRequirements(req,res,next) {
 try{
  const {userId,agencyId}=await prehireOverrideContext(req);
  const {portalStateForUser}=await import('./prehirePortal.controller.js');const state=await portalStateForUser(userId);
  if(Number(state.agency.id)!==agencyId)throw Object.assign(new Error('Select the candidate’s pre-hire agency.'),{status:403});
  const {canOverridePrehireStep}=await import('../utils/hirePrehireStepOverrides.js');
  res.set('Cache-Control','private, no-store');res.json({editable:['PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW'].includes(state.candidate.status)&&!state.journey?.prehireCompletedAt,
   steps:state.workflow.steps.pre_hire.filter(s=>s.required!==false&&s.key!=='review').map(s=>({key:s.key,title:s.title,complete:s.complete,staffOverride:s.staffOverride || null,canOverride:canOverridePrehireStep(s)}))});
 }catch(e){next(e);}
}
export async function postPrehireRequirementOverride(req,res,next) {
 try{
  const context=await prehireOverrideContext(req);const{setPrehireStepOverride}=await import('../services/hirePrehireStepOverrides.service.js');
  res.json(await setPrehireStepOverride({...context,actorUserId:req.user.id,stepKey:req.params.stepKey,reason:req.body?.reason,revoke:req.body?.revoke===true}));
 }catch(e){next(e);}
}
