import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Schedule from '../SchoolAnnualSchedule.vue';
import Followup from '../SchoolAnnualFollowup.vue';
import Dashboard from '../../school/reinit/SchoolReinitDashboard.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
vi.mock('vue-router',()=>({useRouter:()=>({push:vi.fn()})}));
let wrapper;
beforeEach(()=>{vi.resetAllMocks();api.put.mockResolvedValue({data:{}});});
afterEach(()=>wrapper?.unmount());
it('saves recurring agency dates without changing completion records',async()=>{
 wrapper=mount(Schedule,{props:{agencyId:2,schoolYear:'2027-28',rules:{enabled:1,timezone:'America/Denver',opens_md:'08-01',due_md:'08-21',followup_md:'08-31'}}});
 await wrapper.find('form').trigger('submit');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/school-reinit/campaign/annual-schedule',expect.objectContaining({agencyId:2,enabled:true,due_md:'08-21',followup_md:'08-31'}));expect(wrapper.emitted('saved')).toHaveLength(1);
});
it('shows failed schedule saves and keeps the draft',async()=>{
 api.put.mockRejectedValue({response:{data:{error:{message:'Allow at least 14 days'}}}});
 wrapper=mount(Schedule,{props:{agencyId:2,schoolYear:'2027-28'}});await wrapper.find('form').trigger('submit');await flushPromises();expect(wrapper.get('[role=alert]').text()).toContain('14 days');expect(wrapper.emitted('saved')).toBeUndefined();
});
it('requires a follow-up note and sends a dated extension to the selected cycle',async()=>{
 wrapper=mount(Followup,{props:{row:{cycleId:7,annualEligible:true,status:'in_progress',outstanding:[{label:'Days per week onsite'}]}}});
 expect(wrapper.text()).toContain('Days per week onsite');expect(wrapper.get('textarea').attributes('required')).toBeDefined();
 await wrapper.get('input[type=date]').setValue('2026-10-29');await wrapper.get('textarea').setValue('Schools team spoke with the school; allow one week.');await wrapper.find('form').trigger('submit');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/school-reinit/cycles/7/followup',expect.objectContaining({action:'extend',extensionUntil:'2026-10-29'}));
});
it.each([['first_year_onboarding','Your onboarding covers this school year'],['deadline_passed','Annual update collection has closed']])('removes submission controls for %s',async(reason,title)=>{
 wrapper=mount(Dashboard,{props:{initialPayload:{cycle:{id:7,status:'in_progress',school_year:'2026-27'},annualUpdate:{canWrite:false,reason,phase:'closed'},school:{name:'Example'},agency:{name:'Care'},sections:[],questions:[]}},global:{stubs:{PostSchoolEventModal:true,SchoolReinitReceipt:true}}});
 await flushPromises();expect(wrapper.text()).toContain(title);expect(wrapper.find('.cua__finalize-btn').exists()).toBe(false);expect(api.put).not.toHaveBeenCalled();
});
it('shows the missing-information deadline during follow-up',async()=>{
 wrapper=mount(Dashboard,{props:{initialPayload:{cycle:{id:7,status:'in_progress',school_year:'2026-27'},annualUpdate:{canWrite:true,phase:'followup',closesOn:'2026-08-31'},outstanding:[{label:'Days per week onsite'}],school:{name:'Example'},agency:{name:'Care'},sections:[],questions:[]}},global:{stubs:{PostSchoolEventModal:true,SchoolReinitReceipt:true}}});await flushPromises();expect(wrapper.text()).toContain('2026-08-31');expect(wrapper.text()).toContain('Days per week onsite');
});
