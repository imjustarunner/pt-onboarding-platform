import pool from '../config/database.js';
import { queueStaffSmsEnrollment, verifySavedStaffSignature } from '../services/staffSmsEnrollmentBridge.service.js';
const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1];
const agencyId=Number(value('--agency-id')),apply=args.includes('--apply');
if(!Number.isSafeInteger(agencyId)||agencyId<1)throw Error('--agency-id is required; default is dry run. --apply queues existing signatures without sending.');
const parse=v=>typeof v==='string'?JSON.parse(v):v||{};
try {
 const [programs]=await pool.execute(`SELECT n.id,r.registration_json FROM twilio_numbers n JOIN sms_sender_registrations r ON r.number_id=n.id WHERE n.agency_id=? AND n.is_active=1 AND n.status<>'released'`,[agencyId]);
 const [rows]=await pool.execute(`SELECT u.id,u.personal_phone,u.work_phone,u.phone_number,p.notification_categories FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? JOIN user_preferences p ON p.user_id=u.id WHERE JSON_EXTRACT(p.notification_categories,?) IS NOT NULL`,[agencyId,`$.staff_communications_${agencyId}`]);
 for(const row of rows){
  const state=parse(row.notification_categories)[`staff_communications_${agencyId}`];
  if(!Object.values(state.choices||{}).some(v=>v===true)) {console.log(JSON.stringify({userId:row.id,status:'all_texts_off'}));continue;}
  const phone=row.personal_phone||row.work_phone||row.phone_number;
  const relevant=programs.filter(p=>parse(p.registration_json).purposes?.some(v=>['workforce','polling'].includes(v)));
  try{
   for(const program of relevant)verifySavedStaffSignature({state,agencyId,phone,registration:parse(program.registration_json)});
   const requests=apply?await queueStaffSmsEnrollment({userId:row.id,agencyId,state,phone,programs:relevant}):[];
   console.log(JSON.stringify({userId:row.id,status:apply?'queued_for_activation':'verified',requests}));
  }catch(e){console.log(JSON.stringify({userId:row.id,status:'needs_review',reason:e.code||e.message}));}
 }
} finally {await pool.end();}
