import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('axios',()=>({default:api}));
import MobileClientSummary from '../MobileClientSummary.vue';

let wrapper;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const person={key:'guardian:9',maskedName:'Syn* Gua*',relationship:'Guardian',channels:{secure:true,email:true,sms:true}};
const button=text=>wrapper.findAll('button').find(item=>item.text()===text);
async function start(){wrapper=mount(MobileClientSummary,{props:{apiBase:'/api/quick-view',sessionToken:'first-session',clientId:31}});await flushPromises();}
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{client:{maskedName:'Syn* Cli*',age:14},contacts:[person]}});});
afterEach(()=>wrapper?.unmount());

it.each([['♙ Secure message',{threadId:88}],['Email',{channel:'email',to:'old@example.invalid'}]])('ignores an old %s response without unlocking a new request',async(label,oldTarget)=>{
 const first=deferred(),second=deferred();api.post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
 await start();await button(label).trigger('click');await wrapper.setProps({clientId:32});await flushPromises();
 await button(label).trigger('click');expect(button(label).element.disabled).toBe(true);
 first.resolve({data:oldTarget});await flushPromises();
 expect(wrapper.emitted('contact')).toBeUndefined();expect(button(label).element.disabled).toBe(true);
 second.resolve({data:{threadId:99}});await flushPromises();
 expect(wrapper.emitted('contact')).toEqual([[{threadId:99}]]);expect(button(label).element.disabled).toBe(false);
});

it('does not clear a new client SMS draft or navigate when the previous send completes',async()=>{
 const sending=deferred();api.post.mockImplementation(url=>url.endsWith('/contact/send')?sending.promise:Promise.resolve({data:{channel:'sms',to:'555-0100'}}));
 await start();await button('Text').trigger('click');await flushPromises();await wrapper.get('textarea').setValue('First client update.');await wrapper.get('form').trigger('submit');
 expect(api.post.mock.calls.find(([url])=>url.endsWith('/contact/send'))).toEqual(['/api/quick-view/messages/clients/31/contact/send',{recipientKey:'guardian:9',channel:'sms',text:'First client update.'},expect.objectContaining({headers:{'X-Quick-View-Session':'first-session'}})]);
 await wrapper.setProps({clientId:32});await flushPromises();await button('Text').trigger('click');await flushPromises();await wrapper.get('textarea').setValue('Second client unsent draft.');
 sending.resolve({data:{conversationId:88}});await flushPromises();
 expect(wrapper.get('textarea').element.value).toBe('Second client unsent draft.');expect(wrapper.text()).not.toContain('Text sent.');expect(wrapper.emitted('contact')).toBeUndefined();
});

it('ignores an old send failure after a session change while the new contact request stays busy',async()=>{
 const sending=deferred(),opening=deferred();api.post.mockResolvedValueOnce({data:{channel:'sms',to:'555-0100'}}).mockReturnValueOnce(sending.promise).mockReturnValueOnce(opening.promise);
 await start();await button('Text').trigger('click');await flushPromises();await wrapper.get('textarea').setValue('First session update.');await wrapper.get('form').trigger('submit');
 await wrapper.setProps({sessionToken:'replacement-session'});await flushPromises();await button('Text').trigger('click');
 sending.reject({response:{data:{error:{message:'Old session send failure'}}}});await flushPromises();
 expect(wrapper.text()).not.toContain('Old session send failure');expect(button('Text').element.disabled).toBe(true);expect(wrapper.find('form').exists()).toBe(false);
 opening.resolve({data:{channel:'sms',to:'555-0101'}});await flushPromises();expect(wrapper.find('form').exists()).toBe(true);expect(button('Text').element.disabled).toBe(false);
});

it('does not emit a conversation after leaving the client summary',async()=>{
 const opening=deferred();api.post.mockReturnValue(opening.promise);await start();await button('♙ Secure message').trigger('click');wrapper.unmount();opening.resolve({data:{threadId:88}});await flushPromises();expect(wrapper.emitted('contact')).toBeUndefined();
});

it('keeps a pending secure invitation in the protected profile and sends only after confirmation',async()=>{
 api.get.mockResolvedValue({data:{client:{maskedName:'Syn* Cli*',age:14},contacts:[{...person,secureInvitation:true}]}});
 api.post.mockResolvedValueOnce({data:{requiresInvitation:true}}).mockResolvedValueOnce({data:{ok:true,threadId:88,messageId:90,deliveryStatus:'queued'}});
 await start();await button('♙ Secure message & invite').trigger('click');await flushPromises();expect(wrapper.emitted('contact')).toBeUndefined();expect(wrapper.text()).toContain('verify the client’s birth date');
 await wrapper.get('textarea').setValue('Synthetic private text');await wrapper.get('form').trigger('submit');await flushPromises();
 expect(api.post.mock.calls[1][1]).toMatchObject({recipientKey:'guardian:9',channel:'secure',invite:true,requestKey:expect.any(String)});expect(wrapper.text()).toContain('Portal invitation: queued');
});
it('opens an affiliated agency summary without replacing the device workspace and requests a safe full-profile handoff',async()=>{api.get.mockResolvedValue({data:{client:{id:31,maskedName:'Syn* Cli*',age:14},contacts:[],agencyId:20,agencyName:'Other agency',fullProfileUrl:'https://app.theinnerstrengthinstitute.com/admin/clients/31'}});wrapper=mount(MobileClientSummary,{props:{apiBase:'/api/quick-view',sessionToken:'first-session',clientId:31,agencyId:20}});await flushPromises();expect(api.get).toHaveBeenCalledWith('/api/quick-view/clients/31/summary',expect.objectContaining({params:{agencyId:20},headers:{'X-Quick-View-Session':'first-session'}}));await button('Open full profile in app ↗').trigger('click');expect(wrapper.emitted('open-main')[0][0]).toMatchObject({kind:'client',clientId:31,agencyId:20});expect(api.post).not.toHaveBeenCalled();});
