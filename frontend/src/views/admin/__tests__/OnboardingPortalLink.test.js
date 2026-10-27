import { afterEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import View from '../OnboardingAdminView.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'itsco'}}),useRouter:()=>({push:vi.fn()})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1,role:'admin'}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2,slug:'itsco'},userAgencies:[{id:2,slug:'itsco',name:'ITSCO'}]})}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({})}));
let w;afterEach(()=>{w?.unmount();vi.restoreAllMocks();});
it('opens the existing onboarding portal without regenerating or emailing the link',async()=>{
 const tab={opener:{},location:{replace:vi.fn()},close:vi.fn()};vi.spyOn(window,'open').mockReturnValue(tab);
 api.get.mockImplementation(async url=>({data:url.endsWith('/prehire-link')?{portalLink:'https://example.test/pre-hire/token'}:[{id:9,first_name:'Alex',task_total:1,task_completed:0,progress_pct:0}]}));
 w=shallowMount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();
 await w.findAll('button').find(b=>b.text().includes('View onboarding portal')).trigger('click');await flushPromises();
 expect(tab.opener).toBeNull();expect(tab.location.replace).toHaveBeenCalledWith('https://example.test/pre-hire/token');expect(api.post).not.toHaveBeenCalled();
});
