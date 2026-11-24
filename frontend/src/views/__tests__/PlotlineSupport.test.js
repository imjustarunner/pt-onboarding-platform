import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),captcha:vi.fn(),route:null}));
vi.mock('../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('../../utils/plotlineSupportCaptcha',()=>({plotlineSupportCaptcha:m.captcha}));
vi.mock('vue-router',()=>({useRoute:()=>m.route}));
import View from '../public/PlotlineSupportView.vue';
// @vitest-environment jsdom
const meta=()=>({productName:'Plotline',operatorName:'PlotTwistCo',contact:{name:'QA Referee',email:'referee@example.test'},subject:'Question about a reference request',recaptchaRequired:false});
let wrapper;
beforeEach(()=>{vi.clearAllMocks();m.route=reactive({params:{token:'a'.repeat(64)}});m.get.mockResolvedValue({data:meta()});m.post.mockResolvedValue({data:{ok:true,ticketId:501}});m.captcha.mockResolvedValue('captcha-proof');});
afterEach(()=>wrapper?.unmount());
it('shows Plotline and the correct company, with known details already present',async()=>{
 wrapper=mount(View);await flushPromises();expect(wrapper.get('header img').attributes('alt')).toBe('Plotline');expect(wrapper.text()).toContain('Operated by PlotTwistCo');expect(wrapper.text()).not.toContain('Juniper QA');
 expect(wrapper.get('input[name=name]').element.value).toBe('QA Referee');expect(wrapper.get('input[name=email]').element.value).toBe('referee@example.test');expect(wrapper.get('details').attributes('open')).toBeUndefined();
 expect(wrapper.get('input[name=subject]').element.value).toBe('Question about a reference request');expect(wrapper.findAll('footer img')).toHaveLength(1);
});
it('sends a private contact question without requesting an account or CAPTCHA again',async()=>{
 wrapper=mount(View);await flushPromises();await wrapper.get('textarea').setValue('How can I update my professional relationship?');await wrapper.get('form').trigger('submit');await flushPromises();
 expect(m.post).toHaveBeenCalledOnce();expect(m.post.mock.calls[0][0]).toBe(`/public/hiring/reference/${'a'.repeat(64)}/support`);
 expect(m.post.mock.calls[0][1]).toMatchObject({name:'QA Referee',email:'referee@example.test',message:'How can I update my professional relationship?'});expect(m.captcha).not.toHaveBeenCalled();
 expect(wrapper.text()).toContain('#501');expect(wrapper.text()).not.toContain('log in');expect(wrapper.find('form').exists()).toBe(false);
});
it('retains corrections and retries the same submission after an uncertain network result',async()=>{
 m.post.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({data:{ok:true,ticketId:501}});
 wrapper=mount(View);await flushPromises();await wrapper.get('input[name=email]').setValue('corrected@example.test');await wrapper.get('textarea').setValue('A question for Plotline Support.');
 await wrapper.get('form').trigger('submit');await flushPromises();expect(wrapper.get('textarea').element.value).toContain('A question');
 await wrapper.get('form').trigger('submit');await flushPromises();expect(m.post.mock.calls[0][1].submissionKey).toBe(m.post.mock.calls[1][1].submissionKey);expect(m.post.mock.calls[1][1].email).toBe('corrected@example.test');
});
it('requires Enterprise verification for a general public contact, and keeps the draft if it fails',async()=>{
 m.route.params={};m.get.mockResolvedValue({data:{...meta(),contact:{name:'',email:''},recaptchaRequired:true,recaptchaUseEnterprise:true,recaptchaSiteKey:'PUBLIC-KEY'}});m.captcha.mockRejectedValue(new Error('Verification unavailable'));
 wrapper=mount(View);await flushPromises();await wrapper.get('input[name=name]').setValue('QA Applicant');await wrapper.get('input[name=email]').setValue('applicant@example.test');await wrapper.get('textarea').setValue('A public question about the application.');await wrapper.get('form').trigger('submit');await flushPromises();
 expect(m.captcha).toHaveBeenCalledWith('PUBLIC-KEY',true);expect(m.post).not.toHaveBeenCalled();expect(wrapper.text()).toContain('Verification unavailable');expect(wrapper.get('textarea').element.value).toContain('A public question');
});
it('does not leak another reference’s prefill from a late response after the link changes',async()=>{
 let finish;m.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));wrapper=mount(View);
 m.get.mockResolvedValue({data:{...meta(),productName:'Plotline',operatorName:'PlotTwistCo',contact:{name:'Other QA',email:'other@example.test'}}});m.route.params.token='b'.repeat(64);await flushPromises();
 finish({data:meta()});await flushPromises();expect(wrapper.text()).toContain('PlotTwistCo');expect(wrapper.get('input[name=name]').element.value).toBe('Other QA');
});
it('does not render a form or private identity when the contact link is unavailable',async()=>{
 m.get.mockRejectedValue({response:{data:{error:{message:'This contact link has expired.'}}}});wrapper=mount(View);await flushPromises();expect(wrapper.text()).toContain('has expired');expect(wrapper.find('form').exists()).toBe(false);expect(wrapper.text()).not.toContain('QA Referee');expect(m.post).not.toHaveBeenCalled();
});
