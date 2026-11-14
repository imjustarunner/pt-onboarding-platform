import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Enrollment from '../PublicAgencyEnrollView.vue';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'auricwell-qa-demo'}}),RouterLink:{props:['to'],template:'<a :href="to"><slot/></a>'}}));
beforeEach(()=>vi.resetAllMocks());
it('offers counseling enrollment even when no group programs exist',async()=>{
 m.get.mockImplementation(async url=>({data:url.includes('/skill-builders/')?{programs:[]}:{agency:{name:'ITSCO QA'},serviceTypes:[{serviceType:'counseling',displayName:'Counseling'}]}}));
 const w=mount(Enrollment);await flushPromises();expect(w.text()).toContain('Start counseling enrollment');expect(w.find('a[href="/auricwell-qa-demo/join/counseling"]').exists()).toBe(true);expect(w.text()).not.toContain('No program portals');w.unmount();
});
it('keeps public programs available if service booking is disabled',async()=>{
 m.get.mockImplementation(async url=>{if(!url.includes('/skill-builders/'))throw Error('Disabled');return {data:{programs:[{id:2,name:'Program QA',slug:'program-qa'}]}};});
 const w=mount(Enrollment);await flushPromises();expect(w.text()).toContain('Program QA');expect(w.find('.pea-error').exists()).toBe(false);w.unmount();
});
