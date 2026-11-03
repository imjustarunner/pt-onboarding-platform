import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import ThankYou from '../AdaptiveIntakeThankYou.vue';
import { translateJoinEnrollment } from '../../../utils/joinEnrollmentCopy.js';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { post } }));
let wrapper;
beforeEach(() => post.mockReset().mockResolvedValue({ data: { sent: true } }));
afterEach(() => wrapper?.unmount());

it('never displays or sends legacy passwords and requests only an email setup link', async () => {
  wrapper = mount(ThankYou, { props: { agencySlug: 'demo', confirmation: {
    temporaryAccess: { email: 'demo@example.com', password: 'SYNTHETIC-SECRET', userId: 999 }
  } } });
  expect(wrapper.html()).not.toContain('SYNTHETIC-SECRET');
  expect(wrapper.text()).not.toContain('Temporary password');
  expect(post).not.toHaveBeenCalled();
  await wrapper.findAll('button').find(b => b.text() === 'Email me a sign-in or setup link').trigger('click');
  await flushPromises();
  expect(post).toHaveBeenCalledExactlyOnceWith('/public/adaptive-intake/demo/portal-login-email', { email: 'demo@example.com' });
  expect(wrapper.text()).toContain('Check your email for your private sign-in or setup link.');
});

it('renders the receipt date, schedule and authored text in the selected language', async () => {
  const locale = ref('es');
  wrapper = mount(ThankYou, { props: { agencySlug: 'demo', confirmation: {
    identifierCode: 'QA123', summary: {
      whoFor: 'child', whoForLabel: 'My child / dependent', clientName: 'DEMO Child',
      birthdate: '2015-03-10', exchangeSchedule: { days: ['Tuesday'], periods: ['afternoon'], timezone: 'America/Denver', notes: 'Keep these exact notes' },
      preferredLocation: 'Denver', concerns: ['Stress or feeling overwhelmed']
    }
  } }, global: { provide: { enrollmentLocale: locale, enrollmentTranslate: text => translateJoinEnrollment(text, locale.value) } } });
  expect(wrapper.text()).toContain('10 de marzo de 2015');
  expect(wrapper.text()).toContain('Martes');
  expect(wrapper.text()).toContain('Tarde');
  expect(wrapper.text()).toContain('Keep these exact notes');
  expect(wrapper.text()).not.toContain('2015-03-10');
  locale.value = 'en'; await flushPromises();
  expect(wrapper.text()).toContain('March 10, 2015');
  expect(wrapper.text()).toContain('Tuesday');
});
