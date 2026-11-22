import {beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import Workspace from '../GuardianCommunicationsWorkspace.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:7,role:'admin'}})}));
vi.mock('../../../views/EmailComposerView.vue',()=>({default:{props:['composeContext'],template:'<div class="email-composer-stub">{{composeContext.to}} · {{composeContext.clientIds}}</div>'}}));
vi.mock('../../messages/EmailThreadReader.vue',()=>({default:{name:'EmailThreadReader',props:['messages'],template:'<div>{{messages.map(m=>m.body_text).join(" ")}}</div>'}}));
const audienceState=vi.hoisted(()=>({canSend:true,prepare:vi.fn(async()=>true)}));
vi.mock('../../session-comments/SecureFamilyAudience.vue',()=>({default:{setup(_p,{expose}){expose({canSend:audienceState.canSend,prepareSend:audienceState.prepare,serviceId:9,recipientUserIds:[20,21]});return {};},template:'<div>Automatically shared with Parent and Other guardian</div>'}}));
const guardian={id:20,name:'Demo Parent',email:'parent@example.test',phone:'7195551234'};
const clients=[{id:4,name:'Child A',agencyId:2,agencyName:'Practice'},{id:5,name:'Child B',agencyId:2,agencyName:'Practice'},{id:6,name:'Past child',agencyId:2,agencyName:'Practice',isHistorical:true}];
const thread={key:'conversation-10',id:10,channel:'email',subject:'School pickup',agencyId:2,lastMessageAt:'2026-11-22T18:00:00Z',clients:[clients[0],clients[1]]};
beforeEach(()=>{vi.clearAllMocks();audienceState.canSend=true;audienceState.prepare.mockResolvedValue(true);api.get.mockImplementation(async url=>url.endsWith('/sms-lines')?{data:{lines:[{agencyId:2,numberId:8,phoneNumber:'+17195550100'}]}}:url.includes('/conversations/10')?{data:{conversation:{id:10},messages:[{id:1,body_text:'Parent reply'}]}}:{data:{guardian,clients,conversations:[thread],nextCursor:null}});api.post.mockImplementation(async url=>({data:url.endsWith('/sms-eligibility')?{eligible:true,from:'+17195550100',to:'+17195551234'}:{queued:true}}));});
const button=(w,text)=>w.findAll('button').find(b=>b.text()===text);
const start=async()=>{const w=mount(Workspace,{props:{guardianId:20}});await flushPromises();return w;};
it('opens an email inline with one parent recipient and all explicitly selected children',async()=>{
 const w=await start();expect(button(w,'Write email').element.disabled).toBe(true);
 const choices=w.findAll('input[type=checkbox]');expect(choices).toHaveLength(2);
 await choices[0].setValue(true);await choices[1].setValue(true);await button(w,'Write email').trigger('click');
 expect(w.get('.email-composer-stub').text()).toContain('parent@example.test · 4,5');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('filters history by child and channel and reads the original conversation in place',async()=>{
 const w=await start();await w.get('.history-filters select').setValue(5);await flushPromises();
 expect(api.get).toHaveBeenLastCalledWith('/communications/guardian-contacts/20/conversations',expect.objectContaining({params:expect.objectContaining({clientId:5}),skipGlobalLoading:true}));
 await w.get('.thread-list button').trigger('click');await flushPromises();expect(w.text()).toContain('Parent reply');expect(w.text()).toContain('Child A · Child B');w.unmount();
});
it('sends SMS only to the selected guardian and child after the consent preflight',async()=>{
 const w=await start();await button(w,'Text (SMS)').trigger('click');await w.findAll('input[type=radio]')[1].setValue(true);await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/communications/guardian-contacts/20/sms-eligibility',{clientId:5,numberId:8},{skipGlobalLoading:true});
 await w.get('textarea').setValue('Pickup is at 4');await button(w,'Send text').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/messages/send',{clientId:5,guardianUserId:20,numberId:8,body:'Pickup is at 4',startNewConversation:true},{skipGlobalLoading:true});w.unmount();
});
it('keeps private drafts separate between channels and children and displays a blocked SMS reason',async()=>{
 const w=await start();await button(w,'Secure message').trigger('click');await w.findAll('input[type=radio]')[0].setValue(true);await w.get('textarea').setValue('Private clinical context');
 await button(w,'Text (SMS)').trigger('click');await flushPromises();expect(w.get('textarea').element.value).toBe('');
 await w.get('textarea').setValue('Text for Child A');await w.findAll('input[type=radio]')[1].setValue(true);await flushPromises();expect(w.get('textarea').element.value).toBe('');
 api.post.mockRejectedValueOnce({response:{data:{error:{message:'This parent has opted out of care texts.'}}}});await w.findAll('input[type=radio]')[0].setValue(true);await flushPromises();
 expect(w.text()).toContain('opted out of care texts');expect(button(w,'Send text').element.disabled).toBe(true);w.unmount();
});
it('sends secure messages with the reviewed full audience and the selected client context',async()=>{
 const w=await start();await button(w,'Secure message').trigger('click');await w.findAll('input[type=radio]')[0].setValue(true);await flushPromises();
 expect(w.text()).toContain('Other guardian');await w.get('input[type=text]').setValue('Progress question');await w.get('textarea').setValue('A secure update');await button(w,'Send secure message').trigger('click');await flushPromises();
 expect(audienceState.prepare).toHaveBeenCalledOnce();expect(api.post).toHaveBeenCalledWith('/messages/hub/send',expect.objectContaining({agencyId:2,personKey:'user:20@2',method:'secure',clientId:4,serviceId:9,expectedRecipientUserIds:[20,21],newTopic:true}),{skipGlobalLoading:true});expect(w.text()).toContain('queued for delivery');w.unmount();
});
it('does not send if the shared-family notice has not been acknowledged',async()=>{
 audienceState.prepare.mockResolvedValue(false);const w=await start();await button(w,'Secure message').trigger('click');await w.findAll('input[type=radio]')[0].setValue(true);await flushPromises();await w.get('input[type=text]').setValue('Update');await w.get('textarea').setValue('Draft');await button(w,'Send secure message').trigger('click');await flushPromises();expect(api.post).not.toHaveBeenCalledWith('/messages/hub/send',expect.anything(),expect.anything());expect(w.get('textarea').element.value).toBe('Draft');w.unmount();
});
it('keeps past clients in the history filter and excludes them from new messages',async()=>{
 const w=await start();expect(w.find('fieldset').text()).not.toContain('Past child');expect(w.get('.history-filters').text()).toContain('Past child · past relationship');w.unmount();
});
it('shows SMS delivery receipts and replies on the original phone thread',async()=>{
 const smsThread={...thread,key:'conversation-11',id:11,channel:'sms',subject:'Text conversation',clients:[clients[0]]};
 const threadKey='sms:v2:client:4:+17195550100:+17195551234';
 api.get.mockImplementation(async url=>({data:url.endsWith('/sms-lines')?{lines:[{agencyId:2,numberId:8,phoneNumber:'+17195550100'}]}:url.endsWith('/sms')?{conversation:{id:11},clientId:4,threadKey,messages:[{id:7,body_text:'Appointment confirmed',send_status:'delivered',direction:'outbound',from:{name:'Care team'},created_at:'2026-11-22T18:00:00Z'}]}:{guardian,clients,conversations:[smsThread],nextCursor:null}}));
 const w=await start();await w.get('.thread-list button').trigger('click');await flushPromises();expect(w.get('.sms-history').text()).toContain('Delivered');expect(w.get('.sms-history').text()).not.toContain('confirmation pending');
 await button(w,'Reply by text').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/communications/guardian-contacts/20/sms-eligibility',{clientId:4,threadKey},{skipGlobalLoading:true});
 await w.get('textarea').setValue('Thanks for confirming');await button(w,'Send text').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/messages/send',{clientId:4,guardianUserId:20,body:'Thanks for confirming',smsThreadKey:threadKey},{skipGlobalLoading:true});w.unmount();
});
it('loads earlier emails with the message cursor and retains the current conversation',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/10/messages')?{messages:[{id:2,body_text:'Older parent reply'}],nextBeforeId:null}:url.endsWith('/10')?{conversation:{id:10},messages:[{id:9,body_text:'Latest reply'}],nextBeforeId:9}:{guardian,clients,conversations:[thread],nextCursor:null}}));
 const w=await start();await w.get('.thread-list button').trigger('click');await flushPromises();
 // Exercise the real reader's older-message event through its public component contract.
 const reader=w.getComponent({name:'EmailThreadReader'});
 reader.vm.$emit('older');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/communications/conversations/10/messages',expect.objectContaining({params:expect.objectContaining({beforeId:9})}));expect(w.text()).toContain('Older parent reply Latest reply');w.unmount();
});
it('discards stale guardian responses after navigating to another account',async()=>{
 let resolveOld;api.get.mockImplementation(url=>url.includes('/20/')?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve({data:{guardian:{id:21,name:'Different parent',email:'different@example.test'},clients:[],conversations:[],nextCursor:null}}));
 const w=mount(Workspace,{props:{guardianId:20}});await w.setProps({guardianId:21});await flushPromises();resolveOld({data:{guardian,clients,conversations:[thread]}});await flushPromises();expect(w.text()).toContain('Different parent');expect(w.text()).not.toContain('Child A');expect(w.text()).not.toContain('School pickup');w.unmount();
});
it('can cancel an undo-delayed secure send and restore its draft without sending again',async()=>{
 api.post.mockResolvedValue({data:{queued:true,queueId:70,scheduledSendAt:'2026-11-22T18:10:00Z'}});
 const w=await start();await button(w,'Secure message').trigger('click');await w.findAll('input[type=radio]')[0].setValue(true);await flushPromises();await w.get('input[type=text]').setValue('Question');await w.get('textarea').setValue('Keep this secure draft');await button(w,'Send secure message').trigger('click');await flushPromises();
 await button(w,'Undo queued message').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/messages/hub/queued/70/undo',{},{skipGlobalLoading:true});
 expect(w.get('textarea').element.value).toBe('Keep this secure draft');expect(w.text()).toContain('Queued message cancelled');expect(api.post.mock.calls.filter(([url])=>url==='/messages/hub/send')).toHaveLength(1);w.unmount();
});
