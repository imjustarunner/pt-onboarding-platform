import pool from '../config/database.js';

export function itscoWebsiteRouting(categoryOrSubject) {
 const key=String(categoryOrSubject||'').trim().toLowerCase();
 if (['billing','insurance and billing'].includes(key)) return {firstName:'Hannah',lastName:'Inyart',topic:'billing'};
 if (['technical','website help'].includes(key)) return {firstName:'Michael',lastName:'Mendez',topic:'general'};
 if (['intake_join','school_partnership','careers','getting started with itsco','school partnership','careers and our team'].includes(key)) return {firstName:'Rachel',lastName:'Finch',topic:'general'};
 return null;
}

// Only resolve an unambiguous, active staff account in this agency. Never replace a claim.
export async function routePublicWebsiteTicket({agency,ticketId,category,subject}) {
 if (!['itsco'].includes(String(agency.slug||agency.portal_url||'').toLowerCase())) return;
 const rule=itscoWebsiteRouting(category)||itscoWebsiteRouting(subject);
 if (!rule) return;
 const [staff]=await pool.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
 WHERE ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
 AND COALESCE(u.is_active,1)=1 AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')
 AND LOWER(u.first_name)=LOWER(?) AND LOWER(u.last_name)=LOWER(?)
 AND LOWER(u.role) IN ('admin','super_admin','support','staff','clinical_practice_assistant')`,[agency.id,rule.firstName,rule.lastName]);
 await pool.execute(`UPDATE support_tickets SET topic=?, claimed_by_user_id=COALESCE(claimed_by_user_id,?)
 WHERE id=? AND agency_id=? AND status='open'`,[rule.topic,staff.length===1?staff[0].id:null,ticketId,agency.id]);
}
