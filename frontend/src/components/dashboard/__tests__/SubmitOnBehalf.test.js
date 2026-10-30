import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import SubmitEmployeePicker from '../SubmitEmployeePicker.vue';
import HourlyIndirectTimeLog from '../HourlyIndirectTimeLog.vue';
import { createSubmitApi, SUBMIT_CONTEXT } from '../../../composables/useSubmitContext';
const m=vi.hoisted(()=>({get:vi.fn(),request:vi.fn(),push:vi.fn(),clear:vi.fn(),take:vi.fn(),typeRequests:[]}));
vi.mock('../../../services/api',()=>({default:m}));
vi.mock('vue-router',()=>({useRoute:()=>({path:'/itsco/dashboard',query:{}}),useRouter:()=>({push:m.push})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:7,role:'admin',firstName:'Administrator',isHourlyWorker:false}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2,feature_flags:{}}})}));
vi.mock('../../../store/userPreferences',()=>({useUserPreferencesStore:()=>({timezone:'America/Denver'})}));
vi.mock('../../../store/indirectTimeSession',()=>({useIndirectTimeSessionStore:()=>({takePendingClosedSession:m.take,clearSession:m.clear,clearNoteAidSessionFlag:m.clear,clearClockOutAdjust:m.clear,noteAidUsedDuringSession:true,session:{status:'open',clockedInAt:'2026-10-30T12:00:00Z'}})}));
const employee={id:485,role:'provider_plus',firstName:'Jacquelyne',lastName:'Fernandez'};
let wrappers=[];
afterEach(()=>{for(const w of wrappers)w.unmount();wrappers=[];});
beforeEach(()=>{
 vi.clearAllMocks();sessionStorage.clear();
 m.get.mockResolvedValue({data:[employee,{id:12,firstName:'Other',lastName:'Employee',role:'provider'}]});
 m.request.mockImplementation(async c=>({data:c.url.endsWith('/indirect-service-types')?{types:[{id:3,typeKey:'jacquelyne_translation',label:'Translation',payBucket:'admin',description:'Translation for the support team',iconKey:'clock'}],adminTime:{rate:25,huddles:[]}}:c.method==='post'?{id:77}:[]}));
});
it('scopes read, JSON and receipt requests without changing the default API client',async()=>{
 const api=createSubmitApi({agencyId:2,employee},m);const fd=new FormData();fd.append('receipt',new Blob(['fixture']),'receipt.txt');
 await api.get('/payroll/me/time-claims',{params:{agencyId:99}});
 await api.post('/payroll/me/reimbursement-claims',fd);
 await api.post('/me/company-events/8/travel-report',{eventDate:'2026-10-29'});
 expect(m.request.mock.calls.map(([r])=>r.url)).toEqual(['/payroll/submit-for/485/time-claims','/payroll/submit-for/485/reimbursement-claims','/payroll/submit-for/485/company-events/8/travel-report']);
 expect(m.request.mock.calls.every(([r])=>r.params.agencyId===2)).toBe(true);
 expect(m.request.mock.calls[1][0].data).toBe(fd);expect(m.get).not.toHaveBeenCalled();
});
it('preserves repeated route parameters and prevents a second agency in a URL',async()=>{
 await createSubmitApi({agencyId:2,employee},m).get('/company-car/mileage/calculate?agencyId=99&destinations=A&destinations=B');
 expect(m.request).toHaveBeenCalledWith(expect.objectContaining({url:'/payroll/submit-for/485/company-car/mileage/calculate',params:{agencyId:2,destinations:['A','B']}}));
});
it('selects, searches, and returns to the administrator’s own Submit',async()=>{
 const w=mount(SubmitEmployeePicker,{props:{agencyId:2}});wrappers.push(w);await flushPromises();
 await w.get('input').setValue('jacqu');expect(w.findAll('option')).toHaveLength(2);
 await w.get('select').setValue('485');expect(w.emitted('select').at(-1)[0]).toMatchObject({id:485});
 await w.setProps({selected:employee});await w.findAll('button').find(b=>b.text()==='Return to my Submit').trigger('click');expect(w.emitted('select').at(-1)).toEqual([null]);
});
it('ignores stale employee rosters after changing agencies',async()=>{
 let complete;m.get.mockImplementationOnce(()=>new Promise(r=>complete=r)).mockResolvedValueOnce({data:[{id:20,firstName:'New',lastName:'Agency'}]});
 const w=mount(SubmitEmployeePicker,{props:{agencyId:2}});wrappers.push(w);await w.setProps({agencyId:3});await flushPromises();complete({data:[employee]});await flushPromises();
 expect(w.text()).toContain('New');expect(w.text()).not.toContain('Jacquelyne');expect(w.emitted('select').every(e=>e[0]===null)).toBe(true);
});
it('shows Jacquelyne’s private rate and manually submits for her without touching the admin clock',async()=>{
 sessionStorage.setItem('itl-selected-types-2','[999]');
 const w=mount(HourlyIndirectTimeLog,{props:{agencyId:2},global:{provide:{[SUBMIT_CONTEXT]:{agencyId:2,employee}},stubs:{FfsExcessTime:true,EventTravelReportModal:true}}});wrappers.push(w);await flushPromises();
 expect(w.text()).toContain('Jacquelyne');expect(w.text()).not.toContain('Administrator');expect(w.text()).not.toContain('Clock In / Clock Out');
 await w.get('input[type="date"]').setValue('2026-10-29');const times=w.findAll('input[type="time"]');await times[0].setValue('09:00');await times[1].setValue('09:30');await flushPromises();
 expect(w.get('.itl-dual-col--admin').text()).toContain('$25.00/hour');
 await w.findAll('.itl-type-card').find(c=>c.text().includes('Translation')).trigger('click');await w.get('textarea').setValue('Translated information for the support team.');
 for(const input of w.findAll('input[type="checkbox"]')) { if(input.element.closest('.itl-attest-card') || input.element.closest('aside'))await input.setValue(true); }
 await w.get('.itl-submit').trigger('click');await flushPromises();
 expect(m.request).toHaveBeenCalledWith(expect.objectContaining({method:'post',url:'/payroll/submit-for/485/time-claims',data:expect.objectContaining({payload:expect.objectContaining({categoryGroup:'admin_duties',totalMinutes:30})})}));
 expect(m.take).not.toHaveBeenCalled();expect(m.clear).not.toHaveBeenCalled();expect(sessionStorage.getItem('itl-selected-types-2')).toBe('[999]');
 expect(m.request.mock.calls.some(([c])=>c.url.includes('indirect-time-session'))).toBe(false);
});
