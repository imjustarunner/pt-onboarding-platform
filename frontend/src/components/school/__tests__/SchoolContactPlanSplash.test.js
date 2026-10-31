import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Splash from '../SchoolContactPlanSplash.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
const template = '{{parent_name}},\n\nMy name is {{provider_name}}. I was assigned to your child at {{school_name}} and will see them on {{service_day}}. Please reply with times to meet virtually.';
const state = overrides => ({ eligible: true, demoOnly: true, mandatory: false, status: 'unconfigured', template, smsAfterDays: 3, emailAfterDays: 7, staleAfterHours: 72, routing: { isSso: false, from: 'messages@itsco.health', replyTo: 'provider@example.com', providerEmail: 'provider@example.com' }, preview: { subject: 'A warm introduction' }, ...overrides });
let wrapper;
const dialog = () => document.querySelector('[role="dialog"]');
const findButton = text => [...document.querySelectorAll('button')].find(node => node.textContent.includes(text));
async function click(text) { findButton(text).click(); await flushPromises(); }
async function open(overrides) {
  api.get.mockResolvedValue({ data: state(overrides) });
  wrapper = mount(Splash, { attachTo: document.body, props: { agencyId: 450, userId: 9, providerName: 'Alex Provider' }, global: { stubs: { RouterLink: { props: ['to'], template: '<a class="router-link-stub"><slot /></a>' } } } });
  await flushPromises();
}
beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

it('asks eligible providers once and lets a saved decline be revisited', async () => {
  api.put.mockResolvedValue({ data: state({ status: 'declined' }) });
  await open();
  expect(dialog().getAttribute('aria-modal')).toBe('true');
  expect(document.activeElement).toBe(dialog());
  await click('No thanks');
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', { status: 'declined' }, expect.objectContaining({ params: { agencyId: 450 } }));
  expect(dialog()).toBeNull();
  await click('Your school contact plan');
  expect(dialog().textContent).toContain('A little help');
});

it('keeps ineligible tenants quiet and does not prompt providers who already enabled a plan', async () => {
  await open({ eligible: false });
  expect(document.querySelector('.contact-plan-dock')).toBeNull();
  expect(dialog()).toBeNull();
  wrapper.unmount();
  await open({ status: 'enabled' });
  expect(dialog()).toBeNull();
  await click('Your school contact plan');
  expect(dialog().textContent).toContain('Your first hello');
});

it('sends an edited example, minimizes only after success, and preserves the draft on resume', async () => {
  api.post.mockResolvedValue({ data: { sent: true, conversationId: 45, deliveredTo: 'testing@itsco.health' } });
  await open(); await click('Yes, help'); await click('Edit my introduction');
  const editor = document.querySelector('textarea');
  editor.value = `${template}\nLooking forward to connecting!`; editor.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises();
  expect(document.querySelector('.contact-plan-email-body').textContent).toContain('Alex Provider');
  expect(document.querySelector('.contact-plan-email-body').textContent).toContain('Looking forward');
  await click('Send me an example');
  expect(api.post).toHaveBeenCalledWith('/school-contact-plan/example', { template: `${template}\nLooking forward to connecting!` }, expect.objectContaining({ params: { agencyId: 450 } }));
  expect(dialog()).toBeNull();
  expect(document.querySelector('.contact-plan-inbox').textContent).toContain('Check Messages');
  await click('Your example is ready');
  expect(document.querySelector('textarea').value).toContain('Looking forward');
  expect(findButton('Send me another example')).toBeTruthy();
  expect(dialog().textContent).toContain('testing@itsco.health');
});

it('keeps a failed example visible and blocks a template with missing personalization', async () => {
  api.post.mockRejectedValue(new Error('offline'));
  await open(); await click('Yes, help'); await click('Send me an example');
  expect(dialog()).not.toBeNull();
  expect(document.querySelector('[role="alert"]').textContent).toContain('could not be sent');
  await click('Edit my introduction');
  const editor = document.querySelector('textarea'); editor.value = 'Unpersonalized message'; editor.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises();
  expect(findButton('Send me an example').disabled).toBe(true);
  expect(dialog().textContent).toContain('{{parent_name}}');
});

it('validates follow-up order before saving an enabled plan with selected timings', async () => {
  api.put.mockResolvedValue({ data: state({ status: 'enabled', smsAfterDays: 4, emailAfterDays: 8, staleAfterHours: 72 }) });
  await open(); await click('Yes, help'); await click('Next: follow-ups');
  const setNumber = async (label, value) => { const input = document.querySelector(`[aria-label="${label}"]`); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises(); };
  await setNumber('Days before text follow-up', 9);
  expect(findButton('Turn on my contact plan').disabled).toBe(true);
  await setNumber('Days before text follow-up', 4); await setNumber('Days before email follow-up', 8);
  await click('Turn on my contact plan');
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', { status: 'enabled', template, smsAfterDays: 4, emailAfterDays: 8, staleAfterHours: 72 }, expect.any(Object));
  expect(dialog()).toBeNull();
  expect(document.querySelector('.contact-plan-dock').textContent).toContain('Your contact plan is on');
});

it('uses SSO reply guidance and hides the plan while the account is locked', async () => {
  api.post.mockResolvedValue({ data: { sent: true, conversationId: 45, deliveredTo: 'testing@itsco.health' } });
  await open({ routing: { isSso: true, from: 'messages@itsco.health', replyTo: 'messages@itsco.health' } });
  await click('Yes, help');
  expect(dialog().textContent).toContain('Replies return to Messages in the app');
  await wrapper.setProps({ locked: true }); expect(dialog()).toBeNull();
  await wrapper.setProps({ locked: false }); expect(dialog()).not.toBeNull();
  await click('Send me an example'); expect(document.querySelector('.contact-plan-inbox')).toBeNull();
});

it('lets an enabled optional plan be turned off without sending a message', async () => {
  api.put.mockResolvedValue({ data: state({ status: 'declined' }) });
  await open({ status: 'enabled' }); await click('Your school contact plan');
  await click('Turn off automatic contact');
  expect(api.put).toHaveBeenCalledWith('/school-contact-plan', { status: 'declined' }, expect.objectContaining({ params: { agencyId: 450 } }));
  expect(api.post).not.toHaveBeenCalled();
  expect(dialog()).toBeNull();
  expect(document.querySelector('.contact-plan-dock').textContent).toContain('Automatic contact is off');
  await click('Your school contact plan');
  expect(dialog().textContent).toContain('A little help');
});

it('prompts a previously declined provider when setup becomes required and hides the turn-off control', async () => {
  await open({ mandatory: true, status: 'declined' });
  expect(dialog()).not.toBeNull(); expect(findButton('No thanks')).toBeUndefined();
  wrapper.unmount();
  await open({ mandatory: true, status: 'enabled' }); await click('Your school contact plan');
  expect(findButton('Turn off automatic contact')).toBeUndefined();
});

it('does not show a previous tenant response after the selected agency changes', async () => {
  let resolveOld;
  api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue({ data: state({ eligible: false }) });
  wrapper = mount(Splash, { attachTo: document.body, props: { agencyId: 450, userId: 9 }, global: { stubs: { RouterLink: true } } });
  await wrapper.setProps({ agencyId: 2 }); await flushPromises();
  resolveOld({ data: state() }); await flushPromises();
  expect(dialog()).toBeNull(); expect(document.querySelector('.contact-plan-dock')).toBeNull();
});
