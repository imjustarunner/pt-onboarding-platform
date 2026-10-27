import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CompanyEventPublicView from '../CompanyEventPublicView.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { eventId: '8' } }), useRouter: () => ({ replace: vi.fn() }) }));
const auth = vi.hoisted(() => ({ isAuthenticated: false, user: null }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => auth }));
const wrappers = [];
const event = { id: 8, title: 'Bowling night', eventType: 'company_event', rsvpMode: 'yes_no_maybe', publicRegistrationEnabled: true, attendeeSmsEnabled: true };
const data = { event, branding: { agencyName: 'ITSCO' }, smsConsentDisclosure: { enabled: true, disclosure: 'Texts are optional. Reply STOP to opt out.', termsUrl: '/sms-terms', privacyUrl: '/privacy' } };
async function render() { const wrapper = mount(CompanyEventPublicView); wrappers.push(wrapper); await flushPromises(); return wrapper; }
async function enterRegistration(wrapper) {
  await wrapper.find('input[placeholder="Your first name"]').setValue('Pat');
  await wrapper.find('input[type="email"]').setValue('pat@example.com');
  await wrapper.find('.rsvp-choice--yes').trigger('click');
}
beforeEach(() => { auth.isAuthenticated = false; auth.user = null; localStorage.clear(); api.get.mockResolvedValue({ data }); api.post.mockResolvedValue({ data: { managementToken: 'guest-secret', smsConsentStatus: 'pending_review' } }); });
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.clearAllMocks(); });

describe('public attendee registration', () => {
  it('allows registration without SMS consent and saves the guest management token', async () => {
    const wrapper = await render();
    expect(wrapper.find('.sms-choice input').element.checked).toBe(false);
    await enterRegistration(wrapper);
    await wrapper.find('.rsvp-submit-row button').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/company-events/public/8/register', expect.objectContaining({ email: 'pat@example.com', smsConsent: false }), { skipAuthRedirect: true });
    expect(localStorage.getItem('attendee_event_management_8_pat@example.com')).toBe('guest-secret');
    expect(wrapper.text()).toContain('Staff staffing requests use the separate staff event link');
  });
  it('requires an explicitly entered phone when opting into texts', async () => {
    const wrapper = await render(); await enterRegistration(wrapper);
    await wrapper.find('.sms-choice input').setValue(true);
    await wrapper.find('.rsvp-submit-row button').trigger('click'); await flushPromises();
    expect(wrapper.find('.rsvp-error').text()).toContain('Enter your mobile phone number');
    expect(api.post).not.toHaveBeenCalled();
    await wrapper.find('input[type="tel"]').setValue('7195550101');
    await wrapper.find('.rsvp-submit-row button').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/company-events/public/8/register', expect.objectContaining({ smsConsent: true, phone: '7195550101' }), { skipAuthRedirect: true });
    expect(wrapper.text()).toContain('still needs to be verified');
  });
  it('does not offer opt-in when the SMS disclosure is not enabled', async () => {
    api.get.mockResolvedValue({ data: { ...data, smsConsentDisclosure: { enabled: false } } });
    const wrapper = await render();
    expect(wrapper.find('.sms-choice').exists()).toBe(false);
  });
  it('sends a saved management token when updating a previous guest registration', async () => {
    localStorage.setItem('attendee_event_management_8_pat@example.com', 'known-secret');
    const wrapper = await render(); await enterRegistration(wrapper);
    await wrapper.find('.rsvp-submit-row button').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/company-events/public/8/register', expect.objectContaining({ managementToken: 'known-secret' }), { skipAuthRedirect: true });
  });

  it('records attendee check-in and checkout using the guest token without a payroll claim', async () => {
    api.get.mockResolvedValue({ data: { ...data, event: { ...event, attendeeCheckInEnabled: true } } });
    api.post.mockImplementation(url => Promise.resolve({ data: url.endsWith('/register') ? { managementToken: 'guest-secret' }
      : url.endsWith('/attendance') ? { checkedInAt: null, checkedOutAt: null, isEventDay: true }
        : url.endsWith('/check-in') ? { checkedInAt: '2026-10-24T18:00:00Z', checkedOutAt: null }
          : { checkedInAt: '2026-10-24T18:00:00Z', checkedOutAt: '2026-10-24T20:00:00Z' } }));
    const wrapper = await render(); await enterRegistration(wrapper);
    await wrapper.find('.rsvp-submit-row button').trigger('click'); await flushPromises();
    expect(wrapper.find('.attendee-check-in button').text()).toBe('Check in');
    await wrapper.find('.attendee-check-in button').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/company-events/public/8/check-in', { email: 'pat@example.com', managementToken: 'guest-secret' }, { skipAuthRedirect: true });
    expect(wrapper.find('.attendee-check-in button').text()).toBe('Check out');
    await wrapper.find('.attendee-check-in button').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/company-events/public/8/check-out', { email: 'pat@example.com', managementToken: 'guest-secret' }, { skipAuthRedirect: true });
    expect(wrapper.find('.attendee-check-in').text()).toContain('Thank you for attending');
    expect(api.post.mock.calls.some(([url]) => url.includes('/payroll/'))).toBe(false);
  });

  it('refreshes stale stored attendance before allowing checkout when registration has closed', async () => {
    api.get.mockResolvedValue({ data: { ...data, event: { ...event, attendeeCheckInEnabled: true, publicRegistrationStatus: 'closed' } } });
    localStorage.setItem('attendee_rsvp_event_8', JSON.stringify({ email: 'pat@example.com', name: 'Pat', response: 'yes', checkedOutAt: '2026-10-17T20:00:00Z' }));
    localStorage.setItem('attendee_event_management_8_pat@example.com', 'known-secret');
    api.post.mockResolvedValue({ data: { checkedInAt: '2026-10-24T18:00:00Z', checkedOutAt: null, isEventDay: true } });
    const wrapper = await render();
    expect(api.post).toHaveBeenCalledWith('/company-events/public/8/attendance', { email: 'pat@example.com', managementToken: 'known-secret' }, { skipAuthRedirect: true });
    expect(wrapper.find('.attendee-check-in button').text()).toBe('Check out');
    expect(wrapper.text()).toContain('Registration for this event is closed');
    expect(wrapper.find('.rsvp-submit-row').exists()).toBe(false);
  });

  it('does not expose attendance actions without a management token', async () => {
    api.get.mockResolvedValue({ data: { ...data, event: { ...event, attendeeCheckInEnabled: true } } });
    localStorage.setItem('attendee_rsvp_event_8', JSON.stringify({ email: 'pat@example.com', response: 'yes' }));
    const wrapper = await render();
    expect(wrapper.find('.attendee-check-in button').exists()).toBe(false);
    expect(wrapper.find('.attendee-check-in').text()).toContain('browser you used to register');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps check-in disabled outside an event day', async () => {
    api.get.mockResolvedValue({ data: { ...data, event: { ...event, attendeeCheckInEnabled: true } } });
    localStorage.setItem('attendee_rsvp_event_8', JSON.stringify({ email: 'pat@example.com', response: 'yes' }));
    localStorage.setItem('attendee_event_management_8_pat@example.com', 'known-secret');
    api.post.mockResolvedValue({ data: { checkedInAt: null, checkedOutAt: null, isEventDay: false } });
    const wrapper = await render();
    expect(wrapper.find('.attendee-check-in button').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.attendee-check-in').text()).toContain('Check-in opens on the event day');
  });
});

it('keeps travel submissions off the event detail page even for assigned employees', async () => {
  auth.isAuthenticated = true; auth.user = { id: 7, role: 'provider' };
  api.get.mockImplementation(url => Promise.resolve({ data: url.includes('/participation') ? { canSubmitTravel: true } : data }));
  const wrapper = await render();
  expect(wrapper.find('.event-travel-panel').exists()).toBe(false);
});
it('keeps employee payroll controls off the public guest page', async () => {
  const wrapper = await render(); expect(wrapper.find('.event-travel-panel').exists()).toBe(false);
  expect(api.get.mock.calls.some(([url]) => url.includes('/participation'))).toBe(false);
});
