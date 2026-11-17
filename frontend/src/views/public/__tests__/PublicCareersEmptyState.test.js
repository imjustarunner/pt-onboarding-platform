import { afterEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{agencySlug:'tisi'},query:{}}),useRouter:()=>({push:vi.fn()})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({isAuthenticated:false,user:null})}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({fetchAgencyTheme:vi.fn()})}));
vi.mock('pdfjs-dist',()=>({GlobalWorkerOptions:{},getDocument:vi.fn()}));
import Careers from '../PublicCareersView.vue';
let wrapper;
afterEach(()=>wrapper?.unmount());
it('shows no current openings for Inner Strength when its published jobs feed is empty',async()=>{
 api.get.mockResolvedValue({data:{agency:{id:377,name:'The Inner Strength Institute',slug:'tisi'},jobs:[]}});
 wrapper=shallowMount(Careers);await flushPromises();expect(wrapper.text()).toContain('No current openings.');expect(api.get).toHaveBeenCalledWith('/public-intake/careers/tisi',expect.any(Object));
});
it('reports a failed jobs lookup without claiming that there are no openings',async()=>{
 api.get.mockRejectedValue(new Error('Unavailable'));wrapper=shallowMount(Careers);await flushPromises();expect(wrapper.text()).toContain('Unable to load careers');expect(wrapper.text()).not.toContain('No current openings.');
});
