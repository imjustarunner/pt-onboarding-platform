import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia} from 'pinia';
import LoginView from '../LoginView.vue';
import {setRememberedLogin,setRememberedSchoolStaffPasswordLogin} from '../../utils/loginRemember';
import {isPublicAuthFormActive} from '../../utils/publicAuthForm';
const {get,post,replace,push,route}=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),replace:vi.fn(),push:vi.fn(),route:{params:{organizationSlug:'auricwell-qa-demo'},query:{},meta:{organizationSlug:true},path:'/auricwell-qa-demo/login'}}));
vi.mock('vue-router',()=>({useRoute:()=>route,useRouter:()=>({replace,push})}));
vi.mock('../../services/api',()=>({default:{get,post,defaults:{baseURL:'/api'}}}));
let wrapper;
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();replace.mockClear();push.mockClear();post.mockReset();
 route.params={organizationSlug:'auricwell-qa-demo'};route.path='/auricwell-qa-demo/login';route.query={};
 route.meta={organizationSlug:true};
 get.mockReset().mockImplementation(async url=>({data:url.includes('login-theme')?{agency:{id:450,slug:'auricwell-qa-demo',name:'ITSCOLLC',organization_type:'agency'}}:{}}));
 post.mockResolvedValue({data:{}});window.scrollTo=vi.fn();
 setRememberedLogin({username:'jamie@example.com',orgSlug:'auricwell-qa-demo-school',parentOrgSlug:'auricwell-qa-demo'});
 setRememberedSchoolStaffPasswordLogin({username:'jamie@example.com',orgSlug:'auricwell-qa-demo-school',parentOrgSlug:'auricwell-qa-demo'});
});
afterEach(()=>wrapper?.unmount());
async function render({legalNotice=false}={}){wrapper=mount(LoginView,{global:{plugins:[createPinia()],stubs:{PoweredByFooter:true,ServiceUseNotice:!legalNotice,PasskeySignIn:true,HqLoginShell:{template:'<main><slot/></main>'}}}});await flushPromises();}
it('opens normal password recovery from an explicit provider-update link without submitting a reset',async()=>{
 route.query={recovery:'password'};await render();expect(wrapper.find('#forgotEmail').exists()).toBe(true);
 expect(post.mock.calls.some(([url])=>url.includes('request-password-reset'))).toBe(false);
});
it('keeps an explicit agency login on that agency after remembering school staff',async()=>{
 await render();
 expect(replace.mock.calls.some(([target])=>JSON.stringify(target).includes('auricwell-qa-demo-school'))).toBe(false);
 expect(wrapper.vm.username).toBe('');
 expect(post.mock.calls.some(([url])=>url.includes('identify'))).toBe(false);
});
it('discards a stale school username handoff before rendering the agency form',async()=>{
 sessionStorage.setItem('__pt_login_pending_username__','jamie@example.com');
 sessionStorage.setItem('__pt_login_pending_verify__','1');
 await render();expect(wrapper.vm.username).toBe('');
 expect(post.mock.calls.some(([url])=>url.includes('identify'))).toBe(false);
});
it('does not prefill the last family or provider on the shared demo portal even when remembered',async()=>{
 setRememberedLogin({username:'last.family@example.test',orgSlug:'auricwell-qa-demo'});
 sessionStorage.setItem('__pt_login_pending_username__','last.provider@example.test');
 await render();expect(wrapper.vm.username).toBe('');
 expect(replace.mock.calls.some(([target])=>JSON.stringify(target).includes('example.test'))).toBe(false);
});

function schoolRoute(){
 route.params={organizationSlug:'auricwell-qa-demo-school'};
 route.path='/schoolcarebridge/app/auricwell-qa-demo-school';
 route.meta={organizationSlug:true,schoolCareBridgeEntry:true};
}

it('submits school recovery in place with the school slug and product surface',async()=>{
 schoolRoute();await render();
 expect(isPublicAuthFormActive()).toBe(true);
 wrapper.vm.username='jamie.qa.schoolstaff.1028@example.com';
 wrapper.vm.showForgotPassword();await flushPromises();
 expect(wrapper.get('#forgotEmail').element.value).toBe('jamie.qa.schoolstaff.1028@example.com');
 await wrapper.get('.modal-form').trigger('submit');await flushPromises();
 expect(post).toHaveBeenCalledWith('/auth/request-password-reset',{
  email:'jamie.qa.schoolstaff.1028@example.com',surface:'schoolcarebridge',organizationSlug:'auricwell-qa-demo-school'
 },{skipGlobalLoading:true,skipAuthRedirect:true});
 expect(wrapper.find('#forgotEmail').exists()).toBe(true);
 expect(replace).not.toHaveBeenCalled();
 wrapper.unmount();wrapper=null;expect(isPublicAuthFormActive()).toBe(false);
});

it.each(['canonical','missing'])('keeps recovery open if delayed school branding is %s',async result=>{
 schoolRoute();let finishTheme;
 get.mockImplementation(url=>url.includes('login-theme')?new Promise(resolve=>{finishTheme=resolve;}):Promise.resolve({data:{}}));
 await render();wrapper.vm.showForgotPassword();await flushPromises();
 if(result==='canonical')finishTheme({data:{agency:{slug:'auricwell-qa-demo-school',organization_type:'school',canonicalLoginSlug:'auricwell-qa-demo'}}});
 else finishTheme(Promise.reject({response:{status:404}}));
 await flushPromises();
 expect(wrapper.find('#forgotEmail').exists()).toBe(true);
 expect(replace).not.toHaveBeenCalled();
});

it('ignores theme redirects from a sign-in page that has already unmounted',async()=>{
 let finishTheme;
 get.mockImplementation(url=>url.includes('login-theme')?new Promise(resolve=>{finishTheme=resolve;}):Promise.resolve({data:{}}));
 await render();wrapper.unmount();wrapper=null;
 finishTheme({data:{agency:{canonicalLoginSlug:'other-agency'}}});await flushPromises();
 expect(replace).not.toHaveBeenCalled();expect(isPublicAuthFormActive()).toBe(false);
});

it('explains an edge rate limit with its wait time and preserves the username',async()=>{
 await render();
 post.mockRejectedValue({response:{status:429,data:'Rate exceeded.',headers:{'retry-after':'125'}}});
 wrapper.vm.username='avery.qa@example.com';
 await wrapper.vm.verifyUsername({reason:'submit'});await flushPromises();
 expect(wrapper.text()).toContain('Please wait 3 minutes, then try again.');
 expect(wrapper.text()).not.toContain('Verification failed');
 expect(wrapper.vm.username).toBe('avery.qa@example.com');
 expect(post).toHaveBeenCalledTimes(1);
});

it('keeps the Auricwell destination when username identification selects an agency login',async()=>{
 route.query={workspace:'auricwell',redirect:'/auricwell/app/itsco/compliance'};
 post.mockResolvedValue({data:{matched:true,normalizedUsername:'synthetic@example.test',resolvedOrg:{slug:'itsco',portal_url:'itsco',organization_type:'agency'},login:{method:'password'}}});
 await render();wrapper.vm.username='synthetic@example.test';
 await wrapper.vm.verifyUsername({reason:'user'});await flushPromises();
 expect(replace).toHaveBeenCalledWith({path:'/itsco/login',query:{workspace:'auricwell',redirect:'/auricwell/app/itsco/compliance'}});
});

it('preserves the Auricwell return context when the agency login theme cannot load',async()=>{
 route.query={workspace:'auricwell',redirect:'/auricwell/app/itsco/compliance'};
 get.mockImplementation(async url=>{if(url.includes('login-theme'))throw {response:{status:404}};return {data:{}};});
 await render();expect(replace).toHaveBeenCalledWith({path:'/login',query:route.query});
});

it('submits a browser bulk password fill labeled insertText exactly once',async()=>{
 await render();
 wrapper.vm.username='synthetic@example.com';
 wrapper.vm.lastVerifiedUsername='synthetic@example.com';wrapper.vm.showPassword=true;
 await flushPromises();
 const input=wrapper.get('#password').element;
 input.value='fictional-password-fill';
 input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:null}));
 await new Promise(resolve=>setTimeout(resolve,250));await flushPromises();
 expect(post.mock.calls.filter(([url])=>url==='/auth/login')).toHaveLength(1);
 input.dispatchEvent(new Event('change',{bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,250));await flushPromises();
 expect(post.mock.calls.filter(([url])=>url==='/auth/login')).toHaveLength(1);
});

it('keeps a linked family on its chosen tenant instead of nesting a peer primary agency login',async()=>{
 route.params={organizationSlug:'nlu-qa-demo'};route.path='/nlu-qa-demo/login';
 get.mockImplementation(async url=>({data:url.includes('login-theme')?{agency:{id:453,slug:'nlu-qa-demo',name:'Next Level Up',organization_type:'agency'}}:{}}));
 await render();post.mockResolvedValue({data:{matched:true,familyPortalSurface:'clinical',resolvedOrg:{slug:'auricwell-qa-demo',organization_type:'agency'},login:{method:'password'}}});
 wrapper.vm.username='linked.parent@example.test';await wrapper.vm.verifyUsername({reason:'submit'});await flushPromises();
 expect(wrapper.vm.showPassword).toBe(true);expect(replace).not.toHaveBeenCalled();
});

it.each(['nlu','nlu-qa-demo','nlu-qa-learning'])('keeps NLU password branding when a linked account has clinical records (%s)',async slug=>{
 route.params={organizationSlug:slug};route.path=`/${slug}/login`;
 get.mockImplementation(async url=>({data:url.includes('login-theme')?{agency:{id:453,slug,name:'Next Level Up QA',organization_type:'agency'}}:{}}));
 await render();post.mockResolvedValue({data:{matched:true,familyPortalSurface:'clinical',resolvedOrg:{slug:'auricwell-qa-demo',organization_type:'agency'},login:{method:'password'}}});
 wrapper.vm.username='linked.parent@example.test';await wrapper.vm.verifyUsername({reason:'submit'});await flushPromises();
 expect(wrapper.find('.auricwell-auth-brand').exists()).toBe(false);expect(wrapper.vm.defaultLoginSubtitle).not.toContain('AuricWell');
 expect(wrapper.vm.isAuricWellLogin).toBe(false);expect(wrapper.vm.loginBrandOrganizationSlug).toBe(slug);expect(replace).not.toHaveBeenCalled();
});
it('passes an NLU guardian deep-link brand to the legal notice on a shared login',async()=>{
 route.params={};route.path='/login';route.query={redirect:'/nlu-qa-demo/guardian?clientId=2271&serviceId=1043'};
 await render({legalNotice:true});expect(wrapper.vm.loginBrandOrganizationSlug).toBe('nlu-qa-demo');
 const notice=wrapper.get('.service-use-notice');expect(notice.attributes('aria-label')).toBe('Next Level Up terms and privacy');expect(notice.findAll('a').every(link=>link.attributes('href').startsWith('https://nextleveluplcc.com/nlu/'))).toBe(true);
});
it('keeps the explicit AuricWell product entry for clinical families',async()=>{
 route.params={organizationSlug:'nlu-qa-demo'};route.path='/nlu-qa-demo/login';route.query={workspace:'auricwell'};
 await render();expect(wrapper.vm.isAuricWellLogin).toBe(true);
});

it.each(['auricwell-qa-demo','nlu-qa-demo'])('offers scoped Technology help after an unmatched username on %s',async slug=>{
 route.params={organizationSlug:slug};route.path=`/${slug}/login`;
 await render();wrapper.vm.username='unmatched@example.test';
 await wrapper.vm.verifyUsername({reason:'submit'});await flushPromises();
 expect(wrapper.get('.error').attributes('role')).toBe('alert');
 expect(wrapper.get('.login-error-support').attributes('to')).toBe(`/${slug}/support?topic=technical`);
 expect(wrapper.get('.login-error-support').text()).toBe('Contact Technology for sign-in help');
 expect(wrapper.vm.username).toBe('unmatched@example.test');expect(wrapper.vm.showPassword).toBe(false);
 expect(post.mock.calls.every(([url])=>url==='/auth/identify')).toBe(true);
});

it('replaces the old People Operations login message while retaining the chosen agency',async()=>{
 await render();wrapper.vm.username='unmatched@example.test';
 post.mockRejectedValue({response:{status:401,data:{error:{message:'User not found. Contact PO@ITSCO.health if this is an error or if you require your credentials.'}}}});
 await wrapper.vm.verifyUsername({reason:'submit'});await flushPromises();
 expect(wrapper.get('.error').text()).toContain('Check your username or contact Technology');
 expect(wrapper.get('.error').text()).not.toContain('PO@');
 expect(wrapper.get('.login-error-support').attributes('to')).not.toContain('unmatched');
 expect(replace).not.toHaveBeenCalled();expect(post).toHaveBeenCalledTimes(1);
});

it('keeps Technology help in the parent agency for a school login',async()=>{
 route.params={parentOrgSlug:'auricwell-qa-demo',organizationSlug:'school-fixture'};
 route.meta={organizationSlug:true,parentOrgSlug:true};route.path='/auricwell-qa-demo/school-fixture/login';
 await render();wrapper.vm.username='unmatched@example.test';
 await wrapper.vm.verifyUsername({reason:'submit'});await flushPromises();
 expect(wrapper.get('.login-error-support').attributes('to')).toBe('/auricwell-qa-demo/support?topic=technical');
});

it('translates missing-account guidance and Technology help without a recovery request',async()=>{
 route.query={lang:'es'};await render();wrapper.vm.username='unmatched@example.test';
 post.mockRejectedValue({response:{status:401,data:{error:{message:'User not found. Check your username or contact Technology for sign-in help.'}}}});
 await wrapper.vm.verifyUsername({reason:'submit'});await flushPromises();
 expect(wrapper.get('.error').text()).toContain('No se encontró la cuenta');
 expect(wrapper.get('.login-error-support').text()).toBe('Contactar a Tecnología para recibir ayuda con el acceso');
 await wrapper.get('.portal-auth-language select').setValue('en');
 expect(wrapper.get('.error').text()).toContain('User not found.');
 expect(wrapper.get('.login-error-support').text()).toBe('Contact Technology for sign-in help');
 expect(post).toHaveBeenCalledTimes(1);
});

it('preserves a credential failure rather than relabeling it an unknown account',async()=>{
 await render();wrapper.vm.username='retained@example.test';
 post.mockRejectedValue({response:{status:401,data:{error:{message:'Invalid email or password'}}}});
 await wrapper.vm.verifyUsername({reason:'submit'});await flushPromises();
 expect(wrapper.get('.error').text()).toContain('Invalid email or password');
 expect(wrapper.get('.error').text()).not.toContain('User not found');
 expect(wrapper.find('.login-error-support').exists()).toBe(true);
});
