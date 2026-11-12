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
it.each([
 [{hourlyRateCents:5000,sessionRateCents:null,sessionRateLabel:'$0.00'},'$50.00 / hour'],
 [{hourlyRateCents:5500,sessionRateCents:7500,sessionRateLabel:'$75.00'},'$55.00 / hour'],
 [{hourlyRateCents:null,sessionRateCents:null,sessionRateLabel:'$0.00'},'Contact us for pricing'],
 [{hourlyRateCents:null,sessionRateCents:7500,sessionRateLabel:'$75.00'},'$75.00 / session'],
 [{hourlyRateCents:0,sessionRateCents:null},'$0.00 / hour'],
 [{hourlyRateCents:null,sessionRateCents:0},'$0.00 / session'],
 [{hourlyRateCents:'invalid',sessionRateCents:-1},'Contact us for pricing']
])('shows the configured tutoring price without treating a missing rate as free', (tutoringProfile,label)=>{
 const w=mount(Card,{props:{serviceType:'tutoring',provider:{id:1496,displayName:'QA Tutor',tutoringProfile}}});
 expect(w.text()).toContain(label);
 if(label==='Contact us for pricing')expect(w.text()).not.toContain('$0.00');
 if(label.endsWith('/ hour'))expect(w.text()).not.toContain('/ session');
 w.unmount();
});
it.each(['tutoring','counseling'])('shows insurance only when the finder service is clinical: %s',async serviceType=>{
 const w=mount(Finder,{props:{serviceType},global:{plugins:[createPinia()],stubs:{BrandingLogo:true,PublicOfficeLocations:true}}});await flushPromises();
 const insurance=w.findAll('label').find(label=>label.text().startsWith('Insurance'));
 expect(!!insurance).toBe(serviceType==='counseling');w.unmount();
});
