import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import Workspace from '../CompanyWorkspace.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:null})}));
vi.mock('../AgencyManagement.vue',()=>({default:{name:'AgencyManagement',props:['embeddedOrgId'],template:'<div class="business-editor">Business editor</div>'}}));
async function setup(){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<div/>'}}]});await router.push('/admin/settings');const w=mount(Workspace,{props:{embeddedOrgId:1},global:{plugins:[router]}});await flushPromises();return {w,router};}
beforeEach(()=>vi.clearAllMocks());
describe('company setup scope',()=>{
 it('opens a coaching company, defers the large editor, and links setup to the selected tenant',async()=>{api.get.mockResolvedValue({data:{id:1,name:'Example Coaching',organization_type:'life_coach',slug:'example'}});const {w,router}=await setup();expect(w.text()).toContain('Example Coaching');expect(w.find('.business-editor').exists()).toBe(false);await w.findAll('.cw-grid button')[3].trigger('click');await flushPromises();expect(router.currentRoute.value.query).toMatchObject({item:'team-roles',agencyId:'1'});w.unmount();});
 it('never opens tenant settings for an affiliated school',async()=>{api.get.mockResolvedValue({data:{id:1,name:'Sample School',organization_type:'school'}});const {w}=await setup();expect(w.text()).toContain('Affiliated school');expect(w.find('.cw-grid').exists()).toBe(false);expect(w.find('.business-editor').exists()).toBe(false);w.unmount();});
 it('ignores a late company response after switching to a school',async()=>{let resolveOld;api.get.mockImplementationOnce(()=>new Promise(r=>{resolveOld=r;})).mockResolvedValueOnce({data:{id:2,name:'New School',organization_type:'school'}});const {w}=await setup();await w.setProps({embeddedOrgId:2});await flushPromises();resolveOld({data:{id:1,name:'Old Company',organization_type:'agency'}});await flushPromises();expect(w.text()).toContain('New School');expect(w.text()).not.toContain('Old Company');expect(w.find('.business-editor').exists()).toBe(false);w.unmount();});
});
