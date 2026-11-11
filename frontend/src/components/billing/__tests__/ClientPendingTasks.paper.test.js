import {beforeEach,expect,it,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
const push=vi.hoisted(()=>vi.fn());
vi.mock('vue-router',()=>({useRouter:()=>({push})}));vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
vi.mock('../InsuranceEmailReview.vue',()=>({default:{template:'<div/>'}}));vi.mock('../InsuranceCardTasks.vue',()=>({default:{template:'<div/>'}}));
import api from '../../../services/api';import Panel from '../ClientPendingTasks.vue';
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{tasks:[{id:90,title:'Process paper packet enrollment',packet_filename:'Synthetic packet.pdf',document_id:30,created_at:'2026-11-10T22:10:00Z',status:'pending'}]}});});
it('lists and opens a scoped saved-packet task without fetching restricted clinical or billing data',async()=>{
 const w=mount(Panel,{props:{clientId:55,agencyId:450,agencySlug:'qa',paperEnabled:true,billingEnabled:false,clinicalNotes:[]}});await flushPromises();
 expect(api.get).toHaveBeenCalledExactlyOnceWith('/clients/55/paper-packet-documents',{skipGlobalLoading:true});expect(w.text()).toContain('Synthetic packet.pdf');expect(w.text()).toContain('Document #30');
 await w.findAll('button').find(b=>b.text().includes('Open packet task')).trigger('click');expect(push).toHaveBeenCalledWith({path:'/qa/tasks',query:{taskId:90}});w.unmount();
});
it('does not request operational packet tasks without that role capability',async()=>{
 const w=mount(Panel,{props:{clientId:55,agencyId:450,paperEnabled:false,billingEnabled:false,clinicalNotes:[]}});await flushPromises();expect(api.get).not.toHaveBeenCalled();w.unmount();
});
it('ignores a late prior-child task response after switching children',async()=>{
 let finish;api.get.mockImplementationOnce(()=>new Promise(r=>{finish=r})).mockResolvedValueOnce({data:{tasks:[]}});
 const w=mount(Panel,{props:{clientId:55,agencyId:450,paperEnabled:true,billingEnabled:false,clinicalNotes:[]}});await w.setProps({clientId:56});await flushPromises();
 finish({data:{tasks:[{id:90,packet_filename:'Wrong sibling packet.pdf'}]}});await flushPromises();expect(w.text()).not.toContain('Wrong sibling');w.unmount();
});
