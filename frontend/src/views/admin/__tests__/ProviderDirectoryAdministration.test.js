import {beforeEach,it,expect,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import View from '../ProviderDirectoryView.vue';
const mocks=vi.hoisted(()=>({auth:{user:{role:'support'}},get:vi.fn(),post:vi.fn()}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>mocks.auth}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({userAgencies:[{id:450,name:'QA'}],currentAgency:{id:450},fetchUserAgencies:vi.fn()})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'auricwell-qa-demo'}})}));
vi.mock('../../../services/api',()=>({default:mocks}));
beforeEach(()=>{vi.clearAllMocks();mocks.auth.user.role='support';mocks.get.mockResolvedValue({data:[]});});
it('keeps the support directory usable without import, creation, purge or rebuild controls',async()=>{
 const w=shallowMount(View);await flushPromises();
 expect(w.text()).toContain('Provider Directory');
 expect(w.text()).not.toMatch(/Import legacy|Rollback|Bulk create|Rebuild Index|Paste key/);
 expect(w.findAll('button').some(b=>b.text()==='Search')).toBe(true);
 w.unmount();
});
it.each(['admin','super_admin'])('preserves administrative controls for %s',async role=>{
 mocks.auth.user.role=role;const w=shallowMount(View);await flushPromises();
 expect(w.text()).toContain('Rollback / Purge profile values');
 expect(w.text()).toContain('Import legacy answers');expect(w.text()).toContain('Bulk create providers');w.unmount();
});
