import {flushPromises,mount} from '@vue/test-utils';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import MeetingNotesPanel from '../MeetingNotesPanel.vue';
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:mock}));
describe('live transcript display',()=>{
  beforeEach(()=>{vi.useFakeTimers();mock.get.mockReset();mock.get.mockResolvedValue({data:{transcript:'[Alex] Hello everyone'}});});
  afterEach(()=>vi.useRealTimers());
  it('opens live text automatically, polls, and offers viewers no editing controls',async()=>{
    const w=mount(MeetingNotesPanel,{props:{eventId:4,autoRefresh:true,readOnly:true}});await flushPromises();
    expect(w.get('textarea').element.value).toContain('Hello everyone');
    expect(w.get('textarea').attributes('readonly')).toBeDefined();
    expect(w.find('.mnp__actions').exists()).toBe(false);
    mock.get.mockResolvedValue({data:{transcript:'[Alex] Hello everyone\n[Sam] Hi Alex'}});
    await vi.advanceTimersByTimeAsync(5000);
    expect(w.get('textarea').element.value).toContain('Hi Alex');w.unmount();
  });
});
