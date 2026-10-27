// Explicit owner-run fixture configuration. No insurance transmissions or card charges.
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {isAuricwellQaAgency,allowQaExchangeRecipient} from '../utils/auricwellQaPolicy.js';
const args=process.argv.slice(2);
const plan={agencyId:450,providers:[1433,1438,1439],selfPayOnly:true,sessionRateCents:12000,lateCancelCents:8000,noShowCents:10000,noticeHours:24,createsClients:false};
if(!args.includes('--apply'))console.log(JSON.stringify(plan));
else {
 if(!args.includes('--env'))throw Error('Provide an explicit --env path.');
 dotenv.config({path:args[args.indexOf('--env')+1],quiet:true});
 const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
 try {
  await db.beginTransaction();
  const [[agency]]=await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=450 FOR UPDATE');
  if(!isAuricwellQaAgency(agency))throw Error('Expected isolated QA agency.');
  const [providers]=await db.execute(`SELECT u.id,u.email,u.role,u.is_demo FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=450 AND ua.is_active=1 WHERE u.id IN (1433,1438,1439) AND u.is_active=1`);
  if(providers.length!==3||providers.some(p=>!allowQaExchangeRecipient(agency,p)))throw Error('Unexpected provider roster.');
  const [[count]]=await db.execute('SELECT COUNT(*) AS n FROM clients WHERE agency_id=450');
  if(count.n>30)throw Error('Population cap exceeded.');
  await db.execute(`INSERT INTO agency_self_pay_settings(agency_id,self_pay_only,updated_by_user_id) VALUES(450,1,1435) ON DUPLICATE KEY UPDATE self_pay_only=1,updated_by_user_id=1435`);
  let [[service]]=await db.execute("SELECT id FROM tenant_services WHERE agency_id=450 AND name='Individual counseling — DEMO' FOR UPDATE");
  if(!service){const [result]=await db.execute(`INSERT INTO tenant_services(agency_id,business_type,name,description,default_duration_minutes,modality,price_cents,billing_method,is_publicly_bookable,is_staff_bookable,min_notice_hours,max_advance_days) VALUES(450,'mental_health','Individual counseling — DEMO','Synthetic $120 session. Demo balances only; no card collection or insurance submission.',60,'EITHER',12000,'self_pay',1,1,0,90)`);service={id:result.insertId};}
  await db.execute(`INSERT INTO self_pay_service_rates(agency_id,tenant_service_id,provider_user_id,rate_cents,rate_unit,updated_by_user_id) VALUES(450,?,0,12000,'session',1435) ON DUPLICATE KEY UPDATE rate_cents=12000,rate_unit='session',updated_by_user_id=1435`,[service.id]);
  let [[policy]]=await db.execute("SELECT id FROM booking_cancellation_policies WHERE agency_id=450 AND name='Demo attendance policy — 2026-10-27' FOR UPDATE");
  if(!policy){const [result]=await db.execute(`INSERT INTO booking_cancellation_policies(agency_id,name,description,scope_level,notice_hours,late_fee_cents,no_show_fee_cents,late_package_action,allow_client_cancel,require_reason,created_by_user_id) VALUES(450,'Demo attendance policy — 2026-10-27','Synthetic bookings: no fee at least 24 hours before start; $80 late cancellation under 24 hours; $100 no-show. Review and acknowledge before booking. No card collection.','tenant',24,8000,10000,'release',1,1,1435)`);policy={id:result.insertId};}
  await db.execute('UPDATE tenant_services SET cancellation_policy_id=? WHERE id=? AND agency_id=450',[policy.id,service.id]);
  const fields=[['provider_credential_license_type_number','License type and number'],['education_history','Graduate education']];
  const fieldIds={};
  for(const [key,label]of fields){await db.execute(`INSERT INTO user_info_field_definitions(field_key,field_label,field_type,agency_id,created_by_user_id) VALUES(?,?,'text',450,1435) ON DUPLICATE KEY UPDATE field_label=VALUES(field_label)`,[key,label]);const [[f]]=await db.execute('SELECT id FROM user_info_field_definitions WHERE agency_id=450 AND field_key=?',[key]);fieldIds[key]=f.id;}
  for(const p of providers){
   const credential=p.id===1439?'LPCC':'LPC';
   await db.execute('UPDATE users SET credential=? WHERE id=? AND is_demo=1',[credential,p.id]);
   for(const [key,value]of Object.entries({provider_credential_license_type_number:`${credential} — QA-${p.id} (synthetic; not a real license)`,education_history:`Master of Arts in Counseling — Cedar Grove Demonstration University, ${p.id===1439?'2025':'2018'} (synthetic)`}))await db.execute('INSERT INTO user_info_values(user_id,field_definition_id,value) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)',[p.id,fieldIds[key],value]);
   await db.execute('INSERT INTO staff_service_assignments(agency_id,tenant_service_id,user_id,is_active) VALUES(450,?,?,1) ON DUPLICATE KEY UPDATE is_active=1',[service.id,p.id]);
   await db.execute(`INSERT INTO provider_public_profiles(user_id,public_blurb,public_details_json,self_pay_rate_cents,self_pay_rate_note,accepting_new_clients_override) VALUES(?,'Synthetic counseling provider for the isolated QA organization.',JSON_OBJECT(),12000,'Demo balance only',1) ON DUPLICATE KEY UPDATE self_pay_rate_cents=12000,self_pay_rate_note='Demo balance only'`,[p.id]);
   const policy={seesClients:true,acceptingNewClients:true,virtual:true,inPerson:true,school:p.id===1433,waitlistEnabled:true,scheduleAgencyId:450};
   await db.execute(`UPDATE provider_public_profiles SET public_details_json=JSON_SET(COALESCE(public_details_json,JSON_OBJECT()),'$.availabilityByAgency."450"',CAST(? AS JSON),'$.serviceOfferingsByAgency."450"',JSON_ARRAY('counseling'),'$.languages',JSON_ARRAY('English','Spanish'),'$.sessionFormats',JSON_ARRAY('Individual','Family')) WHERE user_id=?`,[JSON.stringify(policy),p.id]);
  }
  let flags=typeof agency.feature_flags==='string'?JSON.parse(agency.feature_flags):agency.feature_flags;
  // Required by chart/signing routes. The synthetic clearinghouse guard still denies every transmission.
  flags.medicalBillingEnabled=true;
  const current=flags.clientSessionBookingRollout||{revision:0,entries:[],history:[]};
  const now=new Date().toISOString(),note='Owner authorized isolated self-pay demo scheduling; no external claims or card collection.';
  flags.clientSessionBookingRollout={revision:current.revision+1,entries:[...(current.entries||[]).filter(e=>!plan.providers.includes(Number(e.providerUserId))),...plan.providers.map(providerUserId=>({providerUserId,enabled:true,note,updatedByUserId:1435,updatedAt:now}))],history:[...(current.history||[]),{providerUserIds:plan.providers,enabled:true,note,updatedByUserId:1435,updatedAt:now}]};
  await db.execute('UPDATE agencies SET feature_flags=?,public_availability_enabled=1 WHERE id=450',[JSON.stringify(flags)]);
  await db.commit();console.log(JSON.stringify({...plan,applied:true,tenantServiceId:service.id,cancellationPolicyId:policy.id,clients:count.n}));
 }catch(e){await db.rollback();throw e;}finally{await db.end();}
}
