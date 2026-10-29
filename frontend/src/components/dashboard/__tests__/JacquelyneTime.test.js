import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import HourlyIndirectTimeLog from '../HourlyIndirectTimeLog.vue';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), push: vi.fn(), types: [], admin: null }));
vi.mock('../../../services/api', () => ({ default: m }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path:'/itsco/dashboard',query:{} }), useRouter: () => ({ push:m.push }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user:{id:485,firstName:'Jacquelyne',role:'provider_plus'} }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency:{id:2,feature_flags:{}} }) }));
vi.mock('../../../store/userPreferences', () => ({ useUserPreferencesStore: () => ({ timezone:'America/Denver' }) }));
vi.mock('../../../store/indirectTimeSession', () => ({ useIndirectTimeSessionStore: () => ({ takePendingClosedSession:()=>null,clearSession:vi.fn(),clearNoteAidSessionFlag:vi.fn(),clearClockOutAdjust:vi.fn() }) }));
let wrapper;
const type=(id,key,label,payBucket)=>({id,typeKey:key,label,payBucket,description:`Allowed: ${label}`,iconKey:'clock',displayCode:`TEST-${id}`});
beforeEach(() => {
 vi.clearAllMocks();sessionStorage.clear();
 m.types=[type(1,'writing_notes','Writing notes','indirect'),type(2,'jacquelyne_team_checkins','Team check-ins','support'),type(3,'jacquelyne_translation','Translation','admin'),type(4,'jacquelyne_outreach','Outreach','admin'),type(5,'jacquelyne_onboarding','Onboarding help','admin')];
 m.admin={rate:25,huddles:[]};
 m.get.mockImplementation(async url=>({data:url.endsWith('/indirect-service-types')?{types:m.types,adminTime:m.admin}:url.endsWith('/time-claims')?[]:{session:null}}));
 m.post.mockResolvedValue({data:{id:77}});
});
afterEach(()=>wrapper?.unmount());
async function openActivities() {
 wrapper=mount(HourlyIndirectTimeLog,{props:{agencyId:2},global:{stubs:{FfsExcessTime:true,EventTravelReportModal:true}}});
 await flushPromises();
 const manual=wrapper.findAll('button').find(b=>b.text().includes('Post Start'));await manual.trigger('click');
 await wrapper.get('input[type="date"]').setValue('2026-10-29');
 const times=wrapper.findAll('input[type="time"]');await times[0].setValue('09:00');await times[1].setValue('09:30');
 await flushPromises();
}
it('shows three separate colored groups, the $25 rate, and hover guidance',async()=>{
 await openActivities();
 expect(wrapper.find('.itl-dual-col--indirect').exists()).toBe(true);
 expect(wrapper.find('.itl-dual-col--support').exists()).toBe(true);
 expect(wrapper.find('.itl-dual-col--admin').text()).toContain('$25.00/hour');
 expect(wrapper.findAll('.itl-type-card').every(c=>c.attributes('title')?.startsWith('Allowed:'))).toBe(true);
 expect(wrapper.findAll('.itl-type-card').every(c=>c.attributes('tabindex')==='0')).toBe(true);
 await wrapper.findAll('button').find(b=>b.text()==='Submit outreach trips').trigger('click');
 expect(wrapper.find('event-travel-report-modal-stub').exists()).toBe(true);
});
it('hides Admin Time when the API returns no private duties',async()=>{
 m.types=m.types.filter(t=>t.payBucket!=='admin'&&!t.typeKey.startsWith('jacquelyne_'));m.admin=null;
 await openActivities();expect(wrapper.find('.itl-dual-col--admin').exists()).toBe(false);
});
it('submits translation under Admin Time with its required work note',async()=>{
 await openActivities();
 await wrapper.findAll('.itl-type-card').find(c=>c.text().includes('Translation')).trigger('click');
 await wrapper.get('textarea').setValue('Translated information for the support team.');
 await wrapper.findAll('input[type="checkbox"]').find(i=>i.element.closest('.itl-attest-card')).setValue(true);
 const submit=wrapper.findAll('button').find(b=>b.classes().includes('itl-submit'));
 expect(submit).toBeTruthy();await submit.trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/payroll/me/time-claims',expect.objectContaining({payload:expect.objectContaining({categoryGroup:'admin_duties',serviceCode:'Admin Time',totalMinutes:30,description:'Translated information for the support team.',allocations:[expect.objectContaining({serviceTypeKey:'jacquelyne_translation',payBucket:'admin'})]})}));
});
it('requires a scheduled huddle before submitting onboarding help',async()=>{
 await openActivities();await wrapper.findAll('.itl-type-card').find(c=>c.text().includes('Onboarding help')).trigger('click');
 expect(wrapper.get('[aria-label="Scheduled onboarding huddle"]').exists()).toBe(true);
 expect(wrapper.text()).toContain('No scheduled huddle is available');
 expect(wrapper.findAll('button').find(b=>b.classes().includes('itl-submit')).attributes('disabled')).toBeDefined();
});
