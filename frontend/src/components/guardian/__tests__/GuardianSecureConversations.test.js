import {beforeEach,expect,it,vi} from 'vitest';
import {defineComponent} from 'vue';
import {flushPromises,mount} from '@vue/test-utils';
import Conversations from '../GuardianSecureConversations.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:10,role:'client_guardian'}})}));
const acknowledge=vi.fn(async()=>true);
const Notice=defineComponent({setup(_,ctx){ctx.expose({ensureAcknowledged:acknowledge});return()=>null;}});
const current={client_id:8,client_label:'Avery',agency_id:2,agency_name:'Practice',service_id:11,service_label:'Counseling',thread_id:20,available:true,readOnly:false,provider:{id:3},participants:[{id:3,name:'Provider'},{id:10,name:'Parent'}]};
const history={...current,service_id:null,service_label:'Previous secure conversation',thread_id:5,readOnly:false};
const root={id:100,subject:'Preparing for next session',body:'Original secure message',created_at:'2026-11-14T12:00:00Z',sender_user_id:3,sender_first_name:'Provider',reply_count:1,last_reply_at:'2026-11-14T13:00:00Z'};
const reply={id:101,parent_message_id:100,body:'Parent reply',created_at:'2026-11-14T13:00:00Z',sender_user_id:10,sender_first_name:'Parent'};
const opts=props=>({props:{threads:[current,history],clientId:8,...props},global:{stubs:{FamilySharingNotice:Notice,SecureMessageBanner:true}}});
beforeEach(()=>{vi.clearAllMocks();acknowledge.mockResolvedValue(true);api.get.mockImplementation(async(url,{params}={})=>({data:url.includes('/care-access')?{participants:current.participants}:url==='/guardian-portal/messages/5'?(params?.parentMessageId?[reply]:[root]):[]}));api.post.mockResolvedValue({data:{id:102,body:'New reply',created_at:'2026-11-14T14:00:00Z'}});});
it('shows the delivered subject across authorized older/current storage instead of an empty new conversation',async()=>{
 const w=mount(Conversations,opts());await flushPromises();expect(w.findAll('.subject-row')).toHaveLength(1);expect(w.get('.subject-row').text()).toContain(root.subject);expect(w.text()).not.toContain('No messages yet');await w.get('.subject-row').trigger('click');await flushPromises();expect(w.findAll('.gmsg-message-text').map(n=>n.text())).toEqual([root.body,reply.body]);expect(w.text()).toContain('Who can read and reply');expect(api.get).toHaveBeenCalledWith('/guardian-portal/messages/5',expect.objectContaining({params:expect.objectContaining({parentMessageId:100})}));w.unmount();
});
it('sends a reply under the selected subject with the reviewed family recipients',async()=>{
 const w=mount(Conversations,opts());await flushPromises();await w.get('.subject-row').trigger('click');await flushPromises();await w.get('textarea').setValue('New reply');await w.get('form').trigger('submit');await flushPromises();expect(acknowledge).toHaveBeenCalledOnce();expect(api.post).toHaveBeenCalledWith('/guardian-portal/messages/5',{clientId:8,body:'New reply',parentMessageId:100,expectedRecipientUserIds:[3]},expect.any(Object));expect(w.emitted('refresh')).toHaveLength(1);w.unmount();
});
it('requires a subject for a new message and sends it through the current context, not older storage',async()=>{
 const w=mount(Conversations,opts());await flushPromises();await w.get('.new-subject').trigger('click');await flushPromises();await w.get('textarea').setValue('A new update');await w.get('form').trigger('submit');expect(api.post).not.toHaveBeenCalled();await w.get('input').setValue('A different topic');await w.get('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/guardian-portal/messages/20',{clientId:8,body:'A new update',subject:'A different topic',expectedRecipientUserIds:[3]},expect.any(Object));w.unmount();
});
it('opens the exact notified subject even when the current context is empty',async()=>{
 const w=mount(Conversations,opts({initialThreadId:5,initialMessageId:100}));await flushPromises();expect(w.findAll('.gmsg-message-text').map(n=>n.text())).toEqual([root.body,reply.body]);w.unmount();
});
it('resolves an authorized reply notification to its subject',async()=>{
 const normal=api.get.getMockImplementation();api.get.mockImplementation((url,options)=>url.endsWith('/locate/101')?Promise.resolve({data:{rootMessageId:100}}):normal(url,options));const w=mount(Conversations,opts({initialThreadId:5,initialMessageId:101}));await flushPromises();expect(api.get).toHaveBeenCalledWith('/guardian-portal/messages/5/locate/101',expect.any(Object));expect(w.findAll('.gmsg-message-text')).toHaveLength(2);w.unmount();
});
it('keeps a revoked or unaddressed notification unavailable without opening a different subject',async()=>{
 const w=mount(Conversations,opts({initialThreadId:999,initialMessageId:300}));await flushPromises();expect(w.get('[role=alert]').text()).toContain('not available');expect(w.findAll('.gmsg-message-text')).toHaveLength(0);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('keeps original-audience history readable but prevents replies after its recipients change',async()=>{
 const w=mount(Conversations,opts({threads:[current,{...history,readOnly:true}]}));await flushPromises();await w.get('.subject-row').trigger('click');await flushPromises();expect(w.findAll('.gmsg-message-text')).toHaveLength(2);expect(w.find('textarea').exists()).toBe(false);expect(w.text()).toContain('original recipients');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('preserves the reply draft after an actual send rejection and shows a safe error',async()=>{
 api.post.mockRejectedValue({response:{status:500,data:{error:{message:'private SQL detail'}}}});const w=mount(Conversations,opts());await flushPromises();await w.get('.subject-row').trigger('click');await flushPromises();await w.get('textarea').setValue('Preserve this reply');await w.get('form').trigger('submit');await flushPromises();expect(w.get('textarea').element.value).toBe('Preserve this reply');expect(w.text()).not.toContain('private SQL detail');w.unmount();
});
it('stops sending when the family acknowledgement is not accepted',async()=>{
 acknowledge.mockResolvedValue(false);const w=mount(Conversations,opts());await flushPromises();await w.get('.subject-row').trigger('click');await flushPromises();await w.get('textarea').setValue('Held reply');await w.get('form').trigger('submit');await flushPromises();expect(api.post).not.toHaveBeenCalled();expect(w.get('textarea').element.value).toBe('Held reply');w.unmount();
});
it('does not mix subjects, drafts or late responses across children',async()=>{
 let release;const normal=api.get.getMockImplementation();api.get.mockImplementation((url,options)=>url==='/guardian-portal/messages/5'&&!options?.params?.parentMessageId?new Promise(done=>release=done):normal(url,options));const w=mount(Conversations,opts());await flushPromises();await w.setProps({clientId:9,threads:[{...current,client_id:9,client_label:'Other child',thread_id:30}]});await flushPromises();release({data:[root]});await flushPromises();expect(w.text()).toContain('Other child');expect(w.text()).not.toContain(root.subject);expect(w.findAll('.gmsg-message-text')).toHaveLength(0);w.unmount();
});
it('retains a reply draft while its subject is refreshed',async()=>{
 const w=mount(Conversations,opts());await flushPromises();await w.get('.subject-row').trigger('click');await flushPromises();await w.get('textarea').setValue('Unsent reply');await w.setProps({threads:[{...current},{...history}]});await flushPromises();expect(w.get('textarea').element.value).toBe('Unsent reply');w.unmount();
});
it('does not jump back to the notification’s subject after another subject is selected and refreshed',async()=>{
 const second={...root,id:110,subject:'Another subject'};const original=api.get.getMockImplementation();api.get.mockImplementation((url,options)=>url==='/guardian-portal/messages/5'&&!options?.params?.parentMessageId?Promise.resolve({data:[root,second]}):original(url,options));
 const w=mount(Conversations,opts({initialThreadId:5,initialMessageId:100}));await flushPromises();await w.findAll('.subject-row').find(b=>b.text().includes(second.subject)).trigger('click');await flushPromises();await w.setProps({threads:[{...current},{...history}]});await flushPromises();expect(w.get('h3').text()).toBe(second.subject);w.unmount();
});
it('opens read-only original history even when no new conversation can be composed',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation((url,options)=>url.endsWith('/care-access')?Promise.reject({response:{status:403}}):original(url,options));const w=mount(Conversations,opts({threads:[{...history,readOnly:true}]}));await flushPromises();await w.get('.subject-row').trigger('click');await flushPromises();expect(w.findAll('.gmsg-message-text')).toHaveLength(2);expect(api.get.mock.calls.some(([url])=>url.endsWith('/care-access'))).toBe(false);w.unmount();
});
it('keeps existing provider topic roots together as one subject and displays their replies',async()=>{
 const first={...root,topic_id:'old-topic'},second={...root,id:105,topic_id:'old-topic',body:'Legacy continuation',created_at:'2026-11-14T14:00:00Z'};const original=api.get.getMockImplementation();api.get.mockImplementation((url,options)=>url==='/guardian-portal/messages/5'&&!options?.params?.parentMessageId?Promise.resolve({data:options?.params?.messageId?[first,second].filter(m=>m.id===options.params.messageId):[first,second]}):original(url,options));const w=mount(Conversations,opts());await flushPromises();expect(w.findAll('.subject-row')).toHaveLength(1);await w.get('.subject-row').trigger('click');await flushPromises();expect(w.text()).toContain(second.body);expect(w.text()).toContain(reply.body);w.unmount();
});
it('loads earlier subjects with a bounded per-thread cursor without duplicating recent ones',async()=>{
 const recent=Array.from({length:60},(_,i)=>({...root,id:61+i,subject:`Subject ${61+i}`,reply_count:0}));
 api.get.mockImplementation(async(url,{params}={})=>({data:url==='/guardian-portal/messages/20'?(params?.beforeId?[{...root,id:60,subject:'Earlier subject'}]:recent):[]}));
 const w=mount(Conversations,opts({threads:[current]}));await flushPromises();expect(w.findAll('.subject-row')).toHaveLength(60);await w.findAll('button').find(b=>b.text()==='Older subjects').trigger('click');await flushPromises();expect(w.findAll('.subject-row')).toHaveLength(61);expect(api.get).toHaveBeenCalledWith('/guardian-portal/messages/20',expect.objectContaining({params:expect.objectContaining({beforeId:61,summaryOnly:1})}));w.unmount();
});
it('lists subject metadata before retrieving a selected root body',async()=>{
 const original=api.get.getMockImplementation();api.get.mockImplementation((url,options)=>url==='/guardian-portal/messages/5'&&options?.params?.summaryOnly?Promise.resolve({data:[{...root,body:''}]}):original(url,options));
 const w=mount(Conversations,opts());await flushPromises();expect(w.text()).not.toContain(root.body);expect(api.get.mock.calls.some(([,o])=>o?.params?.messageId===100)).toBe(false);await w.get('.subject-row').trigger('click');await flushPromises();expect(w.text()).toContain(root.body);expect(api.get).toHaveBeenCalledWith('/guardian-portal/messages/5',expect.objectContaining({params:expect.objectContaining({messageId:100})}));w.unmount();
});
it('does not insert an old child subject after a delayed notification locator resolves',async()=>{
 let release;const other={...current,client_id:9,client_label:'Other child',thread_id:30};
 api.get.mockImplementation(async(url,{params}={})=>{if(url.endsWith('/locate/101'))return new Promise(done=>release=done);return {data:url==='/guardian-portal/messages/5'?[root]:[]};});
 const w=mount(Conversations,opts({initialThreadId:5,initialMessageId:101}));await flushPromises();expect(release).toBeTypeOf('function');await w.setProps({clientId:9,threads:[other]});await flushPromises();release({data:{threadId:5,rootMessageId:100,messageId:101}});await flushPromises();expect(w.text()).toContain('Other child');expect(w.text()).not.toContain(root.subject);expect(w.findAll('.subject-row')).toHaveLength(0);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('does not insert an old child subject after a delayed exact-root response resolves',async()=>{
 let release;const other={...current,client_id:9,client_label:'Other child',thread_id:30};
 api.get.mockImplementation(async(url,{params}={})=>{if(url.endsWith('/locate/101'))return {data:{threadId:5,rootMessageId:100,messageId:101}};if(url==='/guardian-portal/messages/5'&&params?.messageId===100)return new Promise(done=>release=done);return {data:[]};});
 const w=mount(Conversations,opts({initialThreadId:5,initialMessageId:101}));await flushPromises();expect(release).toBeTypeOf('function');await w.setProps({clientId:9,threads:[other]});await flushPromises();release({data:[root]});await flushPromises();expect(w.text()).toContain('Other child');expect(w.text()).not.toContain(root.subject);expect(w.findAll('.subject-row')).toHaveLength(0);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('moves to another authorized profile for a newly changed notification without remounting the family panel',async()=>{
 const other={...history,client_id:9,client_label:'Other child',thread_id:30,readOnly:true};const otherRoot={...root,id:300,subject:'Other child subject',body:'Other child message'};
 api.get.mockImplementation(async(url,{params}={})=>({data:url==='/guardian-portal/messages/5'?(params?.parentMessageId?[]:[root]):url==='/guardian-portal/messages/30'?(params?.parentMessageId?[]:[otherRoot]):[]}));
 const w=mount(Conversations,opts({clientId:null,threads:[current,history,other],initialThreadId:5,initialMessageId:100}));await flushPromises();expect(w.get('h3').text()).toBe(root.subject);await w.setProps({initialThreadId:30,initialMessageId:300});await flushPromises();expect(w.get('h3').text()).toBe(otherRoot.subject);expect(w.text()).toContain(otherRoot.body);expect(w.text()).not.toContain(root.body);expect(w.find('textarea').exists()).toBe(false);w.unmount();
});
it('loads and highlights the exact notified old reply without skipping intervening reply pages',async()=>{
 const oldReply={...reply,id:110,body:'The exact earlier notification'};const recent=Array.from({length:60},(_,i)=>({...reply,id:200+i,body:`Recent reply ${200+i}`}));
 api.get.mockImplementation(async(url,{params}={})=>{if(url.endsWith('/locate/110'))return {data:{threadId:20,rootMessageId:100,messageId:110}};if(url!=='/guardian-portal/messages/20')return {data:[]};if(params?.replyMessageId)return {data:[oldReply]};if(params?.parentMessageId)return {data:params.beforeId?Array.from({length:60},(_,i)=>({...reply,id:140+i})):recent};return {data:[root]};});
 const w=mount(Conversations,opts({threads:[current],initialThreadId:20,initialMessageId:110}));await flushPromises();expect(api.get).toHaveBeenCalledWith('/guardian-portal/messages/20',expect.objectContaining({params:expect.objectContaining({parentMessageId:100,replyMessageId:110})}));expect(w.get('[data-message-id="110"]').text()).toContain(oldReply.body);expect(w.get('[data-message-id="110"]').classes()).toContain('is-notified');await w.findAll('button').find(b=>b.text()==='Earlier replies').trigger('click');await flushPromises();expect(api.get).toHaveBeenCalledWith('/guardian-portal/messages/20',expect.objectContaining({params:expect.objectContaining({parentMessageId:100,beforeId:200})}));expect(w.findAll('[data-message-id="110"]')).toHaveLength(1);w.unmount();
});
it('clears old recipients and paging cursors when a different subject fails to open',async()=>{
 const second={...root,id:300,subject:'Unavailable subject'};const replies=Array.from({length:60},(_,i)=>({...reply,id:101+i}));
 api.get.mockImplementation(async(url,{params}={})=>{if(url!=='/guardian-portal/messages/5')return {data:[]};if(params?.messageId===300)throw {response:{status:403}};if(params?.parentMessageId)return {data:replies};if(params?.messageId)return {data:[root]};return {data:[root,second]};});
 const w=mount(Conversations,opts());await flushPromises();await w.findAll('.subject-row').find(b=>b.text().includes(root.subject)).trigger('click');await flushPromises();expect(w.find('form').exists()).toBe(true);expect(w.findAll('button').some(b=>b.text()==='Earlier replies')).toBe(true);await w.findAll('.subject-row').find(b=>b.text().includes(second.subject)).trigger('click');await flushPromises();expect(w.get('[role="alert"]').text()).toContain('could not be opened');expect(w.find('form').exists()).toBe(false);expect(w.find('.conversation-audience').exists()).toBe(false);expect(w.findAll('button').some(b=>b.text()==='Earlier replies')).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('does not resurrect a draft the user deliberately cleared before changing subjects',async()=>{
 const second={...root,id:300,subject:'Second subject'};api.get.mockImplementation(async(url,{params}={})=>({data:url!=='/guardian-portal/messages/5'?[]:params?.parentMessageId?[]:params?.messageId?[root,second].filter(r=>r.id===params.messageId):[root,second]}));
 const w=mount(Conversations,opts());await flushPromises();const choose=async text=>{await w.findAll('.subject-row').find(b=>b.text().includes(text)).trigger('click');await flushPromises();};await choose(root.subject);await w.get('textarea').setValue('Discard this draft');await choose(second.subject);await choose(root.subject);expect(w.get('textarea').element.value).toBe('Discard this draft');await w.get('textarea').setValue('');await choose(second.subject);await choose(root.subject);expect(w.get('textarea').element.value).toBe('');w.unmount();
});
it('restores the selected older subject and draft after its root falls outside the latest subject page',async()=>{
 const recent=Array.from({length:60},(_,i)=>({...root,id:200+i,subject:`Recent subject ${200+i}`}));api.get.mockImplementation(async(url,{params}={})=>({data:url!=='/guardian-portal/messages/5'?[]:params?.parentMessageId?[]:params?.messageId?[root]:params?.beforeId?[root]:recent}));
 const w=mount(Conversations,opts({threads:[history]}));await flushPromises();await w.findAll('button').find(b=>b.text()==='Older subjects').trigger('click');await flushPromises();await w.findAll('.subject-row').find(b=>b.text().includes(root.subject)).trigger('click');await flushPromises();await w.get('textarea').setValue('Older subject draft');await w.setProps({threads:[{...history}]});await flushPromises();expect(w.get('h3').text()).toBe(root.subject);expect(w.get('textarea').element.value).toBe('Older subject draft');w.unmount();
});

it('uses the exact-read contract for a notified subject outside the summary page',async()=>{
 api.get.mockImplementation(async(url,{params}={})=>{
  if(url.endsWith('/locate/100'))return {data:{threadId:5,rootMessageId:100,messageId:100}};
  if(url!=='/guardian-portal/messages/5')return {data:[]};
  if(params?.messageId){if(params.summaryOnly)throw {response:{status:400}};return {data:[root]};}
  if(params?.parentMessageId)return {data:[reply]};return {data:[]};
 });
 const w=mount(Conversations,opts({initialThreadId:5,initialMessageId:100}));await flushPromises();expect(w.text()).toContain(root.body);expect(w.find('[role=alert]').exists()).toBe(false);expect(api.get.mock.calls.filter(([,o])=>o?.params?.messageId).every(([,o])=>!o.params.summaryOnly)).toBe(true);w.unmount();
});
