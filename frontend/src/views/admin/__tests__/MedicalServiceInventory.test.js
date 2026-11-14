import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:6,slug:'nlu'},agencies:[]})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:10,role:'super_admin'}})}));
vi.mock('../../../components/admin/ClaimMdWorkspace.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../../components/admin/MedicalBillingReportsPanel.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../../components/clinical/ClinicalNoteCosignReview.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../../components/notes/ServiceInformation.vue',()=>({default:{template:'<div />'}}));
import View from '../MedicalBillingView.vue';
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async path=>({data:path.endsWith('/status')?{flags:{medicalBillingEnabled:true}}:{items:[{id:77,service_code:'96136',description:'Testing administration',is_active:0,isActive:false,unit_calc_mode:'NONE',inventory:{group:'testing-administration',groupLabel:'Testing · administration/scoring',payLabel:'Direct Care Rate',compensationBasis:'30 actual minutes equals 0.50 Direct Care hour.',requiredRole:'psychological_testing',medicaidOnly:true}}]}}));api.post.mockResolvedValue({data:{}});});
it('shows inactive Testing codes with their actual work category and time basis, then preserves inactivity on an edit',async()=>{
 const w=mount(View,{props:{billingAgencyId:6,billingAgencySlug:'nlu',serviceCodesOnly:true},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/medical-billing/service-codes',{params:{agencyId:6,includeInactive:'1'}});expect(w.text()).toContain('96136');expect(w.text()).toContain('Direct Care Rate');expect(w.text()).toContain('0.50 Direct Care hour');expect(w.text()).toContain('Testing role required · Medicaid only');expect(w.text()).toContain('Inactive · setup required');expect(w.get('.category-testing-administration').text()).toContain('administration/scoring');
 await w.get('.service-inventory button').trigger('click');const enabled=w.findAll('label').find(label=>label.text().includes('Enabled for clinical use')).get('input');expect(enabled.element.checked).toBe(false);await w.findAll('button').find(button=>button.text()==='Save code').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/medical-billing/service-codes',expect.objectContaining({agencyId:6,serviceCode:'96136',isActive:false}));w.unmount();
});
