import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import Rise from '../RisePublicWebsite.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
let wrapper;
async function render(section = '', branding = {}) {
  api.get.mockResolvedValue({ data: { page: { slug: 'rise', branding } } });
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/p/rise/:section?', component: Rise }] });
  await router.push(`/p/rise${section ? `/${section}` : ''}`);
  wrapper = mount(Rise, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => wrapper?.unmount());
describe('Rise public website', () => {
  it('renders before tenant onboarding without invented enrollment links', async () => {
    await render('join');
    expect(wrapper.text()).toContain('Enrollment opening soon');
    expect(wrapper.findAll('a[href^="/join/"]')).toHaveLength(0);
    expect(api.get).toHaveBeenCalledExactlyOnceWith('/public/marketing-pages/rise', expect.any(Object));
  });
  it('uses the explicitly configured enrollment URL and contact details', async () => {
    const { router } = await render('join', { riseWebsite: { enrollmentUrl: '/join/actual-rise', contactEmail: 'office@example.test' } });
    expect(wrapper.find('a[href="/join/actual-rise"]').text()).toContain('Begin enrollment');
    expect(wrapper.text()).not.toContain('Enrollment opening soon');
    await router.push('/p/rise/contact'); await flushPromises();
    expect(wrapper.find('a[href="mailto:office@example.test"]').exists()).toBe(true);
  });
  it('rejects unsafe or insecure destinations and leaves enrollment pending', async () => {
    await render('join', { riseWebsite: { enrollmentUrl: 'javascript:alert(1)', careersUrl: '//evil.example', partnerUrl: 'http://example.test' } });
    expect(wrapper.text()).toContain('Enrollment opening soon');
    expect(wrapper.findAll('a').every(a => !/javascript:|^\/\/|^http:/.test(a.attributes('href') || ''))).toBe(true);
  });
  it('shows published-page fetch failure and lets a retry recover', async () => {
    await render();
    api.get.mockRejectedValueOnce({ response: { status: 404 } });
    await wrapper.vm.load(); await flushPromises();
    expect(wrapper.text()).toContain('The website may not be published yet');
    expect(wrapper.find('.rise-hero').exists()).toBe(false);
    await wrapper.find('.rise-state button').trigger('click'); await flushPromises();
    expect(wrapper.find('.rise-hero').exists()).toBe(true);
  });
  it('searches resources and shows a useful empty state', async () => {
    await render('resources');
    await wrapper.find('input[type="search"]').setValue('virtual');
    expect(wrapper.findAll('.rise-resource')).toHaveLength(1);
    await wrapper.find('input[type="search"]').setValue('not-a-resource');
    expect(wrapper.text()).toContain('No guides match');
    await wrapper.find('.rise-empty button').trigger('click');
    expect(wrapper.findAll('.rise-resource')).toHaveLength(3);
  });
  it('does not use untrusted preview messages to change published enrollment', async () => {
    await render('join');
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://untrusted.example', data: { type: 'marketing-preview', page: { slug: 'rise', branding: { riseWebsite: { enrollmentUrl: '/join/wrong' } } } } }));
    await flushPromises();
    expect(wrapper.find('a[href="/join/wrong"]').exists()).toBe(false);
  });
  it('shows an explicit missing-page view for unknown subpages', async () => {
    await render('does-not-exist');
    expect(wrapper.text()).toContain('Page not found');
    expect(wrapper.find('.rise-hero').exists()).toBe(false);
  });
});
