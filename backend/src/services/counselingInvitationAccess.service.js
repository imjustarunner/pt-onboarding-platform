import {createHash,createHmac} from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import pool from '../config/database.js';
import CounselingSession from '../models/CounselingSession.model.js';
import {hasActiveMeetingMembership} from './meetingJoinPolicy.service.js';
import {parseUtcDate} from '../utils/officeEventDateTime.util.js';
const issuer='personal-counseling-invitation',audience='counseling-session';
const key=()=>createHmac('sha256',config.jwt.secret).update(issuer).digest();
const hash=token=>createHash('sha256').update(String(token)).digest('hex');
const fail=(message,status=403)=>{throw Object.assign(new Error(message),{status});};
export async function counselingClient(session,db=pool) {
  let rows;
  if(session.appointment_id) [rows]=await db.execute(`SELECT DISTINCT c.id,c.agency_id,c.full_name,c.initials,c.date_of_birth
    FROM appointment_participants p JOIN clients c ON c.id=p.client_id JOIN appointments a ON a.id=p.appointment_id
    WHERE a.id=? AND a.agency_id=? AND c.agency_id=? AND a.status NOT IN ('CANCELLED','CANCELED')`,[session.appointment_id,session.agency_id,session.agency_id]);
  else if(session.client_user_id) [rows]=await db.execute(`SELECT c.id,c.agency_id,c.full_name,c.initials,c.date_of_birth FROM clients c
    JOIN client_guardians g ON g.client_id=c.id WHERE g.guardian_user_id=? AND g.access_enabled=1 AND c.agency_id=?`,[session.client_user_id,session.agency_id]);
  if(rows?.length!==1) fail('Link this session to one client appointment before sending a personal invitation.',409);
  return rows[0];
}
async function available(session) {
  if(!session || session.status==='ended' || (session.guest_invite_expires_at && parseUtcDate(session.guest_invite_expires_at)<=new Date())) fail('This session invitation has ended or expired.',410);
  if(!await hasActiveMeetingMembership(session.agency_id,session.provider_user_id)) fail('The session provider is unavailable.',410);
}
export async function exchangeCounselingInvitation(token) {
  if(!/^[a-f0-9]{48}$/i.test(String(token||'')))fail('Invitation not found.',404);
  let session=await CounselingSession.findByInviteToken(token);await available(session);
  const client=await counselingClient(session);
  session=await CounselingSession.ensurePublicId(session.id);
  const access=jwt.sign({sessionId:Number(session.id),clientId:Number(client.id),agencyId:Number(session.agency_id),invitationHash:hash(token)},key(),{algorithm:'HS256',issuer,audience,expiresIn:'12h'});
  return {ok:true,participantRole:'client',session:CounselingSession.toPublic(session),counselingAccess:{token:access,sessionId:Number(session.id),publicId:session.public_id,displayName:client.initials||'Client',expiresAt:Date.now()+43200000}};
}
export async function validateCounselingInvitation(token,sessionRef) {
  let grant;try{grant=jwt.verify(token,key(),{algorithms:['HS256'],issuer,audience});}catch{fail('Open your personal session invitation again.',401);}
  const session=await CounselingSession.findByIdOrPublicId(sessionRef);await available(session);
  if(Number(grant.sessionId)!==Number(session.id)||Number(grant.agencyId)!==Number(session.agency_id)||grant.invitationHash!==hash(session.guest_invite_token))fail('This link only grants access to its client session.');
  const client=await counselingClient(session);if(Number(grant.clientId)!==Number(client.id))fail('The appointment client has changed. Open a new invitation.',410);
  return {sessionId:Number(session.id),clientId:Number(client.id),agencyId:Number(session.agency_id),displayName:client.initials||'Client',userId:Number(session.client_user_id)||null};
}
