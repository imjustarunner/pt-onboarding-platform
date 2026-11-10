import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import Batches from '../AssistantBillingBatches.vue';
import Rules from '../AssistantBillingRules.vue';
const rule={id:1,ruleNumber:'BILL-000001',revision:1,status:'active',authorizedBy:'Michael Mendez',agencyIds:[2,6,377],instructions:['Submit only the ready references.']};
const ref='11111111-1111-4111-8111-111111111111',item='22222222-2222-4222-8222-222222222222';
beforeEach(()=>vi.clearAllMocks());
it('renders only opaque ready references and sends the exact rule and item references',async()=>{
 api.get.mockResolvedValue({data:{batches:[{ref,rule,expiresAt:'2026-11-10',items:[{ref:item,status:'READY'}]}]}});api.post.mockResolvedValue({data:{results:[{ref:item,status:'CLAIMMD_ACKNOWLEDGED'}]}});
 const w=mount(Batches);await flushPromises();expect(w.text()).toContain('authorization by Michael Mendez, performed by Billing Assistant');
 await w.findAll('button').find(b=>b.text().startsWith('Submit these')).trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith(`/assistant-work/billing/batches/${ref}/submit`,{ruleNumber:'BILL-000001',ruleRevision:1,itemRefs:[item]});expect(w.text()).toContain('does not confirm payer acceptance or payment');w.unmount();
});
it('drops a failed batch instead of offering a blind retry',async()=>{
 api.get.mockResolvedValue({data:{batches:[{ref,rule,items:[{ref:item,status:'READY'}]}]}});api.post.mockRejectedValue(new Error('Unknown delivery'));
 const w=mount(Batches);await flushPromises();await w.findAll('button').find(b=>b.text().startsWith('Submit these')).trigger('click');await flushPromises();
 expect(w.find('[role="alert"]').text()).toContain('Do not retry');expect(w.findAll('button').some(b=>b.text().startsWith('Submit these'))).toBe(false);w.unmount();
});
it('submits one opaque claim and refreshes the remaining authorized items',async()=>{
 const second='33333333-3333-4333-8333-333333333333',batch={ref,rule,items:[{ref:item,status:'READY'},{ref:second,status:'READY'}]};
 api.get.mockResolvedValueOnce({data:{batches:[batch]}}).mockResolvedValueOnce({data:{batches:[{...batch,items:[batch.items[1]]}]}});
 api.post.mockResolvedValue({data:{results:[{ref:item,status:'CLAIMMD_ACKNOWLEDGED'}],remainingCount:1}});
 const w=mount(Batches);await flushPromises();await w.findAll('button').find(b=>b.text()==='Submit this claim').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledExactlyOnceWith(`/assistant-work/billing/batches/${ref}/submit`,{ruleNumber:'BILL-000001',ruleRevision:1,itemRefs:[item]});
 expect(w.text()).toContain(second);expect(w.text()).not.toContain(item);expect(w.text()).toContain('1 acknowledged');w.unmount();
});
it('submits only checked items as a selected batch',async()=>{
 const second='33333333-3333-4333-8333-333333333333',third='44444444-4444-4444-8444-444444444444';
 api.get.mockResolvedValue({data:{batches:[{ref,rule,items:[item,second,third].map(ref=>({ref,status:'READY'}))}]}});
 api.post.mockResolvedValue({data:{results:[],remainingCount:1}});
 const w=mount(Batches);await flushPromises();const checks=w.findAll('input[type="checkbox"]');
 await checks[0].setValue(true);await checks[2].setValue(true);await w.findAll('button').find(b=>b.text()==='Submit selected claims (2)').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledExactlyOnceWith(`/assistant-work/billing/batches/${ref}/submit`,{ruleNumber:'BILL-000001',ruleRevision:1,itemRefs:[item,third]});w.unmount();
});
it('lets the owner start a scoped batch and revoke the numbered rule',async()=>{
 api.get.mockResolvedValue({data:{rules:[rule],instructions:rule.instructions}});api.post.mockResolvedValue({data:{prepared:false,readyCount:0}});
 const w=mount(Rules);await flushPromises();await w.findAll('button').find(b=>b.text().startsWith('Start an')).trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/assistant-accounts/billing-rules/1/batches',{agencyId:2});expect(w.text()).toContain('No fully checked claims');
 await w.findAll('button').find(b=>b.text()==='Revoke rule').trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/assistant-accounts/billing-rules/1/revoke');w.unmount();
});
