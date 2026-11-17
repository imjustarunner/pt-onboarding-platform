import { expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'tisi'},query:{}}),useRouter:()=>({push:vi.fn()})}));
vi.mock('../../../store/branding.js',()=>({useBrandingStore:()=>({})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({isAuthenticated:false,user:null})}));
import Shell from '../PublicTeamFinderShell.vue';
it('shows published provider cards without requiring an opening or loading calendar availability',async()=>{
 api.get.mockImplementation(async url=>url.endsWith('/counselors')?{data:{agencyName:'The Inner Strength Institute',providers:[{id:501,firstName:'Michael',lastName:'Mendez',availability:{slots:[]}}]}}:{data:{agency:{id:377,name:'The Inner Strength Institute'},serviceTypes:[{serviceType:'counseling'}]}});
 const wrapper=shallowMount(Shell,{props:{serviceType:'counseling',pageTitle:'Providers',directoryOnly:true}});await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/public/agency-services/tisi/counselors',expect.objectContaining({params:expect.objectContaining({view:'directory'})}));
 expect(wrapper.findComponent({name:'PublicProviderCard'}).props('provider').displayName).toBe('Michael Mendez');expect(wrapper.text()).not.toContain('Find the earliest time');wrapper.unmount();
});
