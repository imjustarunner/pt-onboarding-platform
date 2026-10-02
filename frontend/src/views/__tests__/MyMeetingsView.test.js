import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import MyMeetingsView from '../MyMeetingsView.vue';
const mocks=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),post:vi.fn(),replace:vi.fn()}));
vi.mock('../../services/api',()=>({default:mocks}));
vi.mock('../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2}})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'},query:{}}),useRouter:()=>({replace:mocks.replace})}));
const record={meeting:{id:7,type:'team',title:'CPA review',startAt:'2026-10-01T17:00:00Z'},attendance:[{user_id:12,name:'Sam',total_seconds:1800}],presence:[],agenda:[{id:1,title:'Intake workflow',status:'discussed'}],workspace:{goals:[],actionItems:[]},personalNote:'My draft',transcript:'Shared conversation',summary:'',summaryStatus:'generating'};
let wrapper;
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();mocks.get.mockImplementation(async url=>({data:url.endsWith('/my-meetings')?{meetings:[{id:7,type:'team',title:'CPA review',category:'cpa',start_at:'2026-10-01T17:00:00Z'}],hasMore:false}:record}));});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
async function open(){wrapper=mount(MyMeetingsView,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();await wrapper.get('.meeting-row').trigger('click');await flushPromises();}
const selectTab=async text=>{await wrapper.findAll('.tabs button').find(b=>b.text()===text).trigger('click');};
describe('My meetings records',()=>{
 it('shows attendance and agenda, then the background summary status',async()=>{
  await open();expect(wrapper.text()).toContain('Sam · 30 minutes');expect(wrapper.text()).toContain('Intake workflow');
  await selectTab('Summary');expect(wrapper.text()).toContain('Summary still generating');
  mocks.get.mockResolvedValue({data:{...record,summaryStatus:'ready',summary:'## Facts\nAgreed policy\n## Suggested next steps\n- First step\n- Second step'}});
  await vi.advanceTimersByTimeAsync(5000);await flushPromises();expect(wrapper.text()).toContain('Agreed policy');
  await selectTab('Suggested next steps');expect(wrapper.text()).toContain('First step');expect(wrapper.text()).toContain('Second step');expect(wrapper.text()).not.toContain('Agreed policy');
 });
 it('keeps unsaved personal notes while summaries poll and saves them to the personal endpoint',async()=>{
  await open();await selectTab('My notes');await wrapper.get('textarea').setValue('Unsaved private note');
  await vi.advanceTimersByTimeAsync(5000);await flushPromises();expect(wrapper.get('textarea').element.value).toBe('Unsaved private note');
  await wrapper.findAll('button').find(b=>b.text()==='Save my notes').trigger('click');await flushPromises();
  expect(mocks.put).toHaveBeenCalledWith('/team-meetings/my-meetings/team/7/personal-note',{noteText:'Unsaved private note'});
 });
 it('sends category and date filters to the history endpoint',async()=>{
  await open();await wrapper.get('select').setValue('supervision');await wrapper.get('input[type=date]').setValue('2026-09-01');await wrapper.get('form').trigger('submit');await flushPromises();
  expect(mocks.get).toHaveBeenLastCalledWith('/team-meetings/my-meetings',expect.objectContaining({params:expect.objectContaining({category:'supervision',from:'2026-09-01',agencyId:2})}));
 });
});
