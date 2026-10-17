import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
vi.mock('../claimMdWorkspace.service.js',()=>({billingWorkspaceAgencies:vi.fn()}));
vi.mock('../insuranceCards/service.js',()=>({cardContext:vi.fn(),refreshCardFollowup:vi.fn()}));
vi.mock('../guardianAppointments.service.js',()=>({guardianReminderPreferences:vi.fn()}));
vi.mock('../familyLedger/senders.js',()=>({requireReadySender:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
import { INTAKE_COMMUNICATION_VERSION } from '../intakeCommunicationChoices.service.js';
import {runInsuranceCardReminders} from '../insuranceCards/reminders.js';
import {emailTaskStatus,previewCardEmail,sendReviewedCardEmail,snoozeCardEmail,listStaffCardTasks} from '../insuranceCards/staffTasks.js';
const user={id:99,role:'support'},input={agencyId:1,profileId:5,cycle:'synthetic-cycle'};
let deps,connection,progress,deliveries,personal;
beforeEach(()=>{
 deliveries=[];personal=new Map();progress={state:'missing',email_enabled:1,cycle_hash:input.cycle,first_requested_at:new Date('2026-10-01T00:00:00Z'),missingSlots:['primary_back']};
 connection={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,args)=>{
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]];
  if(sql.includes('SELECT')&&sql.includes('FROM insurance_card_deliveries'))return [deliveries];
  if(sql.includes('INSERT IGNORE INTO insurance_card_deliveries')){if(deliveries.some(d=>d.ordinal===args[2]))return [{affectedRows:0}];deliveries.push({id:7,ordinal:args[2],status:'sending',created_at:deps.now});return [{affectedRows:1,insertId:7}];}
  if(sql.includes('UPDATE insurance_card_deliveries')){deliveries[0].status=sql.includes("status='unknown'")?'unknown':args[0];return [{affectedRows:1}];}
  if(sql.includes('INSERT INTO insurance_card_staff_reminders')){personal.set(args[2],{snoozed_until:args[3]});return [{}];}
  if(sql.includes('SELECT snoozed_until'))return [[personal.get(args[2])].filter(Boolean)];
  if(sql.includes('SELECT p.id'))return [[{id:5,agency_id:1}]];
  return [[]];
 })};
 deps={db:{execute:(...args)=>connection.execute(...args),getConnection:vi.fn().mockResolvedValue(connection)},now:new Date('2026-10-01T12:00:00Z'),authorize:vi.fn(),activeAgency:vi.fn(async()=>true),agencies:vi.fn(async()=>[{id:1,name:'Synthetic agency'}]),audit:vi.fn(),
 context:vi.fn().mockResolvedValue({profile:{id:5,guardian_user_id:10,email:'synthetic@example.invalid',user_status:'ACTIVE',slug:'synthetic'},clients:[{id:101,full_name:'Synthetic Client'}]}),refresh:vi.fn().mockImplementation(async()=>({...progress})),choices:vi.fn().mockResolvedValue({version:INTAKE_COMMUNICATION_VERSION,guardianUserId:10,emailPreference:'all',signatureAccepted:true,signedAt:'2026-10-01'}),preferences:vi.fn().mockResolvedValue({channels:{email:true},optionalRemindersEnabled:true}),sender:vi.fn().mockResolvedValue({id:1,from_email:'billing@example.invalid'}),send:vi.fn().mockResolvedValue({id:'synthetic',communicationId:7})};
});
const reviewed=async()=>({...input,reviewHash:(await previewCardEmail(user,input,deps)).reviewHash});
it('never sends missing-card emails from the background, even when settings were enabled',async()=>{expect(await runInsuranceCardReminders(deps)).toEqual([]);expect(deps.send).not.toHaveBeenCalled();});
it('previews the exact generic email and sends only after explicit review, once across billers',async()=>{
 const p=await previewCardEmail(user,input,deps);expect(p.canSend).toBe(true);expect(p.text).toContain('panel=payment_methods');expect(p.text).not.toContain('Synthetic Client');expect(deps.send).not.toHaveBeenCalled();
 const request={...input,reviewHash:p.reviewHash};expect(await sendReviewedCardEmail(user,request,deps)).toEqual({status:'sent'});await expect(sendReviewedCardEmail({...user,id:98},request,deps)).rejects.toMatchObject({status:409});expect(deps.send).toHaveBeenCalledOnce();expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({source:'manual',generatedByUserId:99,to:p.to,subject:p.subject,text:p.text,usedFallbackSender:false}));expect(connection.commit).toHaveBeenCalledOnce();
});
it.each(['review','complete','help','waived','not_required'])('does not send a stale preview after the request becomes %s',async state=>{const request=await reviewed();progress.state=state;await expect(sendReviewedCardEmail(user,request,deps)).rejects.toMatchObject({status:409});expect(deps.send).not.toHaveBeenCalled();});
it('rechecks permissions and denies non-agencies, opted-out recipients and stale policy versions',async()=>{
 const request=await reviewed();deps.authorize.mockRejectedValueOnce(Object.assign(new Error('No access'),{status:403}));await expect(sendReviewedCardEmail(user,request,deps)).rejects.toMatchObject({status:403});deps.activeAgency.mockResolvedValueOnce(false);await expect(previewCardEmail(user,input,deps)).rejects.toMatchObject({status:403});
 deps.preferences.mockResolvedValue({channels:{email:false}});await expect(sendReviewedCardEmail(user,request,deps)).rejects.toMatchObject({status:409});progress.cycle_hash='changed';await expect(previewCardEmail(user,input,deps)).rejects.toMatchObject({status:409});expect(deps.send).not.toHaveBeenCalled();
});
it('rejects an altered preview, recipient change, and concurrent sender lock',async()=>{
 const request=await reviewed();await expect(sendReviewedCardEmail(user,{...request,reviewHash:'f'.repeat(64)},deps)).rejects.toMatchObject({status:409});deps.context.mockResolvedValue({...await deps.context(),profile:{...(await deps.context()).profile,email:'changed@example.invalid'}});await expect(sendReviewedCardEmail(user,request,deps)).rejects.toMatchObject({status:409});connection.execute.mockResolvedValueOnce([[{acquired:0}]]);await expect(sendReviewedCardEmail(user,request,deps)).rejects.toMatchObject({status:409});expect(deps.send).not.toHaveBeenCalled();
});
it('holds uncertain transport outcomes across later days and never retries automatically',async()=>{
 const request=await reviewed();deps.send.mockRejectedValue(new Error('timeout'));await expect(sendReviewedCardEmail(user,request,deps)).rejects.toMatchObject({status:409});expect(deliveries[0].status).toBe('unknown');deps.now=new Date('2026-10-20');expect((await previewCardEmail(user,input,deps)).canSend).toBe(false);expect(deps.send).toHaveBeenCalledOnce();
});
it('persists a 24-hour reminder per biller, leaving other billers and the client task unaffected',async()=>{
 await snoozeCardEmail(user,{...input,hours:24},deps);expect((await listStaffCardTasks(user,{},deps)).rows[0]).toMatchObject({state:'missing',reminderDue:false,snoozedUntil:new Date('2026-10-02T12:00:00Z')});expect((await listStaffCardTasks({...user,id:98},{},deps)).rows[0].reminderDue).toBe(true);deps.now=new Date('2026-10-02T12:00:01Z');expect((await listStaffCardTasks(user,{},deps)).rows[0].reminderDue).toBe(true);expect(deps.send).not.toHaveBeenCalled();
});
it('send later is one hour and arbitrary snooze periods are rejected',async()=>{const result=await snoozeCardEmail(user,{...input,hours:1},deps);expect(result.snoozedUntil).toEqual(new Date('2026-10-01T13:00:00Z'));await expect(snoozeCardEmail(user,{...input,hours:999},deps)).rejects.toMatchObject({status:400});});
it('does not leak a different practice or a different client through the review queue',async()=>{await expect(listStaffCardTasks(user,{agencyId:2},deps)).rejects.toMatchObject({status:403});expect((await listStaffCardTasks(user,{agencyId:1,clientId:202},deps)).rows).toEqual([]);});
it('keeps a minimum three-day interval if a biller reviews a late task',()=>{expect(emailTaskStatus(progress,[{status:'sent',ordinal:-1,created_at:new Date('2026-10-01T00:00:00Z')}],deps.now).blocked).toContain('three days');});
it('holds queued or redirected messages for investigation',async()=>{const request=await reviewed();deps.send.mockResolvedValue({id:'held',queued:true});expect(await sendReviewedCardEmail(user,request,deps)).toEqual({status:'held'});expect((await previewCardEmail(user,input,deps)).canSend).toBe(false);});

it('holds inactive or archived recipient accounts even if their legacy status says active',async()=>{const context=await deps.context();deps.context.mockResolvedValue({...context,profile:{...context.profile,user_is_active:0}});expect((await previewCardEmail(user,input,deps)).canSend).toBe(false);expect((await listStaffCardTasks(user,{},deps)).rows[0].reminderDue).toBe(false);deps.context.mockResolvedValue({...context,profile:{...context.profile,user_is_archived:1}});expect((await previewCardEmail(user,input,deps)).canSend).toBe(false);});

it.each(['scheduling_only','no'])('does not expand %s consent to insurance follow-up',async emailPreference=>{deps.choices.mockResolvedValue({version:INTAKE_COMMUNICATION_VERSION,guardianUserId:10,emailPreference,signatureAccepted:true,signedAt:'2026-10-01'});expect((await previewCardEmail(user,input,deps)).canSend).toBe(false);expect((await listStaffCardTasks(user,{},deps)).rows[0].reminderDue).toBe(false);expect(deps.send).not.toHaveBeenCalled();});
it('does not borrow the other guardian’s consent',async()=>{deps.choices.mockResolvedValue({version:INTAKE_COMMUNICATION_VERSION,guardianUserId:11,emailPreference:'all',signatureAccepted:true,signedAt:'2026-10-01'});expect((await previewCardEmail(user,input,deps)).canSend).toBe(false);});
