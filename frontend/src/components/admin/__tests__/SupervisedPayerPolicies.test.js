import { mount,flushPromises } from '@vue/test-utils';
import { beforeEach,describe,it,expect,vi } from 'vitest';
import SupervisedPayerPolicies from '../SupervisedPayerPolicies.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{items:[],providers:[]}});api.post.mockResolvedValue({data:{ok:true}});});
describe('supervised payer policy controls',()=>{
  it('starts unverified and requires separate mapping and deferred-cosign attestations',async()=>{
    const w=mount(SupervisedPayerPolicies,{props:{agencyId:377}});await flushPromises();
    expect(w.text()).toContain('January 1, 2027');expect(w.findAll('input[type=checkbox]').every(c=>!c.element.checked)).toBe(true);
    const inputs=w.findAll('input');await inputs[0].setValue('COCHA');await inputs[1].setValue('Medicaid');
    const dates=w.findAll('input[type=date]');await dates[0].setValue('2026-01-01');await dates[1].setValue('2026-12-31');
    const text=w.findAll('textarea');await text[0].setValue('Payer manual reference');await text[1].setValue('Document pending payer verification');
    await w.find('form').trigger('submit');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/supervised-payer-policies',expect.objectContaining({agencyId:377,version:0,policy:expect.objectContaining({payerId:'COCHA',rules:[expect.objectContaining({mappingVerified:false,deferredCosignAllowed:false})]})}));w.unmount();
  });
  it('clears the prior company’s roster and ignores a late response on scope change',async()=>{
    let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>resolve=r));const w=mount(SupervisedPayerPolicies,{props:{agencyId:1}});await w.setProps({agencyId:2});await flushPromises();
    resolve({data:{items:[{payerId:'OLD',planType:'Old Tenant',version:1}]}});await flushPromises();expect(w.text()).not.toContain('Old Tenant');w.unmount();
  });
});
