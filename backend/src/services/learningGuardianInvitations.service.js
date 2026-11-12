import crypto from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import {sendEnrollmentPortalEmail} from './enrollmentPortalEmail.service.js';
import {buildPublicPortalBaseUrl, buildPublicPortalLoginUrl} from '../utils/publicPortalUrl.js';
import {isNluChildcareAgency} from './compensationCategories.service.js';
import {nluTutoringQaMailDomain} from '../utils/nluTutoringQaPolicy.js';

const SOURCE = 'learning_portal';
const fail = (message, status=403) => Object.assign(new Error(message), {status,statusCode:status});
const parse = value => {try{const parsed=typeof value==='string'?JSON.parse(value):value||{};return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;}catch{return null;}};
const address = value => String(value||'').trim().toLowerCase();
const positive = value => Number.isSafeInteger(Number(value)) && Number(value)>0;
const permissions = Object.freeze({learningOnly:true,serviceKinds:['tutoring'],noView:false,noViewOtherGuardian:false,
  hideOtherGuardianAnswers:true,canViewDocs:false,canSignDocs:false,canViewLinks:true,
  canViewProgramMaterials:false,canViewProgress:false,canMessage:true,canInviteGuardians:false,
  contactSharing:{name:false,email:false,phone:false}});
const audit = (db,action,userId,agencyId,metadata) => db.execute(
  'INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',
  [action,userId,agencyId,JSON.stringify(metadata)]);

function minor(dob, now=new Date()) {
  const birth=dob instanceof Date?dob.toISOString().slice(0,10):String(dob||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(birth)||!Number.isFinite(+new Date(`${birth}T00:00:00Z`))||new Date(`${birth}T00:00:00Z`).toISOString().slice(0,10)!==birth)return false;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const age=Number(today.slice(0,4))-Number(birth.slice(0,4))-(today.slice(5)<birth.slice(5)?1:0);
  return age>=0&&age<18;
}

/** Client-wide guardian links cannot safely grant a tutoring-only view of a
 * dual-service chart. Until those links are service-scoped, require a genuinely
 * learning-only child and recheck the inviting relationship on every action.
 */
export async function requireLearningGuardianInvitationAuthority({userId,clientId,agencyId,lock=false}, db=pool) {
  if(!positive(userId)||!positive(clientId)||!positive(agencyId))throw fail('Choose an organization and learning student.',400);
  const [[row]]=await db.execute(`SELECT c.id,c.agency_id,c.client_type,c.date_of_birth,c.guardian_portal_enabled,c.status,
    cg.access_enabled,cg.permissions_json,cg.relationship_type,u.role,u.is_active AS guardian_active,
    u.is_archived AS guardian_archived,u.terminated_at,u.email AS guardian_email,
    a.slug,a.feature_flags,a.is_active AS agency_active,a.is_archived AS agency_archived,
    EXISTS(SELECT 1 FROM client_service_enrollments e WHERE e.client_id=c.id AND e.agency_id=c.agency_id
      AND e.service_kind='tutoring' AND e.is_active=1) AS tutoring_active,
    EXISTS(SELECT 1 FROM client_service_enrollments e WHERE e.client_id=c.id AND e.service_kind='counseling' AND e.is_active=1) AS clinical_active,
    EXISTS(SELECT 1 FROM client_portal_independence p WHERE p.client_id=c.id AND p.status='active') AS independent
    FROM clients c JOIN client_guardians cg ON cg.client_id=c.id AND cg.guardian_user_id=?
    JOIN users u ON u.id=cg.guardian_user_id JOIN agencies a ON a.id=c.agency_id
    WHERE c.id=? AND c.agency_id=? LIMIT 1${lock?' FOR UPDATE':''}`,[userId,clientId,agencyId]);
  const p=parse(row?.permissions_json);
  const agency=row?{id:row.agency_id,slug:row.slug,feature_flags:row.feature_flags,is_active:row.agency_active,is_archived:row.agency_archived}:null;
  if(!row||Number(row.access_enabled)!==1||!p||p.noView||p.noViewOtherGuardian||p.canInviteGuardians===false
    ||!['guardian',null,undefined].includes(row.relationship_type)||!['client_guardian','guardian'].includes(row.role)
    ||Number(row.guardian_active)!==1||Number(row.guardian_archived)||row.terminated_at
    ||Number(row.guardian_portal_enabled)!==1||Number(row.agency_active)!==1||Number(row.agency_archived)
    ||!isNluChildcareAgency(agency)||([453,454].includes(Number(agencyId))&&!nluTutoringQaMailDomain(agency))
    ||!['learning','tutoring'].includes(row.client_type)||Number(row.tutoring_active)!==1||Number(row.clinical_active)
    ||Number(row.independent)||!minor(row.date_of_birth)||['ARCHIVED','INACTIVE','TERMINATED'].includes(String(row.status).toUpperCase())) {
    throw fail('This guardian relationship cannot invite another person to this learning student. Ask the organization to review access.');
  }
  return row;
}

const summary = row => ({id:Number(row.id),email:row.invited_email,firstName:row.invited_first_name||'',lastName:row.invited_last_name||'',
  status:row.status==='pending'&&row.expires_at&&+new Date(row.expires_at)<=Date.now()?'expired':row.status,
  deliveryStatus:row.delivery_status||'not_requested',createdAt:row.created_at,expiresAt:row.expires_at||null});

export async function listLearningGuardianInvitations(scope,db=pool) {
  await requireLearningGuardianInvitationAuthority(scope,db);
  const [rows]=await db.execute(`SELECT i.*,d.delivery_status FROM co_guardian_invites i
    JOIN co_guardian_invite_clients ic ON ic.invite_id=i.id AND ic.client_id=?
    LEFT JOIN co_guardian_invite_deliveries d ON d.id=(SELECT MAX(x.id) FROM co_guardian_invite_deliveries x WHERE x.invite_id=i.id)
    WHERE i.agency_id=? AND i.invited_by_user_id=? AND i.source=? ORDER BY i.id DESC LIMIT 30`,
    [scope.clientId,scope.agencyId,scope.userId,SOURCE]);
  return {canInvite:true,clientId:Number(scope.clientId),invitations:rows.map(summary)};
}

async function recipientAvailable({email,clientId,agencyId},db) {
  const [users]=await db.execute('SELECT id,email,role,is_active,is_archived,terminated_at,password_hash FROM users WHERE LOWER(email)=? OR LOWER(personal_email)=? OR LOWER(work_email)=? OR LOWER(username)=? LIMIT 2 FOR UPDATE',[email,email,email,email]);
  if(users.length>1)throw fail('This address needs an account review before it can be invited.',409);
  const user=users[0];
  const [aliases]=await db.execute('SELECT user_id FROM user_login_emails WHERE LOWER(TRIM(email))=? FOR UPDATE',[email]);
  if(aliases.some(alias=>!user||Number(alias.user_id)!==Number(user.id)))throw fail('This address is already reserved for another account. Ask the organization to review it.',409);
  if(user&&(address(user.email)!==email||!['client_guardian','guardian'].includes(user.role)||Number(user.is_active)!==1||Number(user.is_archived)||user.terminated_at))throw fail('This address cannot be used for a new guardian invitation. Ask the organization to review it.',409);
  if(user){
    const [[link]]=await db.execute('SELECT access_enabled,permissions_json FROM client_guardians WHERE client_id=? AND guardian_user_id=? LIMIT 1 FOR UPDATE',[clientId,user.id]);
    if(link)throw fail('This person already has a saved relationship with this student. Ask the organization to review existing access instead of sending a new invitation.',409);
    if([453,454].includes(Number(agencyId))){
      const [members]=await db.execute('SELECT agency_id FROM user_agencies WHERE user_id=?',[user.id]);
      if(members.some(m=>![453,454].includes(Number(m.agency_id))))throw fail('Use an isolated synthetic QA guardian identity.',409);
    }
  }
  if([453,454].includes(Number(agencyId))&&!/^[a-z0-9][a-z0-9._+-]*@example\.com$/.test(email))throw fail('Use a distinct synthetic @example.com guardian identity. The testing inbox is a delivery destination, not a login.',400);
  return user||null;
}

async function capacity(clientId,db,{countPending=false}={}) {
  const [rows]=await db.execute(`SELECT guardian_user_id FROM client_guardians WHERE client_id=? AND access_enabled=1 AND COALESCE(relationship_type,'guardian')<>'self' FOR UPDATE`,[clientId]);
  let total=rows.length;
  if(countPending){const [[pending]]=await db.execute(`SELECT COUNT(DISTINCT i.invited_email) AS total FROM co_guardian_invites i
    JOIN co_guardian_invite_clients ic ON ic.invite_id=i.id WHERE ic.client_id=? AND i.status='pending' AND i.expires_at>NOW()`,[clientId]);total+=Number(pending?.total)||0;}
  if(total>=2)throw fail('This student already has two guardians or a pending invitation for the remaining guardian place. Ask the organization to review access.',409);
}

export async function createLearningGuardianInvitation({userId,clientId,agencyId,input},dbPool=pool) {
  if(input?.authorityConfirmed!==true)throw fail('Confirm your authority to invite this person.',400);
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(String(input?.requestKey||'')))throw fail('Refresh the form before sending this invitation.',400);
  const email=address(input.email),firstName=String(input.firstName||'').trim(),lastName=String(input.lastName||'').trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>255||!firstName||!lastName||firstName.length>120||lastName.length>120)throw fail('Enter the invited guardian’s name and valid email address.',400);
  const scope={userId,clientId,agencyId},db=await dbPool.getConnection(),lock=`learning-guardian-invite:${Number(clientId)}`;
  let locked=false,invite,token;
  try{
    const [[l]]=await db.execute('SELECT GET_LOCK(?,5) AS acquired',[lock]);if(!Number(l?.acquired))throw fail('Another invitation is being processed. Please retry.',409);locked=true;
    await db.beginTransaction();
    await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[clientId]);
    const context=await requireLearningGuardianInvitationAuthority({...scope,lock:true},db);
    if(address(context.guardian_email)===email)throw fail('You already use this portal account. Enter the other guardian’s email.',400);
    const [[existing]]=await db.execute(`SELECT i.*,d.delivery_status FROM co_guardian_invites i JOIN co_guardian_invite_clients ic ON ic.invite_id=i.id AND ic.client_id=?
      LEFT JOIN co_guardian_invite_deliveries d ON d.id=(SELECT MAX(x.id) FROM co_guardian_invite_deliveries x WHERE x.invite_id=i.id)
      WHERE i.agency_id=? AND i.invited_by_user_id=? AND i.source=? AND (LOWER(i.invited_email)=?
        OR JSON_UNQUOTE(JSON_EXTRACT(i.response_json,'$.learningPortal.requestKey'))=?) ORDER BY i.id DESC LIMIT 1`,[clientId,agencyId,userId,SOURCE,email,input.requestKey]);
    if(existing){
      if(address(existing.invited_email)!==email)throw fail('This request already belongs to another invitation. Refresh before changing the recipient.',409);
      await db.commit();return {invitation:summary(existing),reused:true,emailSent:['sent','delivered'].includes(existing.delivery_status),deliveryStatus:existing.delivery_status||'not_requested'};
    }
    await recipientAvailable({email,clientId,agencyId},db);await capacity(clientId,db,{countPending:true});
    token=crypto.randomBytes(32).toString('hex');
    const expires=new Date(Date.now()+21*86400000);
    const [saved]=await db.execute(`INSERT INTO co_guardian_invites(agency_id,invited_by_user_id,invited_email,invited_first_name,invited_last_name,
      relationship_title,token_hash,expires_at,status,source,response_json) VALUES (?,?,?,?,?,'Parent/guardian',?,?,'pending',?,?)`,
      [agencyId,userId,email,firstName,lastName,crypto.createHash('sha256').update(token).digest('hex'),expires,SOURCE,JSON.stringify({learningPortal:{requestKey:input.requestKey,authorityConfirmed:true}})]);
    invite={id:saved.insertId,invited_email:email,invited_first_name:firstName,invited_last_name:lastName,status:'pending',created_at:new Date().toISOString(),expires_at:expires};
    await db.execute('INSERT INTO co_guardian_invite_clients(invite_id,client_id) VALUES (?,?)',[invite.id,clientId]);
    const [delivery]=await db.execute("INSERT INTO co_guardian_invite_deliveries(invite_id,recipient_email,enrollment_channel,delivery_status) VALUES (?,?,'tutoring','sending')",[invite.id,email]);
    invite.deliveryId=delivery.insertId;
    await audit(db,'learning_guardian_invited',userId,agencyId,{clientId,inviteId:invite.id,createdAccount:false,grantedAccess:false});
    await db.commit();
  }catch(error){await db.rollback();throw error;}finally{try{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{db.release();}}
  let sent={};
  try{
    await requireLearningGuardianInvitationAuthority(scope);
    const agency=await Agency.findById(agencyId),origin=new URL(buildPublicPortalBaseUrl(agency)).origin;
    const inviteUrl=`${origin}/join/${encodeURIComponent(agency.portal_url||agency.slug)}/tutoring/co-guardian/${encodeURIComponent(token)}`;
    sent=await sendEnrollmentPortalEmail({agencyId,enrollmentChannel:'tutoring',to:email,clientId,source:'learning_guardian_invite',templateType:'co_guardian_invite',
      subject:`${agency.name}: learning portal invitation`,text:`${firstName}, you have been invited to connect to a student’s learning portal. Accept this personal invitation using the email address it was sent to. Your own account will show only information authorized for you; this invitation does not give access to private guardian responses, clinical information, documents, signatures or billing.\n\n${inviteUrl}\n\nThis invitation expires in 21 days. Do not forward it.`,linkUrl:inviteUrl,linkLabel:'Review learning portal invitation'});
  }catch{ /* The saved attempt stays visible and is never silently resent. */ }
  const state=sent?.sent?'sent':sent?.queued?'pending':'failed';
  await pool.execute('UPDATE co_guardian_invite_deliveries SET delivery_status=?,communication_id=?,failure_kind=? WHERE id=?',[state,sent.communicationId||sent.id||null,state==='failed'?'send_failed':null,invite.deliveryId]);
  return {invitation:summary({...invite,delivery_status:state}),reused:false,emailSent:state==='sent',deliveryStatus:state};
}

export async function acceptLearningGuardianInvitation({row,contact={},token},dbPool=pool) {
  if(!token||row.source!==SOURCE)throw fail('Open the personal invitation delivered to your email.',403);
  const email=address(contact.email||row.invited_email);
  if(email!==address(row.invited_email))throw fail('Use the email address that received this invitation.',400);
  const db=await dbPool.getConnection();let userId,created=false,sendSetup=false,agency,clientId,setupState;
  try{
    await db.beginTransaction();
    const [[current]]=await db.execute('SELECT * FROM co_guardian_invites WHERE id=? FOR UPDATE',[row.id]);
    if(!current||current.source!==SOURCE||current.token_hash!==crypto.createHash('sha256').update(token).digest('hex')
      ||!['pending','accepted'].includes(current.status)||!current.expires_at||!Number.isFinite(+new Date(current.expires_at))||+new Date(current.expires_at)<=Date.now())throw fail('This personal invitation is no longer active.',410);
    const [children]=await db.execute('SELECT client_id FROM co_guardian_invite_clients WHERE invite_id=?',[row.id]);
    if(children.length!==1)throw fail('This invitation needs an organization access review.',409);clientId=Number(children[0].client_id);
    await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[clientId]);
    await requireLearningGuardianInvitationAuthority({userId:current.invited_by_user_id,clientId,agencyId:current.agency_id,lock:true},db);
    if(current.status==='accepted'){
      const [[link]]=await db.execute('SELECT access_enabled,permissions_json FROM client_guardians WHERE client_id=? AND guardian_user_id=? FOR UPDATE',[clientId,current.accepted_user_id]);
      const p=parse(link?.permissions_json);
      if(!link||Number(link.access_enabled)!==1||!p||p.noView||p.noViewOtherGuardian)throw fail('This guardian access has changed. Ask the organization to review it.');
      userId=current.accepted_user_id;setupState=parse(current.response_json)?.learningPortal||{};await db.commit();
    }else{
      await capacity(clientId,db);
      const user=await recipientAvailable({email,clientId,agencyId:current.agency_id},db);
      sendSetup=!user?.password_hash;
      if(user)userId=user.id;
      else{
        const qa=[453,454].includes(Number(current.agency_id));
        const [createdUser]=await db.execute("INSERT INTO users(email,username,password_hash,role,status,first_name,last_name,is_active,is_demo) VALUES (?,?,NULL,'client_guardian','PENDING_SETUP',?,?,1,?)",[email,email,current.invited_first_name,current.invited_last_name,qa?1:0]);
        userId=createdUser.insertId;created=true;
      }
      const [[membership]]=await db.execute('SELECT is_active FROM user_agencies WHERE user_id=? AND agency_id=? LIMIT 1',[userId,current.agency_id]);
      if(membership&&Number(membership.is_active)!==1)throw fail('This organization membership was disabled. Ask the organization to review access.');
      if(!membership)await db.execute('INSERT INTO user_agencies(user_id,agency_id,is_active) VALUES (?,?,1)',[userId,current.agency_id]);
      await db.execute("INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,relationship_title,access_enabled,permissions_json,created_by_user_id) VALUES (?,?,'guardian','Parent/guardian',1,?,?)",[clientId,userId,JSON.stringify({...permissions,serviceAgencyIds:[Number(current.agency_id)],coGuardianInviteId:row.id}),current.invited_by_user_id]);
      setupState={created,existingAccount:!sendSetup,setupEmailSent:false,deliveryStatus:sendSetup?'pending':'not_requested',setupAttemptedAt:sendSetup?new Date().toISOString():null};
      await db.execute("UPDATE co_guardian_invites SET status='accepted',accepted_user_id=?,accepted_at=NOW(),response_json=? WHERE id=?",[userId,JSON.stringify({learningPortal:setupState}),row.id]);
      await audit(db,'learning_guardian_invitation_accepted',userId,current.agency_id,{clientId,inviteId:row.id,clinicalAccess:false,documentAccess:false,billingAccess:false});
      await db.commit();
    }
  }catch(error){await db.rollback();throw error;}finally{db.release();}
  agency=await Agency.findById(row.agency_id);
  if(sendSetup){
    let delivery={};try{
      await requireLearningGuardianInvitationAuthority({userId:row.invited_by_user_id,clientId,agencyId:row.agency_id});
      const [[recipient]]=await pool.execute(`SELECT cg.access_enabled,cg.permissions_json,u.email,u.role,u.is_active,u.is_archived,u.terminated_at
        FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
        JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
        WHERE cg.client_id=? AND cg.guardian_user_id=?`,[row.agency_id,clientId,userId]);
      const currentPermissions=parse(recipient?.permissions_json);
      if(Number(recipient?.access_enabled)!==1||!currentPermissions||currentPermissions.noView||currentPermissions.noViewOtherGuardian
        ||address(recipient.email)!==email||!['client_guardian','guardian'].includes(recipient.role)||Number(recipient.is_active)!==1
        ||Number(recipient.is_archived)||recipient.terminated_at)throw fail('Guardian access changed before setup delivery.');
      const {emailPortalLoginInfo}=await import('./coGuardianInvite.service.js');delivery=await emailPortalLoginInfo({to:email,agency,username:email,clientId});
    }catch{}
    const sent=!!delivery.id&&!delivery.queued&&!delivery.skipped&&!delivery.blocked;
    setupState={...setupState,setupEmailSent:sent,deliveryStatus:sent?'sent':delivery.queued?'pending':'failed'};
    await pool.execute('UPDATE co_guardian_invites SET response_json=? WHERE id=?',[JSON.stringify({learningPortal:setupState}),row.id]);
  }
  return {accepted:true,created,acceptedUserId:userId,source:SOURCE,publicKey:null,dependents:[{id:clientId}],
    portalAccess:{email,portalPath:buildPublicPortalLoginUrl(agency),existingAccount:setupState.existingAccount===true,setupEmailSent:setupState.setupEmailSent===true,deliveryStatus:setupState.deliveryStatus}};
}
