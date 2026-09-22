import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { schoolEmailPortalUrl, SCHOOL_EMAIL_DISPLAY_NAME } from './schoolEmailPortal.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';
import { schoolClientStatusEmailBody } from '../utils/schoolClientStatusEmailBody.js';
import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { syncClientProviderLifecycleTasks } from './clientOnboardingTask.service.js';

const hashState = state => createHash('sha256').update(JSON.stringify(state)).digest('hex');
const json = value => { try { return typeof value==='string'?JSON.parse(value):value||{}; } catch { return {}; } };
export function schoolStatusEmailState(client, providers, reason = null) {
  const status=String(client.client_status_key||'').toLowerCase();
  const inactive=['terminated','archived','not_returning'].includes(status)||['TERMINATED','ARCHIVED'].includes(client.status);
  const ids=[...new Set(providers.map(p=>Number(p.id)))].sort((a,b)=>a-b);
  const kind=inactive?null:status==='waitlist'?'waitlist':ids.length?'assigned':null;
  return {agencyId:Number(client.agency_id),kind,providerIds:ids,reason:kind==='waitlist'?String(json(client.agency_intake_json).waitlistReason||reason||'').trim():null};
}
async function loadClient(database, clientId) {
  const [[client]]=await database.execute(`SELECT c.*,cs.status_key client_status_key FROM clients c LEFT JOIN client_statuses cs ON cs.id=c.client_status_id WHERE c.id=?`,[clientId]);
  return client;
}
async function loadProviders(database,client,schoolId) {
  const [rows]=await database.execute(`SELECT DISTINCT u.* FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
    WHERE u.is_active=1 AND (EXISTS(SELECT 1 FROM client_provider_assignments a WHERE a.client_id=? AND a.organization_id=? AND a.provider_user_id=u.id AND a.is_active=1)
      OR (u.id=? AND ?=? AND NOT EXISTS(SELECT 1 FROM client_provider_assignments a WHERE a.client_id=? AND a.is_active=1))) ORDER BY u.id`,
    [client.agency_id,client.id,schoolId,client.provider_id||null,schoolId,client.organization_id,client.id]);
  return rows;
}

/** Queue in the assignment transaction; the worker cannot see a rolled-back assignment. */
export async function queueSchoolClientStatusEmails(database=pool,{clientId,waitlistReason=null}={}) {
  const owned=database===pool;
  const db=owned?await pool.getConnection():database;
  try {
    if(owned)await db.beginTransaction();
    const client=await loadClient(db,clientId);
    if(!client){if(owned)await db.commit();return;}
    const [schools]=await db.execute(`SELECT DISTINCT a.id FROM agencies a WHERE a.organization_type='school' AND a.is_active=1
      AND (a.id=? OR EXISTS(SELECT 1 FROM client_organization_assignments coa WHERE coa.client_id=? AND coa.organization_id=a.id AND coa.is_active=1)
      OR EXISTS(SELECT 1 FROM school_client_status_email_states old WHERE old.client_id=? AND old.school_organization_id=a.id)) ORDER BY a.id`,[client.organization_id,clientId,clientId]);
    for(const school of schools){
      const providers=await loadProviders(db,client,school.id);
      const state=schoolStatusEmailState(client,providers,waitlistReason), hash=hashState(state);
      await db.execute('INSERT IGNORE INTO school_client_status_email_states(client_id,school_organization_id) VALUES(?,?)',[clientId,school.id]);
      const [[prior]]=await db.execute('SELECT state_hash,revision FROM school_client_status_email_states WHERE client_id=? AND school_organization_id=? FOR UPDATE',[clientId,school.id]);
      if(prior.state_hash===hash)continue;
      const revision=Number(prior.revision)+1;
      await db.execute('UPDATE school_client_status_email_states SET state_hash=?,revision=? WHERE client_id=? AND school_organization_id=?',[hash,revision,clientId,school.id]);
      await db.execute("UPDATE school_client_status_emails SET delivery_status='obsolete' WHERE client_id=? AND school_organization_id=? AND delivery_status='pending'",[clientId,school.id]);
      if(state.kind)await db.execute('INSERT INTO school_client_status_emails(agency_id,school_organization_id,client_id,revision,state_hash,state_json) VALUES(?,?,?,?,?,?)',[client.agency_id,school.id,clientId,revision,hash,JSON.stringify(state)]);
    }
    if(owned)await db.commit();
  }catch(error){if(owned)await db.rollback();throw error;}finally{if(owned)db.release();}
}

export async function sendPendingSchoolClientStatusEmails() {
  const [jobs]=await pool.execute("SELECT * FROM school_client_status_emails WHERE delivery_status='pending' AND next_attempt_at<=UTC_TIMESTAMP() ORDER BY id LIMIT 30");
  const results=[];
  for(const job of jobs){
    const db=await pool.getConnection();const lock=`school-status-email:${job.id}`;let locked=false,sending=false;
    try {
      const [[row]]=await db.execute('SELECT GET_LOCK(?,0) acquired',[lock]);locked=!!row.acquired;if(!locked)continue;
      const [[current]]=await db.execute('SELECT j.delivery_status,s.revision FROM school_client_status_emails j JOIN school_client_status_email_states s ON s.client_id=j.client_id AND s.school_organization_id=j.school_organization_id WHERE j.id=?',[job.id]);
      if(current?.delivery_status!=='pending')continue;
      const client=await loadClient(pool,job.client_id);
      const providers=client?await loadProviders(pool,client,job.school_organization_id):[];
      const state=client?schoolStatusEmailState(client,providers,json(job.state_json).reason):null;
      const [[school]]=await pool.execute(`SELECT a.name,sp.itsco_email FROM agencies a JOIN school_profiles sp ON sp.school_organization_id=a.id
        WHERE a.id=? AND a.organization_type='school' AND a.is_active=1 AND (?=a.id OR EXISTS(SELECT 1 FROM client_organization_assignments coa WHERE coa.organization_id=a.id AND coa.client_id=? AND coa.is_active=1))`,[job.school_organization_id,client?.organization_id||null,job.client_id]);
      if(!school||Number(current.revision)!==Number(job.revision)||!state||hashState(state)!==job.state_hash){
        await db.execute("UPDATE school_client_status_emails SET delivery_status='obsolete' WHERE id=?",[job.id]);
        if(client)await queueSchoolClientStatusEmails(pool,{clientId:client.id});
        continue;
      }
      const schoolEmail=String(school.itsco_email||'').trim();if(!schoolEmail)throw new Error('School group email is not configured');
      const identities=await EmailSenderIdentity.list({agencyId:job.agency_id,includePlatformDefaults:false,onlyActive:true});
      const identity=identities.find(i=>String(i.identity_key).toLowerCase()==='schools'&&String(i.from_email).toLowerCase().startsWith('schools@'));
      if(!identity)throw new Error('Schools sender identity is not configured');
      const providerEmails=[];
      for(const provider of providers){const recipient=await resolveMeetingRecipient({agencyId:job.agency_id,user:provider});if(!recipient.email)throw new Error('Assigned provider work email is not configured');providerEmails.push(recipient.email);}
      if(state.kind==='assigned')await syncClientProviderLifecycleTasks({clientId:client.id,providerUserIds:providers.map(p=>p.id)});
      const schoolUrl=await schoolEmailPortalUrl({schoolOrganizationId:job.school_organization_id,agencyId:job.agency_id});
      const providerUrl=buildPublicAppUrl(await Agency.findById(job.agency_id),'dashboard');
      const content=schoolClientStatusEmailBody({schoolName:school.name,clientLabel:client.initials||client.identifier_code||`Client #${client.id}`,providers,kind:state.kind,reason:state.reason,schoolUrl,providerUrl,
        readyForIntake:['ready_to_schedule','needs_day_assignment','scheduled','onboarded','current'].includes(client.client_status_key)});
      const [claim]=await db.execute("UPDATE school_client_status_emails j JOIN school_client_status_email_states s ON s.client_id=j.client_id AND s.school_organization_id=j.school_organization_id SET j.delivery_status='sending',j.attempts=j.attempts+1 WHERE j.id=? AND j.delivery_status='pending' AND s.revision=j.revision",[job.id]);if(!claim.affectedRows)continue;sending=true;
      const result=await sendEmailFromIdentity({senderIdentityId:identity.id,fromDisplayNameOverride:SCHOOL_EMAIL_DISPLAY_NAME,replyToOverride:identity.from_email,
        to:[...new Set([schoolEmail,...providerEmails].map(e=>e.toLowerCase()))],...content,source:'auto',clientId:client.id,templateType:'school_client_status_update',linkUrl:schoolUrl});
      const status=result.id&&!result.redirected?'sent':result.pendingApproval?'approval':'held';
      await db.execute('UPDATE school_client_status_emails SET delivery_status=?,communication_id=?,sent_at=IF(?=\'sent\',UTC_TIMESTAMP(),NULL),last_error=? WHERE id=?',[status,result.communicationId||null,status,result.reason||null,job.id]);
      results.push({id:job.id,status});
    }catch(error){
      await db.execute(`UPDATE school_client_status_emails SET delivery_status=?,attempts=attempts+?,last_error=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE) WHERE id=?`,[sending?'review':'pending',sending?0:1,String(error.message||error).slice(0,500),job.id]);
      console.warn('[School client status email]',job.id,error.code||error.message);
    }finally{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);db.release();}
  }
  return results;
}
