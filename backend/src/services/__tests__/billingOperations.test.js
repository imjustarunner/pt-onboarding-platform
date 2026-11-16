import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../claimMdWorkflow.service.js',()=>({recordClaimEvent:vi.fn()}));
import { closeUnsubmittedClaim } from '../claimClosure.service.js';
import { createTaskAssignmentEmailService } from '../taskAssignmentEmail.service.js';
import { remittanceQuery, remittanceSummary, remittanceMatches, sortRemittances } from '../remittances/query.js';
import { filterBillingWorkItems, loadBillingWorkItems, normalizeBillingWorkItem } from '../billingWorkItems.service.js';

describe('closure attribution',()=>{
  function setup(change={},event=null){
    const claim={id:1,agency_id:2,billing_revision:3,claim_lifecycle:'draft',claim_status:'PENDING',metadata_json:{oldEvidence:'preserved'},...change};
    const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.startsWith('SELECT *')?[[claim]]:sql.startsWith('SELECT id')?[[...(event?[event]:[])]]:[{affectedRows:1}])};
    const deps={dbPool:{getConnection:async()=>db},record:vi.fn().mockResolvedValue(true)};
    return {db,deps,input:{agencyId:2,claimId:1,revision:3,actorUserId:7,reason:'Not intended for submission; external billing review is pending.'}};
  }
  it('records the authenticated actor, reason and time in an append-only event before closing',async()=>{
    const {db,deps,input}=setup();const result=await closeUnsubmittedClaim(input,deps);
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({actorUserId:7,eventType:'claim_closed',payload:expect.objectContaining({actorUserId:7,reason:input.reason,closedAt:expect.any(String)})}),db);
    const [sql,args]=db.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE'));
    expect(sql).not.toMatch(/DELETE|is_deleted/);expect(JSON.parse(args[0])).toMatchObject({oldEvidence:'preserved',claimClosure:result.closure});expect(db.commit).toHaveBeenCalled();
  });
  it.each([{claim_lifecycle:'submitted'},{claimmd_submitted_at:'2026-11-16'},{billing_revision:4}])('rejects a transmitted or changed claim %j',async change=>{
    const {db,deps,input}=setup(change);await expect(closeUnsubmittedClaim(input,deps)).rejects.toMatchObject({status:409});expect(db.rollback).toHaveBeenCalled();expect(deps.record).not.toHaveBeenCalled();
  });
  it('requires a reason and refuses a draft with an existing submission approval',async()=>{
    const {deps,input}=setup({}, {id:40});await expect(closeUnsubmittedClaim(input,deps)).rejects.toThrow(/submission approval/);
    await expect(closeUnsubmittedClaim({...input,reason:''},deps)).rejects.toMatchObject({status:400});
  });
  it('rolls back if the audit event cannot be saved',async()=>{
    const {deps,input,db}=setup();deps.record.mockResolvedValue(false);await expect(closeUnsubmittedClaim(input,deps)).rejects.toThrow(/history/);expect(db.commit).not.toHaveBeenCalled();expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
  });
});

describe('task assignment email',()=>{
  const task={id:11,assigned_to_user_id:7,assigned_to_agency_id:2,status:'pending',title:'PRIVATE PATIENT',description:'PRIVATE DETAIL'};
  function setup(change={}){const deps={user:vi.fn().mockResolvedValue({id:7,work_email:'staff@example.org',email:'login@example.org',personal_email:'private@example.org'}),activeMember:vi.fn().mockResolvedValue(true),sender:vi.fn().mockResolvedValue({id:8,agency_id:2,from_email:'task@example.org',is_active:1}),signInUrl:vi.fn().mockResolvedValue('https://app.example.org/login?redirect=%2Ftasks%3FtaskId%3D11'),send:vi.fn().mockResolvedValue({sent:true}),...change};return {deps,send:createTaskAssignmentEmailService(deps)};}
  it('uses the individual work account and task sender with a sign-in link and no task details',async()=>{
    const {deps,send}=setup();await send({task,actorUserId:9});const message=deps.send.mock.calls[0][0];expect(message).toMatchObject({to:'staff@example.org',senderIdentityId:8,subject:'New task assigned',userId:7});expect(message.html).toContain('Sign in and view task');expect(message.text).toContain('taskId%3D11');expect(JSON.stringify(message)).not.toMatch(/PRIVATE|private@example/);
  });
  it.each([{status:'waiting'},{status:'completed'},{assigned_to_user_id:9}])('skips unactionable or self assignments %j',async change=>{const{deps,send}=setup();await send({task:{...task,...change},actorUserId:9});expect(deps.send).not.toHaveBeenCalled();});
  it('requires active membership and never uses a personal-only or group account',async()=>{
    for(const user of [{id:7,personal_email:'personal@example.org'},{id:7,work_email:'group@example.org',login_is_group_email:1}]){const{deps,send}=setup({user:vi.fn().mockResolvedValue(user)});await send({task,actorUserId:9});expect(deps.send).not.toHaveBeenCalled();}
    const{deps,send}=setup({activeMember:vi.fn().mockResolvedValue(false)});await send({task,actorUserId:9});expect(deps.send).not.toHaveBeenCalled();
  });
  it('supports person-scoped shared-list tasks through an explicitly configured platform task sender',async()=>{
    const {deps,send}=setup({sender:vi.fn().mockResolvedValue({id:8,agency_id:null,from_email:'task@example.org',is_active:1})});
    await send({task:{...task,assigned_to_agency_id:null},actorUserId:9});expect(deps.activeMember).not.toHaveBeenCalled();expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({agencyId:null,to:'staff@example.org'}));
  });
  it.each([null,{id:8,agency_id:3,from_email:'task@example.org',is_active:1},{id:8,agency_id:2,from_email:'notifications@example.org',is_active:1}])('does not substitute an unapproved task sender',async sender=>{const{deps,send}=setup({sender:vi.fn().mockResolvedValue(sender)});await expect(send({task,actorUserId:9})).rejects.toMatchObject({code:'TASK_SENDER_NOT_CONFIGURED'});expect(deps.send).not.toHaveBeenCalled();});
});

describe('ERA search and sort',()=>{
  const era={eraId:'100',payerId:'TEST',payerName:'Synthetic payer',paidDate:'2026-11-12',trace:'PAY-101',paidCents:8000,items:[{patientName:'DEMO Patient',pcn:'CLAIM-42',payerControlNumber:'PAYER-33',lines:[{code:'H0002',date:'2026-11-10',modifiers:['U9'],adjustments:[{group:'CO',code:'45'}],remarkCodes:['N30']}]}]};
  const snapshot={era,raw:{check_type:'eft',received_time:'11-13-2026 15:01',account_number:'NEVER EXPOSE'},directory:null};
  const row=remittanceSummary({id:1,status:'review',imported_at:'2026-11-14 01:00:00'},snapshot);
  it('distinguishes source receipt, payment and app import without exposing bank fields',()=>{expect(row).toMatchObject({receivedDate:'2026-11-13',paidDate:'2026-11-12',importedAt:'2026-11-14 01:00:00',paymentType:'eft'});expect(JSON.stringify(row)).not.toMatch(/NEVER|account_number|DEMO/);});
  it.each(['CLAIM-42','demo patient','H0002 U9','CO-45','PAY-101','PAYER-33','N30'])('finds the attached claim using %s',search=>{expect(remittanceMatches(row,era,remittanceQuery({search}))).toBe(true);});
  it('applies dates and status before sorting across more than one page',()=>{
    expect(remittanceMatches(row,era,remittanceQuery({receivedFrom:'2026-11-14'}))).toBe(false);
    expect(remittanceMatches(row,era,remittanceQuery({paymentType:'check'}))).toBe(false);
    const rows=Array.from({length:75},(_,i)=>({...row,id:i+1,paidCents:i*100}));
    expect(sortRemittances(rows,remittanceQuery({sortBy:'paidCents',direction:'desc'}))[0].id).toBe(75);
    for(const query of [{sortBy:'bad'},{page:-1},{receivedFrom:'2026-02-30'},{paidFrom:'2026-11-15',paidThrough:'2026-11-12'}])expect(()=>remittanceQuery(query)).toThrow();
  });
  it('retains missing receipt dates for earlier imports rather than substituting import time',()=>{expect(remittanceSummary({id:1}, {era,raw:{}}).receivedDate).toBeNull();expect(remittanceSummary({id:1},{era,raw:{},directory:{check_type:'eft',received_time:'11-13-2026 15:01'}}).receivedDate).toBe('2026-11-13');});
});

describe('claim queue boundaries',()=>{
  it('excludes unlinked and invalid client records and keeps linked work',()=>{
    const linked={key:'claim:1',claimId:1,client_id:3,stage:'draft'};
    expect(filterBillingWorkItems([linked,{...linked,key:'draft:2',client_id:null},{...linked,key:'draft:3',client_link_verified:false}],{})).toEqual([linked]);
  });
  it('sorts submitted timestamps over the full result and keeps missing dates last in either direction',()=>{
    const rows=[{key:'claim:1',client_id:3,claimmd_submitted_at:'2026-11-14T01:00:00Z'},{key:'claim:2',client_id:3,claimmd_submitted_at:null},{key:'claim:3',client_id:3,claimmd_submitted_at:'2026-11-13T01:00:00Z'}];
    expect(filterBillingWorkItems(rows,{sortBy:'claimmd_submitted_at',direction:'asc'}).map(r=>r.key)).toEqual(['claim:3','claim:1','claim:2']);
    expect(filterBillingWorkItems(rows,{sortBy:'claimmd_submitted_at',direction:'desc'}).map(r=>r.key)).toEqual(['claim:1','claim:3','claim:2']);
  });
  it('flags a saved claim date mismatch without rewriting its saved date',()=>{
    expect(normalizeBillingWorkItem({claimId:1,date_of_service:'2026-11-17',scheduled_start_at:'2026-11-17 01:30:00',source_timezone:'America/Denver'})).toMatchObject({date_of_service:'2026-11-17',encounter_date_of_service:'2026-11-16',service_date_mismatch:true});
  });
  it('filters orphaned drafts even if a source returns them and never deletes their notes',async()=>{
    const deps={clinical:{execute:vi.fn().mockResolvedValue([[]])},main:{execute:vi.fn(async sql=>sql.includes('FROM clinical_note_drafts')?[[{draft_id:1,agency_id:2,client_id:null},{draft_id:2,agency_id:2,client_id:3},{draft_id:3,agency_id:2,client_id:4}]]:sql.includes('FROM clients')?[[{id:3,agency_id:2,full_name:'DEMO Linked'}]]:[[]])}};
    const result=await loadBillingWorkItems([2],deps);expect(result.items.map(r=>r.draft_id)).toEqual([2]);
    for(const [sql]of [...deps.clinical.execute.mock.calls,...deps.main.execute.mock.calls])expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
});
