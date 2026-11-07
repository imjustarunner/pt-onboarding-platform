import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import axios from 'axios';
import Launcher from '../QuickViewLauncherView.vue';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), initializePortalTheme: vi.fn(), query: {} }));
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useRoute: () => ({ query: mocks.query })
}));
vi.mock('../../store/branding', () => ({
  useBrandingStore: () => ({ initializePortalTheme: mocks.initializePortalTheme, portalHostPortalUrl: '' })
}));
vi.mock('../../utils/subdomain', () => ({
  getSubdomain: () => 'mountain-practice',
  resolveHostForAgencyLookup: () => 'app.example.org',
  isQuickViewHost: () => true
}));

let wrapper;
const tenant = {
  agencyId: 2,
  agencyName: 'Mountain Practice',
  loginUrl: 'https://app.example.org/login'
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  for (const key of Object.keys(mocks.query)) delete mocks.query[key];
  axios.get.mockResolvedValue({ data: tenant });
  axios.post.mockResolvedValue({ data: { sessionToken: 'demo-session-token' } });
});

afterEach(() => {
  wrapper?.unmount();
  document.querySelector('link[rel="manifest"]')?.remove();
});

describe('Quick View launcher access', () => {
  it('resolves the workspace, accepts only six numeric digits, and preserves authorized deep links on unlock', async () => {
    Object.assign(mocks.query, { conversationId: '42', threadId: '-1', join: 'team-meeting', id: 'meeting_7', returnTo: 'https://untrusted.example.org' });
    wrapper = shallowMount(Launcher);
    await flushPromises();

    expect(axios.get).toHaveBeenCalledWith('/api/quick-view/tenant', {
      params: { portal: 'mountain-practice', host: 'app.example.org' },
      withCredentials: true
    });
    expect(wrapper.text()).toContain('Mountain Practice');
    const passcode = wrapper.get('#quick-view-passcode');
    const submit = wrapper.get('button[type="submit"]');
    expect(passcode.attributes('autocomplete')).toBe('current-password');
    expect(submit.attributes('disabled')).toBeDefined();

    await passcode.setValue('12345');
    expect(submit.attributes('disabled')).toBeDefined();
    await passcode.setValue('12x456');
    await wrapper.get('form').trigger('submit');
    expect(axios.post).not.toHaveBeenCalled();
    expect(submit.attributes('disabled')).toBeDefined();

    await wrapper.get('#quick-view-email').setValue('staff@example.org');
    await passcode.setValue('123456');
    expect(submit.attributes('disabled')).toBeUndefined();
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(axios.post).toHaveBeenCalledWith('/api/quick-view/tenant/unlock', {
      passcode: '123456', email: 'staff@example.org', agencyId: 2, portal: 'mountain-practice'
    }, { withCredentials: true });
    expect(sessionStorage.getItem('plottwist.quickViewSession')).toBe('demo-session-token');
    expect(mocks.replace).toHaveBeenCalledWith({
      name: 'QuickViewApp', query: { conversationId: '42', join: 'team-meeting', id: 'meeting_7' }
    });
  });

  it('shows a lookup failure and resolves the workspace when Try again succeeds', async () => {
    axios.get.mockRejectedValueOnce({ response: { data: { error: { message: 'Workspace lookup failed.' } } } });
    wrapper = shallowMount(Launcher);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Workspace lookup failed.');
    expect(wrapper.find('#quick-view-passcode').exists()).toBe(false);
    await wrapper.findAll('button').find((button) => button.text().startsWith('Try again')).trigger('click');
    await flushPromises();

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('#quick-view-passcode').exists()).toBe(true);
    expect(wrapper.text()).toContain('Mountain Practice');
  });

  it('replaces the passcode form with the server-provided recovery route after lockout', async () => {
    axios.post.mockRejectedValueOnce({ response: { data: { error: {
      code: 'locked', requiresReset: true, message: 'Reset your passcode to continue.', loginUrl: 'https://app.example.org/account-recovery'
    } } } });
    wrapper = shallowMount(Launcher);
    await flushPromises();
    await wrapper.get('#quick-view-passcode').setValue('123456');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Reset your passcode to continue.');
    expect(wrapper.find('#quick-view-passcode').exists()).toBe(false);
    expect(wrapper.findAll('a').find((link) => link.text().startsWith('Sign in to reset')).attributes('href')).toBe('https://app.example.org/account-recovery');
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('plottwist.quickViewSession')).toBeNull();
  });
});

it('offers primary account sign-in without upgrading the legacy PIN',async()=>{wrapper=shallowMount(Launcher);await flushPromises();expect(wrapper.get('.primary-account-link').attributes('href')).toBe('https://auricwell.com/mobile');expect(wrapper.text()).toContain('Password, SSO or passkey');expect(wrapper.find('#quick-view-passcode').exists()).toBe(true);expect(axios.post).not.toHaveBeenCalled();});
