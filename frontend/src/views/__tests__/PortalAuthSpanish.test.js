import { shallowMount, mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),login:vi.fn(),theme:vi.fn(),route:{params:{token:'synthetic-test-token',organizationSlug:'itsco'},query:{lang:'es'},path:'/itsco/new_account/synthetic-test-token'}}));
vi.mock('../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('vue-router',()=>({useRoute:()=>m.route,useRouter:()=>({replace:vi.fn()})}));
vi.mock('../../store/branding',()=>({useBrandingStore:()=>({fetchAgencyTheme:m.theme})}));
vi.mock('../../utils/completePasswordTokenLogin.js',()=>({completePasswordTokenLogin:m.login}));
import Setup from '../InitialSetupView.vue';
import Reset from '../ResetPasswordView.vue';
import Meter from '../../components/PasswordStrengthMeter.vue';
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();localStorage.clear();m.get.mockResolvedValue({data:{firstName:'Synthetic',username:'parent@example.test',role:'client_guardian'}});m.post.mockResolvedValue({data:{user:{id:42,role:'client_guardian'},agencies:[{slug:'itsco'}]}});});
it.each([['setup',Setup,'Crear contraseña y continuar'],['reset',Reset,'Guardar contraseña y continuar']])('shows %s in Spanish and passes language into the authenticated portal',async(_,View,label)=>{
 const wrapper=shallowMount(View,{global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(wrapper.text()).toContain(label);expect(wrapper.find('input[autocomplete=username]').element.value).toBe('parent@example.test');
 await wrapper.get('#password').setValue('Synthetic-Password-47!');await wrapper.get('#confirmPassword').setValue('Synthetic-Password-47!');await wrapper.get('form').trigger('submit');await flushPromises();
 expect(m.login).toHaveBeenCalledWith(expect.anything(),expect.anything(),expect.objectContaining({locale:'es',portalSlug:'itsco'}));wrapper.unmount();
});
it('explains password strength and mismatch in Spanish',()=>{
 const wrapper=mount(Meter,{props:{password:'Synthetic-Password-47!',confirmPassword:'different',locale:'es'}});
 expect(wrapper.text()).toContain('Al menos 10 caracteres');expect(wrapper.text()).toContain('Las contraseñas no coinciden');wrapper.unmount();
});
