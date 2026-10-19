import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {reactive} from 'vue';
import {flushPromises,mount} from '@vue/test-utils';
import MyMeetingsView from '../MyMeetingsView.vue';
const mocks=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),post:vi.fn(),replace:vi.fn(),query:{},agency:null}));
vi.mock('../../services/api',()=>({default:mocks}));
vi.mock('../../store/agency',()=>({useAgencyStore:()=>mocks.agency}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'},query:mocks.query}),useRouter:()=>({replace:mocks.replace})}));
const record={meeting:{id:7,type:'team',title:'CPA review',startAt:'2026-10-01T17:00:00Z'},attendance:[{user_id:12,name:'Sam',total_seconds:1800}],presence:[],agenda:[{id:1,title:'Intake workflow',status:'discussed'}],workspace:{goals:[],actionItems:[]},personalNote:'My draft',transcript:'Shared conversation',summary:'',summaryStatus:'generating'};
let wrapper;
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();mocks.query={};mocks.agency=reactive({currentAgency:{id:2}});mocks.get.mockImplementation(async url=>({data:url.endsWith('/my-meetings')?{meetings:[{id:7,type:'team',title:'CPA review',category:'cpa',start_at:'2026-10-01T17:00:00Z'}],hasMore:false}:record}));});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
async function open(){wrapper=mount(MyMeetingsView,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();await wrapper.get('.meeting-row').trigger('click');await flushPromises();}
const selectTab=async text=>{await wrapper.findAll('.tabs button').find(b=>b.text()===text).trigger('click');};
describe('My meetings records',()=>{
 it('preserves the emailed record when agency context finishes loading',async()=>{
  mocks.query={type:'team',meetingId:'7',tab:'Transcript'};mocks.agency.currentAgency=null;
  wrapper=mount(MyMeetingsView,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();
  mocks.agency.currentAgency={id:2};await flushPromises();
  expect(wrapper.get('pre').text()).toBe('Shared conversation');
 });

 it('opens an emailed transcript link directly on the saved transcript',async()=>{
  mocks.query={type:'team',meetingId:'7',tab:'Transcript'};
  wrapper=mount(MyMeetingsView,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();
  expect(wrapper.get('pre').text()).toBe('Shared conversation');
 });
 it('keeps task owner subheadings and excludes other sections from the task tab',async()=>{
  await open();mocks.get.mockResolvedValue({data:{...record,summaryStatus:'ready',summary:'## Tasks by person\n### Pat\n- Send schedule\n## Suggested next steps\n- Optional review'}});
  await vi.advanceTimersByTimeAsync(5000);await flushPromises();await selectTab('Tasks by person');
  expect(wrapper.text()).toContain('Pat');expect(wrapper.text()).toContain('Send schedule');expect(wrapper.text()).not.toContain('Optional review');
 });

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
  await open();await wrapper.get('.back-button').trigger('click');await flushPromises();await wrapper.get('select').setValue('supervision');await wrapper.get('input[type=date]').setValue('2026-09-01');await wrapper.get('form').trigger('submit');await flushPromises();
  expect(mocks.get).toHaveBeenLastCalledWith('/team-meetings/my-meetings',expect.objectContaining({params:expect.objectContaining({category:'supervision',from:'2026-09-01',agencyId:2})}));
 });
});

describe('Meetings dashboard navigation and activity',()=>{
 it('keeps the dashboard rail tab while opening and switching record tabs',async()=>{
  mocks.query={tab:'meetings'};
  wrapper=mount(MyMeetingsView,{props:{embedded:true},global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();
  await wrapper.get('.meeting-row').trigger('click');await flushPromises();await selectTab('Transcript');await flushPromises();
  expect(mocks.replace).toHaveBeenLastCalledWith({query:{tab:'meetings',meetingTab:'Transcript',type:'team',meetingId:7}});
  await wrapper.get('.back-button').trigger('click');await flushPromises();expect(wrapper.findAll('.category-card')).toHaveLength(7);expect(wrapper.text()).toContain('Scheduled staff learning and attendance.');
  expect(mocks.replace).toHaveBeenLastCalledWith({query:{tab:'meetings'}});
 });
 it('opens administrative subcategories and reports actual returned counts',async()=>{
  mocks.get.mockResolvedValue({data:{meetings:[],hasMore:false,total:3,counts:{cpa:2,huddle:1}}});
  wrapper=mount(MyMeetingsView,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();
  const card=wrapper.findAll('.category-card').find(b=>b.text().includes('Administrative meetings'));
  expect(card.get('.category-count').text()).toBe('3');await card.trigger('click');await flushPromises();
  await wrapper.findAll('.admin-tabs button').find(b=>b.text()==='CPA').trigger('click');await flushPromises();
  expect(mocks.get).toHaveBeenLastCalledWith('/team-meetings/my-meetings',expect.objectContaining({params:expect.objectContaining({category:'cpa'})}));
 });
 it('loads chat pages on demand, keeps existing messages, and labels stored activity',async()=>{
  await open();
  mocks.get.mockResolvedValueOnce({data:{activity:[{id:1,activityType:'chat',payload:{text:'Bring the agenda',authorName:'Sam'},createdAt:'2026-10-01T17:00:00Z'}],hasMore:true}});
  await selectTab('Chat & activity');await flushPromises();expect(wrapper.text()).toContain('Bring the agenda');
  mocks.get.mockResolvedValueOnce({data:{activity:[{id:2,activityType:'question',payload:{text:'What is next?',authorName:'Pat'}}],hasMore:false}});
  await wrapper.findAll('button').find(b=>b.text()==='Load more activity').trigger('click');await flushPromises();
  expect(mocks.get).toHaveBeenLastCalledWith('/team-meetings/my-meetings/team/7/activity',{params:{offset:1},skipGlobalLoading:true});
  expect(wrapper.text()).toContain('Bring the agenda');expect(wrapper.text()).toContain('What is next?');expect(wrapper.text()).toContain('Discussion point');
 });
 it('keeps unsaved notes on screen when returning to the library',async()=>{
  await open();await selectTab('My notes');await wrapper.get('textarea').setValue('Keep this draft');await wrapper.get('.back-button').trigger('click');
  expect(wrapper.get('textarea').element.value).toBe('Keep this draft');expect(wrapper.get('[role=alert]').text()).toContain('Save your personal notes');
 });
});
