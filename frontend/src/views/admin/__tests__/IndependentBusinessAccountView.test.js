import { beforeEach, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
const state=vi.hoisted(()=>({agency:null}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>state.agency}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
vi.mock('../../../components/admin/AgencyStripeConnectSection.vue',()=>({default:{props:['agencyId','paymentContext'],template:'<div data-testid="bank-setup">{{agencyId}} · {{paymentContext}}</div>'}}));
vi.mock('../../../components/admin/BillingManagement.vue',()=>({default:{props:{independentBusiness:Boolean},template:'<div data-testid="subscription-billing">{{independentBusiness}}</div>'}}));
vi.mock('../../../components/admin/BusinessJourney.vue',()=>({default:{props:['scopedAgencyId'],template:'<div data-testid="management-pricing">{{scopedAgencyId}}</div>'}}));
import api from '../../../services/api';
import Account from '../IndependentBusinessAccountView.vue';
const profile=()=>({agencyId:7001,name:'Sample Coach Practice',officialName:'',websiteUrl:'https://coach.example',phoneNumber:'',streetAddress:'',city:'',state:'',postalCode:'',timezone:'America/Denver',taxIdType:'ein',taxIdLast4:'6789'});
beforeEach(()=>{vi.clearAllMocks();state.agency=reactive({currentAgency:{id:7001,slug:'sample-coach'}});api.get.mockResolvedValue({data:profile()});api.put.mockResolvedValue({data:profile()});});
it('offers business editing, bank onboarding and subscription billing in the same agency',async()=>{
  const wrapper=mount(Account);await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/billing/7001/business-profile');
  expect(wrapper.get('[data-testid="bank-setup"]').text()).toBe('7001 · coaching');
  expect(wrapper.get('[data-testid="subscription-billing"]').text()).toBe('true');
  expect(wrapper.get('[data-testid="management-pricing"]').text()).toBe('7001');
  expect(wrapper.get('input[type="password"]').attributes('placeholder')).toContain('6789');
  await wrapper.findAll('input')[0].setValue('Updated coaching business');await wrapper.get('form').trigger('submit');await flushPromises();
  const [url,body]=api.put.mock.calls[0];expect(url).toBe('/billing/7001/business-profile');
  expect(body.name).toBe('Updated coaching business');expect(body).not.toHaveProperty('agencyId');expect(body).not.toHaveProperty('taxIdLast4');expect(body).not.toHaveProperty('taxId');
  wrapper.unmount();
});
it('clears a newly entered tax ID after saving it securely',async()=>{
  const wrapper=mount(Account);await flushPromises();
  await wrapper.get('input[type="password"]').setValue('12-3456789');await wrapper.get('form').trigger('submit');await flushPromises();
  expect(api.put.mock.calls[0][1].taxId).toBe('12-3456789');expect(wrapper.get('input[type="password"]').element.value).toBe('');wrapper.unmount();
});
it('shows an authorization error without mounting financial controls',async()=>{
  api.get.mockRejectedValue({response:{data:{error:{message:'Admin access required'}}}});
  const wrapper=mount(Account);await flushPromises();expect(wrapper.get('[role="alert"]').text()).toBe('Admin access required');
  expect(wrapper.find('[data-testid="bank-setup"]').exists()).toBe(false);expect(wrapper.find('[data-testid="subscription-billing"]').exists()).toBe(false);wrapper.unmount();
});
it('does not display an old business response after switching tenants',async()=>{
  let finishOld;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;}));
  const wrapper=mount(Account);state.agency.currentAgency={id:999,slug:'other'};await flushPromises();
  finishOld({data:{...profile(),name:'Stale company'}});await flushPromises();
  expect(wrapper.text()).not.toContain('Stale company');expect(api.get).toHaveBeenCalledWith('/billing/999/business-profile');wrapper.unmount();
});
