import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../services/api',()=>({default:api}));
import Panel from '../ActivityProtectionPanel.vue';
import Assignments from '../admin/PrivacyReviewerAssignments.vue';
const ticket={id:'ticket-1',actor_email:'staff@example.invalid',user_id:1,reason:'Prepare care coordination documents.',requested_units:2,status:'pending',created_at:'2026-09-16T18:00:00Z'};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{required:true,tickets:[],alerts:[],holds:[]}});});
describe('activity protection workflow',()=>{
 it('submits a bounded justification without claiming automatic approval',async()=>{
  api.post.mockResolvedValue({data:{id:'12345678-1234',pending:true}});const w=mount(Panel);await flushPromises();await w.find('textarea').setValue('Prepare required records for the review meeting.');await w.find('input[type="number"]').setValue(2);await w.find('form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/account-security/activity-protection/requests',{reason:'Prepare required records for the review meeting.',units:2},{headers:{'X-Account-Security':'1'}});expect(w.text()).toContain('Access remains paused until approved.');expect(w.text()).toContain('Do not include client names');w.unmount();
 });
 it('keeps a failed or self-approved request visibly denied',async()=>{
  api.get.mockResolvedValue({data:{tickets:[ticket],alerts:[]}});api.post.mockRejectedValue({response:{data:{error:{message:'Another security administrator must review your request.'}}}});const w=mount(Panel,{props:{review:true}});await flushPromises();await w.findAll('button').find(b=>b.text()==='Approve for one hour').trigger('click');await flushPromises();expect(w.find('[role="alert"]').text()).toContain('Another security administrator');expect(w.text()).not.toContain('Request approved.');w.unmount();
 });
 it('uses a fresh code without remembering a reviewer device',async()=>{
  api.post.mockResolvedValue({data:{verified:true}});const w=mount(Panel,{props:{review:true}});await flushPromises();await w.find('input[autocomplete="one-time-code"]').setValue('123456');await w.find('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/account-security/authenticator/verify',{code:'123456',rememberDevice:false,personalDevice:false},{headers:{'X-Account-Security':'1'}});expect(w.find('input[autocomplete="one-time-code"]').element.value).toBe('');w.unmount();
 });
 it('labels missing alert data as a failure, not a clean review',async()=>{
  api.get.mockRejectedValue(new Error('offline'));const w=mount(Panel,{props:{review:true}});await flushPromises();expect(w.find('[role="alert"]').exists()).toBe(true);w.unmount();
 });
});

describe('privacy reviewer assignments',()=>{
 it('does not assign a reviewer if fresh verification fails',async()=>{
  api.post.mockRejectedValue({response:{data:{error:{message:'Invalid authenticator code.'}}}});const w=mount(Assignments,{global:{stubs:{RouterLink:true}}});await flushPromises();await w.findAll('input[type="number"]')[0].setValue(2);await w.findAll('input[type="number"]')[1].setValue(2);await w.find('textarea').setValue('Designate the assigned privacy officer.');await w.find('input[autocomplete="one-time-code"]').setValue('123456');await w.find('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledTimes(1);expect(w.find('[role="alert"]').text()).toContain('Invalid authenticator');w.unmount();
 });
 it('requires the confirmed staff ID and reports a successful explicit assignment',async()=>{
  api.post.mockImplementation(async url=>({data:url.endsWith('/verify')?{verified:true}:{email:'reviewer@example.invalid',enabled:true}}));const w=mount(Assignments,{global:{stubs:{RouterLink:true}}});await flushPromises();await w.findAll('input[type="number"]')[0].setValue(2);await w.findAll('input[type="number"]')[1].setValue(2);await w.find('textarea').setValue('Designate the assigned privacy officer.');await w.find('input[autocomplete="one-time-code"]').setValue('123456');await w.find('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenLastCalledWith('/security-evidence/privacy-reviewers',{userId:2,confirmUserId:2,enabled:true,note:'Designate the assigned privacy officer.'},{headers:{'X-Account-Security':'1'}});expect(w.text()).toContain('reviewer@example.invalid: reviewer designation enabled');expect(w.find('input[autocomplete="one-time-code"]').element.value).toBe('');w.unmount();
 });
});

it('does not ask optional reviewers for an authenticator code',async()=>{
 api.get.mockResolvedValue({data:{required:false,tickets:[],alerts:[],reviewers:[]}});
 const queue=mount(Panel,{props:{review:true}});const assignments=mount(Assignments,{global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(queue.find('input[autocomplete="one-time-code"]').exists()).toBe(false);
 expect(assignments.find('input[autocomplete="one-time-code"]').exists()).toBe(false);
 queue.unmount();assignments.unmount();
});
