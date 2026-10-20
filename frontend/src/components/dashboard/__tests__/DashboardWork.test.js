import {shallowMount,flushPromises} from '@vue/test-utils';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {ref} from 'vue';
const mocks=vi.hoisted(()=>({push:vi.fn(),get:vi.fn(),user:{id:8,role:'provider'},queue:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'agency'}}),useRouter:()=>({push:mocks.push})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:mocks.user})}));
vi.mock('../../../services/api',()=>({default:{get:mocks.get}}));
vi.mock('../../../composables/useDashboardOverview',()=>({useDashboardOverview:()=>Object.fromEntries(Object.entries({loading:false,error:'',summary:{},todayScheduleItems:[],nextScheduleItem:null,notesStats:{},directIndirect:{},supervisionHours:{},payPeriod:{},paycheckCompare:null,upcomingEvents:[],featuredEvent:null,recentActivityItems:[],unreadCount:0,notesToSignCount:0,taskCount:0}).map(([k,v])=>[k,ref(v)]).concat([['refresh',vi.fn()]]))}));
vi.mock('../../../utils/noteAidWorkQueue.js',async importOriginal=>({...await importOriginal(),fetchWorkQueueFromApi:mocks.queue}));
import Home from '../DashboardOverviewHome.vue';
import Work from '../OverviewWorkCard.vue';
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();mocks.get.mockResolvedValue({data:{notes:[],drafts:[]}});mocks.queue.mockResolvedValue([]);});
describe('dashboard work',()=>{
 it('lets staff hide and reorder cards and restores their choices',async()=>{
  let w=shallowMount(Home,{props:{agencyId:2,showNotes:true,showSchedule:true,showPayroll:true}});await flushPromises();
  await w.get('.ov-customize').trigger('click');
  const editor=w.get('.ov-card-editor');
  await editor.findAll('label').find(l=>l.text().includes('Events for you')).get('input').setValue(false);
  await editor.get('[aria-label="Move My Work down"]').trigger('click');
  await flushPromises();expect(w.find('overview-events-card-stub').exists()).toBe(false);expect(w.get('overview-work-card-stub').attributes('style')).toContain('order: 1');w.unmount();
  w=shallowMount(Home,{props:{agencyId:2,showNotes:true}});await flushPromises();expect(w.find('overview-events-card-stub').exists()).toBe(false);expect(w.get('overview-work-card-stub').attributes('style')).toContain('order: 1');w.unmount();
 });
 it('opens the selected exact work queue item in Notes Workspace',async()=>{const w=shallowMount(Work);await flushPromises();w.findComponent({name:'NoteAidWorkQueuePanel'}).vm.$emit('select',{id:42,agencyId:2});await flushPromises();expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({query:expect.objectContaining({workQueueId:'42',agencyId:'2',launchIntent:'work_queue'})}));w.unmount();});
});
