// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Claims from '../PayrollClaimsPanel.vue';
import Preview from '../PayrollPreviewPostPanel.vue';
import Email from '../PayrollReportEmail.vue';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
const wrappers=[];const mounted=(comp,props)=>{const w=mount(comp,{props,global:{stubs:{FundThredBrand:true,PayrollActualHoursReview:true,MeetingClaimDetails:true,IndirectTimeClaimDetailFields:true}}});wrappers.push(w);return w;};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:[]});api.post.mockResolvedValue({data:{status:'sent'}});api.patch.mockResolvedValue({data:{ok:true}});});
afterEach(()=>wrappers.splice(0).forEach(w=>w.unmount()));
const lastState=w=>w.emitted('readiness')?.at(-1)?.[0];
it('shows a branded empty claims stop without a separate Done button',async()=>{const w=mounted(Claims,{agencyId:6,periodId:912,guided:true});expect(lastState(w).ready).toBe(false);await flushPromises();expect(w.text()).toContain('No pending claims');expect(w.text()).not.toContain('Mark done');expect(lastState(w)).toMatchObject({ready:true,empty:true});});
it('blocks pending claims until acted on or explicitly deferred',async()=>{api.get.mockImplementation(async url=>({data:url.endsWith('time-claims')?[{id:7,user_id:532,claim_type:'indirect_time',hours:1}]:[]}));const w=mounted(Claims,{agencyId:6,periodId:912,guided:true});await flushPromises();expect(lastState(w)).toMatchObject({ready:false,pendingCount:1});await w.get('.pcp-defer input').setValue(true);expect(lastState(w)).toMatchObject({ready:true,deferred:true});await w.get('.pcp-defer input').setValue(false);expect(lastState(w).ready).toBe(false);});
it('never treats a failed claims fetch as an empty successful review',async()=>{api.get.mockRejectedValue(new Error('Unavailable'));const w=mounted(Claims,{agencyId:6,periodId:912,guided:true});await flushPromises();expect(lastState(w)).toMatchObject({ready:false,error:'Unavailable'});expect(w.text()).not.toContain('No pending claims');});
it('keeps hours corrections optional without asserting any verified work time',async()=>{api.get.mockImplementation(async url=>({data:url.endsWith('/912')?{summaries:[{user_id:532,first_name:'Test',last_name:'Employee',total_amount:108,total_hours:3,sick_leave_summary:{actualHoursReviewRequired:true,sickLeaveHours:3},breakdown:{H0004:{units:12,amount:108}}}]}:{notifications:[]}}));const w=mounted(Preview,{periodId:912,embedded:true});await flushPromises();expect(lastState(w).ready).toBe(true);expect(w.text()).toContain('Optional hours correction');expect(w.text()).not.toContain('Review actual work hours and processor');expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();});
it('does not permit preview completion without calculated results',async()=>{api.get.mockResolvedValue({data:{summaries:[]}});const w=mounted(Preview,{periodId:912,embedded:true});await flushPromises();expect(lastState(w).ready).toBe(false);expect(w.text()).toContain('Run Payroll first');});
it('does not send an email for a period that is merely calculated',async()=>{const w=mounted(Email,{periodId:912,posted:false});await flushPromises();expect(w.text()).toContain('has not been posted');expect(w.findAll('button').some(b=>b.text()==='Email payroll CSV')).toBe(false);expect(api.post).not.toHaveBeenCalled();});
it('shows confirmed delivery and sends explicit repeat copies only on click',async()=>{api.get.mockResolvedValue({data:{status:'sent',configured:true,mailbox:'payroll@example.test'}});const w=mounted(Email,{periodId:912,posted:true});await flushPromises();expect(w.text()).toContain('Sent with the CSV attached');expect(api.post).not.toHaveBeenCalled();await w.findAll('button').find(b=>b.text()==='Email CSV again').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/payroll/periods/912/report-email',{idempotencyKey:expect.any(String)});});
it('keeps payroll posted while clearly reporting an email failure',async()=>{api.get.mockResolvedValue({data:{status:'failed',configured:true}});const w=mounted(Email,{periodId:912,posted:true});await flushPromises();expect(w.text()).toContain('Payroll remains posted');});

it('shows explicitly targeted claims even if their old suggested period differs',async()=>{api.get.mockImplementation(async url=>({data:url.endsWith('time-claims')?[{id:8,user_id:532,claim_type:'indirect_time',hours:1,target_payroll_period_id:912,suggested_payroll_period_id:911}]:[]}));const w=mounted(Claims,{agencyId:6,periodId:912,guided:true});await flushPromises();expect(lastState(w)).toMatchObject({ready:false,pendingCount:1});expect(w.text()).not.toContain('No pending claims');});
it('bulk selects wizard claims and removes confirmed approvals without another list request',async()=>{
  const rows=[7,8].map(id=>({id,user_id:532,agency_id:6,status:'submitted',claim_type:'indirect_time',hours:1}));
  api.get.mockImplementation(async url=>({data:url.endsWith('time-claims')?rows:[]}));
  api.post.mockResolvedValue({data:{results:rows.map(c=>({kind:'time',id:c.id,ok:true,claim:{...c,status:'approved'}}))}});
  vi.spyOn(window,'confirm').mockReturnValueOnce(true);
  const w=mounted(Claims,{agencyId:6,periodId:912,guided:true});await flushPromises();const gets=api.get.mock.calls.length;
  await w.get('[aria-label="Select all time claims"]').setValue(true);
  await w.findAll('button').find(b=>b.text()==='Approve selected').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledOnce();expect(api.get.mock.calls.length).toBe(gets);expect(lastState(w)).toMatchObject({ready:true,pendingCount:0});expect(w.text()).toContain('No pending claims');
});
