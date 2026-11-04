import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),getConnection:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m,onTableWrite:vi.fn()}));
import {peopleOperationsNotificationRecipients,peopleOperationsNotificationSettings,savePeopleOperationsNotificationSettings,
 queuePeopleOperationsSubmission,peopleOperationsSubmissionSource,createPeopleOperationsSubmissionWorker,assertPeopleOperationsSubmissionRecipient,buildPeopleOperationsSubmissionEmail} from '../peopleOperationsSubmissionNotifications.service.js';
let agency,reviewers,candidate,sourceRow,db,event,record,d,source;
const review={reviewedByUserId:3,reviewedAt:'2026-11-04T14:00:00.000Z',senderIdentityId:11};
beforeEach(()=>{
 vi.clearAllMocks();agency={id:2,name:'Tenant',slug:'tenant',is_active:1,is_archived:0,feature_flags:{peopleOperationsSubmissionNotificationsEnabled:true,peopleOperationsSubmissionReview:review}};
 reviewers=[{id:7,email:'login@tenant.test',work_email:'reviewer@tenant.test',enabled:1,first_name:'Reviewer'}];candidate={id:31,first_name:'Candidate',last_name:'Example'};sourceRow={submitted_at:new Date('2026-11-04T15:00:00Z')};
 db={execute:m.execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.getConnection.mockResolvedValue(db);
 m.execute.mockImplementation(async sql=>{
  if(sql.startsWith('SELECT id,name,slug'))return [[agency]];
  if(sql.startsWith('SELECT DISTINCT'))return [reviewers];
  if(sql.startsWith('SELECT u.id,u.first_name'))return [[candidate]];
  if(sql.startsWith('SELECT u.id,u.role'))return [[{id:3,role:'admin'}]];
  if(sql.startsWith('SELECT id FROM agencies'))return [[{id:2}]];
  if(sql.includes('FROM hire_journeys'))return [[sourceRow]];
  return [{affectedRows:1}];
 });
 source={kind:'prehire_complete',id:31,submittedAt:'2026-11-04T15:00:00.000Z',version:'server-version',eventType:'prehire_complete',candidate};
 event={id:8,agency_id:2,candidate_user_id:31,recipient_user_id:7,email_status:'pending',source_json:{kind:'prehire_complete',id:31,version:'server-version'},communication_id:100};
 record={id:100,agency_id:2,user_id:7,generated_by_user_id:31,channel:'email',template_type:'people_operations_submission',recipient_address:'reviewer@tenant.test',metadata:{peopleOperationsSubmissionId:8}};
 d={database:{execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM people_'))return [[event]];
  if(sql.startsWith('SELECT * FROM user_'))return [[record]];
  if(sql.startsWith('SELECT id FROM email_sender_identities'))return [[{id:11}]];
  if(sql.includes('SET email_status=? WHERE')){const available=event.email_status==='pending';if(available)event.email_status=args[0];return [{affectedRows:available?1:0}];}
  return [{affectedRows:1}];
 })},settings:vi.fn(async()=>({agency,enabled:true,review})),source:vi.fn(async()=>source),recipients:vi.fn(async()=>reviewers),
 communication:vi.fn(async()=>record),updateCommunication:vi.fn(),notify:vi.fn(),identity:vi.fn(async()=>({id:11,agency_id:2,from_email:'po@tenant.test'})),send:vi.fn(async()=>({id:'accepted'}))};
});
describe('People Operations recipient settings',()=>{
 it('lists current active tenant hiring reviewers without granting anyone access',async()=>{
  await peopleOperationsNotificationRecipients(2);const [sql,args]=m.execute.mock.calls[0];
  expect(args).toEqual([2]);expect(sql).toContain('ua.is_active=1');expect(sql).toContain("('ACTIVE','ACTIVE_EMPLOYEE')");expect(sql).toContain('terminated_at IS NULL');expect(sql).toContain('has_hiring_access');
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE users'))).toBe(false);
 });
 it('is off until the agency has both an explicit enable and server review',async()=>{
  agency.feature_flags={};expect(await peopleOperationsNotificationSettings(2)).toMatchObject({enabled:false});
  agency.feature_flags={peopleOperationsSubmissionNotificationsEnabled:true};expect(await peopleOperationsNotificationSettings(2)).toMatchObject({enabled:false});
 });
 it('persists only eligible reviewer IDs and the agency review marker without email/access changes',async()=>{
  await savePeopleOperationsNotificationSettings({agencyId:2,actorUserId:3,enabled:true,recipientIds:[7],senderIdentityId:11},m,{senders:async()=>[{id:11,ready:true}]});
  expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO people_operations_notification_recipients'),[2,7,1]);
  expect(m.execute.mock.calls.some(([sql])=>/UPDATE users|work_email\s*=/.test(sql))).toBe(false);expect(db.commit).toHaveBeenCalledOnce();
 });
 it.each(['reviewer@tenant.test,other@external.test','reviewer@tenant.test;other@external.test','Reviewer <reviewer@tenant.test>','reviewer@tenant.test\r\nBcc: other@external.test','reviewer@tenant.test\r\n','\nreviewer@tenant.test'])('rejects a malformed saved official mailbox during activation without falling back to personal email: %s',async mailbox=>{
  reviewers[0].work_email=mailbox;reviewers[0].email='validpersonal@tenant.test';
  await expect(savePeopleOperationsNotificationSettings({agencyId:2,actorUserId:3,enabled:true,recipientIds:[7],senderIdentityId:11},m,{senders:async()=>[{id:11,ready:true}]})).rejects.toMatchObject({status:400});
  expect(db.commit).not.toHaveBeenCalled();
 });
 it('reports an ineligible saved reviewer address in settings without enabling or changing the account',async()=>{
  reviewers[0].work_email='reviewer@tenant.test,other@external.test';
  const state=await peopleOperationsNotificationSettings(2);expect(state.recipients[0]).toMatchObject({emailEligible:false,emailIssue:expect.any(String)});
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE users'))).toBe(false);
 });
 it.each([[],[999]])('rejects empty or no-longer-authorized reviewers before activation: %j',async recipientIds=>{
  await expect(savePeopleOperationsNotificationSettings({agencyId:2,actorUserId:3,enabled:true,recipientIds})).rejects.toThrow();expect(db.commit).not.toHaveBeenCalled();
 });
});
describe('future-only saved submission events',()=>{
 it('creates unique per-recipient events only from a current source after activation',async()=>{
  await queuePeopleOperationsSubmission({agencyId:2,userId:31,kind:'prehire_complete',id:31});
  const [sql,args]=m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT IGNORE INTO people_operations_submission'));
  expect(sql).toContain('source_json');expect(args.slice(0,3)).toEqual([2,31,7]);expect(args[3]).toMatch(/^prehire_complete:31:/);
 });
 it.each(['off','historical','removed candidate'])('cannot manufacture historical or unauthorized delivery: %s',async condition=>{
  if(condition==='off')agency.feature_flags={};if(condition==='historical')sourceRow.submitted_at=new Date('2026-11-03T15:00:00Z');if(condition==='removed candidate')candidate=null;
  await queuePeopleOperationsSubmission({agencyId:2,userId:31,kind:'prehire_complete',id:31});
  expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT IGNORE INTO people_operations_submission'))).toBe(false);
 });
 it('rejects arbitrary source kinds and other-user completion references',async()=>{
  expect(await peopleOperationsSubmissionSource({agencyId:2,userId:31,kind:'raw_email',id:31})).toBeNull();
  expect(await peopleOperationsSubmissionSource({agencyId:2,userId:31,kind:'prehire_complete',id:99})).toBeNull();
 });
});
describe('delivery and persisted retry admission',()=>{
 const input=()=>({agencyId:2,to:'reviewer@tenant.test',templateType:'people_operations_submission',existingCommunicationId:100,senderIdentityId:11});
 it('sends to the current official reviewer address with the tenant PeopleOps sender, once',async()=>{
  const worker=createPeopleOperationsSubmissionWorker(d);await worker();await worker();
  expect(d.send).toHaveBeenCalledOnce();expect(d.send).toHaveBeenCalledWith(expect.objectContaining({to:'reviewer@tenant.test',senderIdentityId:11,replyToOverride:'po@tenant.test',existingCommunicationId:100}));
  expect(d.notify).toHaveBeenCalledWith(expect.objectContaining({userId:7,relatedEntityId:31}));
 });
 it('retains the initial approval receipt without flagging or automatically sending it again',async()=>{
  d.send.mockResolvedValue({pendingApproval:true,queued:true,communicationId:100});
  const worker=createPeopleOperationsSubmissionWorker(d);await worker();await worker();
  expect(d.send).toHaveBeenCalledOnce();expect(d.send).toHaveBeenCalledWith(expect.objectContaining({preloggedReceipt:true}));
  expect(d.updateCommunication).not.toHaveBeenCalled();
  expect(d.database.execute).toHaveBeenCalledWith('UPDATE people_operations_submission_notifications SET email_status=? WHERE id=?',['pending_approval',8]);
 });
 it('keeps sender/ambiguous failures held and never blindly retries or falls back',async()=>{
  d.send.mockRejectedValue(new Error('Uncertain transport'));const worker=createPeopleOperationsSubmissionWorker(d);await worker();await worker();
  expect(d.send).toHaveBeenCalledOnce();expect(d.updateCommunication).toHaveBeenCalledWith(100,'flagged',null,null,'Uncertain transport');
 });
 it.each(['disabled','removed reviewer','source changed','address changed','rogue copy','record spoof','wrong sender'])('rechecks %s at the final persisted retry',async condition=>{
  if(condition==='disabled')d.settings.mockResolvedValue({enabled:false,agency,review});if(condition==='removed reviewer')reviewers=[];
  if(condition==='source changed')source.version='new-version';if(condition==='address changed')reviewers[0].work_email='changed@tenant.test';
  if(condition==='record spoof')event.communication_id=101;
  await expect(assertPeopleOperationsSubmissionRecipient({...input(),...(condition==='rogue copy'?{cc:['outsider@tenant.test']}:{senderIdentityId:condition==='wrong sender'?99:11})},d)).rejects.toMatchObject({status:403});
 });
 it('refuses raw template-only requests while allowing the exact current saved recipient',async()=>{
  await expect(assertPeopleOperationsSubmissionRecipient({templateType:'people_operations_submission'},d)).rejects.toThrow('saved submission');
  expect(await assertPeopleOperationsSubmissionRecipient(input(),d)).toMatchObject({recipient:{id:7}});
 });
 it('uses an authenticated hiring link and omits private document text or access tokens',()=>{
  const content=buildPeopleOperationsSubmissionEmail({agency,source,userId:31});expect(content.text).toContain('/admin/hiring/people/31/packages');
  expect(content.text).not.toMatch(/SSN|passwordless|token=/i);
 });
});
