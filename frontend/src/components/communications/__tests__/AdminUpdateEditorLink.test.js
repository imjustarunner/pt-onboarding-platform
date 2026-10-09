// @vitest-environment jsdom
import {beforeEach, it, expect, vi} from 'vitest';
import {mount, flushPromises} from '@vue/test-utils';
import Editor from '../CommunicationsCenterAdminUpdate.vue';
const mocks=vi.hoisted(()=>({query:{mode:'admin-update',updateId:'1'},replace:vi.fn(),get:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>({query:mocks.query}),useRouter:()=>({replace:mocks.replace})}));
vi.mock('../../../services/api',()=>({default:{get:mocks.get}}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2,name:'ITSCO'}})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{role:'super_admin',email:'example@example.test'}})}));
beforeEach(()=>{
 vi.clearAllMocks();mocks.query.updateId='1';mocks.replace.mockResolvedValue();
 mocks.get.mockImplementation(async path=>({data:path.endsWith('/admin-updates')?{updates:[{id:3,title:'Newer draft'},{id:1,title:'Requested draft'}]}:path==='/email-senders'?[]:path.endsWith('/public-link')?{}:{id:Number(path.split('/').pop()),title:'Requested draft',topics:[],items:[]}}));
});
it('opens the explicitly linked draft instead of silently showing the newest update',async()=>{
 const wrapper=mount(Editor,{global:{stubs:{BrandingLogo:true,TrainingMediaAttachment:true}}});await flushPromises();
 expect(mocks.get).toHaveBeenCalledWith('/agencies/2/admin-updates/1',expect.any(Object));
 expect(mocks.get.mock.calls.some(([p])=>p==='/agencies/2/admin-updates/3')).toBe(false);wrapper.unmount();
});
it('reports an unavailable linked draft instead of opening another agency’s or another draft',async()=>{
 mocks.query.updateId='99';const wrapper=mount(Editor,{global:{stubs:{BrandingLogo:true,TrainingMediaAttachment:true}}});await flushPromises();
 expect(wrapper.text()).toContain('not available in the selected agency');
 expect(mocks.get.mock.calls.some(([p])=>/admin-updates\/(99|3)$/.test(p))).toBe(false);wrapper.unmount();
});
