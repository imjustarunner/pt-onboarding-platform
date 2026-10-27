import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Composer from '../ReferralRequestComposer.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const person = { personKey:'user:99@377',name:'Sam Example',email:'sam@example.test' };
const entries = [1,2,3,4].map(id => ({ id, name:`Practice ${id}`, matchedServices:['psychology'] }));
let support, wrappers;
beforeEach(() => {
 vi.resetAllMocks();support=false;wrappers=[];
 api.get.mockImplementation(async url => ({ data: url.endsWith('/services') ? {services:[{id:'psychology',label:'Psychology'}]}
  : url.endsWith('/options') ? {canSendAsSupport:support,canEmailNewPerson:support,defaultSenderMode:support?'support':'personal'}
  : url.endsWith('/recipients') ? {recipients:[person]} : {entries} }));
 api.post.mockImplementation(async (url,data) => ({data: url.endsWith('/match') ? {entries,suggestedEntryIds:[1,2,3],warning:'Confirm availability.'}
  : url.endsWith('/preview') ? {id:'draft',from:data.senderMode==='support'?'support@example.test':'messages@example.test',replyTo:data.senderMode==='support'?'support@example.test':'messages@example.test',to:data.to,subject:'Your referral options',text:'Here are referral options.',senderMode:data.senderMode}
  : {status:'sent',conversationId:101} }));
});
afterEach(()=>wrappers.forEach(w=>w.unmount()));
const button=(w,text)=>w.findAll('button').find(b=>b.text()===text);
const input=(w,label)=>w.findAll('label').find(l=>l.text().startsWith(label)).find('input');
const select=(w,label)=>w.findAll('label').find(l=>l.text().startsWith(label)).find('select');
async function open() { const w=mount(Composer,{props:{agencyId:377}});wrappers.push(w);await button(w,'Load referral email options').trigger('click');await flushPromises();return w; }
async function recipient(w) { await input(w,'Find a person').setValue('Sam');await button(w,'Search people').trigger('submit');await flushPromises();await w.find('input[type=radio]').setValue(true); }
async function auto(w) { await input(w,'What services').setValue('psychologist');await button(w,'Auto-select matches').trigger('click');await flushPromises(); }
it('lets a provider pick a person, adjust automatic selections, preview messages routing and send only once',async()=>{
 const w=await open();expect(w.text()).not.toContain('New person');
 await recipient(w);await auto(w);expect(w.text()).toContain('3 selected');
 const choices=w.findAll('label.match input[type=checkbox]');await choices[1].setValue(false);expect(w.text()).toContain('2 selected');
 await button(w,'Preview email').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/referral-directory/outreach/preview',expect.objectContaining({agencyId:377,to:person.email,personKey:person.personKey,senderMode:'personal',entryIds:[1,3]}));
 expect(w.text()).toContain('Replies to: messages@example.test');
 await button(w,'Send referral email').trigger('click');await flushPromises();
 expect(w.text()).toContain('Email sent. Replies will appear in Messages conversation #101');
 expect(button(w,'Send referral email').attributes('disabled')).toBeDefined();
 expect(api.post.mock.calls.filter(([url])=>url.endsWith('/send'))).toHaveLength(1);
});
it('lets support email a new person without creating a system record',async()=>{
 support=true;const w=await open();await select(w,'Recipient type').setValue('new');
 await input(w,'Recipient email').setValue('new@example.test');await input(w,'First name').setValue('Alex');await auto(w);
 await button(w,'Preview email').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/referral-directory/outreach/preview',expect.objectContaining({to:'new@example.test',personKey:null,senderMode:'support',name:'Alex'}));
 expect(w.text()).toContain('Replies to: support@example.test');expect(w.text()).toContain('No account or client record is required');
 api.post.mockResolvedValueOnce({data:{status:'sent',ticketId:497}});
 await button(w,'Send from support').trigger('click');await flushPromises();expect(w.text()).toContain('support ticket #497');
 expect(api.post.mock.calls.every(([url])=>url.startsWith('/referral-directory/'))).toBe(true);
});
it('supports manual browsing and selection without service tags',async()=>{
 const w=await open();await recipient(w);await select(w,'Selection method').setValue('manual');
 await button(w,'Browse referrals').trigger('submit');await flushPromises();
 await w.findAll('label.match input[type=checkbox]')[3].setValue(true);await button(w,'Preview email').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/referral-directory/outreach/preview',expect.objectContaining({entryIds:[4]}));
 expect(api.post.mock.calls.some(([url])=>url.endsWith('/match'))).toBe(false);
});
it('invalidates selection and preview when matching criteria change',async()=>{
 const w=await open();await recipient(w);await auto(w);await button(w,'Preview email').trigger('click');await flushPromises();
 expect(w.find('[aria-label="Referral email preview"]').exists()).toBe(true);
 await input(w,'Insurance').setValue('Aetna');expect(w.find('[aria-label="Referral email preview"]').exists()).toBe(false);
 expect(button(w,'Preview email').attributes('disabled')).toBeDefined();
});
it('does not send or preview automatically when matches are empty',async()=>{
 api.post.mockResolvedValue({data:{entries:[],suggestedEntryIds:[],warning:'No recorded matches.'}});
 const w=await open();await recipient(w);await auto(w);
 expect(w.text()).toContain('No matching referrals');expect(button(w,'Preview email').attributes('disabled')).toBeDefined();
 expect(api.post.mock.calls).toHaveLength(1);
});
it('discards a late recipient search after switching agency',async()=>{
 const w=await open();let resolve;
 const previous=api.get.getMockImplementation();api.get.mockImplementation((url,args)=>url.endsWith('/recipients')?new Promise(r=>{resolve=r;}):previous(url,args));
 await input(w,'Find a person').setValue('Sam');await button(w,'Search people').trigger('submit');
 await w.setProps({agencyId:2});await flushPromises();resolve({data:{recipients:[person]}});await flushPromises();
 expect(w.text()).not.toContain('sam@example.test');expect(button(w,'Preview email').attributes('disabled')).toBeDefined();
});
it('keeps send disabled after an uncertain transport result',async()=>{
 const w=await open();await recipient(w);await auto(w);await button(w,'Preview email').trigger('click');await flushPromises();
 api.post.mockRejectedValueOnce({response:{data:{error:{message:'Check Messages before sending another email.'}}}});
 await button(w,'Send referral email').trigger('click');await flushPromises();
 expect(w.text()).toContain('Check Messages before sending another email');expect(button(w,'Send referral email').attributes('disabled')).toBeDefined();
});
