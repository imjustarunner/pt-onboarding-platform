import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import LogTime from '../HourlyIndirectTimeLog.vue';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),push:vi.fn(),agency:{id:2,feature_flags:{}},user:{id:7,firstName:'Test',role:'provider',has_supervisor_privileges:1}}));
vi.mock('../../../services/api',()=>({default:m}));
vi.mock('vue-router',()=>({useRoute:()=>({path:'/itsco/dashboard',query:{}}),useRouter:()=>({push:m.push})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:m.user})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:m.agency})}));
vi.mock('../../../store/userPreferences',()=>({useUserPreferencesStore:()=>({timezone:'America/Denver'})}));
vi.mock('../../../store/indirectTimeSession',()=>({useIndirectTimeSessionStore:()=>({takePendingClosedSession:()=>null,clearSession:vi.fn(),clearNoteAidSessionFlag:vi.fn(),clearClockOutAdjust:vi.fn()})}));
let wrapper;
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();m.user.has_supervisor_privileges=1;m.agency.id=2;
 m.get.mockImplementation(async url=>({data:url.endsWith('/indirect-service-types')?{types:[{id:1,typeKey:'supervision_note_time',label:'Supervision Note Time',payBucket:'supervision_note',iconKey:'file-text',description:'Review and sign supervisee notes',assignmentId:99}]}:url.endsWith('/time-claims')?[]:{session:null}}));
 m.post.mockResolvedValue({data:{id:77}});
});
afterEach(()=>wrapper?.unmount());
async function open(){wrapper=mount(LogTime,{props:{agencyId:m.agency.id},global:{stubs:{FfsExcessTime:true,EventTravelReportModal:true}}});await flushPromises();await wrapper.findAll('button').find(b=>b.text().includes('Post Start')).trigger('click');await wrapper.get('input[type="date"]').setValue('2026-11-06');const inputs=wrapper.findAll('input[type="time"]');await inputs[0].setValue('09:00');await inputs[1].setValue('09:30');await flushPromises();}
it.each([2,6])('allows manual supervision note submission at Admin Time while retaining Indirect hours in agency %s',async agencyId=>{
 m.agency.id=agencyId;await open();expect(wrapper.find('.itl-dual-col--supervision').text()).toContain('50% of your supervision rate');
 await wrapper.findAll('.itl-type-card').find(c=>c.text().includes('Supervision Note Time')).trigger('click');await wrapper.get('textarea').setValue('Reviewed and signed supervisee documentation.');
 await wrapper.findAll('input[type="checkbox"]').find(i=>i.element.closest('.itl-attest-card')).setValue(true);
 await wrapper.findAll('button').find(b=>b.classes().includes('itl-submit')).trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/payroll/me/time-claims',expect.objectContaining({agencyId,payload:expect.objectContaining({categoryGroup:'supervision_note',serviceCode:'Admin Time',totalMinutes:30,allocations:[expect.objectContaining({serviceTypeKey:'supervision_note_time',payBucket:'supervision_note'})]})}));
});
it('hides note time for general supervisors without a clinical duty in this agency',async()=>{m.get.mockImplementation(async url=>({data:url.endsWith('/indirect-service-types')?{types:[]}:url.endsWith('/time-claims')?[]:{session:null}}));await open();expect(wrapper.find('.itl-dual-col--supervision').exists()).toBe(false);});
it('shows the clinical duty even when the generic supervisor flag is absent',async()=>{m.user.has_supervisor_privileges=0;await open();expect(wrapper.find('.itl-dual-col--supervision').exists()).toBe(true);});
