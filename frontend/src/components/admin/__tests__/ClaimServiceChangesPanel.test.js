import { mount,flushPromises } from '@vue/test-utils';
import { beforeEach,describe,it,expect,vi } from 'vitest';
import ClaimServiceChangesPanel from '../ClaimServiceChangesPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
const data={revision:2,previouslyTransmitted:false,changes:[{id:8,noteId:4,addendumId:6,status:'pending',lines:[{procedureCode:'90834',units:1}]}]};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data});api.post.mockResolvedValue({data:{message:'Existing draft updated'}});});
describe('service corrections stay on the existing claim',()=>{
  it('requires a separate billing decision and explicit charges, without calling submission',async()=>{
    const w=mount(ClaimServiceChangesPanel,{props:{agencyId:1,claimId:7}});await flushPromises();await w.find('button').trigger('click');await w.find('input[type=number]').setValue('120');await w.find('input[placeholder="1 or 1,2"]').setValue('1');await w.find('textarea').setValue('Reviewed amended services and approved charges');await w.find('input[type=checkbox]').setValue(true);await w.find('form').trigger('submit');await flushPromises();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/medical-billing/claimmd/claims/7/service-changes/8/resolve',expect.objectContaining({action:'apply_draft',charges:[12000],revision:2,attested:true}));w.unmount();
  });
  it('never offers draft replacement for a submitted/paid claim and requires payer reference',async()=>{
    api.get.mockResolvedValue({data:{...data,previouslyTransmitted:true}});const w=mount(ClaimServiceChangesPanel,{props:{agencyId:1,claimId:7}});await flushPromises();await w.find('button').trigger('click');expect(w.find('option[value=apply_draft]').exists()).toBe(false);expect(w.find('select').element.value).toBe('payer_followup');expect(w.find('input[minlength="3"]').attributes('required')).toBeDefined();expect(w.text()).toContain('does not transmit replacements');w.unmount();
  });
});
