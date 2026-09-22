import {mount,flushPromises} from '@vue/test-utils';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import DashboardMeetings from '../DashboardMeetings.vue';
const api=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:5}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2}})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'}})}));
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-22T18:00:00Z'));});
afterEach(()=>vi.useRealTimers());
describe('dashboard meeting entry',()=>{
 it('highlights current and next-five-minute meetings, hides ended meetings, and deep-links later ones',async()=>{
  api.get.mockResolvedValue({data:{scheduleEvents:[
   {id:1,kind:'TEAM_MEETING',title:'Now',startAt:'2026-09-22T17:30:00Z',endAt:'2026-09-22T18:30:00Z',appJoinUrl:'/join/current'},
   {id:2,kind:'TEAM_MEETING',title:'Five minutes',startAt:'2026-09-22T18:05:00Z',endAt:'2026-09-22T19:00:00Z',appJoinUrl:'/join/five'},
   {id:3,kind:'TEAM_MEETING',title:'Later',startAt:'2026-09-22T18:06:00Z',endAt:'2026-09-22T19:00:00Z',appJoinUrl:'/join/later'},
   {id:4,kind:'TEAM_MEETING',title:'Ended',startAt:'2026-09-22T17:00:00Z',endAt:'2026-09-22T18:00:00Z',appJoinUrl:'/join/ended'}]}});
  const w=mount(DashboardMeetings,{global:{stubs:{RouterLink:{props:['to'],template:'<span class="schedule-link">{{to.query.eventId}} · View meeting</span>'}}}});await flushPromises();
  expect(w.findAll('.meeting-join').map(a=>a.attributes('href'))).toEqual(['/join/current','/join/five']);expect(w.text()).not.toContain('Ended');expect(w.get('.schedule-link').text()).toContain('3');
  await vi.advanceTimersByTimeAsync(60000);expect(w.findAll('.meeting-join')).toHaveLength(3);w.unmount();
 });
});
