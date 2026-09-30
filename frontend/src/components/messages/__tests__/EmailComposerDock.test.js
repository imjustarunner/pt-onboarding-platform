import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {defineComponent,h,ref,onMounted} from 'vue';
import Dock from '../EmailComposerDock.vue';
import {openEmailComposer} from '../../../utils/emailComposerWindow';
const mocks=vi.hoisted(()=>({save:vi.fn(),prepare:vi.fn(),router:{currentRoute:{value:{params:{organizationSlug:'sample'}}},resolve:vi.fn(()=>({href:'/sample/email-compose?draftId=d1'}))}}));
vi.mock('vue-router',()=>({useRouter:()=>mocks.router}));
const Editor=defineComponent({props:['composeContext'],emits:['close','composer-state'],setup(props,{emit,expose}){
 const text=ref('');
 expose({save:mocks.save,preparePopout:mocks.prepare,saveAndClose:async()=>{try{await mocks.save();emit('close');}catch{}}});
 onMounted(()=>emit('composer-state',{draftId:props.composeContext.draftId || 'd1',conversationId:props.composeContext.conversationId || 10,mode:props.composeContext.mode || 'reply',subject:'Unfinished reply',status:'Draft saved',busy:false}));
 return ()=>h('textarea',{value:text.value,onInput:event=>text.value=event.target.value});
}});
let wrapper;
beforeEach(async()=>{
 vi.clearAllMocks();mocks.save.mockResolvedValue();mocks.prepare.mockResolvedValue('d1');
 wrapper=mount(Dock,{attachTo:document.body,props:{ownerId:5},global:{stubs:{EmailComposer:Editor}}});await flushPromises();
});
afterEach(()=>{wrapper.unmount();vi.restoreAllMocks();});
async function open(context={mode:'reply',conversationId:10}){openEmailComposer(mocks.router,context);await flushPromises();}
it('minimizes and restores the same editor without losing the reply',async()=>{
 await open();await wrapper.get('textarea').setValue('Keep this reply');
 await wrapper.get('[aria-label="Minimize draft"]').trigger('click');
 expect(wrapper.get('.dock-panel').isVisible()).toBe(false);expect(mocks.save).toHaveBeenCalled();
 await wrapper.get('.dock-tabs button').trigger('click');
 expect(wrapper.get('textarea').element.value).toBe('Keep this reply');expect(wrapper.get('.dock-panel').isVisible()).toBe(true);
});
it('focuses an existing draft while keeping Reply and Reply all distinct',async()=>{
 const popup=vi.spyOn(window,'open');await open();await open();expect(wrapper.findAll('textarea')).toHaveLength(1);expect(popup).not.toHaveBeenCalled();
 await open({mode:'reply_all',conversationId:10});expect(wrapper.findAll('textarea')).toHaveLength(2);
});
it('retains the dock if saving for popout fails',async()=>{
 const popup={document:{},close:vi.fn(),location:{replace:vi.fn()}};vi.spyOn(window,'open').mockReturnValue(popup);mocks.prepare.mockRejectedValue(new Error('offline'));
 await open();await wrapper.get('[aria-label="Pop out draft"]').trigger('click');await flushPromises();
 expect(popup.close).toHaveBeenCalled();expect(popup.location.replace).not.toHaveBeenCalled();expect(wrapper.find('textarea').exists()).toBe(true);
});
it('saves before moving an existing draft to a separate window',async()=>{
 const popup={document:{},close:vi.fn(),location:{replace:vi.fn()}};vi.spyOn(window,'open').mockReturnValue(popup);
 await open();await wrapper.get('[aria-label="Pop out draft"]').trigger('click');await flushPromises();
 expect(mocks.prepare).toHaveBeenCalled();expect(popup.location.replace).toHaveBeenCalledWith('/sample/email-compose?draftId=d1');expect(wrapper.find('textarea').exists()).toBe(false);
});
it('keeps an unsuccessful save-and-close open',async()=>{
 mocks.save.mockRejectedValue(new Error('offline'));await open();await wrapper.get('[aria-label="Save and close draft"]').trigger('click');await flushPromises();
 expect(wrapper.find('textarea').exists()).toBe(true);
});
it('hides email while locked and clears private drafts when the account changes',async()=>{
 await open();await wrapper.setProps({locked:true});expect(wrapper.get('.email-dock').isVisible()).toBe(false);
 await wrapper.setProps({ownerId:6,locked:false});expect(wrapper.find('textarea').exists()).toBe(false);
});
it('clears Quick View drafts when that session ends',async()=>{
 await open({mode:'new',quickView:true,session:'cookie'});window.dispatchEvent(new CustomEvent('quick-view-session-ended'));await flushPromises();
 expect(wrapper.find('textarea').exists()).toBe(false);
});

it('resumes the same open editor when Reply follows opening a saved draft by ID',async()=>{
 await open({draftId:'d1'});await open({mode:'reply',conversationId:10});expect(wrapper.findAll('textarea')).toHaveLength(1);
});
