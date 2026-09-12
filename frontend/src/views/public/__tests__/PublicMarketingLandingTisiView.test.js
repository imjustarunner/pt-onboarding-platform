import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import Landing from '../PublicMarketingLandingTisiView.vue';
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: null }) }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => ({ fetchPlatformBranding: vi.fn() }) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
describe('public landing', () => {
  it('renders working intake, hides unverified quotes and placeholders, and opens mobile navigation', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] });
    await router.push('/p/tisi');
    const wrapper = mount(Landing, { props: { previewPage: { slug: 'tisi', branding: { primaryNav: [{ label: 'Home', href: '/p/tisi' }, { label: 'Services', href: '/p/tisi/services' }, { label: 'Who We Help', href: '/p/tisi/who-we-help' }, { label: 'Contact', href: '/p/tisi/contact' }], contactPhone: 'Phone — coming soon', landing: { testimonials: [{ text: 'Invented praise', attribution: 'Client' }] } } } }, global: { plugins: [router] } });
    expect(wrapper.find('.tisi-header-cta').attributes('href')).toBe('/join/tisi');
    expect(wrapper.text()).not.toContain('Invented praise');
    expect(wrapper.text()).not.toContain('coming soon');
    expect(wrapper.find('[aria-label="5 out of 5 stars"]').exists()).toBe(false);
    expect(wrapper.find('a[href="#services"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/p/tisi/about"]').exists()).toBe(false);
    const toggle = wrapper.find('.tisi-nav-toggle');
    await toggle.trigger('click'); expect(toggle.attributes('aria-expanded')).toBe('true');
    for (const slug of ['men', 'boys', 'athletes']) {
      expect(wrapper.findAll(`.tisi-nav a[href="/p/tisi/${slug}"]`)).toHaveLength(1);
    }
    await wrapper.find('.tisi-nav a[href="/p/tisi/men"]').trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    await toggle.trigger('click');
    await wrapper.find('.tisi-nav').trigger('keydown', { key: 'Escape' }); expect(toggle.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });
});
