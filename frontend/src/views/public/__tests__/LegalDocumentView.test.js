import {describe,it,expect,vi,beforeEach} from 'vitest';
import {reactive} from 'vue';
import {mount,flushPromises} from '@vue/test-utils';
import View from '../LegalDocumentView.vue';
const state=vi.hoisted(()=>({route:null,branding:{platformBranding:{},fetchPlatformBranding:vi.fn()},get:vi.fn()}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>state.branding}));
vi.mock('vue-router',()=>({useRoute:()=>state.route}));
vi.mock('../../../services/api',()=>({default:{get:state.get}}));
beforeEach(()=>{vi.clearAllMocks();state.branding.platformBranding={};state.route=reactive({meta:{legalDocType:'platformhipaa'},params:{},path:'/platformhipaa'});});
describe('tenant policy identity and source',()=>{
 it('provides a native platform role notice rather than a provider NPP or Google embed',async()=>{
  const w=mount(View);await flushPromises();expect(w.get('h1').text()).toBe('Plot Twist Co: Health Information & Privacy');expect(w.find('iframe').exists()).toBe(false);expect(w.text()).toContain('not a provider’s Notice');w.unmount();
 });
 it('loads an unknown organization using its exact public identity, without inferring clinical status',async()=>{
  state.route.params.organizationSlug='example';state.get.mockResolvedValue({data:{name:'Example Coaching',slug:'example',organization_type:'agency',support_team_email:'help@example.com'}});
  const w=mount(View);await flushPromises();expect(w.get('h1').text()).toBe('Example Coaching: Health Information & Privacy');expect(w.text()).not.toContain('ITSCO');expect(state.get).toHaveBeenCalledWith('/agencies/slug/example',expect.any(Object));w.unmount();
 });
 it('does not mislabel another organization when the lookup fails or returns the wrong tenant',async()=>{
  state.route.params.organizationSlug='missing';state.get.mockResolvedValue({data:{name:'ITSCO',slug:'itsco'}});
  const w=mount(View);await flushPromises();expect(w.get('[role=alert]').text()).toContain('could not load');expect(w.find('article').exists()).toBe(false);w.unmount();
 });
 it('preserves a configured SMS proof document independently of policy content',async()=>{
  state.route.meta.legalDocType='publicproof';state.branding.platformBranding={public_proof_url:'https://example.com/proof.pdf'};
  const w=mount(View);await flushPromises();expect(w.get('iframe').attributes('src')).toBe('https://example.com/proof.pdf');w.unmount();
 });
});
