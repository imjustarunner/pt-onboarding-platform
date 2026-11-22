import pool from '../config/database.js';
import { logClientAccess } from '../services/clientAccessLog.service.js';

export async function putClientContactEmail(req,res,next) {
  try {
    const clientId = Number(req.params.id), agencyId = Number(req.query.agencyId);
    const {email,previousEmail} = req.body || {};
    const address = typeof email === 'string' ? email.trim() : '';
    if (![clientId,agencyId].every(id => Number.isSafeInteger(id) && id > 0) ||
        typeof email !== 'string' || typeof previousEmail !== 'string' ||
        address.length > 254 || (address && !/^[^\s<>,;@]+@[^\s<>,;@]+\.[^\s<>,;@]+$/.test(address))) {
      return res.status(400).json({error:{message:'Enter one valid client email address.'}});
    }
    if ((req.user.scopedAgencyId && Number(req.user.scopedAgencyId) !== agencyId) || !['super_admin','admin','support','staff'].includes(req.user.role)) return res.status(403).json({error:{message:'Chart editing access required.'}});
    // The contact column is shared. Authorize the owning agency and compare the
    // last displayed value atomically so a stale picker cannot overwrite an edit.
    const [result] = await pool.execute(`UPDATE clients c SET email=NULLIF(?, '')
      WHERE c.id=? AND c.agency_id=? AND BINARY COALESCE(c.email,'')=BINARY ?
        AND (?='super_admin' OR EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=? AND ua.agency_id=c.agency_id AND ua.is_active=1))`,
      [address,clientId,agencyId,previousEmail,req.user.role,req.user.id]);
    if (!result.affectedRows) return res.status(409).json({error:{message:'The chart address or your access changed. Reopen the chart to review the current address.'}});
    await logClientAccess(req,clientId,'client_updated_email');
    res.set('Cache-Control','no-store').json({clientId,agencyId,email:address || null});
  } catch (error) { next(error); }
}
