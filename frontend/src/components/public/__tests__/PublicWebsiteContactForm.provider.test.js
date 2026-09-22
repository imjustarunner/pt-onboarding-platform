import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Form from '../PublicWebsiteContactForm.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../utils/websiteCaptcha',()=>({websiteCaptchaToken:vi.fn(async()=> 'captcha')}));
beforeEach(()=>{vi.clearAllMocks();window.history.replaceState({},'', '/contact?provider=496&providerName=Megan%20Geil-Crader');api.get.mockResolvedValue({data:{categories:[{id:'provider',label:'Finding a provider'}]}});api.post.mockResolvedValue({data:{ok:true,ticketId:123}});});
afterEach(()=>window.history.replaceState({},'','/'));
describe('provider inquiries',()=>{
 it('prefills the topic and message and carries provider identity to the support ticket',async()=>{
  const w=mount(Form,{props:{agencySlug:'itsco'}});await flushPromises();expect(w.find('select').element.value).toBe('provider');expect(w.find('textarea').element.value).toContain('Megan Geil-Crader');
  await w.find('input[autocomplete=name]').setValue('Visitor Name');await w.find('input[type=email]').setValue('visitor@example.com');await w.find('input[type=checkbox]').setValue(true);await w.find('form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/public/agency-support/itsco/tickets',expect.objectContaining({providerId:496,category:'provider',message:expect.stringContaining('Megan Geil-Crader')}),expect.any(Object));w.unmount();
 });
 it('keeps the internship workflow separate',async()=>{const w=mount(Form,{props:{agencySlug:'itsco',internshipInquiry:true}});await flushPromises();expect(w.find('.provider-inquiry').exists()).toBe(false);expect(w.find('textarea').element.value).toBe('');w.unmount();});
});
