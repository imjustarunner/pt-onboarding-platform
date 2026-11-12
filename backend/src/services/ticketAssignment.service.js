import pool from '../config/database.js';
const opsRoles = new Set(['admin','super_admin','support']);
export function isEligibleTicketAssignee(user) {
  if (!user || ['school_staff','client_guardian','assistant'].includes(String(user.role).toLowerCase())) return false;
  if ([false,0,'0'].includes(user.is_active) || [true,1,'1'].includes(user.is_archived) || [false,0,'0'].includes(user.membership_active)) return false;
  if (user.status && !['ACTIVE','ACTIVE_EMPLOYEE'].includes(String(user.status).toUpperCase())) return false;
  return opsRoles.has(String(user.role).toLowerCase());
}
export async function listEligibleTicketAssignees(agencyId, db=pool) {
 const [rows]=await db.execute(`SELECT u.id,u.first_name,u.last_name,u.role,u.is_active,u.is_archived,u.status,
   ua.agency_role,ua.is_active AS membership_active,ua.has_billing_access,ua.has_payroll_access,ua.can_manage_credentialing
   FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
   WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND ua.is_active=1
     AND u.role IN ('admin','super_admin','support')
   ORDER BY u.last_name,u.first_name`,[agencyId]);
 return rows.filter(isEligibleTicketAssignee);
}
export async function recordTicketAssignment({ticketId,agencyId,actorUserId=null,assigneeUserId=null,previousUserId=null,kind='assigned',reason=null},db=pool) {
 await db.execute(`INSERT INTO user_activity_log (action_type,user_id,agency_id,metadata)
   VALUES ('support_ticket_assignment',?,?,?)`,[actorUserId,agencyId,JSON.stringify({ticketId,assigneeUserId,previousUserId,kind,reason})]);
}
export async function ticketAssignmentHistory(ticket,db=pool) {
 const [rows]=await db.execute(`SELECT l.id,l.created_at,l.metadata,u.first_name AS actor_first_name,u.last_name AS actor_last_name
   FROM user_activity_log l LEFT JOIN users u ON u.id=l.user_id
   WHERE l.agency_id=? AND l.action_type='support_ticket_assignment' AND JSON_UNQUOTE(JSON_EXTRACT(l.metadata,'$.ticketId'))=?
   ORDER BY l.id DESC LIMIT 30`,[ticket.agency_id,String(ticket.id)]);
 if(!rows.length){
  const [notices]=await db.execute(`SELECT id,user_id,message,created_at FROM notifications
   WHERE agency_id=? AND related_entity_type='support_ticket' AND related_entity_id=? AND title='Ticket assigned to you' ORDER BY id DESC LIMIT 30`,[ticket.agency_id,ticket.id]);
  return notices.map(n=>({id:`notice-${n.id}`,at:n.created_at,kind:'assigned',assigneeUserId:n.user_id,actorName:String(n.message||'').match(/ by (.+)\.$/)?.[1]||'Recorded assignment',reason:'Assignment notification'}));
 }
 return rows.map(row=>{let data;try{data=typeof row.metadata==='string'?JSON.parse(row.metadata):row.metadata;}catch{data={};}
  return {id:row.id,at:row.created_at,actorName:[row.actor_first_name,row.actor_last_name].filter(Boolean).join(' ')||'Automatic routing',...data};});
}

// Manual ownership and its actor record commit together.
export async function setTicketAssignment({ticketId,agencyId,actorUserId,assigneeUserId=null,previousUserId=null,kind='assigned'},database=pool){
 const db=await database.getConnection();
 try{
  await db.beginTransaction();
  const [[current]]=await db.execute('SELECT id,agency_id,claimed_by_user_id FROM support_tickets WHERE id=? FOR UPDATE',[ticketId]);
  if(!current||Number(current.agency_id)!==Number(agencyId))throw Object.assign(Error('Ticket not found'),{status:404});
  if((Number(current.claimed_by_user_id)||null)!==(Number(previousUserId)||null))throw Object.assign(Error('Ticket ownership changed. Refresh before assigning.'),{status:409});
  await db.execute('UPDATE support_tickets SET claimed_by_user_id=?,claimed_at=CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END WHERE id=?',[assigneeUserId,assigneeUserId,ticketId]);
  await recordTicketAssignment({ticketId,agencyId,actorUserId,assigneeUserId,previousUserId,kind},db);
  await db.commit();return {affectedRows:1};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
