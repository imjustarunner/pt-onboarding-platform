import pool from '../config/database.js';
import { listPayerSetupRequests, saveDirectoryPayer } from '../services/payerSetupCatalog.service.js';
import { resolveClaimMdConnection } from '../services/claimMdConnection.service.js';
import { fetchPayers } from '../services/claimMd.service.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';

export async function payerSetupRequests(req,res,next) {
  try {
    const agencyId=Number(req.query.agencyId || req.body.agencyId);
    if (!Number.isSafeInteger(agencyId) || agencyId<1) return res.status(400).json({error:{message:'Valid agency is required'}});
    await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
    if(req.method==='POST') {
      if (req.body.payerId !== undefined) {
        const payerId = String(req.body.payerId).trim();
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(payerId)) return res.status(400).json({error:{message:'Select a payer from the directory'}});
        const connection = await resolveClaimMdConnection(agencyId);
        const result = await fetchPayers({accountKey:connection.accountKey,payerId});
        const payers = Array.isArray(result.payer) ? result.payer : result.payer ? [result.payer] : [];
        const matches = payers.filter(p => String(p.payerid).toUpperCase() === payerId.toUpperCase());
        if (matches.length !== 1) return res.status(409).json({error:{message:'This payer ID has changed or is unavailable. Search the directory again.'}});
        const db = await pool.getConnection();
        try { await saveDirectoryPayer({agencyId,payer:matches[0],actorUserId:req.user.id},db); }
        finally { db.release(); }
      } else {
        const name=String(req.body.payerName || '').trim();
        if(name.length<2 || name.length>120) return res.status(400).json({error:{message:'Enter a payer name between 2 and 120 characters'}});
        await pool.execute('INSERT IGNORE INTO medical_payer_setup_requests (agency_id,payer_name,created_by_user_id) VALUES (?,?,?)',[agencyId,name,req.user.id]);
      }
    }
    const items=await listPayerSetupRequests(agencyId,pool);
    res.json({items});
  }catch(error){next(error);}
}
