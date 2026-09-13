import pool from '../config/database.js';
import User from '../models/User.model.js';
import { createPublicProviderHoldService } from '../services/publicProviderHold.service.js';

// Staff can resolve holds even after public discovery has been disabled.
export async function requireHoldManager(req,res,next) {
  try {
    if(!['super_admin','admin','support','staff'].includes(req.user?.role)) return res.status(403).json({error:{message:'Staff access required'}});
    const [rows]=await pool.execute(`SELECT id FROM agencies WHERE (slug=? OR portal_url=?) AND LOWER(organization_type) IN ('agency','clubwebapp','life_coach','consultant') LIMIT 1`,[req.params.agencySlug,req.params.agencySlug]);
    const agencyId=Number(rows[0]?.id);
    if(!agencyId) return res.status(404).json({error:{message:'Organization not found'}});
    if(req.user.role !== 'super_admin' && !(await User.getAgencies(req.user.id)).some(a=>Number(a.id)===agencyId)) return res.status(403).json({error:{message:'Access denied for this agency'}});
    const targetId=Number(req.params.userId || req.body?.userId || 0);
    if(targetId && !(await User.getAgencies(targetId)).some(a=>Number(a.id)===agencyId)) return res.status(404).json({error:{message:'Provider not found in this agency'}});
    req.holdAgencyId=agencyId; next();
  } catch(e){next(e);}
}
export async function listPendingHolds(req,res,next) {
  try {
    const [holds]=await pool.execute(`SELECT h.id,h.provider_id,h.client_id,h.service_type,h.modality,h.time_zone,DATE_FORMAT(h.created_at,'%Y-%m-%dT%H:%i:%s.%fZ') created_at,
      DATE_FORMAT(h.start_at,'%Y-%m-%dT%H:%i:%s.%fZ') start_at,
      DATE_FORMAT(h.end_at,'%Y-%m-%dT%H:%i:%s.%fZ') end_at,
      CONCAT(u.first_name,' ',u.last_name) provider_name
      FROM public_provider_slot_holds h JOIN users u ON u.id=h.provider_id
      WHERE h.agency_id=? AND h.released_at IS NULL ORDER BY h.created_at`,[req.holdAgencyId]);
    res.json({holds});
  }catch(e){next(e);}
}
export async function resolvePendingHold(req,res,next) {
  try {
    const reason=req.body?.reason;
    if(!['PLACED','PLACED_ELSEWHERE','ABANDONED','DUPLICATE'].includes(reason)) return res.status(400).json({error:{message:'Choose a resolution reason'}});
    await pool.execute(`UPDATE public_provider_slot_holds SET released_at=UTC_TIMESTAMP(3),resolution=?,resolved_by_user_id=?
      WHERE id=? AND agency_id=? AND released_at IS NULL`,[reason,req.user.id,Number(req.params.holdId)||0,req.holdAgencyId]);
    res.json({ok:true});
  }catch(e){next(e);}
}
export async function checkPublicHold(req,res,next) {
  try {
    const [rows]=await pool.execute('SELECT id FROM agencies WHERE slug=? OR portal_url=? LIMIT 1',[req.params.agencySlug,req.params.agencySlug]);
    const active=rows[0] ? await createPublicProviderHoldService(pool).status({agencyId:rows[0].id,token:req.body?.token}) : false;
    res.json({active});
  }catch(e){next(e);}
}
