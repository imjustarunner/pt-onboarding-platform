import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import {nextTick} from 'vue';
import Composer from '../../../views/EmailComposerView.vue';
const mock=vi.hoisted(()=>({api:vi.fn(),replace:vi.fn(),back:vi.fn(),route:{query:{mode:'reply_all',conversationId:'10'},meta:{}}}));
vi.mock('../../../services/api',()=>({default:mock.api}));
vi.mock('vue-router',()=>({useRoute:()=>mock.route,useRouter:()=>({replace:mock.replace,back:mock.back})}));
let wrapper,state;
beforeEach(async()=>{
 vi.useFakeTimers();vi.clearAllMocks();mock.route.query={mode:'reply_all',conversationId:'10'};
 mock.api.mockImplementation(async({method,url,data})=>{
  if(method==='get'&&url.endsWith('/sender'))return {data:{fromEmail:'messages@itsco.health',replyTo:'thughes@itsco.health'}};
  if(method==='get')return {data:{conversation:{id:10,agency_id:2,inbox_from_email:'eden@itsco.health',subject:'Question'},messages:[{id:1,from:{email:'help@grasshopper.com'},direction:'inbound',to:[{email:'eden@itsco.health'},{email:'staff@itsco.health'}],body_text:'The whole email'}]}};
  if(method==='post'&&url==='/communications/drafts')return {data:{draft:{id:'mine',agency_id:2,conversation_id:10,mode:'reply_all',version:1,state:'editing',from_email:'eden@itsco.health',draft:data.draft}}};
  if(method==='put')return {data:{version:2}};
  return {data:{}};
 });
 wrapper=shallowMount(Composer);state=wrapper.vm.$.setupState;await flushPromises();
});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
it('shows effective From and Reply-To in the detached and docked draft composer',()=>{
 expect(wrapper.text()).toContain('From messages@itsco.health');
 expect(wrapper.text()).toContain('Replies to thughes@itsco.health');
});
it('keeps draft editing and autosave usable if sender preview fails',async()=>{
 mock.api.mockRejectedValueOnce(new Error('Directory timeout'));
 await state.loadSenderPreview('mine');
 expect(state.senderPreviewUnavailable).toBe(true);expect(state.loading).toBe(false);
 expect(state.error).toBe('');
 state.draft.text='Still saving';await nextTick();await vi.advanceTimersByTimeAsync(500);await flushPromises();
 expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({method:'put',data:expect.objectContaining({draft:expect.objectContaining({text:'Still saving'})})}));
 expect(state.status).toBe('Draft saved');
});
it('creates a private draft on an explicit reply action, includes group recipients and quoted history',()=>{
 expect(state.draft.to).toBe('help@grasshopper.com');expect(state.draft.cc).toBe('staff@itsco.health');expect(state.draft.quotedText).toContain('The whole email');expect(state.draft.text).toBe('');
 expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({url:'/communications/conversations/10?markRead=0'}));
 expect(mock.replace).toHaveBeenCalledWith({query:{draftId:'mine'}});
});
it('autosaves text and recipients then waits for saving before closing',async()=>{
 state.draft.text='My reply';state.draft.bcc='private@example.org';await nextTick();await vi.advanceTimersByTimeAsync(500);await flushPromises();
 expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({method:'put',url:'/communications/drafts/mine',data:expect.objectContaining({version:1,draft:expect.objectContaining({text:'My reply',bcc:'private@example.org'})})}));
 expect(state.status).toBe('Draft saved');await state.saveAndClose();expect(mock.back).toHaveBeenCalled();
});
it('retains the draft and keeps the window open when saving fails',async()=>{
 mock.api.mockRejectedValueOnce(new Error('offline'));state.draft.text='Do not lose this';await nextTick();await state.saveAndClose();expect(mock.back).not.toHaveBeenCalled();expect(state.error).toContain('Could not save');expect(state.draft.text).toBe('Do not lose this');
});
it('discards only through the explicit delete action',async()=>{
 await state.discard();expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({method:'delete',url:'/communications/drafts/mine'}));expect(mock.back).toHaveBeenCalled();
});

it('warns before queuing an attachment-free email and lets the writer explicitly continue', async()=>{
 state.draft.text='Please send the attachment';await nextTick();await state.send();
 expect(state.confirmAttachment).toBe(true);
 expect(mock.api.mock.calls.some(([c])=>c.url.endsWith('/send'))).toBe(false);
 await state.send({confirmMissingAttachment:true});
 expect(mock.api.mock.calls.filter(([c])=>c.url.endsWith('/send'))).toHaveLength(1);
});
it('does not warn about attachment wording only in quoted history', async()=>{
 state.draft.text='Thank you';state.draft.quotedText='From: Earlier sender\nSee attached';await nextTick();await state.send();
 expect(state.confirmAttachment).toBe(false);
 expect(mock.api.mock.calls.filter(([c])=>c.url.endsWith('/send'))).toHaveLength(1);
});
it('applies a request deadline and preserves unsaved text when saving times out', async()=>{
 state.draft.text='Keep this safe';await nextTick();mock.api.mockRejectedValueOnce(Object.assign(new Error('timeout'),{code:'ECONNABORTED'}));
 await state.saveAndClose();expect(state.busy).toBe(false);expect(state.draft.text).toBe('Keep this safe');expect(mock.back).not.toHaveBeenCalled();
 expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({method:'put',timeout:30000}));
});

it.each(['now','next_available'])('keeps the draft on an availability prompt and sends only the selected %s choice',async(choice)=>{
 state.draft.text='Hello';await nextTick();await state.save();
 mock.api.mockRejectedValueOnce({response:{data:{error:{code:'RECIPIENT_AVAILABILITY_CHOICE_REQUIRED',availability:{recipientCount:1,nextAvailableAt:'2026-10-01T13:00:00Z'}}}}});
 await state.send();expect(state.availabilityPrompt.recipientCount).toBe(1);expect(state.record.state).toBe('editing');expect(state.busy).toBe(false);
 const prompt=wrapper.findComponent({name:'EmailDeliveryChoice'});prompt.vm.$emit('choose',choice);await flushPromises();
 expect(mock.api).toHaveBeenLastCalledWith(expect.objectContaining({url:'/communications/drafts/mine/send',data:{version:2,deliveryChoice:choice}}));
 expect(state.record.state).toBe('sent');
});
it('clears an availability prompt if recipients change',async()=>{
 state.availabilityPrompt={recipientCount:1};state.draft.to='other@example.org';await nextTick();expect(state.availabilityPrompt).toBeNull();
});

it('resumes the saved writing returned by the server instead of replacing it with a blank reply',async()=>{
 wrapper.unmount();const original=mock.api.getMockImplementation();
 mock.api.mockImplementation(async config=>config.method==='post'&&config.url==='/communications/drafts'?{data:{draft:{id:'existing',agency_id:2,mode:'reply_all',version:8,state:'editing',resumed:true,draft:{to:'alice@example.org',cc:'team@example.org',subject:'Saved subject',text:'Work already written',quotedText:'Original',attachments:[]}}}}:original(config));
 wrapper=shallowMount(Composer,{props:{composeContext:{mode:'reply_all',conversationId:10}}});await flushPromises();
 state=wrapper.vm.$.setupState;expect(state.draft.text).toBe('Work already written');expect(state.status).toBe('Draft restored');
 mock.replace.mockClear();await state.saveAndClose();expect(wrapper.emitted('close')).toHaveLength(1);expect(mock.replace).not.toHaveBeenCalled();
});

it('saves all To, Cc and Bcc recipients before queuing the provider email', async()=>{
 wrapper.unmount();
 wrapper=shallowMount(Composer,{global:{stubs:{EmailRecipientField:false}}});await flushPromises();
 state=wrapper.vm.$.setupState;
 const fields=wrapper.findAllComponents({name:'EmailRecipientField'});
 for(const [field,addresses] of [[fields[0],'alice@example.org; bob@example.org'],[fields[1],'carol@example.org, dave@example.org'],[fields[2],'private@example.org; other@example.org']]){
   await field.find('input').setValue(addresses);await field.find('input').trigger('keydown',{key:'Enter'});
 }
 expect(mock.api.mock.calls.some(([c])=>c.url.endsWith('/send'))).toBe(false);
 state.draft.text='Hello everyone';await nextTick();await wrapper.find('form').trigger('submit');await flushPromises();
 const calls=mock.api.mock.calls.map(([c])=>c);
 const saved=calls.findLast(c=>c.method==='put');
 expect(saved.data.draft).toMatchObject({to:'help@grasshopper.com, alice@example.org, bob@example.org',cc:'staff@itsco.health, carol@example.org, dave@example.org',bcc:'private@example.org, other@example.org'});
 expect(calls.findIndex(c=>c===saved)).toBeLessThan(calls.findIndex(c=>c.url.endsWith('/send')));
 expect(state.record.state).toBe('sent');
});

it('allows filing one conversation under both children and saves the selection before retrying send',async()=>{
 state.draft.text='About both children';await nextTick();
 const original=mock.api.getMockImplementation();let prompted=false;
 mock.api.mockImplementation(async request=>{
  if(request.url.endsWith('/send') && !prompted){prompted=true;throw {response:{data:{error:{code:'CLIENT_FILING_CHOICE_REQUIRED',clients:[{id:1,name:'First child'},{id:2,name:'Second child'}]}}}};}
  return original(request);
 });
 await state.send();await flushPromises();expect(wrapper.text()).toContain('Select every child discussed');
 await wrapper.findAll('button').find(b=>b.text()==='Select all listed children').trigger('click');
 await state.send();await flushPromises();
 expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({method:'put',data:expect.objectContaining({draft:expect.objectContaining({clientIds:[1,2]})})}));
});

it('previews and autosaves formatted reply history independently of the new message',async()=>{
 wrapper.unmount();const original=mock.api.getMockImplementation();
 mock.api.mockImplementation(async config=>{
  const response=await original(config);
  if(config.url.includes('/conversations/'))response.data.messages[0].body_html='<p>The complete original paragraph.</p><table><tr><td>Original signature</td></tr></table>';
  return response;
 });
 wrapper=shallowMount(Composer);await flushPromises();state=wrapper.vm.$.setupState;
 expect(wrapper.find('.quoted-email table').exists()).toBe(true);
 expect(wrapper.find('details pre').exists()).toBe(false);
 expect(state.draft.text).toBe('');state.draft.text='My new reply';await nextTick();await state.save();
 expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({method:'put',data:expect.objectContaining({draft:expect.objectContaining({text:'My new reply',quotedHtml:expect.stringContaining('<table>')})})}));
});

it('saves the selected send delay and keeps the server receipt for a longer scheduled send',async()=>{
 state.draft.text='My reply';state.draft.undoDelaySeconds=120;await nextTick();
 const original=mock.api.getMockImplementation();const receipt={messageId:40,conversationId:10,scheduled:true,sent:false,scheduledSendAt:new Date(Date.now()+120000).toISOString()};
 mock.api.mockImplementation(async c=>c.url.endsWith('/send')?{data:receipt}:original(c));
 await state.send();await flushPromises();
 expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({method:'put',data:expect.objectContaining({draft:expect.objectContaining({undoDelaySeconds:120})})}));
 expect(state.status).toBe('Email scheduled — not sent yet');
 expect(wrapper.findComponent({name:'EmailSendReceipt'}).props('receipt')).toEqual(receipt);
});
it('cancels only once if restoring a draft fails, then retries restoring without resending or cancelling again',async()=>{
 state.draft.text='Keep my writing';state.draft.undoDelaySeconds=120;await nextTick();
 const original=mock.api.getMockImplementation();let failRestore=true;
 mock.api.mockImplementation(async c=>{
  if(c.url.endsWith('/send'))return {data:{messageId:40,conversationId:10,scheduled:true,scheduledSendAt:new Date(Date.now()+120000).toISOString()}};
  if(c.url==='/communications/drafts' && failRestore)throw Error('offline');
  return original(c);
 });
 await state.send();await state.undo();expect(state.sendResult.cancelled).toBe(true);expect(state.error).toContain('was cancelled');expect(state.draft.text).toBe('Keep my writing');
 failRestore=false;await state.undo();expect(state.record.state).toBe('editing');expect(state.sendResult).toBeNull();
 expect(mock.api.mock.calls.filter(([c])=>c.url.endsWith('/undo'))).toHaveLength(1);
 expect(mock.api.mock.calls.filter(([c])=>c.url.endsWith('/send'))).toHaveLength(1);
});
