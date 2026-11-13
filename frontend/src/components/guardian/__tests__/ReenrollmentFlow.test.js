import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import PastProvidersPanel from '../PastProvidersPanel.vue';
import ReenrollmentPackages from '../ReenrollmentPackages.vue';
import ClientReenrollment from '../../admin/ClientReenrollment.vue';
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{packages:[],providers:[]}});});
it('shows past provider history and an explicit review-only return path',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/past-providers')?{providers:[{id:'history-2',serviceId:3,providerUserId:7,providerName:'Previous provider',label:'Counseling',statusLabel:'Discontinued services',reason:'Contact was discontinued.'}]}:url.endsWith('/return-request')?{request:null}:{packages:[]}}));
 const w=mount(PastProvidersPanel,{props:{clientId:8}});await flushPromises();expect(w.text()).toContain('Previous provider');await w.get('button').trigger('click');await flushPromises();expect(w.text()).toContain('fresh re-enrollment package');expect(w.text()).toContain('does not restart services');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('shows an authenticated package and its current documents without treating it as an appointment',async()=>{
 api.get.mockResolvedValue({data:{packages:[{id:4,status:'sent',documents:[{id:10,title:'Current agreement v3'}],path:'/intake/reenroll-private'}]}});
 const w=mount(ReenrollmentPackages,{props:{clientId:8,serviceId:3}});await flushPromises();expect(w.get('a').attributes('href')).toBe('/intake/reenroll-private');expect(w.text()).toContain('Current agreement v3');expect(w.text()).toContain('existing file');w.unmount();
});
it('requires staff review of the recipient and package before sending and reuses the same identity after interruption',async()=>{
 api.get.mockResolvedValue({data:{services:[{id:3,label:'Counseling',providerName:'Previous provider'}],contacts:[{id:11,name:'Client',email:'client@example.invalid'}],documents:[{id:10,title:'Current agreement v3'}],confirmation:'Confirm contact, insurance/payment and communication details.'}});
 api.post.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({data:{deliveryStatus:'sent'}});
 const w=mount(ClientReenrollment,{props:{clientId:8,agencyId:2,serviceId:3}});await w.get('button').trigger('click');await flushPromises();expect(w.get('button[type=submit]').attributes('disabled')).toBeDefined();await w.get('input[type=checkbox]').setValue(true);await w.get('form').trigger('submit');await flushPromises();await w.get('form').trigger('submit');await flushPromises();
 expect(api.post.mock.calls[0][1]).toMatchObject({serviceId:3,recipientUserId:11,confirmed:true});expect(api.post.mock.calls[0][1].requestKey).toBe(api.post.mock.calls[1][1].requestKey);expect(w.text()).toContain('invitation sent');w.unmount();
});
