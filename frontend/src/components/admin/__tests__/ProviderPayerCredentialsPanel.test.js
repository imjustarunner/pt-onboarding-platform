import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, it, expect, vi } from 'vitest';
import ProviderPayerCredentialsPanel from '../ProviderPayerCredentialsPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),patch:vi.fn(),post:vi.fn()}}));
beforeEach(()=>{
  vi.clearAllMocks();
  api.get.mockImplementation(async url=>({data:url.endsWith('/insurances')?{insurances:[{id:1,name:'TRICARE'},{id:2,name:'Aetna'}]}:{credentialing:[
    {id:10,insurance_credentialing_definition_id:1,insurance_name:'TRICARE',allow_supervisee_billing:false},
    {id:11,insurance_credentialing_definition_id:2,insurance_name:'Aetna',allow_supervisee_billing:true,billing_payer_id:'60054',billing_payer_name:'Aetna'}
  ]}}));api.patch.mockResolvedValue({data:{}});
});
it('shows effective defaults and billing connection status and saves the decision',async()=>{
  const w=mount(ProviderPayerCredentialsPanel,{props:{agencyId:2,userId:30}});await flushPromises();
  const cards=w.findAll('.payer-card');expect(cards[0].find('input[type="checkbox"]').element.checked).toBe(false);
  expect(cards[1].find('input[type="checkbox"]').element.checked).toBe(true);
  expect(cards[0].text()).toContain('Billing payer not connected');expect(cards[1].text()).toContain('60054');
  await cards[1].find('input[type="checkbox"]').setValue(false);
  await cards[1].find('.card-actions button').trigger('click');await flushPromises();
  expect(api.patch).toHaveBeenCalledWith('/agencies/2/credentialing/user-insurance/11',expect.objectContaining({allowSuperviseeBilling:false}));
  expect(w.emitted('changed')).toHaveLength(1);w.unmount();
});
