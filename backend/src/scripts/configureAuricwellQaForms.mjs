// Only modifies the dedicated QA tenant. Copies blank demo form definitions,
// never submissions, staff assignments, recipient lists, or real school records.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import pool from '../config/database.js';
import SchoolMaster from '../models/AgencySchoolIntakeMaster.model.js';
import OfficeMaster from '../models/AgencyOfficeIntakeMaster.model.js';
import SchoolPacket from '../models/SchoolPacketTemplate.model.js';
import OfficePacket from '../models/OfficePacketTemplate.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import OfficeRoom from '../models/OfficeRoom.model.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import { ensureDigitalIntakeFormsForSchool } from '../services/schoolOnboardingIntakeBootstrap.service.js';
import { qaPlan } from './provisionAuricwellQa.mjs';

const receiptPath=fileURLToPath(new URL('../../../secrets/auricwell-qa/credentials.json',import.meta.url));
try {
  if(!process.argv.includes('--apply')) throw new Error('Pass --apply to configure the already-provisioned QA tenant.');
  const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
  const [[agency]]=await pool.execute('SELECT id,slug FROM agencies WHERE id=? AND slug=?',[receipt.agencyId,qaPlan.agencySlug]);
  const [[school]]=await pool.execute('SELECT id,slug FROM agencies WHERE id=? AND slug=?',[receipt.schoolId,qaPlan.schoolSlug]);
  const [[source]]=await pool.execute('SELECT id FROM agencies WHERE slug=\'demo\'');
  if(!agency||!school||!source||source.id===agency.id) throw new Error('Expected isolated QA agency, school, and template source are required.');
  const [members]=await pool.execute('SELECT u.id,u.is_demo,u.email FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? AND ua.is_active=1',[agency.id]);
  const expected=new Set(receipt.accounts.map(a=>a.userId));
  if(members.length!==expected.size||members.some(u=>!expected.has(u.id)||!u.is_demo||!u.email.endsWith('@example.com'))) throw new Error('Unexpected QA membership; refusing setup.');
  const actor=receipt.accounts.find(a=>a.key==='setup').userId;
  const provider=receipt.accounts.find(a=>a.key==='provider').userId;
  const links=[];
  for(const languageCode of ['en','es']) {
    for(const [kind,Model] of [['school',SchoolMaster],['office',OfficeMaster]]) {
      let master=await Model.findByAgencyLanguage(agency.id,languageCode);
      if(!master) {
        const original=await Model.findByAgencyLanguage(source.id,languageCode);
        if(!original) throw new Error(`Demo ${kind} ${languageCode} master is unavailable.`);
        master=await Model.upsertContent({agencyId:agency.id,languageCode,title:`AuricWell QA DEMO ${kind} ${languageCode.toUpperCase()}`,intakeSteps:original.intake_steps,intakeFields:original.intake_fields,actorUserId:actor,bumpVersion:false});
      }
      if(kind==='office') {
        const link=await IntakeLink.findById(master.published_intake_link_id);
        links.push({scenario:`office-${languageCode}`,id:link.id,publicKey:link.public_key});
      }
    }
    await SchoolPacket.getOrCreateForAgency(agency.id,{locale:languageCode});
    await OfficePacket.getOrCreateForAgency(agency.id,{locale:languageCode});
  }
  const forms=await ensureDigitalIntakeFormsForSchool({agencyId:agency.id,schoolOrganizationId:school.id,schoolName:qaPlan.schoolName,createdByUserId:actor,onlyIfMissing:true,reuseSourcePublicKey:false});
  if(forms.errors?.length) throw new Error('School intake bootstrap reported errors; inspect tenant setup before continuing.');
  for(const lang of ['en','es']) {
    const form=forms[lang];
    if(!form?.publicKey) throw new Error(`School ${lang} published link missing.`);
    links.push({scenario:`school-${lang}`,id:form.id,publicKey:form.publicKey});
  }
  await pool.execute(`UPDATE agencies SET feature_flags=JSON_SET(COALESCE(feature_flags,JSON_OBJECT()),'$.qaSandbox.exchangeProviderUserId',?,'$.qaSandbox.notificationGuardDeploymentRequired',true) WHERE id=? AND slug=?`,[provider,agency.id,qaPlan.agencySlug]);
  // Capacity must subsequently be published by the provider bot, through the UI.
  for(const day of ['Monday','Tuesday','Wednesday','Thursday','Friday']) {
    const [[exists]]=await pool.execute('SELECT id FROM provider_school_assignments WHERE provider_user_id=? AND school_organization_id=? AND day_of_week=?',[provider,school.id,day]);
    if(!exists) await pool.execute('INSERT INTO provider_school_assignments (provider_user_id,school_organization_id,day_of_week,is_active) VALUES (?,?,?,1)',[provider,school.id,day]);
  }
  const locations=await OfficeLocation.findByAgency(agency.id);
  let office=locations.find(l=>l.name==='Cedar Grove Counseling Office — DEMO');
  if(!office) office=await OfficeLocation.create({agencyId:agency.id,name:'Cedar Grove Counseling Office — DEMO',timezone:qaPlan.timezone});
  const [rooms]=await pool.execute('SELECT id,name FROM office_rooms WHERE location_id=?',[office.id]);
  let room=rooms.find(r=>r.name==='QA Counseling Room 1');
  if(!room) room=await OfficeRoom.create({locationId:office.id,name:'QA Counseling Room 1',roomNumber:101,label:'Fictional QA room'});
  await OfficeRoom.update(room.id,{room_number:101,label:'Fictional QA room'});
  await ProviderPublicProfile.upsertForProvider({providerUserId:provider,
    publicBlurb:'Fictional bilingual QA provider. Automated testing only; not available for actual care.',
    details:{languages:['English','Spanish'],locations:['Cedar Grove K-8 — DEMO','Cedar Grove Counseling Office — DEMO']},
    acceptingNewClientsOverride:true});
  receipt.office={locationId:office.id,roomId:room.id,name:office.name};
  receipt.intakeLinks=links;
  fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({configured:true,agencyId:agency.id,schoolId:school.id,links,messagesSent:0,dailyScheduleEnabled:false}));
}catch(error){console.error('QA form setup failed:',error.code||error.message);process.exitCode=1;}
finally{await pool.end();}
