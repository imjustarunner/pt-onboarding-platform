import { beforeEach, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import View from '../PublicProviderProfileView.vue';
import api from '../../../services/api';

const { route } = vi.hoisted(()=>({route:{params:{organizationSlug:'example',providerId:'8'},query:{}}}));
vi.mock('vue-router',()=>({useRoute:()=>route}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({displayLogoUrl:''})}));
const provider={id:8,firstName:'Example',displayName:'Example Provider',specialties:['Anxiety'],ageGroups:['Adults (18+)'],focus:['Individuals'],modalities:['CBT']};
const profile={publicBlurb:'Published provider biography.',insurancesAccepted:['Example Plan'],selfPayRateLabel:'$100 / session',selfPayRateNote:'Published fee information.'};
const render=()=>mount(View,{global:{stubs:{RouterLink:{template:'<a><slot/></a>'},BrandingLogo:true,PublicProviderProfileEditor:true,PublicProviderAvailabilityWeek:true,PublicProviderAvailabilityPanel:true}}});
beforeEach(()=>{vi.clearAllMocks();route.query={};});
it('renders the shared public details with published fees and the existing availability components',async()=>{
 api.get.mockResolvedValue({data:{provider,profile,agency:{id:2,name:'Example Practice'}}});const w=render();
 try{await flushPromises();expect(w.find('h1').text()).toBe('Example Provider');expect(w.find('.public-provider-details').text()).toContain('Published provider biography.');expect(w.find('.public-provider-details').text()).toContain('Anxiety');expect(w.find('.public-provider-details').text()).toContain('Example Plan');expect(w.text()).toContain('$100 / session');expect(w.text()).toContain('Published fee information.');expect(w.findComponent({name:'PublicProviderAvailabilityPanel'}).props()).toMatchObject({agencySlug:'example',provider:{id:8},serviceType:'counseling'});expect(api.get).toHaveBeenCalledWith('/public/agency-services/example/providers/8',expect.objectContaining({params:expect.objectContaining({view:'profile',serviceType:'counseling',bookingMode:'NEW_CLIENT'})}));}finally{w.unmount();}
});
it('retains tutoring subjects, grades, rates and packages alongside the extracted detail sections',async()=>{
 route.query={serviceType:'tutoring'};api.get.mockResolvedValue({data:{provider:{...provider,tutoringProfile:{subjectAreas:['Math'],gradeLevels:['Grade 6'],hourlyRates:{VIRTUAL:7500},packages:[{id:3,name:'Learning package',components:[],totalCents:30000}]}},profile,agency:{id:2,name:'Example Practice'}}});const w=render();
 try{await flushPromises();expect(w.find('.public-provider-details').text()).toContain('Subjects');expect(w.find('.public-provider-details').text()).toContain('Math');expect(w.find('.public-provider-details').text()).toContain('Grade 6');expect(w.text()).toContain('Learning rates & packages');expect(w.text()).toContain('$75.00 / hour');expect(w.text()).toContain('Learning package');expect(w.text()).toContain('$300.00');expect(w.text()).not.toContain('Self-pay');expect(w.text()).not.toContain('$100 / session');expect(w.text()).not.toContain('Published fee information.');}finally{w.unmount();}
});
it('uses the tutoring hourly prices and withholds a missing clinical fee presented as zero',async()=>{
 route.query={serviceType:'tutoring'};
 api.get.mockResolvedValue({data:{provider:{...provider,tutoringProfile:{hourlyRates:{virtual:5000,'in-person':5500}}},profile:{...profile,selfPayRateLabel:'$0.00'},agency:{id:453,name:'NLU QA'}}});
 const w=render();
 try{await flushPromises();expect(w.text()).toContain('$50.00 / hour');expect(w.text()).toContain('$55.00 / hour');expect(w.text()).not.toContain('Self-pay');expect(w.text()).not.toContain('$0.00');}finally{w.unmount();}
});
