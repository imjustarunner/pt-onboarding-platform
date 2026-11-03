import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Form from '../PublicWebsiteContactForm.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('../../../utils/websiteCaptcha', () => ({websiteCaptchaToken:vi.fn(async()=> 'fixture')}));
let wrapper;
beforeEach(() => {
  api.get.mockResolvedValue({data:{categories:[{id:'billing',label:'Billing'},{id:'credentialing',label:'Credentialing'},{id:'people_operations',label:'People Operations'}]}});
  api.post.mockResolvedValue({data:{ok:true,ticketId:123,emailDelivered:true}});
});
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); window.history.replaceState({},'','/'); });
it.each([['billing','billing'],['credentialing','credentialing'],['people-operations','people_operations']])('preselects and submits the requested %s management topic', async(topic,category) => {
  window.history.replaceState({},'',`/contact?topic=${topic}`);
  wrapper=mount(Form,{props:{agencySlug:'ptco'}});await flushPromises();
  expect(wrapper.find('select').element.value).toBe(category);
  await wrapper.find('input[autocomplete="name"]').setValue('Example Visitor');
  await wrapper.find('input[type="email"]').setValue('visitor@example.test');
  await wrapper.find('textarea').setValue('Please contact me about this service.');
  await wrapper.find('input[type="checkbox"]').setValue(true);
  await wrapper.find('form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/public/agency-support/ptco/tickets',expect.objectContaining({category}),expect.anything());
});
it('does not preselect a management topic for an unrelated clinical website', async() => {
  window.history.replaceState({},'','/contact?topic=credentialing');
  wrapper=mount(Form,{props:{agencySlug:'itsco'}});await flushPromises();expect(wrapper.find('select').element.value).toBe('');
});
it('ignores an unknown topic instead of inventing a selectable category', async() => {
  window.history.replaceState({},'','/contact?topic=unknown');
  wrapper=mount(Form,{props:{agencySlug:'ptco'}});await flushPromises();expect(wrapper.find('select').element.value).toBe('');
});
