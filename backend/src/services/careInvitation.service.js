import crypto from 'node:crypto';
import pool from '../config/database.js';
import IntakeLink from '../models/IntakeLink.model.js';
import EmailService from './email.service.js';
import { resolveConfiguredSenderIdentity } from './emailSenderIdentityResolver.service.js';
import { normalizeCareInvitation, careInvitationEmail, parseCareJson } from './careInvitationPolicy.js';
import { utcDateToZonedParts } from '../utils/zonedWallTime.util.js';

const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export async function careInvitationOptions(agencyId) {
 const [providers]=await pool.execute(`SELECT u.id,CONCAT_WS(' ',u.first_name,u.last_name) name FROM users u JOIN user_agencies ua ON ua.user_id=u.id
  WHERE ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
   AND (u.role IN ('provider','provider_plus','super_admin') OR u.credential IS NOT NULL) ORDER BY u.first_name`,[agencyId]);
 const [offices]=await pool.execute(`SELECT a.id assignmentId,a.provider_id providerId,a.office_location_id officeId,a.room_id roomId,
  l.name,l.timezone,a.weekday,a.hour FROM office_standing_assignments a JOIN office_locations l ON l.id=a.office_location_id
  JOIN user_agencies ua ON ua.user_id=a.provider_id AND ua.agency_id=? AND ua.is_active=1 WHERE a.is_active=1 ORDER BY l.name,a.weekday,a.hour`,[agencyId]);
 return {providers,offices};
}
export async function createCareInvitation(input,actorUserId) {
 const data=normalizeCareInvitation(input);
 const requestKey=String(input.requestKey||'');
 if(!/^[a-zA-Z0-9_-]{16,64}$/.test(requestKey))throw fail('A unique request key is required.',400);
 const lock=await pool.getConnection();let locked=false;
 try {
  const [[got]]=await lock.execute('SELECT GET_LOCK(?,8) acquired',[`care-send:${actorUserId}:${requestKey}`]);locked=Number(got.acquired)===1;
  if(!locked)throw fail('This invitation is already being prepared.');
  const [[prior]]=await pool.execute('SELECT i.*,l.public_key FROM care_invitations i JOIN intake_links l ON l.id=i.intake_link_id WHERE i.created_by_user_id=? AND i.request_key=?',[actorUserId,requestKey]);
  if(prior&&(Number(prior.agency_id)!==data.agencyId||Number(prior.provider_user_id)!==data.providerId||prior.recipient_email!==data.email))throw fail('This request already belongs to another invitation. Close and reopen the dialog to send a different invitation.');
  if(prior)return {id:prior.id,status:prior.status,url:`https://auricwell.com/intake/${prior.public_key}`,alreadyCreated:true,communicationId:prior.communication_id};
  // Staff-only review. Never expose an existing care relationship through the
  // public enrollment form, and never infer which child an email represents.
  const [matches]=await pool.execute(`SELECT DISTINCT c.id,c.full_name FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id JOIN clients c ON c.id=cg.client_id
   WHERE LOWER(u.email)=? AND (c.agency_id=? OR EXISTS(SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1)) ORDER BY c.id`,[data.email,data.agencyId,data.agencyId]);
  const candidates=Array.isArray(matches)?matches.filter(c=>Number(c.id)>0):[];
  const reviewed=[...new Set((Array.isArray(input.reviewedClientIds)?input.reviewedClientIds:[]).map(Number))].sort((a,b)=>a-b);
  if(candidates.length&&!(input.newSubjectConfirmed===true&&JSON.stringify(reviewed)===JSON.stringify(candidates.map(c=>Number(c.id)).sort((a,b)=>a-b))))throw Object.assign(fail('Review the existing client record before sending a new enrollment. Re-enrollment should stay in the same file.'),{code:'EXISTING_RECORD_REVIEW',clients:candidates.map(c=>({id:Number(c.id),name:c.full_name||`Client ${c.id}`}))});
  const [[agency]]=await pool.execute('SELECT id,name,feature_flags FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[data.agencyId]);
  const [[provider]]=await pool.execute(`SELECT u.id,CONCAT_WS(' ',u.first_name,u.last_name) name FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0`,[data.providerId,data.agencyId]);
  if(!agency||!provider)throw fail('This provider is unavailable for the selected organization.',400);
  const {requireStaffCareEligibility}=await import('./staffCareEligibility.service.js');await requireStaffCareEligibility(data.providerId,data.agencyId);
  const billingConfig=parseCareJson(agency.feature_flags).insuranceVerificationTasks;
  if(!billingConfig?.enabled||!Number(billingConfig.taskListId))throw fail('Configure the insurance verification task list before sending a care invitation.');
  let assignment=null;
  if(data.modality==='IN_PERSON') {
   const [assignments]=await pool.execute(`SELECT a.*,l.timezone FROM office_standing_assignments a JOIN office_locations l ON l.id=a.office_location_id
     WHERE a.provider_id=? AND a.office_location_id=? AND a.is_active=1 AND COALESCE(a.bookable_in_person,1)=1`,[data.providerId,data.officeId]);
   if(data.startAt){const p=utcDateToZonedParts(new Date(data.startAt),data.timeZone);const weekday=new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay();
    assignment=assignments.find(a=>Number(a.weekday)===weekday&&Number(a.hour)===p.hour&&p.minute===0&&a.timezone===data.timeZone);
   } else assignment=assignments[0];
   if(!assignment)throw fail('Select a time and office assigned to this provider.');
  }
  const sender=await resolveConfiguredSenderIdentity({agencyId:data.agencyId,templateType:'clinical_enrollment_portal',preferredKeys:['clinical_enrollment_portal'],includePlatformDefaults:false});
  if(!sender?.from_email?.toLowerCase().endsWith('@auricwell.com'))throw fail('Configure the AuricWell enrollment sender for this organization first.');
  const [masters]=await pool.execute(`SELECT id FROM intake_links WHERE organization_id=? AND scope_type='agency' AND form_type='intake'
   AND inherits_office_master=1 AND is_active=1 AND language_code='en' ORDER BY id LIMIT 1`,[data.agencyId]);
  if(!masters[0])throw fail('Configure the full office enrollment packet first.');
  const base=await IntakeLink.findById(masters[0].id);
  const link=await IntakeLink.create({publicKey:'care-'+crypto.randomBytes(24).toString('hex'),title:`Care enrollment with ${provider.name}`,scopeType:'agency',formType:'intake',
   organizationId:data.agencyId,createClient:true,createGuardian:true,requiresAssignment:true,inheritsOfficeMaster:true,
   allowedDocumentTemplateIds:base.allowed_document_template_ids,intakeFields:base.intake_fields,intakeSteps:base.intake_steps,
   retentionPolicy:base.retention_policy_json,customMessages:base.custom_messages,createdByUserId:actorUserId});
  const count=data.frequency==='ONCE'?1:({WEEKLY:52,BIWEEKLY:26,EVERY_3_WEEKS:17,EVERY_4_WEEKS:13,MONTHLY:12}[data.frequency]);
  const [insert]=await pool.execute(`INSERT INTO care_invitations (request_key,agency_id,intake_link_id,provider_user_id,created_by_user_id,recipient_email,modality,office_location_id,
   standing_assignment_id,start_at,time_zone,frequency,occurrence_count,service_code,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'sending')`,
   [requestKey,data.agencyId,link.id,data.providerId,actorUserId,data.email,data.modality,data.officeId,assignment?.id||null,
    data.startAt?new Date(data.startAt).toISOString().slice(0,19).replace('T',' '):null,data.timeZone,data.frequency,count,data.serviceCode]);
  const id=insert.insertId,url=`https://auricwell.com/intake/${link.public_key}`;
  const [[personal]]=await pool.execute('SELECT reply_to,from_email FROM email_sender_identities WHERE agency_id=? AND identity_key=? AND is_active=1 LIMIT 1',[data.agencyId,`personal_${data.providerId}`]);
  const content=careInvitationEmail({...data,agencyName:agency.name,providerName:provider.name,url});
  try {
   const result=await EmailService.sendEmail({...content,to:data.email,fromAddress:sender.from_email,fromName:`AuricWell · ${agency.name}`,
    replyTo:personal?.reply_to||personal?.from_email||sender.reply_to||sender.from_email,source:'manual',usedFallbackSender:false,
    agencyId:data.agencyId,generatedByUserId:actorUserId,templateType:'care_invitation',linkUrl:url});
   const status=result.id&&!result.redirected?'invited':result.pendingApproval||result.queued?'pending_delivery':'delivery_review';
   await pool.execute('UPDATE care_invitations SET status=?,communication_id=? WHERE id=?',[status,result.communicationId||null,id]);
   return {id,status,url,communicationId:result.communicationId||null,messageId:result.id||null};
  } catch(error) {await pool.execute("UPDATE care_invitations SET status='delivery_review',last_error='Check the communication log before resending.' WHERE id=?",[id]);throw error;}
 }finally{try{if(locked)await lock.execute('SELECT RELEASE_LOCK(?)',[`care-send:${actorUserId}:${requestKey}`]);}finally{lock.release();}}
}

/** Notification audience is explicit and tenant-scoped. No family details in staff email. */
export async function notifyCareInvitation(invitation,status,message,{provider=false,billing=false,support=true}={},db=pool) {
 if(db===pool){const connection=await pool.getConnection();try{return await notifyCareInvitation(invitation,status,message,{provider,billing,support},connection);}finally{connection.release();}}
 await db.beginTransaction();
 try {
  const [[row]]=await db.execute('SELECT notified_status FROM care_invitations WHERE id=? FOR UPDATE',[invitation.id]);
  if(row.notified_status===status){await db.commit();return;}
  const [users]=await db.execute(`SELECT DISTINCT u.id,ua.has_billing_access,u.role FROM users u JOIN user_agencies ua ON ua.user_id=u.id
   WHERE ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0`,[invitation.agency_id]);
  const ids=new Set(users.filter(u=>(provider&&Number(u.id)===Number(invitation.provider_user_id))
   ||(billing&&Number(u.has_billing_access)===1)||(support&&(u.role==='support'||Number(u.id)===Number(invitation.created_by_user_id)))).map(u=>Number(u.id)));
  const title=status==='ready'?'New client enrollment ready':status==='billing_review'?'New client enrollment — insurance verification needed':'Care invitation needs review';
  for(const id of ids)await db.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_source)
    VALUES ('client_assigned',?,?,?,?,?,'client',?,'care_invitation')`,[status==='ready'?'info':'warning',title,message,id,invitation.agency_id,invitation.client_id||null]);
  await db.execute('UPDATE care_invitations SET notified_status=? WHERE id=?',[status,invitation.id]);
  await db.commit();
 }catch(e){await db.rollback();throw e;}
}
