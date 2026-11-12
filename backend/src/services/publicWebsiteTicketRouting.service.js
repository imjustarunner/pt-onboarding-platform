import { recordTicketAssignment } from './ticketAssignment.service.js';
import pool from '../config/database.js';

export function itscoWebsiteRouting(categoryOrSubject) {
 const key=String(categoryOrSubject||'').trim().toLowerCase();
 if (['billing','insurance and billing'].includes(key)) return {firstName:'Hannah',lastName:'Inyart',topic:'billing'};
 if (['technical','website help'].includes(key)) return {firstName:'Michael',lastName:'Mendez',topic:'general'};
 if (['provider','provider_waitlist'].includes(key)) return {firstName:'Rachel',lastName:'Finch',topic:'general'};
 if (['intake_join','school_partnership','careers','getting started with itsco','school partnership','careers and our team'].includes(key)) return {firstName:'Rachel',lastName:'Finch',topic:'general'};
 return null;
}

// Only resolve an unambiguous, active staff account in this agency. Never replace a claim.
export async function routePublicWebsiteTicket({agency,ticketId,category,subject}, db=pool) {
 if (String(agency.slug||agency.portal_url||'').toLowerCase()==='michael') {
  const [owners]=await db.execute(`SELECT DISTINCT u.id FROM agencies a
   JOIN users u ON u.id=a.account_owner_user_id JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=a.id
   WHERE a.id=? AND a.slug='michael' AND a.organization_type='consultant' AND a.is_active=1
   AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
   AND u.role IN ('admin','super_admin','support') AND LOWER(u.first_name)='michael' AND LOWER(u.last_name)='mendez'`,[agency.id]);
  if (owners.length===1) { const [changed]=await db.execute(`UPDATE support_tickets SET topic='general',
   claimed_by_user_id=?,claimed_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=? AND status='open' AND claimed_by_user_id IS NULL`,
   [owners[0].id,ticketId,agency.id]);
   if(changed.affectedRows)await recordTicketAssignment({ticketId,agencyId:agency.id,assigneeUserId:owners[0].id,kind:'routed',reason:'Consultant website support'},db);
  }
  return;
 }
 if (!['itsco'].includes(String(agency.slug||agency.portal_url||'').toLowerCase())) return;
 const rule=itscoWebsiteRouting(category)||itscoWebsiteRouting(subject);
 if (!rule) return;
 const [staff]=await db.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
 WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
 AND COALESCE(u.is_active,1)=1 AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')
 AND LOWER(u.first_name)=LOWER(?) AND LOWER(u.last_name)=LOWER(?)
 AND LOWER(u.role) IN ('admin','super_admin','support')`,[agency.id,rule.firstName,rule.lastName]);
 const [changed]=await db.execute(`UPDATE support_tickets SET topic=?, claimed_by_user_id=?,claimed_at=CASE WHEN ? IS NULL THEN claimed_at ELSE CURRENT_TIMESTAMP END
 WHERE id=? AND agency_id=? AND status='open' AND claimed_by_user_id IS NULL`,[rule.topic,staff.length===1?staff[0].id:null,staff.length===1?staff[0].id:null,ticketId,agency.id]);
 if(changed.affectedRows&&staff.length===1)await recordTicketAssignment({ticketId,agencyId:agency.id,assigneeUserId:staff[0].id,kind:'routed',reason:`Website support category: ${category || subject}`},db);
}
