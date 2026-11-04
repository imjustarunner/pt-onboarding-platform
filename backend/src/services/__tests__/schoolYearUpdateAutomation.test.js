import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),cohort:vi.fn(),access:vi.fn(),send:vi.fn(),mode:vi.fn(),enabled:vi.fn(),agency:vi.fn(),identity:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{findByAgencyAndIdentityKey:m.identity}}));
vi.mock('../emailSettings.service.js',()=>({getEmailSendingMode:m.mode,isEmailNotificationsEnabled:m.enabled}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:m.send}));
vi.mock('../schoolEmailPortal.service.js',()=>({schoolEmailPortalUrl:async({schoolOrganizationId})=>`https://care.example/school-${schoolOrganizationId}/dashboard`,schoolEmailAdminOverviewUrl:()=> 'https://schoolcarebridge.org/app/itsco/admin/schools/overview?orgType=school&yearUpdate=1'}));
vi.mock('../../utils/publicPortalUrl.js',()=>({buildPublicAppUrl:(_agency,path)=>`https://care.example/${path}`}));
vi.mock('../schoolYearUpdateAccess.service.js',()=>({annualCohort:m.cohort,getAnnualAccess:m.access}));
import {deliverAnnualEmail,runSchoolYearUpdateAutomation,annualMailContext,queueAnnualCompletionReceipt,reconcileAnnualDeliveries} from '../schoolYearUpdateAutomation.service.js';
const context={identity:{id:12},schoolsEmail:'schools@care.example'};
let jobs,cohort,campaignStatus;
beforeEach(()=>{
 vi.resetAllMocks();jobs=[];campaignStatus='pushed';
 vi.stubEnv('SCHOOL_YEAR_UPDATE_AUTOMATION_ENABLED','true');
 cohort=[{eligible:true,school:{id:5,name:'Returning',group_email:'returning@care.example'},cycle:{id:7,status:'in_progress'},outstanding:[{label:'Days per week onsite'}],sections:[],questions:[]}];
 m.cohort.mockImplementation(async()=>cohort);m.access.mockImplementation(async({cycle})=>({canWrite:cycle?.status!=='finalized'}));
 m.mode.mockResolvedValue('all');m.enabled.mockResolvedValue(true);m.send.mockResolvedValue({id:'gmail-1',communicationId:123});
 m.agency.mockResolvedValue({id:2,name:'Care Agency',slug:'care'});
 m.identity.mockImplementation(async(aid,key)=>({id:key==='schools'?12:11,is_active:1,from_email:`${key}@care.example`,reply_to:'wrong@care.example'}));
 m.execute.mockImplementation(async(sql,args=[])=>{
  if(sql.includes("status IN ('sending','held')"))return [[]];
  if(sql.includes('FROM school_reinit_rules'))return [[{agency_id:2,enabled:1,timezone:'America/Denver',opens_md:'08-01',due_md:'08-21',followup_md:'08-31',activated_at:'2026-07-01'}]];
  if(sql.includes('SELECT * FROM school_reinit_campaigns'))return [[{id:3,status:campaignStatus}]];
  if(sql.includes('SELECT DISTINCT u.email'))return [[{email:'admin@care.example'}]];
  if(sql.includes("kind='receipt' AND status='pending'"))return [[]];
  if(sql.includes("created_at>DATE_SUB"))return [[]];
  if(sql.includes('SELECT * FROM school_reinit_cycles WHERE id='))return [[cohort.find(r=>r.cycle?.id===args[0])?.cycle]];
  if(sql.startsWith('INSERT IGNORE INTO school_reinit_deliveries')){
   let job=jobs.find(j=>j.agency_id===args[0]&&j.school_year===args[1]&&j.school_id===args[2]&&j.key===args[4]);
   if(!job)jobs.push({id:jobs.length+1,agency_id:args[0],school_year:args[1],school_id:args[2],key:args[4],status:'pending'});
   return [{affectedRows:job?0:1}];
  }
  if(sql.startsWith('SELECT * FROM school_reinit_deliveries WHERE agency_id='))return [[jobs.find(j=>j.agency_id===args[0]&&j.school_year===args[1]&&j.school_id===args[2]&&j.key===args[3])]];
  if(sql.includes("SET status='sending'")){const j=jobs.find(j=>j.id===args[2]);if(j.status!=='pending')return[{affectedRows:0}];j.status='sending';return[{affectedRows:1}];}
  if(sql.includes('SET status=?,communication_id=')){jobs.find(j=>j.id===args[4]).status=args[0];return[{affectedRows:1}];}
  if(sql.includes("SET status='held'")){jobs.find(j=>j.id===args[1]).status='held';return[{affectedRows:1}];}
  return [{affectedRows:1}];
 });
});
afterEach(()=>vi.unstubAllEnvs());
it('holds every delivery entry point before database work or transport when runtime release is off',async()=>{
 vi.stubEnv('SCHOOL_YEAR_UPDATE_AUTOMATION_ENABLED','');
 await expect(runSchoolYearUpdateAutomation()).resolves.toMatchObject({held:true});
 await expect(deliverAnnualEmail({})).resolves.toMatchObject({held:true});
 await expect(queueAnnualCompletionReceipt({})).resolves.toMatchObject({held:true});
 await expect(reconcileAnnualDeliveries()).resolves.toMatchObject({held:true});
 expect(m.execute).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
});
describe('annual mail delivery',()=>{
 const args=()=>({agencyId:2,schoolYear:'2026-27',schoolId:5,cycleId:7,key:'reminder:one',kind:'reminder',context,to:['school@care.example'],content:{subject:'Annual reminder',text:'Please update'}});
 it('claims once across concurrent workers and repeated ticks',async()=>{
  await Promise.all([deliverAnnualEmail(args()),deliverAnnualEmail(args())]);await deliverAnnualEmail(args());
  expect(m.send).toHaveBeenCalledTimes(1);expect(m.send).toHaveBeenCalledWith(expect.objectContaining({senderIdentityId:12,cc:'schools@care.example',replyToOverride:'schools@care.example',templateType:'school_annual_update_reminder'}));
 });
 it('holds uncertain network outcomes without resending',async()=>{m.send.mockRejectedValue(new Error('Connection lost'));await deliverAnnualEmail(args());await deliverAnnualEmail(args());expect(m.send).toHaveBeenCalledTimes(1);expect(jobs[0].status).toBe('held');});
 it('does not claim a redirected email reached the school',async()=>{m.send.mockResolvedValue({id:'redirect',redirected:true});expect(await deliverAnnualEmail(args())).toEqual({status:'held'});});
 it('requires a configured Schools identity instead of silently using Support',async()=>{m.identity.mockResolvedValue({id:11,is_active:1,from_email:'support@care.example'});await expect(annualMailContext(2)).rejects.toThrow('Schools sender');});
 it('does not treat a string-zero inactive Schools identity as active',async()=>{m.identity.mockResolvedValue({id:12,is_active:'0',from_email:'schools@care.example'});await expect(annualMailContext(2)).rejects.toThrow('Schools sender');});
 it('never copies a different agency mailbox',async()=>{await deliverAnnualEmail({...args(),agencyId:6,context:{identity:{id:80},schoolsEmail:'schools@another.example'},to:['school@another.example']});expect(m.send.mock.calls[0][0]).toMatchObject({cc:'schools@another.example',replyToOverride:'schools@another.example'});});
});
describe('annual worker',()=>{
 it('waits until a weekday to send school reminders',async()=>{await runSchoolYearUpdateAutomation({now:new Date('2026-08-15T16:00:00Z')});expect(m.send).not.toHaveBeenCalled();});
 it('sends only the current reminder and includes exact missing information',async()=>{await runSchoolYearUpdateAutomation({now:new Date('2026-08-20T16:00:00Z')});expect(m.send).toHaveBeenCalledTimes(1);expect(m.send.mock.calls[0][0]).toMatchObject({to:'returning@care.example',cc:'schools@care.example',replyToOverride:'schools@care.example'});expect(m.send.mock.calls[0][0].text).toContain('Days per week onsite');});
 it('excludes new schools, completed schools, and waived follow-ups',async()=>{cohort=[{...cohort[0],eligible:false,reason:'first_year_onboarding'},{...cohort[0],cycle:{id:8,status:'finalized',finalized_at:'2026-06-01'}},{...cohort[0],followup:{status:'waived'}}];await runSchoolYearUpdateAutomation({now:new Date('2026-08-20T16:00:00Z')});expect(m.send).not.toHaveBeenCalled();});
 it('rechecks completion immediately before sending a reminder',async()=>{m.access.mockResolvedValue({canWrite:false});await runSchoolYearUpdateAutomation({now:new Date('2026-08-20T16:00:00Z')});expect(m.send).not.toHaveBeenCalled();});
 it('honors disabled campaigns and email settings',async()=>{campaignStatus='disabled';await runSchoolYearUpdateAutomation({now:new Date('2026-08-20T16:00:00Z')});expect(m.send).not.toHaveBeenCalled();m.mode.mockResolvedValue('manual_only');await runSchoolYearUpdateAutomation({now:new Date('2026-10-22T16:00:00Z')});expect(m.send).not.toHaveBeenCalled();});
 it('after the final deadline sends one internal report, preserves follow-ups, and sends no expired reminders',async()=>{
  await runSchoolYearUpdateAutomation({now:new Date('2026-10-22T16:00:00Z')});await runSchoolYearUpdateAutomation({now:new Date('2026-10-22T16:05:00Z')});
  expect(m.send).toHaveBeenCalledTimes(1);expect(m.send.mock.calls[0][0]).toMatchObject({to:'admin@care.example,support@care.example',cc:'schools@care.example',replyToOverride:'schools@care.example',templateType:'school_annual_update_report'});
  expect(m.send.mock.calls[0][0].text).toContain('Days per week onsite');expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO school_reinit_followups'),expect.any(Array));
 });
 it('reports missing school email addresses without using an unverified recipient',async()=>{cohort[0].school.group_email=null;await runSchoolYearUpdateAutomation({now:new Date('2026-08-25T16:00:00Z')});expect(m.send).toHaveBeenCalledTimes(1);expect(m.send.mock.calls[0][0].templateType).toBe('school_annual_update_report');expect(m.send.mock.calls[0][0].text).toContain('School group email is missing');});
});
