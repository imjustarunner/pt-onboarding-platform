import crypto from 'node:crypto';
import pool from '../config/database.js';
import { clinicalAccess } from './guardianClinicalAccess.service.js';
import { clientAgencyMembership, listClientServices } from './clientServiceEnrollment.service.js';
import { guardianContactRows, sharedGuardianContact } from './guardianContactSharing.service.js';
import { recordSecureMessageEvent } from './secureMessageBoundary.service.js';
import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import {guardianServiceAllowed} from '../utils/guardianServiceRestrictions.js';

export const FAMILY_CONVERSATION_POLICY_VERSION = '2026-11-11';
const FAMILY = new Set(['client','client_guardian']);
const PROVIDERS = new Set(['provider','provider_plus','intern','intern_plus','clinician','therapist','supervisor','clinical_practice_assistant','admin','super_admin']);
const fail = (status,message,code='FAMILY_SHARED_ACCESS') => Object.assign(new Error(message),{status,code});
const uid = value => {const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw fail(400,'Choose the client and care context.');return n;};
const parse = value => typeof value==='string'?JSON.parse(value):value;
const ids = value => [...new Set((parse(value)||[]).map(Number))].sort((a,b)=>a-b);
const instant=value=>value instanceof Date?value:new Date(utcMysqlToIso(value)||value);
const active = user => user && Number(user.is_active)===1 && !Number(user.is_archived||0)
  && !user.terminated_at && (!user.status_expires_at || instant(user.status_expires_at)>new Date())
  && ['active','active_employee','ehr_only'].includes(String(user.status||'').toLowerCase());
const label = user => [user.first_name,user.last_name].filter(Boolean).join(' ') || 'Portal user';
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
export function assertReviewedFamilyRecipients({shared,userId,expectedRecipientUserIds}) {
  const expected=shared.audienceUserIds.filter(n=>Number(n)!==Number(userId)).map(Number).sort((a,b)=>a-b);
  const reviewed=Array.isArray(expectedRecipientUserIds)&&expectedRecipientUserIds.length<=30
    ? [...new Set(expectedRecipientUserIds.map(uid))].sort((a,b)=>a-b) : null;
  if(!reviewed||!same(expected,reviewed))throw fail(409,'Review the full authorized recipient list before sending this shared secure message.','FAMILY_SHARED_AUDIENCE_REVIEW_REQUIRED');
}

export function createFamilySharedConversations(overrides={}) {
  const d={db:pool,clinical:clinicalAccess,membership:clientAgencyMembership,services:listClientServices,
    contacts:guardianContactRows,audit:recordSecureMessageEvent,...overrides};
  async function currentAudience({clientId,agencyId,serviceId=0,providerUserId=0,allowUnavailableProvider=false,requireClinical=false},db=d.db) {
    const cid=uid(clientId),aid=uid(agencyId);
    if(!await d.membership(cid,aid,db))throw fail(404,'This client is not enrolled with this practice.');
    const [[client]]=await db.execute(`SELECT c.id,c.agency_id,c.provider_id,c.client_type,c.guardian_portal_enabled FROM clients c
      JOIN agencies a ON a.id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 WHERE c.id=?`,[aid,cid]);
    if(!client)throw fail(404,'This client is not available.');
    const allServices=await d.services(cid,aid,db);
    const services=allServices.filter(s=>Number(s.is_active)===1);
    const service=serviceId?(allowUnavailableProvider?allServices:services).find(s=>Number(s.id)===Number(serviceId)):null;
    if(serviceId&&!service)throw fail(403,'This service is no longer available.');
    if(!allowUnavailableProvider&&!serviceId&&services.length>1&&new Set(services.map(s=>`${s.service_kind}:${s.provider_user_id}`)).size>1)
      throw fail(409,'Choose the client’s service before opening shared secure messages.','FAMILY_SHARED_CONTEXT_REQUIRED');
    let pid=Number(service?.provider_user_id||providerUserId||client.provider_id)||0;
    const [assigned]=await db.execute(`SELECT DISTINCT u.id,u.role,u.first_name,u.last_name,u.is_active,u.is_archived,u.status,u.terminated_at,u.status_expires_at
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
      WHERE (u.id=? AND NOT EXISTS(SELECT 1 FROM client_provider_assignments ended WHERE ended.client_id=? AND ended.provider_user_id=u.id))
      OR EXISTS(SELECT 1 FROM client_provider_assignments p WHERE p.client_id=? AND p.provider_user_id=u.id AND p.is_active=1)`,[aid,client.provider_id||0,cid,cid]);
    const providers=assigned.filter(p=>active(p)&&PROVIDERS.has(p.role));
    if(!pid&&providers.length===1)pid=Number(providers[0].id);
    const provider=providers.find(p=>Number(p.id)===pid);
    if(!provider&&!allowUnavailableProvider)throw fail(409,'An active assigned provider is required before secure messaging is available.');
    const clinical=requireClinical || (service?service.service_kind==='counseling':['clinical','mental_health','school'].includes(String(client.client_type)));
    const [links]=await db.execute(`SELECT u.id,u.role,u.first_name,u.last_name,u.is_active,u.is_archived,u.status,u.terminated_at,u.status_expires_at,cg.access_enabled,cg.relationship_type,cg.permissions_json
      FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=? AND cg.access_enabled=1`,[cid]);
    const family=[];
    for(const member of links) {
      const p=parse(member.permissions_json)||{};
      if(!active(member)||!FAMILY.has(member.role)||p.noView||p.noViewOtherGuardian||p.coGuardianInviteRestricted||p.canMessage===false)continue;
      if(!guardianServiceAllowed({...member,agency_id:client.agency_id},service||{agency_id:aid}))continue;
      if(member.relationship_type!=='self'&&!client.guardian_portal_enabled)continue;
      if(clinical&&!(await d.clinical({agencyId:aid,clientId:cid,userId:member.id},db)).scopes.includes('clinical_messages'))continue;
      family.push(member);
    }
    if(!family.length)throw fail(403,'No eligible family portal account can access this conversation.');
    const participants=[...(provider?[provider]:[]),...family];
    const audienceIds=[...new Set(participants.map(p=>Number(p.id)))].sort((a,b)=>a-b);
    const fingerprint=crypto.createHash('sha256').update(JSON.stringify([cid,aid,Number(serviceId)||0,pid,clinical,FAMILY_CONVERSATION_POLICY_VERSION,audienceIds])).digest('hex');
    return {clientId:cid,agencyId:aid,serviceId:Number(serviceId)||0,providerUserId:pid,clinical,participants,audienceIds,fingerprint};
  }
  async function find(threadId,db=d.db) {
    const [[mapping]]=await db.execute('SELECT * FROM family_shared_conversations WHERE thread_id=?',[uid(threadId)]);
    return mapping||null;
  }
  async function displayParticipants(audience,userId,db=d.db) {
    const current=audience.participants.find(p=>Number(p.id)===Number(userId));
    const contacts=FAMILY.has(current?.role)?await d.contacts(audience.clientId,db):[];
    const own=contacts.find(p=>Number(p.id)===Number(userId));
    return audience.participants.map(p=>{
      const contact=contacts.find(c=>Number(c.id)===Number(p.id));
      const shared=contact?sharedGuardianContact(contact,userId,own?.permissions_json):null;
      return {id:Number(p.id),name:shared?shared.hiddenFields.includes('name')?'Guardian (name private)':shared.name:label(p),
        role:PROVIDERS.has(p.role)?'provider':p.relationship_type==='self'?'client':'guardian',required:true};
    });
  }
  async function open({userId,clientId,agencyId,serviceId=0,providerUserId=0,req}) {
    const actorId=uid(userId),db=await d.db.getConnection();
    try {
      await db.beginTransaction();
      await db.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[uid(clientId)]);
      const audience=await currentAudience({clientId,agencyId,serviceId,providerUserId},db);
      if(!audience.audienceIds.includes(actorId))throw fail(403,'This shared secure conversation is not available to your account.');
      const [[existing]]=await db.execute(`SELECT thread_id FROM family_shared_conversations
        WHERE client_id=? AND agency_id=? AND service_id=? AND provider_user_id=? AND policy_version=? AND audience_hash=?`,
      [audience.clientId,audience.agencyId,audience.serviceId,audience.providerUserId,FAMILY_CONVERSATION_POLICY_VERSION,audience.fingerprint]);
      let threadId=existing?.thread_id;
      if(!threadId) {
        const [thread]=await db.execute("INSERT INTO chat_threads(agency_id,thread_type,message_channel,name) VALUES(?,'client_secure','secure','Shared family secure messages')",[audience.agencyId]);
        threadId=thread.insertId;
        await db.execute(`INSERT INTO family_shared_conversations
          (thread_id,client_id,agency_id,service_id,provider_user_id,clinical_required,policy_version,audience_hash,audience_json,created_by_user_id)
          VALUES(?,?,?,?,?,?,?,?,?,?)`,[threadId,audience.clientId,audience.agencyId,audience.serviceId,audience.providerUserId,audience.clinical?1:0,FAMILY_CONVERSATION_POLICY_VERSION,audience.fingerprint,JSON.stringify(audience.audienceIds),actorId]);
        for(const memberId of audience.audienceIds)await db.execute('INSERT INTO chat_thread_participants(thread_id,user_id) VALUES(?,?)',[threadId,memberId]);
        await d.audit({agencyId:audience.agencyId,threadId,userId:actorId,eventType:'shared_family_thread_created',req,executor:db});
      }
      await db.commit();
      return {threadId:Number(threadId),clientId:audience.clientId,agencyId:audience.agencyId,serviceId:audience.serviceId,
        audienceUserIds:audience.audienceIds,participants:await displayParticipants(audience,actorId),shared:true,sharingPolicy:'all_eligible_family'};
    } catch(error){await db.rollback();throw error;}finally{db.release();}
  }
  async function requireAccess(userId,threadId,{forSend=false,db=d.db}={}) {
    const mapping=await find(threadId,db);
    if(!mapping)return null;
    const audience=await currentAudience({clientId:mapping.client_id,agencyId:mapping.agency_id,serviceId:mapping.service_id,providerUserId:mapping.provider_user_id,allowUnavailableProvider:!forSend,requireClinical:Number(mapping.clinical_required)===1},db);
    const snapshot=ids(mapping.audience_json),actorId=uid(userId);
    if(!snapshot.includes(actorId)||!audience.audienceIds.includes(actorId))throw fail(403,'Your access to this shared conversation has changed.');
    const [[member]]=await db.execute('SELECT user_id FROM chat_thread_participants WHERE thread_id=? AND user_id=?',[threadId,actorId]);
    if(!member)throw fail(403,'This conversation belongs to its recorded participants.');
    if(forSend&&(!same(snapshot,audience.audienceIds)||mapping.audience_hash!==audience.fingerprint||mapping.policy_version!==FAMILY_CONVERSATION_POLICY_VERSION))throw Object.assign(fail(409,'The authorized family changed. Open a new shared conversation and review its recipients before sending.','FAMILY_SHARED_AUDIENCE_CHANGED'),{clientId:mapping.client_id,agencyId:mapping.agency_id,serviceId:mapping.service_id});
    const eligibleIds=snapshot.filter(n=>audience.audienceIds.includes(n));
    return {...mapping,clientId:Number(mapping.client_id),agencyId:Number(mapping.agency_id),serviceId:Number(mapping.service_id),audienceUserIds:eligibleIds,
      recordedAudienceUserIds:snapshot,readOnly:!same(snapshot,audience.audienceIds)||mapping.audience_hash!==audience.fingerprint||mapping.policy_version!==FAMILY_CONVERSATION_POLICY_VERSION,
      participants:await displayParticipants({...audience,participants:audience.participants.filter(p=>eligibleIds.includes(Number(p.id)))},actorId,db)};
  }
  return {open,find,requireAccess,currentAudience};
}
export const familySharedConversations=createFamilySharedConversations();
