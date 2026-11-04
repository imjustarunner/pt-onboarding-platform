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
