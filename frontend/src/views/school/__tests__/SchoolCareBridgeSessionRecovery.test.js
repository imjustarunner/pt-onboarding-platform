import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import {createPinia,setActivePinia} from 'pinia';
import SchoolCareBridgeEntryView from '../SchoolCareBridgeEntryView.vue';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),auth:null,route:null,agency:null,start:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>m.route,useRouter:()=>({replace:vi.fn(),push:vi.fn()})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>m.auth}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>m.agency}));
vi.mock('../../../store/organization',()=>({useOrganizationStore:()=>({fetchBySlug:vi.fn()})}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({setActiveRouteSlug:vi.fn(),fetchAgencyTheme:vi.fn()})}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('../../../utils/activityTracker',()=>({startActivityTracking:m.start}));
vi.mock('../../LoginView.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../OrganizationDashboardView.vue',()=>({__esModule:true,default:{template:'<main data-school-workspace>School workspace<input aria-label="Unsaved school entry" /></main>'}}));
vi.mock('../../../components/schoolcarebridge/SchoolCareBridgeBrand.vue',()=>({default:{template:'<div />'}}));
vi.mock('../../../components/legal/ServiceUseNotice.vue',()=>({default:{template:'<div />'}}));
let wrapper;
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();setActivePinia(createPinia());m.auth=reactive({isAuthenticated:true,user:{id:1465,role:'school_staff'},clearAuth:vi.fn()});m.agency=reactive({userAgencies:[{id:451,organization_type:'school'}]});m.route=reactive({name:'SchoolCareBridgeSchool',path:'/schoolcarebridge/app/cedar-grove-qa',params:{organizationSlug:'cedar-grove-qa'},query:{clientId:'2535',tab:'records'}});m.get.mockImplementation(async url=>({data:url.includes('/schools/')?{school:{id:451,name:'Fictional Cedar Grove'}}:{}}));});
afterEach(()=>wrapper?.unmount());
const render=async()=>{wrapper=mount(SchoolCareBridgeEntryView,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});await flushPromises();};
it('recovers the exact school after a blocked load only on verified session resume',async()=>{
 m.get.mockImplementation(async url=>{if(url.includes('/access/'))throw{response:{status:423,data:{error:{code:'SESSION_LOCKED',message:'Unlock your session to continue.'}}}};return{data:{school:{id:451,name:'Fictional Cedar Grove'}}};});
 await render();expect(wrapper.text()).toContain('Your session is paused');expect(wrapper.text()).not.toContain('Opening your portal');expect(m.auth.clearAuth).not.toHaveBeenCalled();expect(wrapper.find('[data-school-workspace]').exists()).toBe(false);
 m.get.mockImplementation(async url=>({data:url.includes('/schools/')?{school:{id:451,name:'Fictional Cedar Grove'}}:{}}));
 window.dispatchEvent(new Event('pt:session-resumed'));await flushPromises();expect(wrapper.find('[data-school-workspace]').exists()).toBe(true);expect(m.route.query).toEqual({clientId:'2535',tab:'records'});expect(m.get).toHaveBeenCalledWith('/schoolcarebridge/access/cedar-grove-qa',expect.objectContaining({skipAuthRedirect:true,timeout:15000}));
});
it('covers an already open school on a server lock and does not re-read protected data before resume',async()=>{
 await render();expect(wrapper.find('[data-school-workspace]').exists()).toBe(true);m.get.mockClear();window.dispatchEvent(new CustomEvent('pt:session-security',{detail:{error:{code:'SESSION_LOCKED'}}}));await flushPromises();expect(wrapper.text()).toContain('Your session is paused');expect(wrapper.find('[data-school-workspace]').isVisible()).toBe(false);expect(m.get).not.toHaveBeenCalled();
 window.dispatchEvent(new Event('pt:session-resumed'));await flushPromises();expect(wrapper.find('[data-school-workspace]').exists()).toBe(true);
});
it('ignores unrelated security events and removes recovery listeners on unmount',async()=>{
 await render();window.dispatchEvent(new CustomEvent('pt:session-security',{detail:{error:{code:'MFA_REQUIRED'}}}));await flushPromises();expect(wrapper.find('[data-school-workspace]').exists()).toBe(true);wrapper.unmount();m.get.mockClear();window.dispatchEvent(new Event('pt:session-resumed'));await flushPromises();expect(m.get).not.toHaveBeenCalled();
});

it('does not cover a renewed school with an older delayed security response',async()=>{
 await render();localStorage.setItem('sessionId','school-qa');const now=Date.now();localStorage.setItem('pt:session-security:1465:school-qa',JSON.stringify({activityVersion:2,serverNow:now,lastActivityAt:now,lockAt:now+60000,expiresAt:now+120000,phase:'active'}));
 window.dispatchEvent(new CustomEvent('pt:session-security',{detail:{error:{code:'SESSION_LOCKED'},session:{activityVersion:1,serverNow:now-1000,lastActivityAt:now-60000,lockAt:now-1000,expiresAt:now+60000,phase:'timedown'}}}));await flushPromises();expect(wrapper.find('[data-school-workspace]').exists()).toBe(true);
});

it('preserves the same open school and unsaved field across normal lock and verified access recovery',async()=>{
 await render();const input=wrapper.get('input[aria-label="Unsaved school entry"]');await input.setValue('Fictional unsaved packet correction');const element=input.element;
 window.dispatchEvent(new CustomEvent('pt:session-security',{detail:{error:{code:'SESSION_LOCKED'}}}));await flushPromises();expect(wrapper.get('[data-school-workspace]').isVisible()).toBe(false);expect(wrapper.get('input[aria-label="Unsaved school entry"]').element).toBe(element);window.dispatchEvent(new Event('pt:session-resumed'));await flushPromises();expect(wrapper.vm.$.setupState.sessionPaused).toBe(false);expect(wrapper.get('[data-school-workspace]').element.parentElement.style.display).toBe('');expect(wrapper.get('[data-school-workspace]').element.parentElement.hasAttribute('inert')).toBe(false);expect(wrapper.find('.scb-status').exists()).toBe(false);expect(wrapper.get('input[aria-label="Unsaved school entry"]').element).toBe(element);expect(element.value).toBe('Fictional unsaved packet correction');
});
it('keeps a previously loaded school hidden when normal access is revoked while paused',async()=>{
 await render();window.dispatchEvent(new CustomEvent('pt:session-security',{detail:{error:{code:'SESSION_LOCKED'}}}));await flushPromises();m.get.mockRejectedValue({response:{status:403,data:{error:{message:'School access removed'}}}});window.dispatchEvent(new Event('pt:session-resumed'));await flushPromises();expect(wrapper.find('[data-school-workspace]').exists()).toBe(false);expect(wrapper.text()).toContain('School access removed');
});
