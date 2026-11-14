import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import ServiceReturnRequest from '../ServiceReturnRequest.vue';
const id='11111111-1111-4111-8111-111111111111',url='/guardian-portal/clients/8/services/3/return-request';
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('crypto',{randomUUID:()=>id});api.get.mockResolvedValue({data:{request:null}});});
const render=()=>mount(ServiceReturnRequest,{props:{clientId:8,serviceId:3,providerName:'Dr. Example'}});
it('submits a provider-specific review request without restarting care or booking',async()=>{
 api.post.mockResolvedValue({data:{request:{id,status:'pending',note:'Ready to talk again'}}});
 const w=render();await flushPromises();expect(w.text()).toContain('Dr. Example');expect(w.text()).toContain('does not restart services');
 await w.find('textarea').setValue('Ready to talk again');await w.find('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith(url,{requestId:id,note:'Ready to talk again'});expect(api.post).toHaveBeenCalledTimes(1);
 expect(w.text()).toContain('waiting for team review');expect(w.text()).toContain('Ready to talk again');expect(w.find('form').exists()).toBe(false);
});
it('retains the same request identity after an interrupted submission',async()=>{
 api.post.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({data:{request:{id,status:'pending'}}});
 const w=render();await flushPromises();await w.find('form').trigger('submit');await flushPromises();expect(w.text()).toContain('Retry');
 await w.find('form').trigger('submit');await flushPromises();expect(api.post.mock.calls.map(([,body])=>body.requestId)).toEqual([id,id]);
});
it('shows the reviewed outcome and keeps services closed until separate staff activation',async()=>{
 api.get.mockResolvedValue({data:{request:{id,status:'declined',response:'Please contact another provider.'}}});
 const w=render();await flushPromises();expect(w.text()).toContain('Please contact another provider.');expect(w.text()).toContain('explicitly reactivates');
 expect(w.find('form').exists()).toBe(false);await w.findAll('button').find(b=>b.text()==='Request consideration again').trigger('click');expect(w.find('form').exists()).toBe(true);expect(api.post).not.toHaveBeenCalled();
});
it('requires an authorized status read before presenting a form',async()=>{
 api.get.mockRejectedValue({response:{data:{error:{message:'Access revoked.'}}}});const w=render();await flushPromises();expect(w.text()).toContain('Access revoked.');expect(w.find('form').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();
});
