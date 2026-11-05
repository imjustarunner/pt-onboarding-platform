import pool from '../config/database.js';
import { assertEnrollmentAgencyMembership } from './enrollmentAgencyAccess.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const canViewPortalAs=actor=>['admin','support','super_admin'].includes(actor?.role);
export function createPortalViewAs({db=pool,assertMembership=assertEnrollmentAgencyMembership}={}) {
  async function clientAccess({actor,agencyId,clientId}) {
    if(!canViewPortalAs(actor))throw fail(403,'Portal View as is limited to admin, support, and superadmin.');
    if(![agencyId,clientId].every(id=>Number.isSafeInteger(Number(id))&&Number(id)>0))throw fail(400,'Choose a practice and client.');
    await assertMembership(actor,Number(agencyId));
    const [[client]]=await db.execute('SELECT id,agency_id,full_name,initials FROM clients WHERE id=? AND agency_id=?',[Number(clientId),Number(agencyId)]);
    if(!client)throw fail(404,'Client unavailable in this practice.');
    return client;
  }
  async function accounts(context) {
    const client=await clientAccess(context);
    const [accounts]=await db.execute(`SELECT u.id,u.first_name,u.last_name,u.role,u.is_active,u.is_archived,u.status,
      cg.relationship_type,cg.relationship_title,cg.access_enabled,
      (SELECT MAX(created_at) FROM user_activity_log WHERE user_id=u.id AND agency_id=? AND action_type='login') AS lastLogin,
      (SELECT ip_address FROM user_activity_log WHERE user_id=u.id AND agency_id=? AND action_type='login' ORDER BY created_at DESC,id DESC LIMIT 1) AS lastLoginIp,
      (SELECT MAX(created_at) FROM user_activity_log WHERE user_id=u.id AND agency_id=?) AS lastActivity
      FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
      WHERE cg.client_id=? AND u.role IN ('client','client_guardian') ORDER BY cg.relationship_type='self' DESC,u.first_name,u.last_name,u.id`,[Number(context.agencyId),Number(context.agencyId),Number(context.agencyId),client.id]);
    return {client,accounts:accounts.map(u=>({id:u.id,lastLogin:u.lastLogin,lastLoginIp:u.lastLoginIp||null,lastActivity:u.lastActivity,name:[u.first_name,u.last_name].filter(Boolean).join(' '),role:u.role,relationship:u.relationship_type==='self'?'Client':u.relationship_title||'Parent / guardian',available:Number(u.access_enabled)===1&&Number(u.is_active)===1&&!Number(u.is_archived)&&!['ARCHIVED','SUSPENDED','TERMINATED_PENDING','INACTIVE_EMPLOYEE'].includes(u.status)}))};
  }
  async function target(context) {
    const result=await accounts(context),account=result.accounts.find(a=>Number(a.id)===Number(context.userId));
    if(!account?.available)throw fail(403,'This account does not have active portal access for this client.');
    return {...result,account,user:{id:Number(account.id),role:account.role,agencyId:Number(context.agencyId)}};
  }
  async function activity(context) {
    const {account}=await target(context);
    const [[summary]]=await db.execute(`SELECT MAX(CASE WHEN action_type='login' THEN created_at END) AS lastLogin,
      MAX(created_at) AS lastActivity FROM user_activity_log WHERE user_id=? AND agency_id=?`,[account.id,context.agencyId]);
    const [accountEvents]=await db.execute(`SELECT id,action_type AS action,created_at AS occurredAt,ip_address AS ipAddress
      FROM user_activity_log WHERE user_id=? AND agency_id=? ORDER BY created_at DESC,id DESC LIMIT 100`,[account.id,context.agencyId]);
    const [portalEvents]=await db.execute(`SELECT id,action,occurred_at AS occurredAt,client_ip AS ipAddress,route,method
      FROM security_evidence WHERE user_id=? AND phase='completed' AND outcome IN ('succeeded','issued','response_sent')
      AND action<>'login' AND (route LIKE '/api/guardian-portal/%' OR route LIKE '/api/family-billing/%' OR route LIKE '/api/clients/%')
      ORDER BY occurred_at DESC,id DESC LIMIT 100`,[account.id]);
    const events=[...accountEvents.map(event=>({...event,source:'account'})),...portalEvents.map(event=>({...event,source:'portal'}))]
      .sort((a,b)=>new Date(b.occurredAt)-new Date(a.occurredAt)||Number(b.id)-Number(a.id)).slice(0,100);
    return {account,...summary,events};
  }
  return {clientAccess,accounts,target,activity};
}
export const portalViewAs=createPortalViewAs();
