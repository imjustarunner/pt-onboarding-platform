import {shallowMount,flushPromises} from '@vue/test-utils';
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),login:vi.fn(),theme:vi.fn(),query:{}}));
vi.mock('../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{token:'test-token',organizationSlug:'itsco'},query:m.query,path:'/itsco/new_account/test-token'}),useRouter:()=>({replace:vi.fn()})}));
vi.mock('../../store/branding',()=>({useBrandingStore:()=>({fetchAgencyTheme:m.theme})}));
vi.mock('../../utils/completePasswordTokenLogin.js',()=>({completePasswordTokenLogin:m.login}));
import Setup from '../InitialSetupView.vue';
import Reset from '../ResetPasswordView.vue';
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({data:{firstName:'Morgan',username:'parent@example.com',role:'client_guardian',requiresClientDob:false}});m.post.mockResolvedValue({data:{token:'session',user:{role:'client_guardian'},agencies:[{slug:'itsco'}]}});});
it.each([['/intake/personal-roi','/intake/personal-roi'],['//outside.example',null]])('returns from password setup only to a safe internal ROI destination %s',async(redirect,destination)=>{
 m.query={redirect};const w=shallowMount(Setup,{global:{stubs:{RouterLink:true}}});await flushPromises();await w.get('#password').setValue('Ocean-Forest-47!');await w.get('#confirmPassword').setValue('Ocean-Forest-47!');await w.get('form').trigger('submit');await flushPromises();expect(m.login).toHaveBeenCalledWith(expect.any(Object),expect.any(Object),expect.objectContaining({destination}));w.unmount();m.query={};
});
it.each([['setup',Setup],['reset',Reset]])('%s preserves password case and gives password managers the matching username before automatic sign-in',async(kind,View)=>{
 const w=shallowMount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(w.find('input[autocomplete=username]').element.value).toBe('parent@example.com');
 expect(w.find('input[autocomplete=username]').attributes('name')).toBe('username');
 await w.find('#password').setValue('Ocean-Forest-47!');await w.find('#confirmPassword').setValue('Ocean-Forest-47!');
 expect(w.find('#password').attributes('autocapitalize')).toBe('none');
 await w.find('form').trigger('submit');await flushPromises();
 expect(m.post.mock.calls[0][1].password).toBe('Ocean-Forest-47!');expect(m.login).toHaveBeenCalledWith(expect.any(Object),expect.any(Object),expect.objectContaining({portalSlug:'itsco'}));w.unmount();
});
