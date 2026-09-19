import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Form from '../PublicWebsiteContactForm.vue';
import api from '../../../services/api';
import { careerLocations } from '../../../utils/careerLocations';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../utils/websiteCaptcha', () => ({ websiteCaptchaToken: vi.fn().mockResolvedValue('captcha') }));
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { categories: [{id:'careers',label:'Careers'}] } }); });
describe('internship contact form', () => {
 it('requires email, hides general topics, and sends through the dedicated route', async () => {
  const w = mount(Form, { props: { agencySlug:'itsco', internshipInquiry:true, title:'Contact Rachel' } });await flushPromises();
  expect(w.find('input[type=email]').attributes('required')).toBeDefined();
  expect(w.find('input[type=tel]').attributes('required')).toBeUndefined();expect(w.find('select').exists()).toBe(false);
  await w.find('input[autocomplete=name]').setValue('Example Student');await w.find('input[type=email]').setValue('student@example.com');
  await w.find('textarea').setValue('I would like to learn about a Denver practicum.');await w.find('input[type=checkbox]').setValue(true);
  api.post.mockResolvedValue({data:{ok:true,ticketId:42,emailDelivered:true}});await w.find('form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/public/agency-support/itsco/internship-inquiries',expect.objectContaining({name:'Example Student',email:'student@example.com',captchaToken:'captcha'}),expect.anything());
  expect(w.text()).toContain('assigned to Rachel');w.unmount();
 });
 it('retains phone-only support and the existing general endpoint', async () => {
  const w=mount(Form,{props:{agencySlug:'itsco'}});await flushPromises();await w.find('input[type=tel]').setValue('7195550100');
  expect(w.find('input[type=email]').attributes('required')).toBeUndefined();expect(w.find('select').exists()).toBe(true);w.unmount();
 });
 it('keeps a saved inquiry visible when the email notification fails',async()=>{
  const w=mount(Form,{props:{agencySlug:'itsco',internshipInquiry:true}});await flushPromises();
  api.post.mockResolvedValue({data:{ok:true,ticketId:42,emailDelivered:false}});await w.find('form').trigger('submit');await flushPromises();
  expect(w.text()).toContain('You do not need to submit it again');expect(w.find('form').exists()).toBe(false);w.unmount();
 });
 it('includes a shared posting under both city filters',()=>{expect(careerLocations({city:'Colorado Springs & Denver'})).toEqual(['Colorado Springs','Denver']);expect(careerLocations({city:'Denver'})).toEqual(['Denver']);});
});
