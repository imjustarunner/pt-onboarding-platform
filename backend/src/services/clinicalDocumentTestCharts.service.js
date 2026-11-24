import dbPool from '../config/database.js';
import Client from '../models/Client.model.js';
import { isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';
import { requireStaffCareEligibility } from './staffCareEligibility.service.js';

const agencyId=450;
const bad=(status,message)=>Object.assign(new Error(message),{status});
const providerRoles=new Set(['provider','provider_plus','supervisor','intern','intern_plus']);
const examples=[
  {suffix:'ADULT',name:'Jamie Alder · QA signature',initials:'JA',birthday:'1992-03-14'},
  {suffix:'OLDER',name:'Quinn Alder · QA assessment',initials:'QA',birthday:'2015-06-09'},
  {suffix:'YOUNGER',name:'Robin Alder · QA assessment',initials:'RA',birthday:'2018-09-26'}
];

async function ensureGuardian(db,actorId,slot,firstName) {
  const email='qa.document.'+actorId+'.'+slot+'@example.com';
  const [[existing]]=await db.execute('SELECT id,role,is_demo FROM users WHERE LOWER(email)=? FOR UPDATE',[email]);
  if(existing&&(existing.role!=='client_guardian'||Number(existing.is_demo)!==1))
    throw bad(409,'A test guardian address is already used by a different account.');
  let id=existing?.id;
  if(!id){
    const [result]=await db.execute(`INSERT INTO users(email,first_name,last_name,role,status,is_active,is_demo,created_via_dev_fill)
      VALUES(?,?,'Alder QA','client_guardian','PENDING_SETUP',1,1,1)`,[email,firstName]);
    id=result.insertId;
    await db.execute('INSERT INTO user_agencies(user_id,agency_id,is_active) VALUES(?,?,1)',[id,agencyId]);
  }
  const [[membership]]=await db.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[id,agencyId]);
  if(!membership)throw bad(409,'Review the test guardian’s access in the QA agency.');
  return id;
}

export async function createClinicalDocumentTestCharts(user) {
  const actorId=Number(user?.id);
  if(!Number.isSafeInteger(actorId)||actorId<1||!providerRoles.has(user.role)||user.demoMode||user.switchedFromUserId)
    throw bad(403,'Use your own signed-in QA provider account to create test charts.');
  const db=await dbPool.getConnection();
  const lock='qa-document-charts:'+actorId;
  let locked=false;
  try {
    const [[gate]]=await db.execute('SELECT GET_LOCK(?,5) AS acquired',[lock]);
    if(!(locked=Number(gate?.acquired)===1))throw bad(409,'Fixture creation is busy. Try again.');
    const [[agency]]=await db.execute(`SELECT a.id,a.slug,a.feature_flags FROM agencies a
      JOIN user_agencies ua ON ua.agency_id=a.id AND ua.user_id=? AND ua.is_active=1
      WHERE a.id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`,[actorId,agencyId]);
    if(!isAuricwellQaAgency(agency))throw bad(403,'The AuricWell QA agency and an active provider membership are required.');
    await requireStaffCareEligibility(actorId,agencyId);
    await db.beginTransaction();
    const guardians=[await ensureGuardian(db,actorId,'parent-a','Dana'),await ensureGuardian(db,actorId,'parent-b','Cameron')];
    const charts=[];
    for(const example of examples){
      const identifier='AWQ-DOC-'+actorId+'-'+example.suffix;
      const [[existing]]=await db.execute('SELECT id,is_demo,created_by_user_id,provider_id,status FROM clients WHERE agency_id=? AND identifier_code=? FOR UPDATE',[agencyId,identifier]);
      if(existing&&(Number(existing.is_demo)!==1||Number(existing.created_by_user_id)!==actorId||
        Number(existing.provider_id)!==actorId||String(existing.status).toUpperCase()==='ARCHIVED'))
        throw bad(409,'Review the existing test chart before creating another fixture.');
      let id=existing?.id;
      if(!id){
        const isAdult=example.suffix==='ADULT';
        const chart=await Client.create({organization_id:agencyId,agency_id:agencyId,initials:example.initials,
          full_name:example.name,date_of_birth:example.birthday,status:'ACTIVE',source:'ADMIN_CREATED',
          submission_date:new Date().toISOString().slice(0,10),created_by_user_id:actorId,
          client_type:'clinical',identifier_code:identifier,is_demo:true,guardian_portal_enabled:!isAdult},{executor:db,hydrate:false});
        id=chart.id;
        await db.execute('UPDATE clients SET provider_id=?,email=? WHERE id=? AND agency_id=?',
          [actorId,isAdult?'qa.document.'+actorId+'.adult@example.com':null,id,agencyId]);
        await db.execute(`INSERT INTO client_provider_assignments(client_id,organization_id,provider_user_id,created_by_user_id,updated_by_user_id)
          VALUES(?,?,?,?,?)`,[id,agencyId,actorId,actorId,actorId]);
        if(!isAdult){
          for(const guardian of guardians)await db.execute(`INSERT INTO client_guardians
            (client_id,guardian_user_id,relationship_type,relationship_title,access_enabled,permissions_json,created_by_user_id)
            VALUES(?,?,'parent','QA Parent',1,?,?)`,[id,guardian,JSON.stringify({enrollmentAccessConfirmed:true,canViewDocs:true,canSignDocs:true}),actorId]);
        }
      }
      charts.push({id,name:example.name});
    }
    await db.commit();
    return {charts};
  }catch(error){await db.rollback();throw error;}
  finally{try{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{db.release();}}
}
