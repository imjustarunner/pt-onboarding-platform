import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia} from 'pinia';
import LoginView from '../LoginView.vue';
import {setRememberedLogin,setRememberedSchoolStaffPasswordLogin} from '../../utils/loginRemember';
const {get,post,replace,push,route}=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),replace:vi.fn(),push:vi.fn(),route:{params:{organizationSlug:'auricwell-qa-demo'},query:{},meta:{organizationSlug:true},path:'/auricwell-qa-demo/login'}}));
vi.mock('vue-router',()=>({useRoute:()=>route,useRouter:()=>({replace,push})}));
vi.mock('../../services/api',()=>({default:{get,post,defaults:{baseURL:'/api'}}}));
let wrapper;
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();replace.mockClear();push.mockClear();post.mockReset();
 route.params={organizationSlug:'auricwell-qa-demo'};route.path='/auricwell-qa-demo/login';route.query={};
 get.mockReset().mockImplementation(async url=>({data:url.includes('login-theme')?{agency:{id:450,slug:'auricwell-qa-demo',name:'ITSCOLLC',organization_type:'agency'}}:{}}));
 post.mockResolvedValue({data:{}});window.scrollTo=vi.fn();
 setRememberedLogin({username:'jamie@example.com',orgSlug:'auricwell-qa-demo-school',parentOrgSlug:'auricwell-qa-demo'});
 setRememberedSchoolStaffPasswordLogin({username:'jamie@example.com',orgSlug:'auricwell-qa-demo-school',parentOrgSlug:'auricwell-qa-demo'});
});
afterEach(()=>wrapper?.unmount());
async function render(){wrapper=mount(LoginView,{global:{plugins:[createPinia()],stubs:{PoweredByFooter:true,ServiceUseNotice:true,PasskeySignIn:true,HqLoginShell:{template:'<main><slot/></main>'}}}});await flushPromises();}
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
