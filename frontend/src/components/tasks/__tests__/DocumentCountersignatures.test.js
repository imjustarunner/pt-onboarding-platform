import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'},fullPath:'/itsco/tasks'})}));
import Component from '../DocumentCountersignatures.vue';
const ready={id:7,documentTaskId:6,employeeName:'Test Employee',agencyName:'Test Agency',title:'Countersign — Agreement',signedAt:'2026-10-16 13:37:12',state:'ready'};
beforeEach(()=>vi.clearAllMocks());
it('opens the employee document, shows ready and waiting separately, and never signs from the queue',async()=>{
 m.get.mockResolvedValue({data:{items:[ready,{...ready,id:9,documentTaskId:8,employeeName:'Waiting Employee',state:'waiting'}]}});
 const w=mount(Component,{props:{agencyId:2},global:{stubs:{RouterLink:{props:['to'],template:'<a :href="to.path"><slot /></a>'}}}});await flushPromises();
 expect(m.get).toHaveBeenCalledWith('/tasks/countersignatures',expect.objectContaining({params:{agencyId:2}}));
 expect(w.find('h2').text()).toContain('Ready to countersign 1');expect(w.find('summary').text()).toContain('1 awaiting');
 expect(w.find('a').attributes('href')).toBe('/itsco/tasks/documents/6/sign');
 expect(w.text()).toContain('Waiting for the employee to sign');w.unmount();
});
it('refresh removes completed items without creating another task',async()=>{
 m.get.mockResolvedValueOnce({data:{items:[ready]}}).mockResolvedValueOnce({data:{items:[]}});
 const w=mount(Component,{global:{stubs:['RouterLink']}});await flushPromises();await w.get('header button').trigger('click');await flushPromises();expect(w.find('section').exists()).toBe(false);w.unmount();
});
