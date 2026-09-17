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
  if(method==='get')return {data:{conversation:{id:10,agency_id:2,inbox_from_email:'eden@itsco.health',subject:'Question'},messages:[{id:1,from:{email:'help@grasshopper.com'},direction:'inbound',to:[{email:'eden@itsco.health'},{email:'staff@itsco.health'}],body_text:'The whole email'}]}};
  if(method==='post'&&url==='/communications/drafts')return {data:{draft:{id:'mine',agency_id:2,conversation_id:10,mode:'reply_all',version:1,state:'editing',from_email:'eden@itsco.health',draft:data.draft}}};
  if(method==='put')return {data:{version:2}};
  return {data:{}};
 });
 wrapper=shallowMount(Composer);state=wrapper.vm.$.setupState;await flushPromises();
});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
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
