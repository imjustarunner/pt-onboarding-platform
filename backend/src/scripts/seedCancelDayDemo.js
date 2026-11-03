/** Idempotent, notification-free fixtures for the explicitly approved isolated QA tenant.
 * Run with DB credentials in the environment; dry-run unless --apply is supplied.
 * No staff/provider identities, signed notes, deliveries, or retained cases are reset.
 */
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';

const apply = process.argv.includes('--apply');
const manifestArg = process.argv.find(a=>a.startsWith('--manifest='));
const agencyId=450,schoolId=451,providerId=1433,actorId=1434;
const source='qa_cancel_day_20261102';
const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const dateArg=process.argv.find(a=>a.startsWith('--dates='));
const dates=dateArg ? [...new Set(dateArg.slice(8).split(','))].sort() : ['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-23'];
const scenarioArg=process.argv.find(a=>a.startsWith('--scenario-dates='));
const scenarioDates=scenarioArg ? scenarioArg.slice(17).split(',') : ['2026-11-18','2026-11-19'];
for(const date of [...dates,...scenarioDates]) if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) throw Error('Use explicit valid YYYY-MM-DD fixture dates.');
if(!dates.length || dates.length>14 || scenarioDates.length!==2) throw Error('Choose up to fourteen session dates and two scenario dates.');
const [hostedDate,rsvpDate]=scenarioDates;
const scenarioSuffix=scenarioArg ? ` ${hostedDate}-${rsvpDate}` : '';
const schoolEmail='qa.cedar-grove.cancel-day@example.com';
const definitions=[
 {key:'QACDSE',name:'Cancel Day School Email QA',type:'school',guardians:[1440]},
 {key:'QACDS2',name:'Cancel Day School Two Guardians QA',type:'school',guardians:[1449,1456]},
 {key:'QACDSM',name:'Cancel Day School Missing Email QA',type:'school',guardians:[]},
 {key:'QACDOE',name:'Cancel Day Office Email QA',type:'clinical',email:'qa.cancel-day.office@example.com',guardians:[]},
 {key:'QACDO2',name:'Cancel Day Office Two Guardians QA',type:'clinical',guardians:[1449,1456]},
 {key:'QACDOM',name:'Cancel Day Office Missing Email QA',type:'clinical',guardians:[]}
];
const db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,
 password:process.env.DB_PASSWORD,database:process.env.DB_NAME,timezone:'Z',dateStrings:true});
const report={agencyId,schoolId,providerId,actorId,source,schoolEmail,dates,applied:false,clients:[],appointments:[],events:[],softSlots:[]};
const instant=(date,time)=>wallMysqlToUtcMysql(`${date} ${time}:00`,'America/Denver');
let locked=false;
try {
 const [[lock]]=await db.execute('SELECT GET_LOCK(?,5) AS acquired',[`${source}:450`]);
 if(Number(lock?.acquired)!==1)throw Error('The demo seed is already running.');locked=true;
 const [[agency]]=await db.execute('SELECT id,slug,portal_url FROM agencies WHERE id=?',[agencyId]);
 if((agency?.portal_url||agency?.slug)!=='auricwell-qa-demo')throw Error('The approved isolated demo tenant did not match.');
 const [affiliations]=await db.execute('SELECT agency_id FROM organization_affiliations WHERE organization_id=? AND is_active=1',[schoolId]);
 if(affiliations.length!==1||Number(affiliations[0].agency_id)!==agencyId)throw Error('The school is not isolated to this demo tenant.');
 const [people]=await db.execute(`SELECT u.id,u.role FROM users u JOIN user_agencies ua ON ua.user_id=u.id
  WHERE ua.agency_id=? AND ua.is_active=1 AND u.id IN (1433,1434,1440,1449,1456)`,[agencyId]);
 if(new Set(people.map(p=>Number(p.id))).size!==5)throw Error('Required existing QA accounts are unavailable; do not create replacement identities.');
 const [[status]]=await db.execute(`SELECT id AS client_status_id,status_key FROM client_statuses WHERE agency_id=? AND status_key='current' ORDER BY id LIMIT 1`,[agencyId]);
 if(!apply){console.log(JSON.stringify({...report,plannedClients:definitions.map(d=>d.key),message:'Dry run only; no records changed.'},null,2));}
 else {
  await db.beginTransaction();
  for(const def of definitions){
   const [[existing]]=await db.execute('SELECT id,full_name,agency_id FROM clients WHERE agency_id=? AND initials=?',[agencyId,def.key]);
   let id=existing?.id;
   if(existing&&existing.full_name!==def.name)throw Error('A seed identifier is already used by another record.');
   if(!id){
    const [created]=await db.execute(`INSERT INTO clients (organization_id,agency_id,provider_id,initials,full_name,client_type,status,client_status_id,
      submission_date,source,email,session_email_opt_in,session_sms_opt_in,session_phone_opt_in,internal_notes)
      VALUES (?,?,?,?,?,?,'ACTIVE',?,CURRENT_DATE(),'ADMIN_CREATED',?,1,0,0,?)`,[def.type==='school'?schoolId:452,agencyId,providerId,def.key,def.name,def.type,status?.client_status_id||null,def.email||null,`Synthetic cancellation QA fixture: ${source}. Preserve after testing.`]);
    id=created.insertId;
    await db.execute('INSERT INTO client_organization_assignments (client_id,organization_id,is_active) VALUES (?,?,1)',[id,def.type==='school'?schoolId:452]);
    for(const guardianId of def.guardians) await db.execute('INSERT INTO client_guardians (client_id,guardian_user_id,relationship_type,access_enabled,permissions_json) VALUES (?,?,\'guardian\',1,?)',[id,guardianId,JSON.stringify({viewSchedule:true,viewNotes:true})]);
   }
   report.clients.push({id:Number(id),key:def.key,name:def.name,type:def.type,email:def.email||null,guardianIds:def.guardians});
  }
  await db.execute('UPDATE school_profiles SET itsco_email=? WHERE school_organization_id=?',[schoolEmail,schoolId]);
  for(const day of days){
   await db.execute(`INSERT INTO school_day_schedules (school_organization_id,weekday,is_active,created_by_user_id) VALUES (?,?,1,?) ON DUPLICATE KEY UPDATE id=id`,[schoolId,day,actorId]);
   await db.execute(`INSERT INTO school_day_provider_assignments (school_organization_id,weekday,provider_user_id,is_active,created_by_user_id) VALUES (?,?,?,1,?) ON DUPLICATE KEY UPDATE id=id`,[schoolId,day,providerId,actorId]);
   for(const [index,client] of report.clients.filter(c=>c.type==='school').entries()){
    await db.execute(`INSERT INTO client_provider_assignments (client_id,organization_id,provider_user_id,service_day,is_active,created_by_user_id,updated_by_user_id)
      SELECT ?,?,?,?,1,?,? WHERE NOT EXISTS(SELECT 1 FROM client_provider_assignments WHERE client_id=? AND organization_id=? AND provider_user_id=? AND service_day=?)`,[client.id,schoolId,providerId,day,actorId,actorId,client.id,schoolId,providerId,day]);
    let [[slot]]=await db.execute('SELECT id FROM soft_schedule_slots WHERE school_organization_id=? AND provider_user_id=? AND weekday=? AND client_id=?',[schoolId,providerId,day,client.id]);
    if(!slot){
     const [[next]]=await db.execute('SELECT COALESCE(MAX(slot_index),-1)+1 AS position FROM soft_schedule_slots WHERE school_organization_id=? AND provider_user_id=? AND weekday=?',[schoolId,providerId,day]);
     const start=`${String(9+index).padStart(2,'0')}:00:00`,end=`${String(10+index).padStart(2,'0')}:00:00`;
     const [r]=await db.execute(`INSERT INTO soft_schedule_slots (school_organization_id,weekday,provider_user_id,slot_index,start_time,end_time,client_id,note,created_by_user_id,updated_by_user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,[schoolId,day,providerId,next.position,start,end,client.id,'Synthetic soft-schedule content: preserve this on cancellation.',actorId,actorId]);slot={id:r.insertId};
    }
    report.softSlots.push({id:Number(slot.id),day,clientId:client.id});
   }
  }
  async function event({title,date,start,end,host=providerId,clientId=null,kind='PERSONAL_EVENT',attendees=[]}){
   const [[old]]=await db.execute('SELECT id FROM provider_schedule_events WHERE agency_id=? AND title=?',[agencyId,title]);
   if(old)return Number(old.id);
   const [r]=await db.execute(`INSERT INTO provider_schedule_events (agency_id,provider_id,client_id,kind,title,description,all_day,is_private,start_at,end_at,event_timezone,status,created_by_user_id,updated_by_user_id)
    VALUES (?,?,?,?,?,?,0,0,?,?,'America/Denver','ACTIVE',?,?)`,[agencyId,host,clientId,kind,title,'Synthetic QA content; cancellation must preserve this.',instant(date,start),instant(date,end),actorId,actorId]);
   for(const uid of attendees){
    await db.execute('INSERT INTO provider_schedule_event_attendees (event_id,user_id) VALUES (?,?)',[r.insertId,uid]);
    await db.execute("INSERT INTO meeting_participant_preferences (event_id,user_id,rsvp,rsvp_at) VALUES (?,?,'accepted',UTC_TIMESTAMP())",[r.insertId,uid]);
   }
   return Number(r.insertId);
  }
  for(const date of dates)for(const [index,client] of report.clients.filter(c=>c.type==='clinical').entries()){
   const title=`Cancel day QA ${date} ${client.key}`;
   const [[old]]=await db.execute('SELECT id,status FROM appointments WHERE agency_id=? AND source=? AND title=?',[agencyId,source,title]);
   let id=old?.id;
   if(!id){
    const start=`${14+index}:00`,end=`${14+index}:45`;
    const pse=await event({title,date,start,end,clientId:client.id});
    const [r]=await db.execute(`INSERT INTO appointments (agency_id,provider_user_id,tenant_service_id,start_at,end_at,modality,service_location_id,status,participant_mode,
      provider_schedule_event_id,source,title,service_code,source_timezone,created_by_user_id,updated_by_user_id)
      VALUES (?,?,291,?,?,'IN_PERSON',123,'scheduled','individual',?,?,?,'90834','America/Denver',?,?)`,[agencyId,providerId,instant(date,start),instant(date,end),pse,source,title,actorId,actorId]);id=r.insertId;
    await db.execute("INSERT INTO appointment_participants (appointment_id,role,client_id,display_name,is_billing_responsible,receives_reminders) VALUES (?,'client',?,?,1,1)",[id,client.id,client.name]);
   }
   report.appointments.push({id:Number(id),date,clientId:client.id,case:client.key,status:old?.status||'scheduled'});
  }
  // A booked school occurrence must replace its roster fallback, not generate two family notices.
  const schoolClient=report.clients.find(c=>c.key==='QACDSE'),date=hostedDate,title=`Cancel day QA booked school precedence${scenarioSuffix}`;
  let [[booked]]=await db.execute('SELECT id FROM appointments WHERE agency_id=? AND source=? AND title=?',[agencyId,source,title]);
  if(!booked){
   const pse=await event({title,date,start:'09:00',end:'09:45',clientId:schoolClient.id});
   const [r]=await db.execute(`INSERT INTO appointments (agency_id,provider_user_id,tenant_service_id,start_at,end_at,modality,service_location_id,status,participant_mode,provider_schedule_event_id,source,title,service_code,source_timezone,created_by_user_id,updated_by_user_id)
    VALUES (?,?,291,?,?,'IN_PERSON',125,'scheduled','individual',?,?,?,'90834','America/Denver',?,?)`,[agencyId,providerId,instant(date,'09:00'),instant(date,'09:45'),pse,source,title,actorId,actorId]);booked={id:r.insertId};
   await db.execute("INSERT INTO appointment_participants (appointment_id,role,client_id,display_name,is_billing_responsible,receives_reminders) VALUES (?,'client',?,?,1,1)",[booked.id,schoolClient.id,schoolClient.name]);
  }
  report.appointments.push({id:Number(booked.id),date,clientId:schoolClient.id,case:'EHR school precedence'});
  for(const spec of [
   {title:`Cancel day QA hosted meeting${scenarioSuffix}`,date:hostedDate,start:'13:00',end:'13:30',kind:'TEAM_MEETING',attendees:[1438]},
   {title:`Cancel day QA attended interview RSVP${scenarioSuffix}`,date:rsvpDate,start:'13:00',end:'13:30',host:1438,kind:'TEAM_MEETING',attendees:[providerId]},
   {title:`Cancel day QA personal event content${scenarioSuffix}`,date:rsvpDate,start:'17:00',end:'17:30'}
  ]) report.events.push({id:await event(spec),title:spec.title,date:spec.date});
  const companyTitle=`Cancel day QA company event RSVP${scenarioSuffix}`;
  let [[company]]=await db.execute('SELECT id FROM company_events WHERE agency_id=? AND title=?',[agencyId,companyTitle]);
  if(!company){
   const [r]=await db.execute(`INSERT INTO company_events (agency_id,created_by_user_id,updated_by_user_id,title,starts_at,ends_at,timezone,is_active,rsvp_mode)
    VALUES (?,?,?,?,?,?,'America/Denver',1,'registration')`,[agencyId,actorId,actorId,companyTitle,instant(rsvpDate,'18:00'),instant(rsvpDate,'18:30')]);company={id:r.insertId};
   await db.execute("INSERT INTO company_event_invitations (company_event_id,agency_id,user_id,token,response,responded_at,created_by_user_id) VALUES (?,?,?,?,'yes',UTC_TIMESTAMP(),?)",[company.id,agencyId,providerId,randomUUID(),actorId]);
   await db.execute("INSERT INTO company_event_responses (company_event_id,user_id,response_key,response_label,source) VALUES (?,?,'yes','Attending','in_app')",[company.id,providerId]);
  }
  report.events.push({id:Number(company.id),type:'company',title:companyTitle,date:rsvpDate});
  const supervisionTitle=`Cancel day QA attended supervision${scenarioSuffix}`;
  let [[supervision]]=await db.execute('SELECT id FROM supervision_sessions WHERE agency_id=? AND supervisor_user_id=1438 AND supervisee_user_id=? AND start_at=?',[agencyId,providerId,instant(rsvpDate,'17:30')]);
  if(!supervision){
   const [r]=await db.execute(`INSERT INTO supervision_sessions (agency_id,supervisor_user_id,supervisee_user_id,start_at,end_at,status)
    VALUES (?,1438,?,?,?,'SCHEDULED')`,[agencyId,providerId,instant(rsvpDate,'17:30'),instant(rsvpDate,'18:00')]);supervision={id:r.insertId};
   await db.execute("INSERT INTO supervision_session_attendees (session_id,user_id,participant_role,status) VALUES (?,?,'supervisee','SIGNED_UP')",[supervision.id,providerId]);
  }
  report.events.push({id:Number(supervision.id),type:'supervision',title:supervisionTitle,date:rsvpDate});
  await db.commit();report.applied=true;
  if(manifestArg)await writeFile(manifestArg.slice('--manifest='.length),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({agencyId,applied:true,clients:report.clients.length,appointments:report.appointments.length,softSlots:report.softSlots.length,events:report.events.length,schoolEmail,notificationsSent:0}));
 }
}catch(error){if(apply)await db.rollback();throw error;}
finally{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[`${source}:450`]);await db.end();}
