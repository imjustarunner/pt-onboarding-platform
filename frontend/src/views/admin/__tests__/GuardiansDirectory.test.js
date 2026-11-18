import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import View from '../GuardiansView.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'},query:{}}),useRouter:()=>({push:vi.fn()})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{role:'admin'}})}));
vi.mock('../../../components/admin/UserSmartGrid.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../../components/admin/IdentityReviewDrawer.vue',()=>({default:{template:'<div />'}}));
it('searches phone, school and linked child while showing a keyboard-accessible guardian account link',async()=>{
 api.get.mockImplementation(async url=>({data:url==='/users/guardians'?[{id:20,first_name:'Example',last_name:'Parent',email:'parent@example.test',phone:'(303) 555-0100',school_names:'Example School',agencies:'Care agency',linked_clients_count:1,portal_clients_count:0,linked_clients:[{id:10,name:'First Child'}]}]:[]}));
 const w=mount(View,{global:{stubs:{RouterLink:{props:['to'],template:'<a :href="to"><slot /></a>'}}}});await flushPromises();
 expect(w.text()).toContain('(303) 555-0100');expect(w.text()).toContain('First Child');expect(w.text()).toContain('0 with relationship access enabled');
 expect(w.get('a.guardian-name').attributes('href')).toBe('/itsco/admin/users/20');
 const search=w.get('input[placeholder="Name, email, phone, child or school"]');
 for(const query of ['3035550100','First Child','Example School']){await search.setValue(query);expect(w.text()).toContain('Example Parent');}
 await search.setValue('missing');expect(w.text()).toContain('No guardians found.');w.unmount();
});
