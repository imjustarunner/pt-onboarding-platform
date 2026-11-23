import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import {beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({auth:null}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>state.auth}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
import api from '../../../services/api';
import Settings from '../ClientBillingAccountSettings.vue';
beforeEach(()=>{vi.clearAllMocks();state.auth=reactive({user:{id:5,role:'provider',billingAgencyIds:[]}});api.get.mockResolvedValue({data:{rates:[],policies:[{insurerName:'Visible insurer',programType:'commercial',memberId:'PRIVATE_MEMBER',copay:100}],balance:{amount:99999},verification:{current:true},paymentSetup:{responsiblePartyName:'PRIVATE_PERSON'}}});});
const stubs={ClientInsuranceEditor:true,ClientAccountSupport:true,ResponsibleBillingParty:true,ExternalResponsibleInvoices:true};
it('shows providers only insurer names and categories even when privileged props and unexpected response fields are present',async()=>{
 const w=mount(Settings,{props:{clientId:8,agencyId:2,accountSupport:true},global:{stubs}});await flushPromises();
 expect(w.text()).toContain('Visible insurer');expect(w.text()).toContain('Commercial');expect(w.text()).not.toMatch(/PRIVATE_MEMBER|PRIVATE_PERSON|99999|Verified|Payment|invoices/);
 expect(w.find('client-insurance-editor-stub').exists()).toBe(false);expect(w.find('form').exists()).toBe(false);
 expect(api.get).toHaveBeenCalledTimes(1);expect(api.get).toHaveBeenCalledWith('/clients/8/care-insurance-labels',{skipGlobalLoading:true});w.unmount();
});
it.each([{role:'billing',billingAgencyIds:[2]},{role:'admin',billingAgencyIds:[2]},{role:'super_admin',billingAgencyIds:[]},{role:'provider',agencyAccess:{agencyId:2},billingAgencyIds:[2]}])('opens the full workspace only with agency billing authorization: %j',async user=>{
 state.auth.user={id:5,...user};const w=mount(Settings,{props:{clientId:8,agencyId:2},global:{stubs}});await flushPromises();
 expect(w.findComponent({name:'ClientInsuranceEditor'}).props('profileLayout')).toBe(true);expect(w.find('details[open]').exists()).toBe(false);expect(api.get).toHaveBeenCalledWith('/family-billing/account/clients/8/settings',expect.any(Object));w.unmount();
});
it('does not transfer another agency’s billing permission into the client profile',async()=>{
 state.auth.user={id:5,role:'billing',billingAgencyIds:[99]};const w=mount(Settings,{props:{clientId:8,agencyId:2},global:{stubs}});await flushPromises();expect(w.find('form').exists()).toBe(false);expect(api.get.mock.calls.every(([path])=>path.endsWith('care-insurance-labels'))).toBe(true);w.unmount();
});
it('removes the workspace and its rates when billing access is revoked',async()=>{
 state.auth.user={id:5,role:'billing',billingAgencyIds:[2]};const w=mount(Settings,{props:{clientId:8,agencyId:2},global:{stubs}});await flushPromises();state.auth.user.billingAgencyIds=[];await flushPromises();expect(w.find('client-insurance-editor-stub').exists()).toBe(false);expect(w.find('form').exists()).toBe(false);expect(w.text()).toContain('Visible insurer');w.unmount();
});
