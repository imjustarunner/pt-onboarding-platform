import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,it,expect,vi} from 'vitest';
import MedicalBillingView from '../MedicalBillingView.vue';
import api from '../../../services/api';
import {BILLING_MANUAL_POS} from '../../../navigation/billingManualPlaces.js';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2,slug:'practice'}})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:9,role:'support',billingAgencyIds:[2]}})}));
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async path=>({data:path.endsWith('/status')?{flags:{medicalBillingEnabled:true},claimMd:{configured:false}}:path.endsWith('/service-codes')?{items:[{id:1,service_code:'90840',description:'Crisis add-on',unit_calc_mode:'SINGLE',is_addon:1,allowed_place_of_service_json:['11']},{id:2,service_code:'90839',description:'Crisis',unit_calc_mode:'SINGLE',allowed_place_of_service_json:['11']}]}:{}}));});
it('Edit focuses a visible code editor and exposes manual-specific locations and automatic units',async()=>{
 const scroll=vi.fn();Element.prototype.scrollIntoView=scroll;
 const w=mount(MedicalBillingView,{attachTo:document.body,props:{billingAgencyId:2,serviceCodesOnly:true},global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();
 const row=w.findAll('tbody tr').find(r=>r.text().includes('90840'));expect(row.text()).toContain('Auto with 90839');expect(row.text()).not.toContain('SINGLE');await row.find('button').trigger('click');await flushPromises();expect(w.text()).toContain('Editing 90840');expect(scroll).toHaveBeenCalled();expect(document.activeElement.getAttribute('aria-label')).toBe('Service code');expect(w.text()).toContain('page 20');
 const choices=w.findAll('.mb-pos-list input[type=checkbox]').map(input=>input.element.value);for(const code of BILLING_MANUAL_POS['90840'].places)expect(choices).toContain(code);expect(choices).toContain('50');expect(choices).toContain('99');expect(choices).not.toContain('49');
 await w.findAll('button').find(b=>b.text()==='Use manual locations').trigger('click');expect(w.findAll('.mb-pos-list input:checked').map(i=>i.element.value)).toEqual(expect.arrayContaining(BILLING_MANUAL_POS['90840'].places));
 api.post.mockResolvedValue({data:{claimable:true,units:1,effectiveServiceCode:'90839',addons:[{code:'90840',units:5}]}});await w.findAll('tbody tr').find(r=>r.find('strong').text()==='90839').find('button').trigger('click');await w.find('input[placeholder="Preview minutes"]').setValue(200);await w.findAll('button').find(b=>b.text()==='Preview units').trigger('click');await flushPromises();expect(w.text()).toContain('90839 × 1 · 90840 × 5 (automatic)');w.unmount();
});
it('keeps modifier-specific mobile crisis locations separate and preserves distinct testing location lists',()=>{
 expect(BILLING_MANUAL_POS['90839'].page).toBe(18);expect(BILLING_MANUAL_POS['90839'].places).toContain('11');expect(BILLING_MANUAL_POS['96130'].places).not.toContain('27');expect(BILLING_MANUAL_POS['96121'].places).toContain('27');expect(BILLING_MANUAL_POS.H0032.places).not.toContain('21');
});
