import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Form from '../Mh4kidzVolunteerForm.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../utils/websiteCaptcha', () => ({ websiteCaptchaToken: vi.fn().mockResolvedValue('captcha') }));
let wrapper;
beforeEach(() => { api.get.mockResolvedValue({ data: { recaptchaRequired: false } }); api.post.mockResolvedValue({ data: { ok: true, ticketId: 42 } }); });
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); window.history.replaceState({}, '', '/'); });
async function fill() {
  wrapper = mount(Form); await flushPromises();
  await wrapper.find('input[autocomplete="name"]').setValue('Alex Volunteer');
  await wrapper.find('input[type="email"]').setValue('alex@example.com');
  await wrapper.findAll('.volunteer-fields input')[3].setValue('Denver, CO');
  await wrapper.find('textarea').setValue('Weekends, four hours a month');
  await wrapper.findAll('input[type="checkbox"]').at(-1).setValue(true);
}
it('requires an interest and submits selected areas to MH4Kidz', async () => {
  await fill(); await wrapper.find('form').trigger('submit');
  expect(api.post).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('choose at least one');
  await wrapper.findAll('fieldset input')[0].setValue(true);
  await wrapper.findAll('fieldset input')[2].setValue(true);
  expect(wrapper.find('form').element.checkValidity()).toBe(true);
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/public/agency-support/mh4kidz/tickets', expect.objectContaining({ email: 'alex@example.com', phiAcknowledged: true, captchaToken: 'captcha', message: expect.stringContaining('Fundraising events, Researching grants') }), expect.anything());
  expect(api.post.mock.calls[0][1].message).toContain('Weekends, four hours a month');
  expect(wrapper.text()).toContain('reference is #42'); expect(wrapper.find('form').exists()).toBe(false);
});
it('retains the application after a server error and supports retry', async () => {
  await fill(); await wrapper.find('fieldset input').setValue(true);
  api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Please try later.' } } } });
  await wrapper.find('form').trigger('submit'); await flushPromises();
  expect(wrapper.find('[role="alert"]').text()).toBe('Please try later.');
  expect(wrapper.find('input[type="email"]').element.value).toBe('alex@example.com');
  await wrapper.find('form').trigger('submit'); await flushPromises(); expect(wrapper.text()).toContain('reference is #42');
});
it('allows recovery when configuration fails', async () => {
  api.get.mockRejectedValueOnce(new Error('offline')); wrapper = mount(Form); await flushPromises();
  expect(wrapper.find('button[type="submit"]').element.disabled).toBe(true);
  await wrapper.find('button[type="button"]').trigger('click'); await flushPromises();
  expect(wrapper.find('button[type="submit"]').element.disabled).toBe(false);
});
it('does not collect applications in editor preview', async () => {
  window.history.replaceState({}, '', '/?marketingPreview=1'); wrapper = mount(Form); await flushPromises();
  expect(wrapper.find('form').exists()).toBe(false); expect(api.get).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
});
