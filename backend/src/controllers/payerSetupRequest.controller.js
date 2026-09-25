import pool from '../config/database.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';

export async function payerSetupRequests(req,res,next) {
  try {
    const agencyId=Number(req.query.agencyId || req.body.agencyId);
    if (!Number.isSafeInteger(agencyId) || agencyId<1) return res.status(400).json({error:{message:'Valid agency is required'}});
    await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
    if(req.method==='POST') {
      const name=String(req.body.payerName || '').trim();
      if(name.length<2 || name.length>120) return res.status(400).json({error:{message:'Enter a payer name between 2 and 120 characters'}});
      await pool.execute('INSERT IGNORE INTO medical_payer_setup_requests (agency_id,payer_name,created_by_user_id) VALUES (?,?,?)',[agencyId,name,req.user.id]);
    }
    const [items]=await pool.execute('SELECT id,payer_name,created_at FROM medical_payer_setup_requests WHERE agency_id=? ORDER BY id',[agencyId]);
    res.json({items});
  }catch(error){next(error);}
}
