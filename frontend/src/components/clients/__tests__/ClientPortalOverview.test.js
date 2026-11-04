import {it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
import api from '../../../services/api';
import Overview from '../ClientPortalOverview.vue';
const props={client:{id:7,full_name:'Fictional Client'},agency:{id:2,name:'Practice'},actor:{id:1,role:'super_admin'}};
const accounts=[{id:10,name:'Parent One',relationship:'Parent',available:true,lastLogin:'2026-11-04T10:00:00Z'},{id:11,name:'Parent Two',relationship:'Parent',available:true}];
const global={stubs:{PortalAccountPreview:{props:['account'],template:'<aside class="preview">{{account.name}}</aside>'}}};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{accounts}});});
it('starts with an overview and sharing actions, then supports either parent or both',async()=>{
 const w=mount(Overview,{props,global});await flushPromises();expect(w.findAll('.preview')).toHaveLength(0);expect(w.text()).toContain('Linked portal accounts');expect(w.text()).toContain('Parent One');
 await w.findAll('button').find(b=>b.text()==='Share documents').trigger('click');expect(w.emitted('share-documents')).toHaveLength(1);
 await w.findAll('button').find(b=>b.text()==='View as Parent Two').trigger('click');expect(w.findAll('.preview')).toHaveLength(1);expect(w.get('.preview').text()).toBe('Parent Two');
 await w.findAll('button').find(b=>b.text()==='Show all linked portal views').trigger('click');expect(w.findAll('.preview')).toHaveLength(2);w.unmount();
});
it('does not expose or fetch View as/activity for provider roles',async()=>{for(const role of ['provider','staff','supervisor','client_guardian']){const w=mount(Overview,{props:{...props,actor:{id:1,role}},global});await flushPromises();expect(w.findAll('button').some(b=>b.text().startsWith('View as'))).toBe(false);w.unmount();}expect(api.get).not.toHaveBeenCalled();});
it('discards a late account response after the client changes',async()=>{let finish;api.get.mockReturnValueOnce(new Promise(resolve=>finish=resolve)).mockResolvedValue({data:{accounts:[]}});const w=mount(Overview,{props,global});await w.setProps({client:{id:8,full_name:'Another client'}});await flushPromises();finish({data:{accounts}});await flushPromises();expect(w.text()).not.toContain('Parent One');w.unmount();});
