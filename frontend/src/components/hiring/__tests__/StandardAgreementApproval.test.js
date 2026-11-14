import {beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({patch:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
import Approval from '../StandardAgreementApproval.vue';
const props={agencyId:6,configId:32,agencyName:'Next Level Up',libraryUrl:'/nlu/admin/contracts?agencyId=6&tab=library'};
beforeEach(()=>{vi.clearAllMocks();api.patch.mockResolvedValue({data:{is_active:1}});});
describe('standard agreement approval beside the draft',()=>{
 it('shows the exact library destination and waits for a complete current preview',async()=>{
  const w=mount(Approval,{props});expect(w.get('a').attributes('href')).toBe(props.libraryUrl);expect(w.text()).toContain('Prepare a current preview');expect(w.get('input').element.disabled).toBe(true);
  await w.get('button').trigger('click');expect(api.patch).not.toHaveBeenCalled();w.unmount();
 });
 it('requires explicit standard-term approval even when a preview is ready',async()=>{
  const w=mount(Approval,{props:{...props,previewReady:true}});expect(w.get('button').element.disabled).toBe(true);await w.get('input').setValue(true);await w.get('button').trigger('click');await flushPromises();
  expect(api.patch).toHaveBeenCalledExactlyOnceWith('/contracts/configs/32',{agencyId:6,isActive:true});expect(w.emitted('approved')).toHaveLength(1);expect(w.text()).toContain('Each person’s dates, roles and pay must still be reviewed');w.unmount();
 });
 it('clears approval after the selected draft or its preview changes',async()=>{
  const w=mount(Approval,{props:{...props,previewReady:true}});await w.get('input').setValue(true);await w.setProps({configId:33});expect(w.get('input').element.checked).toBe(false);await w.get('input').setValue(true);await w.setProps({previewReady:false});expect(w.get('button').element.disabled).toBe(true);w.unmount();
 });
 it('keeps the approval blocked when the server denies permission or activation',async()=>{
  api.patch.mockRejectedValue({response:{data:{error:{message:'Organization access required.'}}}});const w=mount(Approval,{props:{...props,previewReady:true}});await w.get('input').setValue(true);await w.get('button').trigger('click');await flushPromises();expect(w.get('[role=alert]').text()).toBe('Organization access required.');expect(w.emitted('approved')).toBeUndefined();w.unmount();
 });
});
