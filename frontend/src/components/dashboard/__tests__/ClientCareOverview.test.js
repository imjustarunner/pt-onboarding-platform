import {mount,flushPromises} from '@vue/test-utils';
import {expect,it,vi,afterEach} from 'vitest';
import {createRouter,createMemoryHistory} from 'vue-router';
import Overview from '../ClientCareOverview.vue';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:9,role:'provider'}})}));
let w;
afterEach(()=>{w?.unmount();vi.clearAllMocks();});
async function render(){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div />'}}]});await router.push('/dashboard');
 m.get.mockImplementation(async url=>({data:url.includes('documentation-queue')?{items:[{clientId:12,agencyId:2,clinicalSessionId:22,appointmentId:44,providerUserId:9,dateOfService:'2026-11-20',serviceCode:'H0004',noteStatus:'draft'},{clientId:12,agencyId:3,clinicalSessionId:99,serviceCode:'OTHER AGENCY'}]}:{treatmentPlan:{eligible:false,code:'treatment_plan_expired'},diagnosisAlerts:[{code:'adjustment_six_month_review',diagnosisId:7,message:'Adjustment diagnosis needs review.'}],fiscalSessions:{total:24,recorded:2,imported:1,period:{start:'2026-07-01',today:'2026-11-22'},baseline:{id:1,count:22,throughDate:'2026-08-01',reason:'Prior provider records'},reviewSuggested:true}}}));
 w=mount(Overview,{props:{clientId:12,agencyId:2},global:{plugins:[router]}});await flushPromises();return router;
}
it('shows outstanding notes and clinical warnings and opens the actual session in Note Workspace',async()=>{
 const router=await render();expect(w.text()).toContain('Finish draft note');expect(w.text()).toContain('Treatment plan expired');expect(w.text()).toContain('Adjustment diagnosis needs review');expect(w.text()).not.toContain('OTHER AGENCY');
 await w.findAll('button').find(b=>b.text().includes('Finish draft note')).trigger('click');await flushPromises();
 expect(router.currentRoute.value.query).toMatchObject({clientId:'12',agencyId:'2',clinicalSessionId:'22',appointmentId:'44'});
});
it('does not claim all notes are complete when access or storage is unavailable',async()=>{
 await render();m.get.mockRejectedValue({response:{status:403}});await w.setProps({clientId:13});await flushPromises();expect(w.text()).toContain('Outstanding notes could not be checked');expect(w.text()).not.toContain('No undocumented sessions found');
});
it('saves a verified total with its prior revision and the exact chart agency',async()=>{
 await render();m.post.mockResolvedValue({data:{total:25,period:{start:'2026-07-01',today:'2026-11-22'},baseline:{id:2,count:23,throughDate:'2026-08-01'}}});
 await w.get('input[type=number]').setValue('23');await w.get('form').trigger('submit');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/clients/12/fiscal-session-total',expect.objectContaining({agencyId:2,count:23,expectedRevisionId:1,reason:'Prior provider records'}),expect.anything());expect(w.text()).toContain('Verified total saved.');
});
