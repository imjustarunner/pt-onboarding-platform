// Explicit, demo-only QA fixtures. Does not opt in, assign clients, or send.
import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isAuricwellQaAgency } from '../backend/src/utils/auricwellQaPolicy.js';

const QA_AGENCY = 450, SCHOOL = 451, GUARDIAN = 1437, ACTOR = 1435;
export const STAFF = Object.freeze([
  [1433,'qa.provider.auricwell@example.com'],[1434,'qa.support.auricwell@example.com'],
  [1435,'qa.setup.auricwell@example.com'],[1438,'qa.provider.supervisor.auricwell@example.com'],
  [1439,'qa.provider.supervisee.auricwell@example.com'],[1453,'qa.biller.auricwell@example.com'],
  [1454,'qa.inactive.auricwell@example.com'],[1455,'qa.expired-password.auricwell@example.com']
]);
export const CONTACT_FIXTURES = Object.freeze([
  {marker:'QACONTACT-INITIAL-1031',initials:'QACINI',name:'Ari QA Contact Initial — SYNTHETIC',dob:'2016-01-15'},
  {marker:'QACONTACT-SSO-1031',initials:'QACSSO',name:'Sky QA Contact SSO — SYNTHETIC',dob:'2015-02-16'}
]);
export const SSO_EMAIL = 'qa-inbox@itsco.health';
export const provisionPlan = Object.freeze({agencyId:QA_AGENCY,schoolId:SCHOOL,guardianUserId:GUARDIAN,
  providerEmail:SSO_EMAIL,clientMarkers:CONTACT_FIXTURES.map(f=>f.marker),
  providerGoogleSso:true,requiredRoles:['provider'],clientCap:30,providerCap:10,
  sendsMessages:false,enablesContactPlans:false,assignsClients:false,changesExistingPasswords:false,
  grantsVerifiedLicenses:false,createsGoogleAccounts:false,enablesSms:false});
const fail=message=>new Error(message);
const json=value=>typeof value==='string'?JSON.parse(value):value || {};
const lower=value=>String(value||'').trim().toLowerCase();
const bool=value=>value===true || Number(value)===1;
const expectedStaff=new Map(STAFF);

function verifySsoMemberships(rows) {
  const agency=rows.filter(r=>Number(r.agency_id)===QA_AGENCY);
  const school=rows.filter(r=>Number(r.agency_id)===SCHOOL);
  if(agency.length!==1 || !bool(agency[0].is_active) || !bool(agency[0].is_default)
    || school.length>1 || school.some(r=>!bool(r.is_active)||bool(r.is_default))
    || rows.some(r=>![QA_AGENCY,SCHOOL].includes(Number(r.agency_id))))
    throw fail('Unexpected SSO fixture organization membership.');
  return school.length===1;
}

function verifyMemberships(rows, ids, {sole=false}={}) {
  for(const id of ids){
    const memberships=rows.filter(row=>Number(row.user_id)===Number(id));
    if(!memberships.some(row=>Number(row.agency_id)===QA_AGENCY && bool(row.is_active))
      || memberships.some(row=>!(sole?[QA_AGENCY]:[QA_AGENCY,SCHOOL,452]).includes(Number(row.agency_id))))
      throw fail('Unexpected QA account organization membership.');
  }
}

export async function provision(db,{passwordHash}={}) {
  await db.beginTransaction();
  try {
    const [[agency]]=await db.execute('SELECT id,slug,feature_flags,is_active,is_archived FROM agencies WHERE id=450 FOR UPDATE');
    if(!isAuricwellQaAgency(agency) || !bool(agency.is_active) || bool(agency.is_archived)) throw fail('Expected active isolated synthetic demo agency 450.');
    const flags=structuredClone(json(agency.feature_flags));
    const allowedDomains=flags.googleSsoAllowedDomains;
    if(allowedDomains!=null && !Array.isArray(allowedDomains)) throw fail('Existing Google domain restrictions require review.');
    if(Array.isArray(allowedDomains) && allowedDomains.length && !allowedDomains.map(lower).includes('itsco.health')) throw fail('Existing Google domain restrictions require review.');
    const [[school]]=await db.execute(`SELECT s.id,s.slug,s.organization_type FROM agencies s
      JOIN organization_affiliations oa ON oa.organization_id=s.id AND oa.agency_id=450 AND oa.is_active=1
      WHERE s.id=451 AND s.slug='auricwell-qa-demo-school' AND s.organization_type='school'
        AND s.is_active=1 AND COALESCE(s.is_archived,0)=0`);
    if(!school) throw fail('Expected the affiliated synthetic Cedar Grove school.');
    const [staff]=await db.execute(`SELECT id,email,is_demo,sso_password_override FROM users WHERE id IN(1433,1434,1435,1438,1439,1453,1454,1455) FOR UPDATE`);
    if(staff.length!==STAFF.length || new Set(staff.map(u=>Number(u.id))).size!==STAFF.length
      || staff.some(u=>lower(u.email)!==expectedStaff.get(Number(u.id)) || !bool(u.is_demo))) throw fail('Unexpected existing QA staff identity.');
    const [staffMemberships]=await db.execute('SELECT user_id,agency_id,is_active FROM user_agencies WHERE user_id IN(1433,1434,1435,1438,1439,1453,1454,1455)');
    verifyMemberships(staffMemberships,STAFF.map(([id])=>id));
    // The original retained synthetic guardian has is_demo=0. Its exact identity
    // and sole demo membership are owner-confirmed; do not change the account.
    const [[guardian]]=await db.execute('SELECT id,email,personal_email,first_name,last_name,role,is_active,is_archived FROM users WHERE id=1437');
    if(!guardian || lower(guardian.email)!=='testing@itsco.health' || lower(guardian.personal_email)!=='testing@itsco.health'
      || guardian.first_name!=='Jordan' || guardian.last_name!=='QA-SchoolEN-1025' || guardian.role!=='client_guardian'
      || !bool(guardian.is_active) || bool(guardian.is_archived)) throw fail('Expected the retained synthetic testing guardian.');
    const [guardianMemberships]=await db.execute('SELECT user_id,agency_id,is_active FROM user_agencies WHERE user_id=1437');
    verifyMemberships(guardianMemberships,[GUARDIAN],{sole:true});
    const [averyAssignments]=await db.execute('SELECT id,day_of_week,start_time,end_time,slots_total,is_active FROM provider_school_assignments WHERE provider_user_id=1433 AND school_organization_id=451 AND is_active=1');
    const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday'];
    if(averyAssignments.length!==5 || new Set(averyAssignments.map(a=>a.day_of_week)).size!==5
      || averyAssignments.some(a=>!weekdays.includes(a.day_of_week) || String(a.start_time).slice(0,5)!=='09:00'
        || String(a.end_time).slice(0,5)!=='13:00' || Number(a.slots_total)!==4)) throw fail('Avery’s known school assignment changed; review before provisioning.');
    const [existingUsers]=await db.execute(`SELECT id,email,username,work_email,personal_email,first_name,last_name,role,is_demo,is_active,is_archived,
      credential,sso_password_override,has_supervisor_privileges,login_is_group_email FROM users
      WHERE LOWER(email)=? OR LOWER(username)=? OR LOWER(work_email)=? OR LOWER(personal_email)=?`,[SSO_EMAIL,SSO_EMAIL,SSO_EMAIL,SSO_EMAIL]);
    if(existingUsers.length>1) throw fail('The SSO email collides with multiple app identities.');
    let provider=existingUsers[0] || null;
    if(provider){
      if(lower(provider.email)!==SSO_EMAIL || lower(provider.username)!==SSO_EMAIL || provider.role!=='provider'
        || bool(provider.is_demo) || !bool(provider.is_active) || bool(provider.is_archived)
        || bool(provider.sso_password_override) || bool(provider.has_supervisor_privileges) || bool(provider.login_is_group_email)
        || lower(provider.work_email)!==SSO_EMAIL || lower(provider.personal_email)!==SSO_EMAIL
        || String(provider.credential||'').trim() || provider.first_name!=='Quality' || provider.last_name!=='Tester QA SSO') throw fail('The existing SSO email is not the prepared real Google QA fixture.');
    }
    const [ssoMemberships]=provider
      ? await db.execute('SELECT user_id,agency_id,is_active,is_default FROM user_agencies WHERE user_id=?',[provider.id])
      : [[]];
    const hasSchoolMembership=provider?verifySsoMemberships(ssoMemberships):false;
    // Requiring Google for the provider role must not lock out an unknown user.
    // Existing known QA accounts keep their explicit password exceptions.
    const [providerRoster]=await db.execute(`SELECT DISTINCT u.id FROM users u
      JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=450 AND ua.is_active=1
      WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0
        AND u.role IN('provider','provider_plus','supervisor','intern','intern_plus')`);
    const expectedProviderIds=[1433,1438,1439,...(provider?[Number(provider.id)]:[])];
    if(providerRoster.length!==expectedProviderIds.length
      || new Set(providerRoster.map(u=>Number(u.id))).size!==expectedProviderIds.length
      || providerRoster.some(u=>!expectedProviderIds.includes(Number(u.id))))
      throw fail('The active demo provider roster changed; review SSO scope before provisioning.');
    const markers=CONTACT_FIXTURES.map(f=>f.marker);
    const [existingClients]=await db.execute('SELECT id,agency_id,organization_id,identifier_code,is_demo,client_type,provider_id,status FROM clients WHERE identifier_code IN(?,?)',markers);
    for(const client of existingClients){
      if(Number(client.agency_id)!==QA_AGENCY || Number(client.organization_id)!==SCHOOL || !bool(client.is_demo)
        || client.client_type!=='school' || client.status==='ARCHIVED') throw fail('A contact client marker collides with an unexpected record.');
    }
    if(new Set(existingClients.map(c=>c.identifier_code)).size!==existingClients.length) throw fail('Duplicate contact client marker.');
    const [[counts]]=await db.execute(`SELECT
      (SELECT COUNT(*) FROM clients WHERE agency_id=450 AND status<>'ARCHIVED') AS clients,
      (SELECT COUNT(DISTINCT u.id) FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=450 AND ua.is_active=1
        WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.role IN('provider','provider_plus','supervisor','intern','intern_plus')) AS providers`);
    const newClientCount=CONTACT_FIXTURES.length-existingClients.length;
    if(Number(counts.clients)+newClientCount>30 || Number(counts.providers)+(provider?0:1)>10) throw fail('QA population cap would be exceeded.');
    if(!provider){
      if(!/^\$2[aby]\$(?:1[2-9]|2\d|3[01])\$[./A-Za-z0-9]{53}$/.test(String(passwordHash||''))) throw fail('A strong random bcrypt hash is required for the new real Google QA fixture.');
      const [created]=await db.execute(`INSERT INTO users
        (email,username,work_email,personal_email,first_name,last_name,role,status,is_active,is_demo,created_via_dev_fill,
         password_hash,identity_product,timezone,sso_password_override,login_is_group_email,has_supervisor_privileges,sees_clients,provider_accepting_new_clients)
        VALUES(?,?,?,?,'Quality','Tester QA SSO','provider','ACTIVE_EMPLOYEE',1,0,0,?,'full_suite','America/Denver',0,0,0,1,0)`,
      [SSO_EMAIL,SSO_EMAIL,SSO_EMAIL,SSO_EMAIL,passwordHash]);
      provider={id:Number(created.insertId)};
      await db.execute("INSERT INTO user_agencies(user_id,agency_id,is_active,is_default,agency_role) VALUES(?,450,1,1,'provider')",[provider.id]);
      await db.execute("INSERT INTO user_preferences(user_id,timezone,sms_enabled,sms_forwarding_enabled,sms_support_mirror_enabled) VALUES(?,'America/Denver',0,0,0)",[provider.id]);
    }
    if(!hasSchoolMembership) await db.execute("INSERT INTO user_agencies(user_id,agency_id,is_active,is_default,agency_role) VALUES(?,451,1,0,'provider')",[provider.id]);
    const [schoolAssignments]=await db.execute('SELECT id,school_organization_id,day_of_week,start_time,end_time,slots_total,is_active FROM provider_school_assignments WHERE provider_user_id=?',[provider.id]);
    if(schoolAssignments.some(a=>Number(a.school_organization_id)!==SCHOOL || a.day_of_week!=='Tuesday'
      || String(a.start_time).slice(0,5)!=='09:00' || String(a.end_time).slice(0,5)!=='13:00' || Number(a.slots_total)!==1 || !bool(a.is_active))
      || schoolAssignments.length>1) throw fail('The SSO provider school assignment changed; preserve it for review.');
    let assignmentId=schoolAssignments[0]?.id;
    if(!assignmentId){
      const [assignment]=await db.execute(`INSERT INTO provider_school_assignments
        (provider_user_id,school_organization_id,day_of_week,start_time,end_time,slots_total,slots_available,is_active)
        VALUES(?,451,'Tuesday','09:00:00','13:00:00',1,1,1)`,[provider.id]);
      assignmentId=Number(assignment.insertId);
    }
    const clients=[];
    for(const definition of CONTACT_FIXTURES){
      let client=existingClients.find(c=>c.identifier_code===definition.marker);
      if(!client){
        const [created]=await db.execute(`INSERT INTO clients
          (organization_id,agency_id,provider_id,initials,identifier_code,full_name,date_of_birth,status,submission_date,
           document_status,client_type,source,is_demo,created_via_dev_fill,created_by_user_id,guardian_portal_enabled,
           client_status_id,paperwork_status_id,insurance_type_id,session_email_opt_in,session_sms_opt_in,session_phone_opt_in,cleared_to_start,
           internal_notes,preferred_language,primary_client_language,primary_parent_language)
          VALUES(451,450,NULL,?,?,?,?,'PENDING_REVIEW',UTC_DATE(),'NONE','school','ADMIN_CREATED',1,0,1435,1,NULL,NULL,NULL,1,0,0,0,
            'Explicit synthetic contact-plan QA fixture; no enrollment, legal rights verification, signed documents or clinical care has been completed.','English','English','English')`,
        [definition.initials,definition.marker,definition.name,definition.dob]);
        client={id:Number(created.insertId),identifier_code:definition.marker,provider_id:null};
        await db.execute('INSERT INTO client_agency_assignments(client_id,agency_id,is_primary,is_active) VALUES(?,450,1,1)',[client.id]);
        await db.execute('INSERT INTO client_organization_assignments(client_id,organization_id,is_primary,is_active) VALUES(?,451,1,1)',[client.id]);
        await db.execute(`INSERT INTO client_guardians(client_id,guardian_user_id,relationship_type,relationship_title,access_enabled,permissions_json,created_by_user_id)
          VALUES(?,1437,'guardian','Parent (synthetic QA)',1,?,1435)`,[client.id,JSON.stringify({canMessage:true,canSignDocs:false,canViewDocs:false,canViewLinks:false,canViewProgress:false,canViewProgramMaterials:false})]);
      } else {
        const [links]=await db.execute('SELECT guardian_user_id,relationship_type,access_enabled FROM client_guardians WHERE client_id=?',[client.id]);
        if(links.length!==1 || Number(links[0].guardian_user_id)!==GUARDIAN || links[0].relationship_type!=='guardian' || !bool(links[0].access_enabled)) throw fail('An existing fixture guardian link changed; review instead of replacing it.');
        const [memberships]=await db.execute('SELECT agency_id,is_active FROM client_agency_assignments WHERE client_id=?',[client.id]);
        if(!memberships.some(m=>Number(m.agency_id)===QA_AGENCY&&bool(m.is_active)) || memberships.some(m=>Number(m.agency_id)!==QA_AGENCY)) throw fail('An existing client has unexpected agency membership.');
        const [organizations]=await db.execute('SELECT organization_id,is_active FROM client_organization_assignments WHERE client_id=?',[client.id]);
        if(!organizations.some(o=>Number(o.organization_id)===SCHOOL&&bool(o.is_active)) || organizations.some(o=>Number(o.organization_id)!==SCHOOL)) throw fail('An existing client has unexpected school membership.');
      }
      const [assignments]=await db.execute('SELECT id FROM client_provider_assignments WHERE client_id=? AND is_active=1',[client.id]);
      clients.push({id:Number(client.id),marker:definition.marker,unassigned:!client.provider_id&&!assignments.length});
    }
    for(const user of staff) if(!bool(user.sso_password_override)) await db.execute('UPDATE users SET sso_password_override=1 WHERE id=? AND email=? AND is_demo=1',[user.id,expectedStaff.get(Number(user.id))]);
    flags.googleSsoEnabled=true;
    flags.googleSsoRequiredRoles=['provider'];
    if(!allowedDomains?.length) flags.googleSsoAllowedDomains=['itsco.health'];
    if(JSON.stringify(flags)!==JSON.stringify(json(agency.feature_flags))) await db.execute('UPDATE agencies SET feature_flags=? WHERE id=450',[JSON.stringify(flags)]);
    const [plans]=await db.execute('SELECT provider_user_id,status FROM school_provider_contact_plans WHERE agency_id=450 AND provider_user_id IN(1433,?)',[provider.id]);
    await db.commit();
    return {...provisionPlan,applied:true,ssoProviderUserId:Number(provider.id),ssoSchoolAssignmentId:Number(assignmentId),
      averySchoolAssigned:true,averyPlanStatus:plans.find(p=>Number(p.provider_user_id)===1433)?.status||'unconfigured',
      ssoPlanStatus:plans.find(p=>Number(p.provider_user_id)===Number(provider.id))?.status||'unconfigured',clients,
      counts:{clients:Number(counts.clients)+newClientCount,providers:Number(counts.providers)+(existingUsers.length?0:1)}};
  } catch(error){await db.rollback();throw error;}
}

async function main(){
  const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
  if(!args.includes('--apply')){console.log(JSON.stringify(provisionPlan));return;}
  if(!args.includes('--env')||!arg('--env')||!args.includes('--host')||!arg('--host')||!args.includes('--port')||!arg('--port')) throw fail('Provide explicit --env, --host and --port with --apply.');
  const port=Number(arg('--port'));
  if(!Number.isSafeInteger(port)||port<1||port>65535||arg('--host').startsWith('--')||arg('--env').startsWith('--')) throw fail('Provide a valid explicit environment path, host, and TCP port.');
  const require=createRequire(new URL('../backend/package.json',import.meta.url));
  require('dotenv').config({path:arg('--env'),quiet:true});
  const mysql=require('mysql2/promise'),bcrypt=require('bcrypt');
  const db=await mysql.createConnection({host:arg('--host'),port,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,timezone:'Z',connectTimeout:10000});
  try{console.log(JSON.stringify(await provision(db,{passwordHash:await bcrypt.hash(crypto.randomBytes(48).toString('base64url'),12)})));}
  finally{await db.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{console.error('Contact QA provisioning failed:',error.code||error.message);process.exitCode=1;});
