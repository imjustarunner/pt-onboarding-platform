import {beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import Messages from '../GuardianMessagesPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:10,role:'client_guardian'}})}));
const tickets=[{id:1,subject:'First support request'},{id:2,subject:'Second support request'}];
const details=id=>({data:{ticket:{id,subject:tickets[id-1].subject,status:'open'},messages:[{id:id*10,body:`Request ${id} response`,senderType:'guardian',senderUserId:10,createdAt:'2026-11-14T12:00:00Z'}]}});
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async url=>url==='/guardian-portal/messages'?{data:{threads:[{client_id:8,client_label:'QA child'}]}}:url==='/guardian-portal/support-tickets'?{data:{tickets}}:details(Number(url.split('/').at(-1))));api.post.mockResolvedValue({data:{ok:true}});});
async function setup(){const w=mount(Messages,{props:{clientId:8},global:{stubs:{GuardianSecureConversations:true,QaRecipientEmailInbox:true,ConversaBrand:true}}});await flushPromises();await w.findAll('.gmsg-tabs button')[1].trigger('click');await flushPromises();return w;}
const choose=(w,id)=>w.findAll('.gmsg-list button').find(b=>b.text().includes(`#${id}`)).trigger('click');
it('ignores a late ticket response so the visible subject and reply recipient agree',async()=>{
 let release;const original=api.get.getMockImplementation();api.get.mockImplementation((url,...rest)=>url==='/guardian-portal/support-tickets/1'?new Promise(r=>release=r):original(url,...rest));const w=await setup();await choose(w,1);await choose(w,2);await flushPromises();release(details(1));await flushPromises();expect(w.text()).toContain('Request 2 response');expect(w.text()).not.toContain('Request 1 response');await w.get('textarea').setValue('For the second request');await w.get('.gmsg-composer button').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/guardian-portal/support-tickets/2/messages',{body:'For the second request'});w.unmount();
});
it('keeps another ticket’s unsent reply when an earlier send completes',async()=>{
 let release;api.post.mockImplementation(()=>new Promise(r=>release=r));const w=await setup();await choose(w,1);await flushPromises();await w.get('textarea').setValue('Send first');await w.get('.gmsg-composer button').trigger('click');await choose(w,2);await flushPromises();await w.get('textarea').setValue('Keep second draft');release({data:{ok:true}});await flushPromises();expect(w.get('textarea').element.value).toBe('Keep second draft');expect(w.text()).toContain('Request 2 response');w.unmount();
});
it('preserves newer typing in the same ticket after the captured reply is sent',async()=>{
 let release;api.post.mockImplementation(()=>new Promise(r=>release=r));const w=await setup();await choose(w,1);await flushPromises();await w.get('textarea').setValue('Captured text');await w.get('.gmsg-composer button').trigger('click');await w.get('textarea').setValue('New unsent text');release({data:{ok:true}});await flushPromises();expect(w.get('textarea').element.value).toBe('New unsent text');w.unmount();
});
it('restores an unsent reply only for its own selected ticket',async()=>{
 const w=await setup();await choose(w,1);await flushPromises();await w.get('textarea').setValue('First draft');await choose(w,2);await flushPromises();expect(w.get('textarea').element.value).toBe('');await w.get('textarea').setValue('Second draft');await choose(w,1);await flushPromises();expect(w.get('textarea').element.value).toBe('First draft');w.unmount();
});

const createPayload={clientId:8,topic:'general',subject:'First created request',question:'Captured first question'};
async function fillNewRequest(w,subject='First created request',question='Captured first question') {
 await w.get('.gmsg-new').trigger('click');
 await w.findAll('.gmsg-field select')[0].setValue('8');
 await w.get('.gmsg-field input').setValue(subject);
 await w.get('.gmsg-field textarea').setValue(question);
}
const submitNew=w=>w.get('.gmsg-composer button').trigger('click');
function createdResponse(){return {data:{ticket:{id:3,subject:'First created request',status:'open'}}};}
it('preserves a second unsent request when the first create finishes late',async()=>{
 let release;api.post.mockImplementation(()=>new Promise(done=>release=done));
 const w=await setup();await fillNewRequest(w);await submitNew(w);
 await fillNewRequest(w,'Second unsent request','Keep this new question');
 expect(w.get('[role=status]').text()).toContain('This draft has not been sent');
 expect(w.get('.gmsg-composer button').text()).toContain('Waiting for pending request');
 release(createdResponse());await flushPromises();
 expect(api.post).toHaveBeenCalledTimes(1);
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/support-tickets',createPayload);
 expect(w.get('.gmsg-field input').element.value).toBe('Second unsent request');
 expect(w.get('.gmsg-field textarea').element.value).toBe('Keep this new question');
 expect(w.get('[role=status]').text()).toContain('request #3 was submitted');
 expect(api.get).not.toHaveBeenCalledWith('/guardian-portal/support-tickets/3',expect.anything());
 w.unmount();
});
it('does not replace an existing selected request or its draft after an earlier create succeeds',async()=>{
 let release;api.post.mockImplementation(()=>new Promise(done=>release=done));
 const w=await setup();await fillNewRequest(w);await submitNew(w);
 await choose(w,2);await flushPromises();await w.get('textarea').setValue('Keep selected request reply');
 release(createdResponse());await flushPromises();
 expect(w.get('.gmsg-chat-head strong').text()).toContain('#2');
 expect(w.get('textarea').element.value).toBe('Keep selected request reply');
 expect(w.text()).toContain('Request 2 response');
 expect(api.get).not.toHaveBeenCalledWith('/guardian-portal/support-tickets/3',expect.anything());
 w.unmount();
});
it('keeps edits made to the same new request while its earlier captured payload is submitted',async()=>{
 let release;api.post.mockImplementation(()=>new Promise(done=>release=done));
 const w=await setup();await fillNewRequest(w);await submitNew(w);
 await w.get('.gmsg-field textarea').setValue('Newer unsent question');
 release(createdResponse());await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/support-tickets',createPayload);
 expect(w.get('.gmsg-field textarea').element.value).toBe('Newer unsent question');
 expect(w.get('[role=status]').text()).toContain('current draft is unchanged');
 w.unmount();
});
it('opens the newly created request only while its submitted form remains current and can then reply',async()=>{
 api.post.mockResolvedValueOnce(createdResponse()).mockResolvedValue({data:{ok:true}});
 const original=api.get.getMockImplementation();
 api.get.mockImplementation((url,...rest)=>url==='/guardian-portal/support-tickets/3'
  ?Promise.resolve({data:{ticket:{id:3,subject:'First created request',status:'open'},messages:[]}})
  :original(url,...rest));
 const w=await setup();await fillNewRequest(w);await submitNew(w);await flushPromises();
 expect(w.get('.gmsg-chat-head strong').text()).toContain('#3');
 expect(w.find('.gmsg-field input').exists()).toBe(false);
 await w.get('textarea').setValue('Reply to the new request');await w.get('.gmsg-composer button').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenLastCalledWith('/guardian-portal/support-tickets/3/messages',{body:'Reply to the new request'});
 expect(w.get('textarea').element.value).toBe('');
 w.unmount();
});
it('does not expose a stale create result or its status after changing the selected child',async()=>{
 let release;api.post.mockImplementation(()=>new Promise(done=>release=done));
 const w=await setup();await fillNewRequest(w);await submitNew(w);
 await w.setProps({clientId:9});await flushPromises();release(createdResponse());await flushPromises();
 expect(w.find('.gmsg-field input').exists()).toBe(false);
 expect(w.text()).not.toContain('request #3 was submitted');
 expect(w.text()).not.toContain('First created request');
 expect(api.get).not.toHaveBeenCalledWith('/guardian-portal/support-tickets/3',expect.anything());
 w.unmount();
});
it('keeps a newer request draft and shows a safe earlier-create failure without opening another ticket',async()=>{
 let reject;api.post.mockImplementation(()=>new Promise((_,fail)=>reject=fail));
 const w=await setup();await fillNewRequest(w);await submitNew(w);
 await fillNewRequest(w,'Current request','Keep current question');
 reject({response:{status:500,data:{error:{message:'Private database detail'}}}});await flushPromises();
 expect(w.get('.gmsg-field input').element.value).toBe('Current request');
 expect(w.get('.gmsg-field textarea').element.value).toBe('Keep current question');
 expect(w.get('[role=status]').text()).toContain('earlier request could not be submitted');
 expect(w.text()).not.toContain('Private database detail');
 expect(w.get('.gmsg-composer button').attributes('disabled')).toBeUndefined();
 w.unmount();
});
