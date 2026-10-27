import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { familyBillingRoutes } from '../../../router/familyBillingRoutes.js';
const m=vi.hoisted(()=>({get:vi.fn(),agency:null,user:null}));
vi.mock('../../../services/api',()=>({default:{get:m.get}}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>m.agency}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:m.user})}));
vi.mock('../../../components/billing/ClientAccountSupport.vue',()=>({default:{props:['clientId','agencyId'],template:'<p>Client account {{ clientId }} in {{ agencyId }}</p>'}}));
import View from '../AccountSupportView.vue';
beforeEach(()=>{vi.clearAllMocks();m.agency=reactive({currentAgency:{id:450}});m.user={role:'support',billingAgencyIds:[]};m.get.mockResolvedValue({data:[{id:2271,full_name:'Rowan QA'}]});});
async function mountPage(){const router=createRouter({history:createMemoryHistory(),routes:[...familyBillingRoutes,{path:'/:organizationSlug/admin/clients/:id',component:{template:'<p>Client</p>'}}]});await router.push('/auricwell-qa-demo/admin/account-support');await router.isReady();const w=mount(View,{global:{plugins:[router]}});await flushPromises();return {w,router};}
it('marks scoped routes as scoped and also resolves flat tenant-host billing URLs',()=>{
  const router=createRouter({history:createMemoryHistory(),routes:familyBillingRoutes});
  expect(router.resolve('/auricwell-qa-demo/admin/family-billing').meta.organizationSlug).toBe(true);
  expect(router.resolve('/auricwell-qa-demo/admin/account-support').meta.organizationSlug).toBe(true);
  expect(router.resolve('/admin/family-billing').name).toBe('UnscopedFamilyBillingDesk');
});
it('lets support open client account summaries without exposing billing controls',async()=>{
  const {w}=await mountPage();expect(m.get).toHaveBeenCalledWith('/clients',{params:{agency_id:450}});
  expect(w.text()).not.toContain('Manage balances');await w.get('select').setValue('2271');expect(w.text()).toContain('Client account 2271 in 450');w.unmount();
});
it('gives only the scoped biller a discoverable balance and plan link',async()=>{
  m.user.billingAgencyIds=[450];const {w}=await mountPage();expect(w.get('a').attributes('href')).toBe('/auricwell-qa-demo/admin/family-billing?agencyId=450');
  m.agency.currentAgency={id:2};await flushPromises();expect(w.text()).not.toContain('Manage balances');expect(w.text()).not.toContain('Client account 2271');w.unmount();
});
