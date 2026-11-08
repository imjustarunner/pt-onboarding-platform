import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),context:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../schoolContactPlan.service.js',()=>({getContactPlanContext:m.context}));
import {approvedSchoolContactStaff,loadSchoolContactStaff,schoolContactComposePath,schoolContactStaffEmailSeed,validateSchoolContactStaffDraft} from '../schoolContactStaffEmail.service.js';

const workflow={id:42,agency_id:450,provider_user_id:1490,client_id:2298,school_id:451,initials:'QACSSO',roi_expires_at:'2026-12-31',timezone:'America/Denver',slug:'auricwell-qa-demo',school_name:'Cedar Grove'};
const staff={school_staff_user_id:1465,first_name:'Jamie',last_name:'QA',email:'QA.School@Example.com',access_level:'roi',is_active:1};
let rows,steps,guardianReply;
beforeEach(()=>{
 vi.clearAllMocks();guardianReply=null;rows=[staff];steps=[{step_key:'initial_email',status:'sent'},{step_key:'second_contact',status:'sent'},{step_key:'final_contact',status:'sent'}];
 m.context.mockResolvedValue({agencyId:450,userId:1490,provider:{first_name:'Quality',last_name:'Tester'}});
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('FROM school_contact_workflows w JOIN clients'))return [[args[0]===42&&args[1]===450&&args[2]===1490?{...workflow,parent_reply_at:guardianReply}:undefined].filter(Boolean)];
  if(sql.includes('FROM client_school_roi_guardian_decisions') || sql.includes('FROM intake_submission_documents'))return [[]];
  if(sql.includes('FROM client_school_staff_roi_access'))return [rows];
  if(sql.includes('FROM school_contact_workflow_steps'))return [steps];
  throw new Error(`Unexpected staff permission query: ${sql}`);
 });
});
describe('individual school ROI contact eligibility',()=>{
 it('permits only active individual roi or roi_docs entries with a complete email',()=>{
  const candidates=[staff,{...staff,school_staff_user_id:2,access_level:'roi_docs'},{...staff,school_staff_user_id:3,access_level:'packet'},{...staff,school_staff_user_id:4,access_level:'limited'},{...staff,school_staff_user_id:5,is_active:0},{...staff,school_staff_user_id:6,email:'invalid'},{...staff,school_staff_user_id:7,access_level:'school_admin'}];
  expect(approvedSchoolContactStaff(candidates,{expiresOn:'2026-10-31',timezone:'America/Denver',now:new Date('2026-11-01T05:59:59Z')})).toEqual([
   {userId:1465,name:'Jamie QA',email:'qa.school@example.com',accessLevel:'roi'},
   {userId:2,name:'Jamie QA',email:'qa.school@example.com',accessLevel:'roi_docs'}
  ]);
 });
 it.each(['2026-10-30',null,'not a date'])('does not infer permission from a school badge if the client ROI expiration is %s',expiresOn=>{
  expect(approvedSchoolContactStaff([staff],{expiresOn,timezone:'America/Denver',now:new Date('2026-11-01T05:00:00Z')})).toEqual([]);
 });
 it('expires on the next Denver local date, including the DST change weekend',()=>{
  expect(approvedSchoolContactStaff([staff],{expiresOn:'2026-10-31',timezone:'America/Denver',now:new Date('2026-11-01T06:00:00Z')})).toEqual([]);
 });
 it('keeps workflow reads scoped to the actual provider, agency, active school affiliation and assigned client',async()=>{
  const state=await loadSchoolContactStaff({agencyId:450,providerUserId:1490,workflowId:42,now:new Date('2026-10-31T18:00:00Z')});expect(state.contacts[0].userId).toBe(1465);
  const [sql,args]=m.execute.mock.calls[0];expect(args).toEqual([42,450,1490]);expect(sql).toContain('c.agency_id=w.agency_id');expect(sql).toContain('oa.is_active=1');expect(sql).toContain('cp.is_active=1');expect(sql).toContain('w.provider_user_id=?');
  const [staffSql,staffArgs]=m.execute.mock.calls[1];expect(staffArgs).toEqual([2298,451]);expect(staffSql).toContain('ua.agency_id=r.school_organization_id AND ua.is_active=1');expect(staffSql).toContain("u.role='school_staff'");expect(staffSql).toContain('u.is_active=1');expect(staffSql).toContain("r.access_level IN ('roi','roi_docs')");expect(staffSql).not.toContain('school_admin');
 });
 it.each([{agencyId:999,providerUserId:1490},{agencyId:450,providerUserId:1433}])('does not expose workflow data to a different scope: %o',async scope=>{
  await expect(loadSchoolContactStaff({...scope,workflowId:42})).rejects.toMatchObject({status:404});expect(m.execute).toHaveBeenCalledTimes(1);
 });
 it('counts logical contact phases and cannot mistake an old SMS plus the new second contact for the final email',async()=>{
  steps=[{step_key:'initial_email',status:'sent'},{step_key:'followup_sms',status:'sent'},{step_key:'second_contact',status:'sent'}];
  expect((await loadSchoolContactStaff({agencyId:450,providerUserId:1490,workflowId:42})).attemptCount).toBe(2);
 });
});
describe('editable staff coordination drafts',()=>{
 const input={agencyId:450,userId:1490,workflowId:42,staffUserId:1465};
 const draft=()=>({_schoolContact:{workflowId:42,staffUserId:1465},clientIds:[2298],to:'qa.school@example.com',cc:'',bcc:'',text:'My reviewed and edited message.'});
 it('uses the actual three contacts and initials, and puts only IDs in the deep link',async()=>{
  const seed=await schoolContactStaffEmailSeed(input);expect(seed).toMatchObject({agencyId:450,clientId:2298,to:'qa.school@example.com',schoolContact:{workflowId:42,staffUserId:1465}});expect(seed.text).toContain("I've reached out three times");expect(seed.text).toContain('QACSSO');expect(seed.text).toContain('Hi Jamie QA');
  const href=schoolContactComposePath(workflow,{userId:1465,name:'Jamie QA',email:'qa.school@example.com'});expect(href).toBe('/auricwell-qa-demo/email-compose?agencyId=450&schoolContactWorkflowId=42&schoolStaffUserId=1465');expect(href).not.toContain('@');
 });
 it('rechecks individual ROI at send, so a draft opened before revocation cannot be sent',async()=>{
  await schoolContactStaffEmailSeed(input);rows=[{...staff,is_active:0}];await expect(validateSchoolContactStaffDraft({agencyId:450,userId:1490,draft:draft()})).rejects.toMatchObject({status:403});
 });
 it('does not prefill an untrue no-response claim after the guardian has replied',async()=>{
  guardianReply=new Date('2026-10-31T18:00:00Z');const seed=await schoolContactStaffEmailSeed(input);expect(seed.text).toContain("I'm following up on the intake for QACSSO");expect(seed.text).not.toContain("haven't heard back");
 });
 it('rejects a recipient without an individual permission even when other school staff are approved',async()=>{
  await expect(schoolContactStaffEmailSeed({...input,staffUserId:999})).rejects.toMatchObject({status:403});
 });
 it.each([{to:'someoneelse@example.com'},{cc:'another@example.com'},{bcc:'hidden@example.com'},{clientIds:[2297]},{clientIds:[2298,2297]}])('rejects changed recipient or client scope at send: %o',async change=>{
  await expect(validateSchoolContactStaffDraft({agencyId:450,userId:1490,draft:{...draft(),...change}})).rejects.toMatchObject({status:409});
 });
 it('allows edited wording while the individual ROI, provider assignment and recipient still match',async()=>{
  await expect(validateSchoolContactStaffDraft({agencyId:450,userId:1490,draft:draft()})).resolves.toBeUndefined();expect(m.context).toHaveBeenCalledWith({agencyId:450,userId:1490});
 });
 it('does not bypass an expired provider context',async()=>{
  m.context.mockRejectedValue(Object.assign(new Error('Provider access ended'),{status:403}));await expect(schoolContactStaffEmailSeed(input)).rejects.toMatchObject({status:403});expect(m.execute).not.toHaveBeenCalled();
 });
});
