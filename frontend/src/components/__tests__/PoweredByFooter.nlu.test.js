import {beforeEach,expect,it,vi} from 'vitest';
import {mount} from '@vue/test-utils';
import {reactive} from 'vue';
const state=vi.hoisted(()=>({auth:null,agency:null,branding:null,route:null}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>state.auth}));
vi.mock('../../store/agency',()=>({useAgencyStore:()=>state.agency}));
vi.mock('../../store/branding',()=>({useBrandingStore:()=>state.branding}));
vi.mock('vue-router',()=>({useRoute:()=>state.route}));
vi.mock('../../composables/useSummitStatsChallengeChrome',()=>({useSummitStatsChallengeChrome:()=>false}));
import Footer from '../PoweredByFooter.vue';
beforeEach(()=>{
 state.auth=reactive({user:{id:1496,role:'provider',workspaceServiceContext:{agencyId:453,learningOnly:true,canClinical:false,canTutor:true}}});
 state.agency=reactive({currentAgency:{id:453,slug:'nlu-qa-demo',feature_flags:{qaSandbox:{program:'tutoring'}}}});
 state.branding=reactive({activeRouteSlug:'nlu-qa-demo',showPoweredBy:false});
 state.route=reactive({path:'/nlu-qa-demo/tutoring-profile',params:{organizationSlug:'nlu-qa-demo'}});
});
const render=()=>mount(Footer,{global:{stubs:{RouterLink:{props:['to'],template:'<a :href="to"><slot/></a>'}}}});
it('renders actual tutor footer with NLU links and without clinical records or HIPAA notices',()=>{
 const w=render();const hrefs=w.findAll('a').map(a=>a.attributes('href'));
 expect(hrefs).toContain('https://nextleveluplcc.com/nlu/terms');
 expect(hrefs).toContain('https://nextleveluplcc.com/nlu/privacypolicy');
 expect(hrefs.some(href=>/auricwell|platformhipaa|records-request/.test(href))).toBe(false);
 expect(w.text()).not.toContain('HIPAA');w.unmount();
});
it('passes selected learning context into the parent terms notice on the shared app',()=>{
 state.auth.user.role='client_guardian';state.route.path='/nlu-qa-demo/guardian';
 const w=render();expect(w.find('details').exists()).toBe(true);
 expect(w.text()).toContain('Next Level Up provides tutoring, learning and childcare');
 expect(w.findAll('a').every(a=>a.attributes('href').startsWith('https://nextleveluplcc.com/nlu/'))).toBe(true);w.unmount();
});
it('keeps normal clinical notices when a clinician returns to their clinical context',async()=>{
 const w=render();state.agency.currentAgency={id:450,slug:'itsco'};state.branding.activeRouteSlug='itsco';
 state.auth.user.workspaceServiceContext={agencyId:450,canClinical:true,learningOnly:false};state.route.path='/itsco/dashboard';
 await w.vm.$nextTick();const hrefs=w.findAll('a').map(a=>a.attributes('href'));
 expect(hrefs).toContain('/records-request');expect(hrefs).toContain('https://www.itsco.health/itsco/platformhipaa');
 expect(hrefs).toContain('https://auricwell.com/auricwell/terms');w.unmount();
});
