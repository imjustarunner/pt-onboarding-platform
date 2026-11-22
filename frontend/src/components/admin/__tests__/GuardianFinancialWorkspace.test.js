import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Workspace from '../GuardianFinancialWorkspace.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../billing/ClientInsuranceEditor.vue',()=>({default:{template:'<div>Insurance editor</div>'}}));
vi.mock('../../billing/ResponsibleBillingParty.vue',()=>({default:{template:'<div>Responsible party editor</div>'}}));
const props={guardian:{id:20,email:'parent@example.test'},canEdit:true,data:{clients:[{clientId:4,agencyId:2,name:'Child',insurance:{state:'recorded',source:'chart',policies:[{slot:'primary',insurerName:'Saved Insurer',memberLastFour:'5678'}]},billing:{available:true,isResponsibleParty:true,assignedBalances:1,dueCents:2500,responsibleParty:{contact:{fullName:'Parent'}}}}]}};
beforeEach(()=>{vi.resetAllMocks();URL.createObjectURL=vi.fn(()=> 'blob:private-statement');URL.revokeObjectURL=vi.fn();api.post.mockResolvedValue({data:{noticeId:44}});api.get.mockResolvedValue({data:new Blob(['private PDF'])});});
it('displays real coverage and responsible-party status and prepares a recipient-specific preview without sending',async()=>{
 const w=mount(Workspace,{props});expect(w.text()).toContain('Saved Insurer');expect(w.text()).toContain('Responsible billing party');
 await w.findAll('button').find(b=>b.text()==='Prepare statement').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledExactlyOnceWith('/family-billing/staff/notices',expect.objectContaining({agencyId:2,payerUserId:20,clientId:4,kind:'statement'}),{skipGlobalLoading:true});
 expect(api.post.mock.calls.some(([url])=>url.endsWith('/send'))).toBe(false);expect(w.get('iframe').attributes('src')).toBe('blob:private-statement');
 await w.findAll('button').find(b=>b.text()==='Send to this guardian').trigger('click');await flushPromises();expect(api.post).toHaveBeenLastCalledWith('/family-billing/staff/notices/44/send',{agencyId:2},{skipGlobalLoading:true});w.unmount();
});
it('offers secure payment authorization for only this guardian and selected client, without raw card fields',async()=>{
 const w=mount(Workspace,{props});await w.findAll('button').find(b=>b.text()==='Prepare secure payment setup').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/family-billing/staff/tasks',{agencyId:2,guardianUserId:20,clientIds:[4],requireCard:false},{skipGlobalLoading:true});expect(w.find('input[autocomplete=cc-number]').exists()).toBe(false);w.unmount();
});
it('shows a failed insurance read as unavailable instead of claiming there is no insurance',()=>{
 const value=JSON.parse(JSON.stringify(props));value.data.clients[0].insurance={state:'unavailable',message:'Insurance could not be loaded.'};const w=mount(Workspace,{props:value});expect(w.text()).toContain('Insurance could not be loaded.');expect(w.text()).not.toContain('No saved or submitted insurance');w.unmount();
});
