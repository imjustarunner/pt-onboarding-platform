import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),patch:vi.fn(),leave:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{sessionId:'101'}}),useRouter:()=>({back:vi.fn()}),onBeforeRouteLeave:m.leave,onBeforeRouteUpdate:vi.fn()}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:7}})}));
vi.mock('../../../services/api',()=>({default:{get:m.get,patch:m.patch}}));
import Builder from '../SupervisionPresentationBuilderView.vue';
let wrapper;
beforeEach(()=>{
  vi.clearAllMocks();
  m.get.mockResolvedValue({data:{presentation:{id:11,slides:[{id:1,title:'First',body_html:'',presenter_notes:''},{id:2,title:'Second',body_html:'',presenter_notes:''}]}}});
  m.patch.mockImplementation(async(url,p)=>({data:{slide:{id:Number(url.split('/').pop()),title:p.title,body_html:p.bodyHtml,presenter_notes:p.presenterNotes}}}));
});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
async function load(){wrapper=mount(Builder,{global:{stubs:{RouterLink:true}}});await flushPromises();return wrapper;}
it('saves content and notes before changing sections',async()=>{
  await load(); const editor=wrapper.find('[contenteditable]');editor.element.innerHTML='<ul><li>Keep this</li></ul>';await editor.trigger('input');
  await wrapper.find('textarea').setValue('Private notes');
  await wrapper.findAll('.spb__nav-btns button')[1].trigger('click');await flushPromises();
  expect(m.patch).toHaveBeenCalledWith('/supervision/presentation-slides/1',expect.objectContaining({bodyHtml:'<ul><li>Keep this</li></ul>',presenterNotes:'Private notes'}));
  expect(wrapper.find('.spb__title-readonly').text()).toBe('Second');
});
it('keeps the current section and draft if saving fails',async()=>{
  await load();m.patch.mockRejectedValue(new Error('offline'));const editor=wrapper.find('[contenteditable]');editor.element.innerHTML='Unsaved';await editor.trigger('input');
  await wrapper.findAll('.spb__nav-btns button')[1].trigger('click');await flushPromises();
  expect(wrapper.find('.spb__title-readonly').text()).toBe('First');expect(editor.element.innerHTML).toBe('Unsaved');expect(wrapper.text()).toContain('Failed to save section');
});
it('debounces automatic saves without clicking Save',async()=>{
  await load();vi.useFakeTimers();const editor=wrapper.find('[contenteditable]');editor.element.innerHTML='Autosaved';await editor.trigger('input');
  await vi.advanceTimersByTimeAsync(700);expect(m.patch).toHaveBeenCalledOnce();expect(wrapper.text()).toContain('Saved');
});
