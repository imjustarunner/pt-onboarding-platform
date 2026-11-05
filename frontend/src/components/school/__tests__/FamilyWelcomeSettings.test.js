import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Settings from '../FamilyWelcomeSettings.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
const template = '{{parent_name}},\n\nMy name is {{provider_name}}. I was assigned to your child at {{school_name}} and will see them on {{service_day}}. Learn more: {{profile_link}}';
const sms = 'Hi {{parent_name}}, this is {{provider_name}}. Please reply with times for a brief intake meeting.';
const plan = overrides => ({ eligible: true, agencyId: 450, status: 'unconfigured', includePdf: true, mandatory: false, template, secondTemplate: template + ' Second.', finalTemplate: template + ' Final.', smsTemplate: sms,
  recommendedTemplates: { template, secondTemplate: template, finalTemplate: template, smsTemplate: sms }, previewValues: { profile_link: 'https://app.example/demo/provider/9' }, schools: [{ id: 451, name: 'Cedar Grove' }], ...overrides });
let wrapper;
const button = text => wrapper.findAll('button').find(b => b.text().includes(text));
async function mountWith(overrides) {
  api.get.mockResolvedValue({ data: plan(overrides) });
  wrapper = mount(Settings, { attachTo: document.body, props: { agencyId: 450, userId: 9, providerName: 'Alex Provider' } });
  await flushPromises();
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

it('shows the SchoolCareBridge Family Welcome settings with booking hours marked coming soon', async () => {
  await mountWith();
  expect(wrapper.attributes('id')).toBe('my-family-welcome');
  expect(wrapper.text()).toContain('SchoolCareBridge');
  expect(wrapper.text()).toContain('Family Welcome & Follow-Up');
  expect(wrapper.text()).toContain('Introduce yourself to new families and follow up until you connect.');
  expect(wrapper.text()).toContain('Add my available hours for booking');
  expect(wrapper.text()).toContain('Coming soon');
  expect(wrapper.text()).toContain('Preview my PDF');
  expect(wrapper.text()).toContain('Support sends an introduction email when I am assigned, and I am copied.');
  expect(wrapper.find('.fw-preview-body').text()).toContain('https://app.example/demo/provider/9');
});

it('asks for the profile link when it was removed and saves anyway on No thanks', async () => {
  api.put.mockResolvedValue({ data: plan({ status: 'enabled' }) });
  await mountWith();
  await wrapper.find('input[value="enabled"]').setValue(true);
  await wrapper.find('#fw-template').setValue(template.replace('Learn more: {{profile_link}}', 'Thanks.'));
  await button('Save Family Welcome').trigger('click'); await flushPromises();
  expect(api.put).not.toHaveBeenCalled();
  expect(wrapper.text()).toContain('Your email does not include your profile link. Please use the add profile link button in the body of your email.');
  await button('No thanks, save anyway').trigger('click'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', expect.objectContaining({ status: 'enabled', includePdf: true }), expect.anything());
});

it('adds the profile link, edits the one text, and saves an opt-out without the PDF', async () => {
  api.put.mockResolvedValue({ data: plan({ status: 'declined', includePdf: false }) });
  await mountWith();
  await wrapper.find('#fw-template').setValue('{{parent_name}}, I am {{provider_name}} at {{school_name}} on {{service_day}}. I look forward to meeting your family soon.');
  await button('Add profile link').trigger('click'); await flushPromises();
  expect(wrapper.find('#fw-template').element.value).toContain('{{profile_link}}');
  await button('Follow-up text at 48 hours').trigger('click');
  await wrapper.find('#fw-smsTemplate').setValue(`${sms} Thanks!`);
  await wrapper.find('.fw-options input[type="checkbox"]').setValue(false);
  await button('Save Family Welcome').trigger('click'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', expect.objectContaining({ status: 'declined', includePdf: false, smsTemplate: `${sms} Thanks!`, template: expect.stringContaining('{{profile_link}}') }), expect.anything());
  expect(wrapper.text()).toContain('Support will introduce you, and you will be copied.');
});

it('explains the support introduction when the provider is not in the pilot', async () => {
  await mountWith({ eligible: false });
  expect(wrapper.text()).toContain('Support introduces you to each new family, and you are copied on that email.');
  expect(wrapper.find('textarea').exists()).toBe(false);
});
