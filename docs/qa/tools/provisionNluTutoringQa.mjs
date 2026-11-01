// Configuration-only seed. No users, students, appointments, signatures, messages,
// merchant accounts, payment methods or NLU family records are copied.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import mysql from '../../../backend/node_modules/mysql2/promise.js';
import dotenv from '../../../backend/node_modules/dotenv/lib/main.js';
const root=new URL('../../../',import.meta.url);
const envFile=process.env.QA_ENV_FILE || fileURLToPath(new URL('backend/.env',root));
const env=dotenv.parse(fs.readFileSync(envFile));
if(env.DB_NAME!=='onboarding_stage')throw Error('This retained QA seed only supports onboarding_stage.');
const db=await mysql.createConnection({host:process.env.QA_DB_HOST||'127.0.0.1',port:Number(process.env.QA_DB_PORT||3308),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,connectTimeout:8000});
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const marker='nlu-tutoring-qa-20261101';
let locked=false;
try{
 const [[lock]]=await db.execute('SELECT GET_LOCK(?,0) acquired',[marker]);if(!lock?.acquired)throw Error('Another setup is running');locked=true;
 const [[source]]=await db.execute("SELECT id,slug,logo_url,color_palette FROM agencies WHERE id=6 AND slug='nlu'");if(!source)throw Error('Expected NLU source agency6');
 const [existing]=await db.execute("SELECT id,slug,feature_flags FROM agencies WHERE slug IN ('nlu-qa-demo','nlu-qa-learning')");
 if(existing.length){if(existing.length!==2||existing.some(a=>parse(a.feature_flags)?.qaSandbox?.setupMarker!==marker))throw Error('Existing slug belongs to an unexpected/incomplete setup; inspect without overwriting.');console.log(JSON.stringify({alreadyConfigured:true,organizations:existing.map(({id,slug})=>({id,slug}))}));process.exitCode=0;}
 else{
  const [[saved]]=await db.execute('SELECT catalog_json FROM agency_learning_catalogs WHERE agency_id=6');if(!saved)throw Error('NLU catalog unavailable');
  const catalog=structuredClone(parse(saved.catalog_json));
  if(!Array.isArray(catalog.tiers)||!catalog.tiers.find(t=>t.id==='L4'))throw Error('Review NLU catalog version first');
  catalog.packages=[{id:'qa-nlu-1101-virtual-four',name:'SYNTHETIC QA - four virtual tutoring visits',program:'tutoring',published:true,components:[{service:'tutoring',format:'virtual',pricingMode:'provider-discount',discountPercent:10,sessions:4,minutes:60}]},{id:'qa-nlu-1101-in-person-four',name:'SYNTHETIC QA - four in-person tutoring visits',program:'tutoring',published:true,components:[{service:'tutoring',format:'in-person',pricingMode:'provider-discount',discountPercent:10,sessions:4,minutes:60}]}];
  const [forms]=await db.execute("SELECT id,title,language_code,intake_fields,intake_steps FROM intake_links WHERE organization_id=6 AND master_channel='tutoring' AND is_active=1 ORDER BY id LIMIT 3");
  const [services]=await db.execute("SELECT * FROM tenant_services WHERE agency_id=6 AND is_active=1 AND service_code IN ('TUTORING','TUTORING VIRTUAL','TUTORING IN PERSON','HOMEWORK HELP') ORDER BY id");
  const proposal={marker,sourceAgencyId:6,slugs:['nlu-qa-demo','nlu-qa-learning'],tierCount:catalog.tiers.length,packages:catalog.packages.map(p=>p.id),formCount:forms.length,serviceCount:services.length,operatorUserIds:[1435,1434],mailDestination:'testing@itsco.health',newUsers:0,newStudents:0};
  if(!process.argv.includes('--apply'))console.log(JSON.stringify({dryRun:true,...proposal}));
  else{
   await db.beginTransaction();
   const [[operator]]=await db.execute("SELECT id FROM users WHERE id=1435 AND is_demo=1 AND role='admin' AND is_active=1");if(!operator)throw Error('Expected retained setup administrator');
   const flags={standardsLearningEnabled:true,groupClassSessionsEnabled:true,publicProviderFinderEnabled:true,publicAvailabilityEnabled:true,guardianWaiversEnabled:true,medicalBillingEnabled:false,clinicalChartEnabled:false,clinicalNoteSigningEnabled:false,medicalClaimsEnabled:false,googleSsoEnabled:false,sessionRecordingEnabled:false,qaSandbox:{syntheticOnly:true,program:'tutoring',setupMarker:marker,sourceAgencyId:6,inbox:'testing@itsco.health',timezone:'America/Denver',dailyRunEnabled:false}};
   const palette=source.color_palette?JSON.stringify(parse(source.color_palette)):JSON.stringify({primary:'#315c66'});
   const [parent]=await db.execute("INSERT INTO agencies(name,official_name,slug,portal_url,organization_type,is_active,timezone,logo_url,color_palette,feature_flags,support_team_email,onboarding_team_email) VALUES(?,?,?,?,'agency',1,'America/Denver',?,?,?,'testing@itsco.health','testing@itsco.health')",['Next Level Up - SYNTHETIC QA','Next Level Up QA','nlu-qa-demo','nlu-qa-demo',source.logo_url||'https://nextleveluplcc.com/assets/nlu/logo.png',palette,JSON.stringify(flags)]);
   const parentId=parent.insertId;
   const [child]=await db.execute("INSERT INTO agencies(name,slug,portal_url,organization_type,is_active,timezone,logo_url,color_palette,feature_flags,support_team_email) VALUES(?,?,?,'learning',1,'America/Denver',?,?,?,'testing@itsco.health')",['NLU Learning Program - SYNTHETIC QA','nlu-qa-learning','nlu-qa-learning',source.logo_url||'https://nextleveluplcc.com/assets/nlu/logo.png',palette,JSON.stringify({...flags,learningProgramBillingEnabled:true})]);
   const childId=child.insertId;
   await db.execute('INSERT INTO organization_affiliations(agency_id,organization_id,is_active) VALUES(?,?,1)',[parentId,childId]);
   for(const id of [parentId,childId]){
    for(const user of [1435,1434])await db.execute('INSERT INTO user_agencies(user_id,agency_id,is_active,is_default) VALUES(?,?,1,0)',[user,id]);
    for(const [order,type] of ['learning','tutoring'].entries())await db.execute('INSERT INTO agency_business_types(agency_id,business_type,is_enabled,sort_order) VALUES(?,?,1,?)',[id,type,order]);
    await db.execute('INSERT INTO agency_learning_catalogs(agency_id,catalog_json) VALUES(?,?)',[id,JSON.stringify(catalog)]);
   }
   await db.execute("INSERT INTO agency_public_service_types(agency_id,service_type,display_name,intro_blurb,is_enabled,sort_order) VALUES(?,'tutoring','Tutoring - SYNTHETIC QA','Fictional tutoring enrollment and session test; no real openings.',1,0)",[parentId]);
   const serviceIds=[];
   for(const service of services){const [r]=await db.execute(`INSERT INTO tenant_services(agency_id,business_type,name,description,service_code,default_duration_minutes,allows_individual,allows_group,max_participants,modality,price_cents,billing_method,is_publicly_bookable,is_staff_bookable,package_eligible,program_eligible,buffer_before_minutes,buffer_after_minutes,is_active,sort_order) VALUES(?,'tutoring',?,?,?,?,?,?,?,?,?,?,0,1,?,?,0,0,1,?)`,[parentId,`SYNTHETIC QA - ${service.name}`,'Nonclinical synthetic tutoring test service; no live charge authorized.',service.service_code,service.default_duration_minutes,service.allows_individual,service.allows_group,service.max_participants,service.modality,service.price_cents,service.billing_method,service.package_eligible,service.program_eligible,service.sort_order]);serviceIds.push(r.insertId);}
   const formIds=[];
   for(const form of forms){const [r]=await db.execute("INSERT INTO intake_links(public_key,title,language_code,scope_type,form_type,master_channel,organization_id,is_active,create_client,create_guardian,requires_assignment,allowed_document_template_ids,intake_fields,intake_steps,created_by_user_id) VALUES(REPLACE(UUID(),'-',''),?,?,'agency','intake','tutoring',?,1,1,1,1,'[]',?,?,1435)",[`SYNTHETIC QA - ${form.title}`,form.language_code||'en',parentId,JSON.stringify(parse(form.intake_fields)||[]),JSON.stringify(parse(form.intake_steps)||[])]);formIds.push(r.insertId);}
   const metadata={actorSource:'owner_authorized_qa_configuration_setup',marker,sourceAgencyId:6,sourceCatalogHash:digest(parse(saved.catalog_json)),newAgencyId:parentId,newLearningOrgId:childId,serviceIds,formIds,newUsers:0,newStudents:0,mailDestination:'testing@itsco.health',realRecordsCopied:false};
   const [audit]=await db.execute("INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES('qa_tutoring_configuration_created',NULL,?,?)",[parentId,JSON.stringify(metadata)]);
   await db.commit();console.log(JSON.stringify({...proposal,agencyId:parentId,learningOrganizationId:childId,serviceIds,formIds,auditId:audit.insertId}));
  }
 }
}catch(error){await db.rollback();throw error;}finally{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[marker]);await db.end();}
