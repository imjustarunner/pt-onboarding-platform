import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
const state=vi.hoisted(()=>({auth:null,route:null,agencies:null}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>state.auth}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>state.agencies}));
vi.mock('vue-router',()=>({useRoute:()=>state.route}));
vi.mock('../PlotlineSessionBoundary.vue',()=>({default:{template:'<div data-session-boundary />'}}));
vi.mock('../PlotlineWorkspaceShell.vue',()=>({default:{template:'<div data-plotline-shell><slot /></div>'}}));
vi.mock('../../assistants/AssistantAppShell.vue',()=>({default:{template:'<div><slot /></div>'}}));
vi.mock('../../public/PublicWebsiteShell.vue',()=>({default:{template:'<div><slot /></div>'}}));
vi.mock('../../../AppWorkspace.vue',()=>({__esModule:true,default:{template:'<div data-ordinary-workspace />'}}));
import App from '../../../App.vue';
let wrapper;
beforeEach(()=>{
 state.auth=reactive({isAuthenticated:true,user:{id:1434,role:'staff'}});
 state.route=reactive({name:'Careers',params:{organizationSlug:'juniper'},meta:{}});
 state.agencies=reactive({currentAgency:{id:463,slug:'juniper',feature_flags:{plotlineOnly:true}}});
});
afterEach(()=>wrapper?.unmount());
it('mounts session recovery beside the private Plotline shell rather than relying on the omitted ordinary workspace',async()=>{
 wrapper=mount(App,{global:{stubs:{RouterView:true}}});await flushPromises();
 expect(wrapper.find('[data-plotline-shell]').exists()).toBe(true);
 expect(wrapper.find('[data-session-boundary]').exists()).toBe(true);
 expect(wrapper.find('[data-ordinary-workspace]').exists()).toBe(false);
});
it('also covers authenticated company setup and entry screens',async()=>{
 state.route.meta={plotlineEntry:true};state.route.params={};state.route.name='PlotlineCompany';
 wrapper=mount(App,{global:{stubs:{RouterView:true}}});await flushPromises();expect(wrapper.find('[data-session-boundary]').exists()).toBe(true);
});
it.each(['anonymous','login','family','ordinary'])('does not start a second employee tracker on %s',async lane=>{
 if(lane==='anonymous')state.auth.isAuthenticated=false;
 if(lane==='login')state.route.name='OrganizationLogin';
 if(lane==='family')state.auth.user.role='guardian';
 if(lane==='ordinary')state.agencies.currentAgency.feature_flags={};
 wrapper=mount(App,{global:{stubs:{RouterView:true}}});await flushPromises();expect(wrapper.find('[data-session-boundary]').exists()).toBe(false);
});
