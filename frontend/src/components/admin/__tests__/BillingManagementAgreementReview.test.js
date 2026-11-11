import { beforeEach, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
const state=vi.hoisted(()=>({agency:null,route:null}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>state.agency}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:4001,role:'provider'}})}));
vi.mock('vue-router',()=>({useRoute:()=>state.route,useRouter:()=>({push:vi.fn()})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn(),defaults:{baseURL:'/api'}}}));
vi.mock('@stripe/stripe-js/pure',()=>({loadStripe:vi.fn(async()=>null)}));
vi.mock('../AgencyStripeConnectSection.vue',()=>({default:{template:'<div />'}}));
import api from '../../../services/api';
import BillingManagement from '../BillingManagement.vue';
const documentId='60ab85c4-d937-4c0f-845a-3f306dba58a2';
const invoice=()=>({id:123,agency_id:7001,total_cents:18000,status:'draft',payment_status:'unpaid',period_start:'2026-11-01',period_end:'2026-11-30',qbo_invoice_id:null,line_items_json:{chargeLines:[{key:'management',label:'Sample management service',amountCents:18000}],businessAgreement:{contractReference:documentId,requiresSignatures:true,signedOn:'',ready:false}}});
beforeEach(()=>{
  vi.clearAllMocks();state.agency=reactive({currentAgency:{id:7001,slug:'sample-coach',organization_type:'life_coach'},agencies:[{id:7001,slug:'sample-coach',organization_type:'life_coach'}],setCurrentAgency:vi.fn()});
  state.route=reactive({params:{organizationSlug:'sample-coach'},query:{agencyId:'7001',invoiceId:'123'},path:'/sample-coach/admin/business-account'});
  api.get.mockImplementation(async url=>({data:url.endsWith('/invoices')?[invoice()]:url.endsWith('/estimate')?{totals:{totalCents:18000,baseFeeCents:0},lineItems:[],chargeLines:[]}:url.endsWith('/settings')?{autopayEnabled:true,billingRollout:{status:'active'},subscriptionPaymentProvider:'QUICKBOOKS',subscriptionProviderStatus:{paymentsEnabled:true}}:{}}));
});
it('auto-opens the linked review invoice, shows management lines and its exact document, and disables collection',async()=>{
  const wrapper=mount(BillingManagement,{props:{independentBusiness:true},global:{stubs:{RouterLink:RouterLinkStub}}});await flushPromises();
  expect(wrapper.text()).toContain('Sample management service');expect(wrapper.text()).toContain('$180.00');
  expect(wrapper.get('.invoice-review-hold').text()).toContain('both representatives sign');
  const contract=wrapper.findAllComponents(RouterLinkStub).find(link=>link.text()==='Open the exact management contract');
  expect(contract.props('to')).toEqual({path:'/sample-coach/admin/organization-agreements',query:{agencyId:'7001',document:documentId}});
  for(const title of ['Retry Autopay','Send Invoice'])expect(wrapper.findAll('button').find(button=>button.text()===title).attributes('disabled')).toBeDefined();
  expect(wrapper.findAll('button').find(button=>button.text()==='Download Invoice').attributes('disabled')).toBeUndefined();
  expect(api.post).not.toHaveBeenCalled();expect(wrapper.text()).not.toContain('Go to Features');wrapper.unmount();
});
it('keeps finalized management invoices available to the existing payment controls',async()=>{
  const original=api.get.getMockImplementation();api.get.mockImplementation(async url=>url.endsWith('/invoices')?{data:[{...invoice(),line_items_json:{...invoice().line_items_json,businessAgreement:{contractReference:documentId,requiresSignatures:true,signedOn:'2026-11-05',ready:true}}}]}:original(url));
  const wrapper=mount(BillingManagement,{props:{independentBusiness:true},global:{stubs:{RouterLink:RouterLinkStub}}});await flushPromises();
  expect(wrapper.find('.invoice-review-hold').exists()).toBe(false);
  expect(wrapper.findAll('button').find(button=>button.text()==='Retry Autopay').attributes('disabled')).toBeUndefined();wrapper.unmount();
});
