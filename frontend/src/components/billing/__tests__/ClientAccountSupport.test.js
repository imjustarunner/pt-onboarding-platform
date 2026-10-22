import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import ClientAccountSupport from '../ClientAccountSupport.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const data=()=>({balance:{payableCents:7500,hasItemsUnderReview:true},payers:[{name:'Parent',cardOnFile:true,card:{brand:'Visa',last4:'4242'}}],portalUrl:'https://example.test/guardian?panel=billing'});
const mountPanel=()=>mount(ClientAccountSupport,{props:{clientId:20,agencyId:2},global:{stubs:{ClientPortalInviteDialog:true}}});
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:data()});});
it('shows only account assistance and routes receipts and payment actions to the client portal',async()=>{
  const w=mountPanel();await flushPromises();expect(api.get).toHaveBeenCalledWith('/clients/20/account-support');
  expect(w.text()).toContain('$75.00');expect(w.text()).toContain('Visa ending 4242');expect(w.text()).toContain('excluded from this amount');
  expect(w.text()).toContain('Forgot password');expect(w.find('input[readonly]').element.value).toBe(data().portalUrl);
  expect(w.findAll('button').map(b=>b.text())).toEqual(['Send portal invitation','Copy portal link','Manage portal contacts','Refresh account status']);
  expect(w.findAll('a')).toHaveLength(0);w.unmount();
});
it('opens the existing invitation preview for this client and offers contact management',async()=>{
  const w=mountPanel();await flushPromises();await w.findAll('button').find(b=>b.text()==='Send portal invitation').trigger('click');
  expect(w.findComponent({name:'ClientPortalInviteDialog'}).props('clientIds')).toEqual([20]);
  await w.findAll('button').find(b=>b.text()==='Manage portal contacts').trigger('click');expect(w.emitted('manage-contacts')).toHaveLength(1);w.unmount();
});
it('clears private data and ignores late responses when switching clients',async()=>{
  let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const w=mountPanel();await w.setProps({clientId:21});await flushPromises();
  resolve({data:{...data(),payers:[{name:'Previous client payer',cardOnFile:false}]}});await flushPromises();
  expect(w.text()).not.toContain('Previous client payer');expect(api.get).toHaveBeenLastCalledWith('/clients/21/account-support');w.unmount();
});
it('does not present a failed balance request as a zero balance',async()=>{
  api.get.mockRejectedValue({response:{data:{error:{message:'Access revoked'}}}});const w=mountPanel();await flushPromises();
  expect(w.find('[role=alert]').text()).toBe('Access revoked');expect(w.text()).not.toContain('$0.00');expect(w.find('input').exists()).toBe(false);w.unmount();
});
