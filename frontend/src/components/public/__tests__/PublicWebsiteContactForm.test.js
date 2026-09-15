import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Form from '../PublicWebsiteContactForm.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../utils/websiteCaptcha',()=>({websiteCaptchaToken:vi.fn().mockResolvedValue('synthetic')}));
let wrapper;
beforeEach(()=>{api.get.mockResolvedValue({data:{categories:[{id:'other',label:'Something else'}],recaptchaRequired:false}});api.post.mockResolvedValue({data:{ok:true,ticketId:999}});});
afterEach(()=>{wrapper?.unmount();vi.clearAllMocks();});
it.each([{email:'visitor@example.com',phone:''},{email:'',phone:'7195550100'},{email:'visitor@example.com',phone:'7195550100'}])('accepts contact methods %o and includes them in the inquiry',async contact=>{
 wrapper=mount(Form,{props:{agencySlug:'itsco'}});await flushPromises();
 await wrapper.find('input[autocomplete="name"]').setValue('Website Visitor');await wrapper.find('select').setValue('other');await wrapper.find('textarea').setValue('Please help me get started.');await wrapper.find('input[type="checkbox"]').setValue(true);
 expect(wrapper.find('form').element.checkValidity()).toBe(false);
 await wrapper.find('input[type="email"]').setValue(contact.email);await wrapper.find('input[type="tel"]').setValue(contact.phone);
 expect(wrapper.find('form').element.checkValidity()).toBe(true);
 await wrapper.find('form').trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/public/agency-support/itsco/tickets',expect.objectContaining(contact),expect.anything());expect(wrapper.text()).toContain('Your reference is #999');
});
