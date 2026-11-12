import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Contact from '../NoteworthyContactPanel.vue';
import Trial from '../NoteworthyTrialPanel.vue';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
const wrappers=[];
const base=()=>({state:'ready_for_approval',trialDays:30,cardRequired:false,policyAccepted:false,trialStartedAt:null,trialEndsAt:null,daysRemaining:30,retentionDays:0,scheduledDeletionAt:null,canWrite:false,deletionNotice:'Backups and required agreements are handled separately.'});
const props={agencyId:1,practiceName:'Example Practice'};
beforeEach(()=>{Object.values(api).forEach(mock=>mock.mockReset());api.get.mockResolvedValue({data:base()});});
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());vi.restoreAllMocks();});
async function renderTrial(){const wrapper=mount(Trial,{props,attachTo:document.body});wrappers.push(wrapper);await flushPromises();return wrapper;}
const button=(wrapper,label)=>wrapper.findAll('button').find(b=>b.text().includes(label));
it('starts with a no-card trial after approval and saves a deliberate retention choice',async()=>{
  const wrapper=await renderTrial();expect(wrapper.text()).toContain('30 days free. No card required.');expect(wrapper.text()).toContain('starts when FundThred approves');
  api.put.mockResolvedValue({data:{...base(),policyAccepted:true,retentionDays:30}});
  await wrapper.get('select').setValue('30');await wrapper.get('input[type=checkbox]').setValue(true);await wrapper.get('form').trigger('submit');await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/noteworthy/practices/1/data-choices',{retentionDays:30,acknowledged:true},expect.any(Object));expect(wrapper.text()).toContain('choices are saved');
});
it('does not overwrite an unsaved retention choice while refreshing status',async()=>{
  const wrapper=await renderTrial();await wrapper.get('select').setValue('90');await button(wrapper,'Refresh status').trigger('click');await flushPromises();expect(wrapper.get('select').element.value).toBe('90');
});
it('requires exact destructive confirmation and reports queued cleanup without claiming completion',async()=>{
  const wrapper=await renderTrial();await button(wrapper,'Wipe my NoteWorthy data').trigger('click');const dialog=wrapper.get('[role=dialog]');
  expect(dialog.text()).toContain('Download the records you need first');
  await dialog.get('input:not([type=checkbox])').setValue('Wrong');await dialog.get('input[type=checkbox]').setValue(true);expect(button(dialog,'Permanently wipe').attributes('disabled')).toBeDefined();
  await dialog.get('input:not([type=checkbox])').setValue('Example Practice');
  api.post.mockResolvedValue({data:{...base(),state:'deleting',deletionRequestedAt:'2026-11-12T20:00:00Z',deletionJob:{status:'queued'}}});
  await dialog.get('form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/noteworthy/practices/1/wipe',{practiceName:'Example Practice',confirmed:true},expect.any(Object));expect(wrapper.text()).toContain('Deletion requested');expect(wrapper.text()).not.toContain('workspace was deleted');
});
it('does not apply a deletion response to a different practice after switching',async()=>{
  const wrapper=await renderTrial();let resolve;api.post.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  await button(wrapper,'Wipe my NoteWorthy data').trigger('click');const dialog=wrapper.get('[role=dialog]');await dialog.get('input:not([type=checkbox])').setValue('Example Practice');await dialog.get('input[type=checkbox]').setValue(true);await dialog.get('form').trigger('submit');
  await wrapper.setProps({agencyId:2,practiceName:'Other Practice'});await flushPromises();resolve({data:{...base(),state:'deleted',deletedAt:'2026-11-12T20:00:00Z'}});await flushPromises();
  expect(wrapper.text()).not.toContain('workspace was deleted');expect(wrapper.emitted('state').at(-1)[0].state).toBe('ready_for_approval');
});
it('submits a public inquiry once, then only creates an account on an explicit second action',async()=>{
  const wrapper=mount(Contact,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});wrappers.push(wrapper);
  await wrapper.get('input[autocomplete=given-name]').setValue('Alex');await wrapper.get('input[autocomplete=family-name]').setValue('Example');await wrapper.get('input[autocomplete=organization]').setValue('Example Practice');await wrapper.get('input[autocomplete=email]').setValue('alex@example.test');await wrapper.get('textarea').setValue('Interested in the free trial.');await wrapper.get('input[type=checkbox]').setValue(true);
  api.post.mockResolvedValueOnce({data:{id:'saved-reference',ticketId:123,saved:true}});await wrapper.get('form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledOnce();expect(api.post.mock.calls[0][0]).toBe('/noteworthy/inquiries');expect(api.post.mock.calls[0][1]).toMatchObject({consent:true,practiceName:'Example Practice',name:'Alex Example'});expect(wrapper.text()).toContain('ticket #123');
  api.post.mockResolvedValueOnce({data:{verificationSent:true,message:'Check your email.'}});await button(wrapper,'Create my free trial account').trigger('click');await flushPromises();expect(api.post.mock.calls[1][0]).toBe('/noteworthy/signup');expect(api.post.mock.calls[1][1]).not.toHaveProperty('password');
});
it('preserves the message reference on a failed send and only uses the exact practice conversation endpoint',async()=>{
  api.get.mockResolvedValue({data:{threads:[]}});const wrapper=mount(Contact,{props:{agencyId:7}});wrappers.push(wrapper);await flushPromises();await wrapper.get('textarea').setValue('Help with setup.');
  api.post.mockRejectedValueOnce(new Error('Synthetic network error')).mockResolvedValueOnce({data:{id:'thread-id',ticketId:12,saved:true}});
  await wrapper.get('form').trigger('submit');await flushPromises();const first=api.post.mock.calls[0][1];await wrapper.get('form').trigger('submit');await flushPromises();expect(api.post.mock.calls[1][1].requestId).toBe(first.requestId);expect(api.post.mock.calls[1][0]).toBe('/noteworthy/practices/7/support');
});
