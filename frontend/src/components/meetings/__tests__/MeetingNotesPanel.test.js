import {flushPromises,mount} from '@vue/test-utils';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import MeetingNotesPanel from '../MeetingNotesPanel.vue';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{}})}));
vi.mock('../../../services/api',()=>({default:mock}));
describe('live transcript display',()=>{
  beforeEach(()=>{vi.useFakeTimers();mock.get.mockReset();mock.post.mockReset();mock.post.mockResolvedValue({data:{ok:true}});mock.get.mockResolvedValue({data:{transcript:'[Alex] Hello everyone'}});});
  afterEach(()=>vi.useRealTimers());
  it('opens live text automatically, polls, and offers viewers no editing controls',async()=>{
    const w=mount(MeetingNotesPanel,{props:{eventId:4,autoRefresh:true,readOnly:true},global:{stubs:{RouterLink:true}}});await flushPromises();
    expect(w.get('textarea').element.value).toContain('Hello everyone');
    expect(w.get('textarea').attributes('readonly')).toBeDefined();
    expect(w.find('.mnp__actions').exists()).toBe(false);
    mock.get.mockResolvedValue({data:{transcript:'[Alex] Hello everyone\n[Sam] Hi Alex'}});
    await vi.advanceTimersByTimeAsync(5000);
    expect(w.get('textarea').element.value).toContain('Hi Alex');w.unmount();
  });
  it('saves transcript edits through the existing endpoint and polls pending summaries even outside a live room',async()=>{
    mock.get.mockResolvedValue({data:{transcript:'Transcript',summaryStatus:'queued'}});
    const w=mount(MeetingNotesPanel,{props:{eventId:4},global:{stubs:{RouterLink:true}}});await flushPromises();
    await w.get('.mnp__collapse').trigger('click');
    expect(w.text()).toContain('Summary still generating');
    await w.get('textarea').setValue('Edited transcript');
    await w.findAll('button').find(b=>b.text()==='Save & summarize').trigger('click');await flushPromises();
    expect(mock.post).toHaveBeenCalledWith('/team-meetings/4/client-transcript',{transcript:'Edited transcript',replace:true},expect.anything());
    mock.get.mockResolvedValue({data:{transcript:'Edited transcript',summary:'## Facts\nSaved evidence',summaryStatus:'ready'}});
    await vi.advanceTimersByTimeAsync(5000);await flushPromises();
    expect(w.find('.mnp__summary h2').text()).toBe('Facts');w.unmount();
  });

});

it('keeps chronological text, focus and scroll position while a live transcript refreshes',async()=>{
 vi.useFakeTimers();mock.get.mockResolvedValue({data:{transcript:'[Alex] First\n[Sam] Second'}});
 const w=mount(MeetingNotesPanel,{attachTo:document.body,props:{eventId:4,autoRefresh:true,readOnly:true},global:{stubs:{RouterLink:true}}});await flushPromises();
 const text=w.get('textarea').element;text.focus();text.scrollTop=120;text.setSelectionRange(2,8);
 mock.get.mockResolvedValue({data:{transcript:'[Alex] First\n[Sam] Second\n[Alex] Third'}});await vi.advanceTimersByTimeAsync(5000);await flushPromises();
 expect(w.get('textarea').element).toBe(text);expect(document.activeElement).toBe(text);expect(text.scrollTop).toBe(120);expect(text.value.indexOf('First')).toBeLessThan(text.value.indexOf('Third'));w.unmount();vi.useRealTimers();
});
