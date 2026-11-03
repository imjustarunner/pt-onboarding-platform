import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, shallowMount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import Badge from '../AuricWellPartnerBadge.vue';
import Landing from '../../../views/public/PublicMarketingLandingTisiView.vue';
import { AURICWELL_MARK_URL } from '../../../constants/auricwellBrand.js';

vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: null }) }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => ({ fetchPlatformBranding: vi.fn() }) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));

let wrapper;
afterEach(() => wrapper?.unmount());

describe('AuricWell public partner badge', () => {
  it.each([
    ['schoolcarebridge', 'SchoolCareBridge'],
    ['mh4kidz', 'MH4Kidz'],
    ['itsco', 'ITSCO'],
    ['nlu', 'Next Level Up Learning and Counseling Centers'],
    ['tisi', 'The Inner Strength Institute'],
    ['rise', 'Rise Revive Counseling and Coaching']
  ])('opens the confirmed %s partnership with an accessible name', (partner, name) => {
    wrapper = mount(Badge, { props: { partner, name } });
    const link = wrapper.get('a');
    expect(link.attributes('href')).toBe(`https://auricwell.com/partners#${partner}`);
    expect(link.attributes('aria-label')).toContain(name);
    expect(link.attributes('aria-label')).toContain('AuricWell Partner');
    expect(link.text()).toContain('AuricWell');
    expect(link.text()).toContain('Partner');
  });

  it('uses the shared official mark without duplicating the link name for screen readers', () => {
    wrapper = mount(Badge, { props: { partner: 'itsco', name: 'ITSCO' } });
    expect(wrapper.get('img').attributes('src')).toBe(AURICWELL_MARK_URL);
    expect(wrapper.get('img').attributes('alt')).toBe('');
    expect(wrapper.get('.auricwell-partner-badge__arrow').attributes('aria-hidden')).toBe('true');
  });

  it.each([['tisi', true], ['independent-practice', false]])(
    'limits the reusable public landing template badge to the confirmed tenant (%s)',
    async (slug, expected) => {
      const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/p/:hubSlug', component: Landing }] });
      await router.push(`/p/${slug}`);
      wrapper = shallowMount(Landing, {
        props: { previewPage: { slug, branding: {} } },
        global: { plugins: [router], stubs: { AuricWellPartnerBadge: false } }
      });
      expect(wrapper.find('a[href="https://auricwell.com/partners#tisi"]').exists()).toBe(expected);
    }
  );
});
