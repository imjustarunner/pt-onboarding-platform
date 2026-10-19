#!/usr/bin/env node
// Run without --apply to review. The stable seed key prevents duplicate meetings/invitations.
import pool from '../config/database.js';
import {createScheduledTraining,trainingRoster} from '../services/scheduledTraining.service.js';
const SEED_KEY='itsco-crisis-training-2026-10-27';
try {
 const [agencies]=await pool.execute("SELECT id FROM agencies WHERE slug='itsco' AND is_active=1");
 if(agencies.length!==1)throw Error('Expected exactly one active ITSCO agency.');
 const agencyId=Number(agencies[0].id);
 const [trainers]=await pool.execute("SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1 WHERE u.first_name='Megan' AND u.last_name='Geil-Crader' AND u.is_active=1",[agencyId]);
 const [actors]=await pool.execute("SELECT id,role FROM users WHERE first_name='Michael' AND last_name='Mendez' AND role IN ('admin','super_admin','superadmin') AND is_active=1");
 if(trainers.length!==1||actors.length!==1)throw Error('Trainer or scheduling account is ambiguous; no meeting created.');
 const actor=actors[0], roster=await trainingRoster(agencyId,actor);
 const [existing]=await pool.execute('SELECT event_id FROM scheduled_trainings WHERE seed_key=?',[`${SEED_KEY}:0`]);
 if(existing.length){console.log(JSON.stringify({alreadySeeded:true,eventId:existing[0].event_id}));}
 else {
  const [duplicates]=await pool.execute("SELECT id FROM provider_schedule_events WHERE agency_id=? AND status='ACTIVE' AND LOWER(title)='crisis training' AND start_at='2026-10-27 23:00:00'",[agencyId]);
  if(duplicates.length)throw Error('A matching training already exists; inspect it before seeding.');
  const input={agencyId,title:'Crisis Training',topic:'Virtual Crisis Training led by Megan Geil-Crader. Mandatory for bachelor’s-level staff and practicum/intern students; optional for clinical candidates and licensed staff.',proctorId:trainers[0].id,coproctorIds:[],timeZone:'America/Denver',agencyVisible:true,videoAllowed:true,videoDefaultOn:false,muteAll:true,
   sessions:[{startAt:'2026-10-27T17:00:00-06:00',endAt:'2026-10-27T19:00:00-06:00'}],
   participants:roster.map(p=>({userId:p.id,required:p.requirement==='mandatory'})),meetingSettings:{transcription:true,reminders:[10080,1440,60]},seedKey:SEED_KEY};
  console.log(JSON.stringify({apply:process.argv.includes('--apply'),agencyId,trainerId:input.proctorId,startAt:input.sessions[0].startAt,endAt:input.sessions[0].endAt,staff:roster.length,mandatory:input.participants.filter(p=>p.required).length,optional:input.participants.filter(p=>!p.required).length,reminders:input.meetingSettings.reminders}));
  if(process.argv.includes('--apply')){
   const result=await createScheduledTraining(input,actor);
   console.log(JSON.stringify({created:true,eventIds:result.events.map(e=>e.id),delivery:result.delivery}));
  }
 }
}finally{await pool.end();}
