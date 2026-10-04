import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import View from '../ClubManagerSignupView.vue';
import api from '../../services/api';
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../store/branding', () => ({ useBrandingStore: () => ({ setPortalThemeFromLoginTheme: vi.fn() }) }));
let wrapper;
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/:organizationSlug/signup/club-manager', component: View },
    { path: '/:pathMatch(.*)*', component: { template: '<div />' } }
  ] });
  await router.push('/sstc/signup/club-manager');
  wrapper = mount(View, { attachTo: document.body, global: { plugins: [router] } });
  await flushPromises();
}
async function fill() {
  for (const [id,value] of Object.entries({ email:'organizer@example.test', password:'TestPassword123!', firstName:'Alex', lastName:'Morgan', clubName:'Mountain Movers', city:'Denver', state:'co', clubFocus:'A walking community' })) {
    await wrapper.find(`#${id}`).setValue(value);
  }
  await wrapper.find('input[type="checkbox"]').setValue(true);
}
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { agency: { name: 'Summit Stats Team Challenge' } } });
});
afterEach(() => wrapper?.unmount());
describe('Club founder signup', () => {
  it('keeps navigation and account and club fields accessible', async () => {
    await render();
    expect(wrapper.find('nav a[href="/sstc/clubs"]').exists()).toBe(true);
    expect(wrapper.find('nav a[href="/sstc/login"]').exists()).toBe(true);
    expect(wrapper.findAll('fieldset')).toHaveLength(2);
    expect(wrapper.find('input[type="checkbox"]').attributes('required')).toBeDefined();
    await wrapper.find('.toggle-vis').trigger('click');
    expect(wrapper.find('#password').attributes('type')).toBe('text');
  });
  it('preserves registration details and focuses the verification confirmation', async () => {
    api.post.mockResolvedValue({ data: { message: 'Please verify your email.' } });
    await render(); await fill();
    await wrapper.find('form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/auth/register-club-manager', {
      email:'organizer@example.test', password:'TestPassword123!', firstName:'Alex', lastName:'Morgan', clubName:'Mountain Movers', city:'Denver', state:'CO', clubFocus:'A walking community', portalSlug:'sstc'
    });
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('[role="status"]').text()).toContain('Please verify your email.');
    expect(document.activeElement).toBe(wrapper.find('[role="status"]').element);
  });
  it('prevents duplicate submissions while a request is in progress', async () => {
    let finish;
    api.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await render(); await fill();
    await wrapper.find('form').trigger('submit');
    await wrapper.find('form').trigger('submit');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    finish({data:{message:'Check your email'}}); await flushPromises();
  });
  it('routes existing account holders to login and keeps their input', async () => {
    api.post.mockRejectedValue({ response: { status:409, data:{error:{code:'ACCOUNT_EXISTS'}} } });
    await render(); await fill();
    await wrapper.find('form').trigger('submit'); await flushPromises();
    expect(wrapper.find('[role="alert"] a').attributes('href')).toBe('/sstc/login');
    expect(wrapper.find('#clubName').element.value).toBe('Mountain Movers');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });
});
