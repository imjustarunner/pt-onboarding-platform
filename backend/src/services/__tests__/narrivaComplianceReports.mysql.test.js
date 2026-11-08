import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
const m=vi.hoisted(()=>({db:null,enabled:true,permission:true,quote:10000,model:vi.fn(),load:vi.fn(),review:vi.fn(),audit:vi.fn(),features:true,privacy:true,account:{},pricing:{}}));
vi.mock('../../config/database.js',()=>({default:{execute:(...args)=>m.db.execute(...args),getConnection:()=>m.db.getConnection()}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:(...args)=>m.db.execute(...args)}}));
vi.mock('../../models/AgencyBillingAccount.model.js',()=>({default:{getByAgencyId:async()=>m.account}}));
vi.mock('../billingPricing.service.js',()=>({getEffectiveBillingPricingForAgency:async()=>({effective:m.pricing}),getFeatureCatalog:()=>({narrivaComplianceReports:{unitAmountCents:m.quote}}),resolveFeatureEntitlements:()=>({narrivaComplianceReports:{available:true}})}));
vi.mock('../narrivaAccess.service.js',()=>({positiveId:value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null,narrivaError:(status,message)=>Object.assign(new Error(message),{status}),parseNarrivaObject:value=>typeof value==='string'?JSON.parse(value||'{}'):value||{},requireNarrivaAgency:async(user,agency)=>{if(!m.permission||Number(agency)!==1)throw Object.assign(new Error('Access denied'),{status:403});Object.assign(user,{role:user.id===2?'provider':'admin',is_demo:0});},requireNarrivaClient:async(user,agency,client)=>{if(Number(agency)!==1||Number(client)<1||Number(client)>10)throw Object.assign(new Error('Not available'),{status:404});return {id:client};}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:value=>'sealed:'+Buffer.from(value).toString('base64'),maybeDecryptNotePayload:value=>Buffer.from(value.slice(7),'base64').toString()}));
vi.mock('../narrivaSource.service.js',()=>({loadNarrivaSource:(...args)=>m.load(...args)}));
vi.mock('../narrivaReview.service.js',()=>({latestNarrivaStatus:(...args)=>m.review(...args),narrivaFeatures:async()=>({compliance:m.features})}));
vi.mock('../sessionAiPrivacy.service.js',()=>({createSessionPrivacyContext:()=>({redact:async text=>{if(!m.privacy)throw Object.assign(new Error('DLP unavailable'),{code:'SESSION_PRIVACY_UNAVAILABLE'});return String(text).replaceAll('Synthetic PrivateName','Client').replaceAll('private@example.com','[REDACTED]');}}),callPrivateSessionText:(...args)=>m.model(...args)}));
vi.mock('../narrivaGuidance.service.js',()=>({loadNarrivaGuidanceContext:async()=>({requiredReferenceComplete:true,supportCoverageComplete:true,guidanceHash:'guidance-1',serviceReferenceHash:'reference-1',guidance:'Supplied service reference.'})}));
vi.mock('../clinicalKnowledgeBase.service.js',()=>({getKnowledgeBaseContext:async()=>''}));
vi.mock('../noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:(...args)=>m.audit(...args)}));
vi.mock('../clinicalNoteReviewInsights.service.js',()=>({loadClinicalTreatmentHistory:async()=>({status:'available',objectives:[{trend:{status:'stagnant',reason:'Three comparable observations did not change.'}}]})}));
vi.mock('../../utils/agencyAccessContext.js',()=>({runWithAgencyAccess:(_id,fn)=>fn()}));
import {getComplianceReportSettings,saveComplianceReportSettings,createComplianceReport,processComplianceReport,readComplianceReport,retryComplianceReport,requireReportAdministrator,runDueComplianceReports,evaluateReportNote,reportBillingQuote} from '../narrivaComplianceReports.service.js';
import {complianceReportInvoiceLines,attachComplianceReportInvoice} from '../narrivaReportBilling.service.js';
import {NARRIVA_AUDIT_CHECKS} from '../../content/narrivaAuditStandards.js';
const socket=process.env.NARRIVA_MYSQL_SOCKET;
const suite=socket||process.env.NARRIVA_MYSQL_TEST==='1'?describe:describe.skip;
let connection;
const req=extra=>({user:{id:1},headers:{},get:()=>null,body:{agencyId:1,periodStart:'2026-10-01',periodEnd:'2026-10-31',confirmCharge:true,acceptedPriceCents:10000,idempotencyKey:crypto.randomUUID(),...extra},query:{agencyId:1},params:{}});
const run=async(extra={})=>createComplianceReport(req(extra),{enqueue:false});
async function activate(){return saveComplianceReportSettings(req({enabled:true,cadence:'manual',revision:0}));}
const migration=readFileSync(new URL('../../../../database/migrations/1777_narriva_compliance_reports.sql',import.meta.url),'utf8');
suite('real MySQL report persistence, leases and invoice idempotency (synthetic only)',()=>{
 beforeAll(async()=>{
  connection=await mysql.createConnection({...(socket?{socketPath:socket}:{host:'127.0.0.1',port:Number(process.env.NARRIVA_MYSQL_PORT||3306),password:process.env.NARRIVA_MYSQL_PASSWORD||''}),user:'root',multipleStatements:true});
  await connection.query('CREATE DATABASE IF NOT EXISTS narriva_reports_synthetic_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await connection.changeUser({database:'narriva_reports_synthetic_test'});
  await connection.query(`DROP TABLE IF EXISTS narriva_report_settings,narriva_report_runs,agencies,clinical_notes;
    CREATE TABLE agencies(id INT PRIMARY KEY);
    CREATE TABLE clinical_notes(id INT PRIMARY KEY,agency_id INT,client_id INT,clinical_session_id INT,date_of_service DATE,is_deleted TINYINT,status VARCHAR(30),provider_signed_at DATETIME,metadata_json JSON);INSERT INTO agencies VALUES(1),(2);`);
  await connection.query(migration);await connection.query(migration);
  m.db=mysql.createPool({...(socket?{socketPath:socket}:{host:'127.0.0.1',port:Number(process.env.NARRIVA_MYSQL_PORT||3306),password:process.env.NARRIVA_MYSQL_PASSWORD||''}),user:'root',database:'narriva_reports_synthetic_test',connectionLimit:5,timezone:'+00:00'});
 });
 beforeEach(async()=>{
  vi.clearAllMocks();m.permission=true;m.features=true;m.quote=10000;m.privacy=true;m.account={};m.pricing={};
  await connection.query('DELETE FROM narriva_report_settings;DELETE FROM narriva_report_runs;DELETE FROM clinical_notes;');
  for(let client=1;client<=10;client++)for(let day=1;day<=7;day++)await connection.execute('INSERT INTO clinical_notes VALUES(?,1,?,?,?,0,\'signed\',\'2026-10-31 12:00:00\',\'{}\')',[client*100+day,client,client*100+day,`2026-10-${String(day).padStart(2,'0')}`]);
  m.load.mockImplementation(async(user,input)=>{const [[note]]=await m.db.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=?',[input.noteId,input.agencyId]);if(!note)throw new Error('Missing note');return {agencyId:1,noteId:note.id,source:note,sourceHash:`hash-${note.id}`,narrative:`Synthetic PrivateName practiced breathing. Client reported less tension and will practice before the next session. private@example.com`,identifiers:['Synthetic PrivateName','private@example.com'],client:{id:note.client_id,first_name:'Synthetic',last_name:'PrivateName'},provider:{id:3,first_name:'Synthetic',last_name:'Clinician'},session:{id:note.clinical_session_id},service:{code:'90837',durationAllowed:true,modalityAllowed:true,allowed:true},encounter:{durationMinutes:60,timesValid:true,modality:'in_person',consentConfirmed:true}};});
  m.review.mockImplementation(async(user,agency,note)=>({id:note+1000,sourceHash:`hash-${note}`,status:'passed',scoring:{passed:true},checks:Array.from({length:5},()=>({status:'passed',findings:[]}))}));
  m.model.mockImplementation(async()=>({text:JSON.stringify({checks:Object.fromEntries(NARRIVA_AUDIT_CHECKS.filter(c=>c.evidence==='narrative').map(c=>[c.id,{status:'passed',evidence:'Client reported less tension'}]))}),modelName:'synthetic-model'}));
 });
 afterAll(async()=>{await m.db?.end();await connection?.end();});
 it('migration is rerunnable, leaves every agency disabled, and requires explicit quoted activation',async()=>{
  expect((await getComplianceReportSettings({id:1},1)).settings.enabled).toBe(false);
  await expect(run()).rejects.toMatchObject({status:409});
  await expect(saveComplianceReportSettings(req({enabled:true,revision:0,confirmCharge:false}))).rejects.toMatchObject({status:409});
  await activate();expect((await getComplianceReportSettings({id:1},1)).billing.canRun).toBe(true);
  await expect(saveComplianceReportSettings(req({enabled:false,revision:0}))).rejects.toMatchObject({status:409});
 });
 it('completes explicitly waived reports at zero, preserves zero settings and never invoices them',async()=>{
  m.account={feature_entitlements_json:{narrivaComplianceReports:{unitAmountCents:0}}};
  await saveComplianceReportSettings(req({enabled:true,cadence:'manual',revision:0,acceptedPriceCents:0}));
  expect((await getComplianceReportSettings({id:1},1)).billing).toMatchObject({priceCents:0,priceConfigured:true,feeWaived:true,canRun:true});
  const pending=await run({acceptedPriceCents:0});await processComplianceReport(pending.id,1);const request=req();request.params.runId=pending.id;const result=await readComplianceReport(request);
  expect(result.status).toBe('completed');expect(result.billing).toMatchObject({unitCents:0,billable:false,invoiceId:null});
  expect(await complianceReportInvoiceLines(1,'2099-12-31')).toEqual([]);
  const db=await m.db.getConnection();try{await expect(attachComplianceReportInvoice(1,77,[{reportIds:[pending.id]}],db)).rejects.toMatchObject({status:409});}finally{db.release();}
  await saveComplianceReportSettings(req({enabled:false,revision:1}));expect((await getComplianceReportSettings({id:1},1)).settings.acceptedPriceCents).toBe(0);
 });
 it('keeps an already authorized free run and failed retry free when the waiver later ends',async()=>{
  m.account={feature_entitlements_json:{narrivaComplianceReports:{unitAmountCents:0}}};
  await saveComplianceReportSettings(req({enabled:true,cadence:'manual',revision:0,acceptedPriceCents:0}));
  const pending=await run({acceptedPriceCents:0});m.model.mockRejectedValueOnce(new Error('synthetic interruption'));await processComplianceReport(pending.id,1);
  let [[saved]]=await connection.execute('SELECT status,unit_cents,billable_at FROM narriva_report_runs WHERE id=?',[pending.id]);expect(saved).toMatchObject({status:'unavailable',unit_cents:0,billable_at:null});
  m.account={};await connection.execute("UPDATE narriva_report_runs SET status='queued' WHERE id=?",[pending.id]);await processComplianceReport(pending.id,1);
  [[saved]]=await connection.execute('SELECT status,unit_cents,billable_at FROM narriva_report_runs WHERE id=?',[pending.id]);expect(saved).toMatchObject({status:'completed',unit_cents:0,billable_at:null});
  const request=req();request.params.runId=pending.id;expect((await retryComplianceReport({...request,body:{agencyId:1}})).billing).toMatchObject({unitCents:0,billable:false});expect(await complianceReportInvoiceLines(1,'2099-12-31')).toEqual([]);
 });
 it('pauses newly paid schedules after a zero waiver and requires explicit paid acceptance for manual requests',async()=>{
  m.account={feature_entitlements_json:{narrivaComplianceReports:{unitAmountCents:0}}};
  await saveComplianceReportSettings(req({enabled:true,cadence:'manual',revision:0,acceptedPriceCents:0}));
  await connection.execute("UPDATE narriva_report_settings SET cadence='quarterly',next_run_at='2026-10-01'");m.account={};
  expect(await runDueComplianceReports({now:new Date('2026-11-07')})).toMatchObject({queued:0,processed:0});
  await expect(run({acceptedPriceCents:0})).rejects.toMatchObject({status:409});await expect(run({acceptedPriceCents:10000,confirmCharge:false})).rejects.toMatchObject({status:409});
  const paid=await run({acceptedPriceCents:10000});expect(paid.billing.unitCents).toBe(10000);
  const [[settings]]=await connection.execute('SELECT accepted_price_cents FROM narriva_report_settings WHERE agency_id=1');expect(settings.accepted_price_cents).toBe(0);
 });
 it('concurrent identical requests create one run; changed quote/window cannot reuse its key',async()=>{
  await activate();const key=crypto.randomUUID();const results=await Promise.all([run({idempotencyKey:key}),run({idempotencyKey:key})]);expect(results[0].id).toBe(results[1].id);
  const [[count]]=await connection.query('SELECT COUNT(*) AS n FROM narriva_report_runs');expect(count.n).toBe(1);
  await expect(run({idempotencyKey:key,periodEnd:'2026-10-30'})).rejects.toMatchObject({status:409});
 });
 it('uses one processing lease, freezes selection, skips approved random notes, redacts text, and charges once',async()=>{
  await activate();const pending=await run();await Promise.all([processComplianceReport(pending.id,1),processComplianceReport(pending.id,1)]);
  const request=req();request.params.runId=pending.id;const result=await readComplianceReport(request);
  expect(result.status).toBe('completed');expect(result.summary).toMatchObject({sampledClients:10,selectedNotes:50,approvedNotes:25,evaluatedNotes:25});expect(m.model).toHaveBeenCalledTimes(25);
  expect(result.billing).toMatchObject({unitCents:10000,billable:true});expect(JSON.stringify(result)).not.toMatch(/Synthetic PrivateName|private@example.com|sourceHash|noteId|sessionId/);
  expect(result.samples[0].longitudinal.uniqueness.pairs.length).toBeGreaterThan(0);
  for(const [call] of m.model.mock.calls)expect(call.prompt).not.toMatch(/Synthetic PrivateName|private@example.com|Client #|"clientId"|"noteId"|"sessionId"/);
  expect((await retryComplianceReport({...request,body:{agencyId:1}})).status).toBe('completed');expect(m.model).toHaveBeenCalledTimes(25);
 });
 it('keeps unknown claim/PDF/identity checks unassessed and never credits general consent as telehealth consent',async()=>{
  await activate();const original=m.load.getMockImplementation();m.load.mockImplementation(async(...args)=>{const source=await original(...args);source.encounter.modality='video';return source;});
  const pending=await run();await processComplianceReport(pending.id,1);const request=req();request.params.runId=pending.id;const report=await readComplianceReport(request);
  const audit=report.samples.find(s=>s.cohort==='consecutive').notes[0].audit;
  expect(audit.status).toBe('incomplete');expect(audit.checks.find(c=>c.id==='general.page_identifiers').status).toBe('not_assessed');expect(audit.checks.find(c=>c.id==='place.consent').status).toBe('not_assessed');expect(audit.checks.find(c=>c.id==='units.duration').status).toBe('not_assessed');
 });
 it('failed model work is not billed; a retry preserves sample and exact prior results',async()=>{
  await activate();m.model.mockRejectedValueOnce(new Error('synthetic failure'));const pending=await run();await processComplianceReport(pending.id,1);
  const [[failed]]=await connection.execute('SELECT * FROM narriva_report_runs WHERE id=?',[pending.id]);expect(failed.status).toBe('unavailable');expect(failed.billable_at).toBeNull();const snapshot=failed.snapshot_encrypted;
  await connection.execute("UPDATE narriva_report_runs SET status='queued' WHERE id=?",[pending.id]);await processComplianceReport(pending.id,1);
  const [[done]]=await connection.execute('SELECT * FROM narriva_report_runs WHERE id=?',[pending.id]);expect(done.status).toBe('completed');
  const decode=v=>JSON.parse(Buffer.from(v.slice(7),'base64').toString());expect(decode(done.snapshot_encrypted).clients.map(c=>c.notes.map(n=>n.noteId))).toEqual(decode(snapshot).clients.map(c=>c.notes.map(n=>n.noteId)));
 });
 it('never charges empty or mid-run disabled/revoked reports',async()=>{
  await activate();await connection.query('DELETE FROM clinical_notes');let pending=await run();await processComplianceReport(pending.id,1);let [[row]]=await connection.execute('SELECT status,billable_at FROM narriva_report_runs WHERE id=?',[pending.id]);expect(row).toMatchObject({status:'empty',billable_at:null});
  await connection.execute("INSERT INTO clinical_notes VALUES(101,1,1,101,'2026-10-01',0,'signed','2026-10-31 12:00:00','{}')");
  m.review.mockResolvedValue(null);m.model.mockImplementationOnce(async()=>{m.permission=false;return {text:JSON.stringify({checks:Object.fromEntries(NARRIVA_AUDIT_CHECKS.filter(c=>c.evidence==='narrative').map(c=>[c.id,{status:'passed',evidence:'Client reported less tension'}]))})};});
  pending=await run();await processComplianceReport(pending.id,1);[[row]]=await connection.execute('SELECT status,billable_at FROM narriva_report_runs WHERE id=?',[pending.id]);expect(row).toMatchObject({status:'unavailable',billable_at:null});
 });
 it('rejects malformed, unsupported or fabricated model evidence and does not expose identifiers',async()=>{
  const source=await m.load({id:1},{agencyId:1,noteId:101});
  await expect(evaluateReportNote(source,{model:async()=>({text:'not json'})})).rejects.toMatchObject({status:502});
  const checks=Object.fromEntries(NARRIVA_AUDIT_CHECKS.filter(c=>c.evidence==='narrative').map(c=>[c.id,{status:'passed',evidence:'Client reported less tension'}]));
  checks['procedure.service_content'].evidence='Fabricated treatment';
  await expect(evaluateReportNote(source,{model:async()=>({text:JSON.stringify({checks})})})).rejects.toMatchObject({status:502});
  checks['procedure.service_content']={status:'not_applicable',evidence:''};
  await expect(evaluateReportNote(source,{model:async()=>({text:JSON.stringify({checks})})})).rejects.toMatchObject({status:502});
  await expect(evaluateReportNote(source,{privacyContext:{redact:async()=>{throw Object.assign(new Error('DLP unavailable'),{code:'SESSION_PRIVACY_UNAVAILABLE'});}}})).rejects.toThrow('DLP unavailable');
  expect(m.model).not.toHaveBeenCalled();
 });
 it('records bypass reasons in redacted form and freezes every revision before model processing',async()=>{
  await activate();m.review.mockResolvedValue({id:22,status:'bypassed',sourceHash:'old',checks:[{id:'service',status:'bypassed',findings:[{id:'missing',bypassed:true,message:'Synthetic PrivateName lacks evidence',bypassReason:'private@example.com: keep as is'}]}]});
  let first=true;const original=m.model.getMockImplementation();m.model.mockImplementation(async(...args)=>{if(first){first=false;const [[saved]]=await connection.execute('SELECT snapshot_encrypted FROM narriva_report_runs');const snapshot=JSON.parse(Buffer.from(saved.snapshot_encrypted.slice(7),'base64').toString());expect(snapshot.clients.flatMap(c=>c.notes).every(n=>n.sourceHash)).toBe(true);}return original(...args);});
  const pending=await run();await processComplianceReport(pending.id,1);const request=req();request.params.runId=pending.id;const report=await readComplianceReport(request);
  expect(report.status).toBe('completed');expect(report.summary.approvedNotes).toBe(0);expect(report.samples[0].notes[0].priorApproval.findings[0]).toMatchObject({bypassed:true,reason:'[REDACTED]: keep as is'});
 });
 it('checkpoints a timed-out slice as queued and resumes the same sample without double billing',async()=>{
  await activate();m.review.mockResolvedValue(null);const original=m.model.getMockImplementation();let calls=0;
  m.model.mockImplementation(async options=>{calls++;if(calls===2)return new Promise((resolve,reject)=>{if(options.signal.aborted)return reject(options.signal.reason);options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});return original(options);});
  const pending=await run();await processComplianceReport(pending.id,1,{budgetMs:1000});
  let [[saved]]=await connection.execute('SELECT * FROM narriva_report_runs WHERE id=?',[pending.id]);expect(saved).toMatchObject({status:'queued',billable_at:null,lease_token:null});
  const decode=v=>JSON.parse(Buffer.from(v.slice(7),'base64').toString());const selected=decode(saved.snapshot_encrypted).clients;expect(decode(saved.result_encrypted).samples.flatMap(s=>s.notes)).toHaveLength(1);
  await processComplianceReport(pending.id,1);[[saved]]=await connection.execute('SELECT * FROM narriva_report_runs WHERE id=?',[pending.id]);expect(saved).toMatchObject({status:'completed',attempt_count:2});expect(saved.billable_at).not.toBeNull();expect(decode(saved.snapshot_encrypted).clients).toEqual(selected);expect(decode(saved.result_encrypted).samples.flatMap(s=>s.notes)).toHaveLength(50);expect(m.model).toHaveBeenCalledTimes(51);
 });
 it('privacy service failure blocks dispatch and leaves the complete run unbillable',async()=>{
  await activate();m.privacy=false;const pending=await run();await processComplianceReport(pending.id,1);
  const [[saved]]=await connection.execute('SELECT status,billable_at FROM narriva_report_runs WHERE id=?',[pending.id]);expect(saved).toMatchObject({status:'unavailable',billable_at:null});expect(m.model).not.toHaveBeenCalled();
 });
 it('makes a changed signed revision or pending amendment stale without charge',async()=>{
  await activate();const original=m.load.getMockImplementation();m.load.mockImplementation(async(...args)=>{const source=await original(...args);source.source.clinical_version_pending_id=77;return source;});
  const pending=await run();await processComplianceReport(pending.id,1);const [[saved]]=await connection.execute('SELECT status,billable_at FROM narriva_report_runs WHERE id=?',[pending.id]);expect(saved).toMatchObject({status:'stale',billable_at:null});expect(m.model).not.toHaveBeenCalled();
 });
 it('disabling reports during model work blocks final billable completion',async()=>{
  await activate();const original=m.model.getMockImplementation();m.model.mockImplementationOnce(async(...args)=>{await connection.execute('UPDATE narriva_report_settings SET enabled=0 WHERE agency_id=1');return original(...args);});
  const pending=await run();await processComplianceReport(pending.id,1);const [[saved]]=await connection.execute('SELECT status,billable_at FROM narriva_report_runs WHERE id=?',[pending.id]);expect(saved).toMatchObject({status:'unavailable',billable_at:null});
 });
 it('rejects ordinary providers and cross-agency report access',async()=>{await expect(requireReportAdministrator({id:2},1)).rejects.toMatchObject({status:403});await expect(getComplianceReportSettings({id:1},2)).rejects.toMatchObject({status:403});});
 it('invoice selection locks only completed runs; duplicate attachment rolls back without duplicate charges',async()=>{
  await activate();const done=await run();await processComplianceReport(done.id,1);const failed=await run();await connection.execute("UPDATE narriva_report_runs SET status='unavailable' WHERE id=?",[failed.id]);
  const db=await m.db.getConnection();try{await db.beginTransaction();const lines=await complianceReportInvoiceLines(1,'2099-12-31',{db,lock:true});expect(lines).toHaveLength(1);expect(lines[0].amountCents).toBe(10000);await attachComplianceReportInvoice(1,99,lines,db);await db.commit();await db.beginTransaction();await expect(attachComplianceReportInvoice(1,100,lines,db)).rejects.toMatchObject({status:409});await db.rollback();expect(await complianceReportInvoiceLines(1,'2099-12-31',{db})).toEqual([]);}finally{db.release();}
 });
 it('serializes concurrent invoice selection so a completed report belongs to one invoice',async()=>{
  await activate();const done=await run();await processComplianceReport(done.id,1);
  const first=await m.db.getConnection(),second=await m.db.getConnection();
  try{await first.beginTransaction();await second.beginTransaction();const lines=await complianceReportInvoiceLines(1,'2099-12-31',{db:first,lock:true});let resolved=false;
   const next=complianceReportInvoiceLines(1,'2099-12-31',{db:second,lock:true}).then(value=>{resolved=true;return value;});
   await new Promise(resolve=>setTimeout(resolve,40));expect(resolved).toBe(false);
   await attachComplianceReportInvoice(1,101,lines,first);await first.commit();expect(await next).toEqual([]);await second.commit();
  }finally{await first.rollback();await second.rollback();first.release();second.release();}
 });
 it('recovers an expired lease without resampling and refuses a changed quote before model dispatch',async()=>{
  await activate();const pending=await run();await connection.execute("UPDATE narriva_report_runs SET status='running',lease_token='old-worker',lease_until='2026-01-01' WHERE id=?",[pending.id]);
  await processComplianceReport(pending.id,1);let [[saved]]=await connection.execute('SELECT status,attempt_count FROM narriva_report_runs WHERE id=?',[pending.id]);expect(saved).toMatchObject({status:'completed',attempt_count:1});
  const second=await run();m.model.mockClear();m.quote=11000;await processComplianceReport(second.id,1);[[saved]]=await connection.execute('SELECT status,billable_at FROM narriva_report_runs WHERE id=?',[second.id]);expect(saved).toMatchObject({status:'unavailable',billable_at:null});expect(m.model).not.toHaveBeenCalled();
 });
 it('disabled schedules create no reports and changed quotes cannot autocharge',async()=>{
  await activate();await connection.execute("UPDATE narriva_report_settings SET cadence='quarterly',next_run_at='2026-10-01',accepted_price_cents=9000");expect(await runDueComplianceReports({now:new Date('2026-11-07')})).toMatchObject({queued:0,processed:0});
  await connection.execute("UPDATE narriva_report_settings SET enabled=0,accepted_price_cents=10000");expect(await runDueComplianceReports({now:new Date('2026-11-07')})).toMatchObject({queued:0,processed:0});
 });
});

// Quote validation does not need a database and is always run, including CI.
describe('explicit zero report pricing',()=>{
 beforeEach(()=>{m.quote=10000;m.account={};m.pricing={};});
 it('preserves the ordinary $100 catalog and unrelated overrides when a tenant waiver is present',async()=>{
  const account={feature_entitlements_json:{narrivaComplianceReports:{unitAmountCents:0},sessionRecording:{unitAmountCents:1000}}};m.account=structuredClone(account);
  expect(await reportBillingQuote(1)).toMatchObject({priceCents:0,feeWaived:true,priceConfigured:true,canRun:true});expect(m.account).toEqual(account);expect(m.quote).toBe(10000);
  m.account={};expect(await reportBillingQuote(1)).toMatchObject({priceCents:10000,feeWaived:false});
 });
 it.each([null,undefined,'',false,-1,0.5,NaN,'0'])('does not silently waive an invalid explicit override: %s',async value=>{
  m.account={feature_entitlements_json:{narrivaComplianceReports:{unitAmountCents:value}}};expect(await reportBillingQuote(1)).toMatchObject({priceCents:null,feeWaived:false,priceConfigured:false,canRun:false});
 });
 it('guards against the real shared normalizer coercing invalid explicit values to zero',async()=>{
  const actual=await vi.importActual('../billingPricing.service.js');
  for(const invalid of [null,'',-1]){
   const raw={narrivaComplianceReports:{unitAmountCents:invalid}};
   expect(actual.resolveFeatureEntitlements({featureEntitlementsJson:raw}).narrivaComplianceReports.unitAmountCents).toBe(0);
   m.account={feature_entitlements_json:raw};expect(await reportBillingQuote(1)).toMatchObject({priceConfigured:false,feeWaived:false,canRun:false});
  }
  expect(actual.getFeatureCatalog().narrivaComplianceReports.unitAmountCents).toBe(10000);
 });
 it('accepts an explicit zero catalog override but rejects a missing effective price',async()=>{
  m.pricing={featureCatalog:{narrivaComplianceReports:{unitAmountCents:0}}};expect(await reportBillingQuote(1)).toMatchObject({priceCents:0,feeWaived:true,canRun:true});
  m.pricing={};m.quote=undefined;expect(await reportBillingQuote(1)).toMatchObject({priceCents:null,priceConfigured:false,canRun:false});
 });
});
