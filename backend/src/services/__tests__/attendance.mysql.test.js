import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
const state=vi.hoisted(()=>({connection:null,schema:null}));
vi.mock('../../config/database.js',()=>({onTableWrite:()=>()=>{},default:{execute:(...args)=>state.connection.execute(...args),getConnection:async()=>({execute:(...args)=>state.connection.execute(...args),beginTransaction:()=>state.connection.beginTransaction(),commit:()=>state.connection.commit(),rollback:()=>state.connection.rollback(),release(){}})}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:v=>v,maybeDecryptNotePayload:v=>v}));
import {publishTutoringNote,getPublishedTutoringNote} from '../tutoringNotePublication.service.js';
import {getAppointmentChangeWorkflow,saveAppointmentChangeDraft} from '../appointmentChangeWorkflow.service.js';
import Policy from '../../models/BookingCancellationPolicy.model.js';
import {declareAppointmentNoShow,undoAppointmentNoShow,getAppointmentNoShowReview,processDueAppointmentNoShows,listAppointmentNoShowHistory} from '../appointmentNoShowReview.service.js';
describe.runIf(process.env.CHILDCARE_MYSQL_TESTS==='1')('attendance policies and signed declaration persistence in an owned SQL schema',()=>{
 beforeAll(async()=>{
  if(process.env.DB_HOST!=='127.0.0.1'||process.env.DB_NAME!=='onboarding_stage')throw Error('Use the reviewed local proxy and table definitions only.');
  const mysql=await import('mysql2/promise');state.connection=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,timezone:'Z',dateStrings:true});
  state.schema=`nlu_attendance_test_${Date.now()}_${process.pid}`;if(!/^nlu_attendance_test_\d+_\d+$/.test(state.schema))throw Error('Invalid owned schema');
  await state.connection.query(`CREATE DATABASE ${state.schema}`);await state.connection.changeUser({database:state.schema});
  const [[definition]]=await state.connection.query('SHOW CREATE TABLE onboarding_stage.booking_cancellation_policies');
  await state.connection.query(definition['Create Table'].split('\n').filter(line=>!line.includes('FOREIGN KEY')&&!/^\s*`(payer_type|service_code|provider_category|provider_level|customer_tier_id|modality|no_show_suggested_wait_minutes|no_show_undo_after_end_minutes|supersedes_policy_id)`/.test(line)).join('\n').replace(/,\s*\)/g,')'));
  for(const file of ['1841_appointment_no_show_review.sql','1842_platform_attendance_fee_defaults.sql','1847_appointment_attendance_declaration_history.sql','1848_tutoring_note_publications.sql'])for(const sql of (await fs.readFile(new URL(`../../../../database/migrations/${file}`,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await state.connection.query(sql);
  const [[workflowDefinition]]=await state.connection.query('SHOW CREATE TABLE onboarding_stage.appointment_change_workflows');
  await state.connection.query(workflowDefinition['Create Table'].split('\n').filter(line=>!line.includes('FOREIGN KEY')).join('\n').replace(/,\s*\)/g,')'));
  await state.connection.query('CREATE TABLE tutoring_session_notes(id INT PRIMARY KEY,status VARCHAR(32),saved_at DATETIME,saved_by_user_id INT,updated_by_user_id INT)');
  await state.connection.query('CREATE TABLE appointments(id INT PRIMARY KEY,agency_id INT,provider_user_id INT,status VARCHAR(64),start_at DATETIME(3),end_at DATETIME(3),updated_by_user_id INT)');
 },60000);
 afterAll(async()=>{try{if(state.schema)await state.connection.query(`DROP DATABASE ${state.schema}`);}finally{await state.connection?.end();}},30000);
 it('persists global fees, versions scoped terms and keeps original fees readable by their saved ID',async()=>{
  const global=await Policy.create(null,{name:'SYNTHETIC SQL default',scopeLevel:'platform',lateFeeCents:1500,noShowFeeCents:2200},1807);
  expect(global.agencyId).toBeNull();expect((await Policy.listForAgency(453,{includePlatform:true})).map(p=>p.id)).toContain(global.id);
  const original=await Policy.create(453,{name:'SYNTHETIC SQL category',scopeLevel:'rate_category',businessType:'tutoring',payerType:'self_pay',providerCategory:1,providerLevel:2,lateFeeCents:100,noShowFeeCents:200},1807);
  const changed=await Policy.update(original.id,453,{noShowFeeCents:300},1807);
  expect(changed).toMatchObject({noShowFeeCents:300,supersedesPolicyId:original.id});expect(await Policy.findById(original.id,453)).toMatchObject({noShowFeeCents:200,isActive:false});
  expect(await Policy.update(global.id,453,{name:'wrong scope'},1807)).toBeNull();
 });
 it('stores one declaration and an append-only undo while preserving its original snapshot and resetting attendance',async()=>{
  const now=Date.now(),start=new Date(now-20*60000).toISOString(),end=new Date(now+40*60000).toISOString();
  const appt={id:90,agencyId:453,providerUserId:1496,status:'scheduled',startAt:start,endAt:end};
  await state.connection.execute('INSERT INTO appointments VALUES(90,453,1496,?,?,?,NULL)',['scheduled',start.slice(0,23).replace('T',' '),end.slice(0,23).replace('T',' ')]);
  const preview={evaluation:{},consequence:{model:'fee',feeCents:100}};
  const saved=await declareAppointmentNoShow(appt,{},preview,1496);await declareAppointmentNoShow(appt,{},preview,1496);
  expect(saved.state).toBe('pending');expect((await getAppointmentNoShowReview(90)).canUndo).toBe(true);
  const [[before]]=await state.connection.query('SELECT snapshot_json FROM appointment_no_show_reviews WHERE appointment_id=90');
  await undoAppointmentNoShow(90,1496,'Client arrived; recording the performed session.');await undoAppointmentNoShow(90,1496,'Client arrived; recording the performed session.');
  const [[after]]=await state.connection.query('SELECT snapshot_json,state FROM appointment_no_show_reviews WHERE appointment_id=90');expect(after.snapshot_json).toEqual(before.snapshot_json);expect(after.state).toBe('undone');
  const [events]=await state.connection.query('SELECT action,actor_type,actor_user_id FROM appointment_no_show_review_events ORDER BY id');expect(events.map(e=>e.action)).toEqual(['no_show_declared','no_show_undone']);expect(events.every(e=>e.actor_user_id===1496)).toBe(true);
  const [[result]]=await state.connection.query('SELECT status FROM appointments WHERE id=90');expect(result.status).toBe('scheduled');
 });
 it('reads due work with a literal bounded LIMIT and versions a re-declaration after undo',async()=>{
  // No source rows are modified by this test. The future declaration is not due.
  await expect(processDueAppointmentNoShows({agencyId:453,limit:20})).resolves.toEqual([]);
  const [[row]]=await state.connection.query('SELECT * FROM appointments WHERE id=90');
  const next=await declareAppointmentNoShow({id:90,agencyId:453,providerUserId:1496,startAt:row.start_at,endAt:row.end_at},{},{evaluation:{},consequence:{model:'none'}},1496);
  expect(next.state).toBe('pending');
  const [versions]=await state.connection.query('SELECT id,state,snapshot_json FROM appointment_no_show_reviews WHERE appointment_id=90 ORDER BY id');
  expect(versions).toHaveLength(2);expect(versions[0].state).toBe('undone');expect(versions[1].id).toBe(next.id);
  const events=await listAppointmentNoShowHistory(90);expect(events.filter(e=>e.action==='no_show_declared')).toHaveLength(2);expect(events.find(e=>e.action==='no_show_undone').reason).toContain('Client arrived');
 });
 it('archives an undone signed workflow before saving the new draft',async()=>{
  const now=Date.now(),start=new Date(now-20*60000).toISOString(),end=new Date(now+40*60000).toISOString();
  await state.connection.execute('INSERT INTO appointments VALUES(91,453,1496,?,?,?,NULL)',['scheduled',start.slice(0,23).replace('T',' '),end.slice(0,23).replace('T',' ')]);
  await declareAppointmentNoShow({id:91,agencyId:453,providerUserId:1496,startAt:start,endAt:end},{},{evaluation:{}},1496);
  await undoAppointmentNoShow(91,1496,'Synthetic arrival correction');
  await state.connection.execute("INSERT INTO appointment_change_workflows(appointment_id,agency_id,status,facts_json,narrative,signed_by_user_id,signed_at,updated_by_user_id) VALUES(91,453,'completed',?,'Original signed declaration',1496,UTC_TIMESTAMP(),1496)",[JSON.stringify({noShowReviewActive:true})]);
  expect((await getAppointmentChangeWorkflow(91)).status).toBe('withdrawn');
  const draft=await saveAppointmentChangeDraft(91,{eventType:'no_show',reasonKnown:false},1496);expect(draft.status).toBe('draft');
  const [[archive]]=await state.connection.query('SELECT signed_payload FROM appointment_change_workflow_history WHERE appointment_id=91');
  expect(JSON.parse(archive.signed_payload)).toMatchObject({status:'completed',narrative:'Original signed declaration',signed_by_user_id:1496});
 });
 it('retains an immutable signed family snapshot and treats an identical retry as one publication',async()=>{
  await state.connection.query("INSERT INTO tutoring_session_notes VALUES(1,'saved',NULL,NULL,NULL)");
  const ctx={host:true,clientId:2545,req:{user:{id:1496}},appointment:{id:92,agencyId:453,status:'completed',startAt:'2026-11-17 18:00:00',endAt:'2026-11-17 19:00:00'}};
  const input={workedOn:'Synthetic fractions',howItWent:'Practiced one model',homePractice:'None assigned',signatureConfirmed:true};
  const session={id:600,actual_started_at:'2026-11-17 18:01:00',actual_ended_at:'2026-11-17 18:59:00'};
  const result=await publishTutoringNote(ctx,session,{id:1},input,state.connection);await publishTutoringNote(ctx,session,{id:1},input,state.connection);
  expect((await getPublishedTutoringNote(1,state.connection)).summary).toMatchObject({workedOn:'Synthetic fractions',homePractice:'None assigned'});
  const [rows]=await state.connection.query('SELECT * FROM tutoring_note_publications WHERE note_id=1');expect(rows).toHaveLength(1);expect(rows[0].id).toBe(result.id);
  await expect(publishTutoringNote(ctx,session,{id:1},{...input,workedOn:'Changed signed content'},state.connection)).rejects.toThrow('read-only');
  expect((await state.connection.query('SELECT status FROM tutoring_session_notes WHERE id=1'))[0][0].status).toBe('signed');
 });

});
