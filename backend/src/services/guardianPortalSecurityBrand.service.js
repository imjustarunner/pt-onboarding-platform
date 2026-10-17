import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import {inferAgencyMailDomain} from './tenantMessageMailboxes.service.js';
import {enrollmentMailBrand} from './enrollmentPortalEmail.service.js';
import {securityError} from '../utils/accountSecurity.js';

export async function guardianPortalSecurityBrand(req) {
  const [linked] = await pool.execute(`SELECT DISTINCT c.agency_id,c.client_type
    FROM client_guardians cg JOIN clients c ON c.id=cg.client_id
    JOIN user_agencies ua ON ua.agency_id=c.agency_id AND ua.user_id=cg.guardian_user_id
    JOIN agencies a ON a.id=c.agency_id
    WHERE cg.guardian_user_id=? AND cg.access_enabled=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    ORDER BY (c.agency_id=?) DESC,c.agency_id`, [req.user.id,Number(req.user.agencyId)||0]);
  let agencyId = linked[0]?.agency_id;
  if (!agencyId) {
    const [[membership]] = await pool.execute(`SELECT ua.agency_id FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id
      WHERE ua.user_id=? AND a.organization_type='agency' AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
      ORDER BY (ua.agency_id=?) DESC,ua.agency_id LIMIT 1`, [req.user.id,Number(req.user.agencyId)||0]);
    agencyId = membership?.agency_id;
  }
  if (!agencyId) throw securityError('MFA_EMAIL_UNAVAILABLE','Contact support to confirm your portal organization.',409);
  const agency = await Agency.findById(agencyId),domain = await inferAgencyMailDomain(agencyId);
  if (!agency || !domain) throw securityError('MFA_EMAIL_UNAVAILABLE','Portal email is not configured for your organization.',503);
  const types = linked.filter(row=>Number(row.agency_id)===Number(agencyId)).map(row=>row.client_type);
  // An agency can offer both tutoring and clinical care. Its broad feature flag
  // alone must not turn a tutoring family's security email into an EHR email.
  const clinical = types.some(type=>['clinical','mental_health'].includes(type));
  const brand = enrollmentMailBrand({agency,domain,channel:clinical ? 'counseling' : 'tutoring'});
  return {...brand,agencyId};
}
