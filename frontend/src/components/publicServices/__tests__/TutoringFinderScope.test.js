import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia} from 'pinia';
import Card from '../PublicProviderCard.vue';
import Finder from '../PublicTeamFinderShell.vue';
const {get}=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'nlu-qa-demo'},query:{}}),useRouter:()=>({push:vi.fn()})}));
beforeEach(()=>get.mockReset().mockResolvedValue({data:{providers:[]}}));
it('uses tutoring subjects without clinical insurance or specialties on a mixed-role tutor card',()=>{
 const w=mount(Card,{props:{serviceType:'tutoring',provider:{id:1,displayName:'QA Tutor',specialties:['Anxiety'],ageGroups:['Adults'],profile:{insurancesAccepted:['Clinical Insurance'],details:{clinicalFocus:{reviewed:true}}},tutoringProfile:{subjectAreas:['Math'],gradeLevels:['5']}}}});
 expect(w.text()).toContain('Math');expect(w.text()).not.toContain('Anxiety');expect(w.text()).not.toContain('Clinical Insurance');expect(w.text()).not.toContain('Highlighted areas');w.unmount();
});
it.each(['tutoring','counseling'])('shows insurance only when the finder service is clinical: %s',async serviceType=>{
 const w=mount(Finder,{props:{serviceType},global:{plugins:[createPinia()],stubs:{BrandingLogo:true,PublicOfficeLocations:true}}});await flushPromises();
 const insurance=w.findAll('label').find(label=>label.text().startsWith('Insurance'));
 expect(!!insurance).toBe(serviceType==='counseling');w.unmount();
});
