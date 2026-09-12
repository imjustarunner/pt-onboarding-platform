import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import Page from '../TisiAudiencePage.vue';
import { defaultTisiLandingConfig, resolveTisiLandingConfig } from '../../../constants/tisiMarketingLanding';
import { tisiAudiencePages } from '../../../constants/tisiAudiencePages';
import { landingDestination } from '../../../utils/marketingPageQuality';
describe('TISI designed audience pages', () => {
  for (const slug of Object.keys(tisiAudiencePages)) it(`${slug} has real intake and service destinations and a mobile menu`, async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] });
    await router.push(`/p/tisi/${slug}`);
    const wrapper = mount(Page, { props: { slug, config: defaultTisiLandingConfig(), contentPage: { body: 'Coming soon' } }, global: { plugins: [router] } });
    expect(wrapper.find('h1').text()).toBe(tisiAudiencePages[slug].title);
    expect(wrapper.text()).not.toContain('Coming soon');
    expect(wrapper.find('a[href="/join/tisi"]').exists()).toBe(true);
    for (const link of wrapper.findAll('a[href^="#"]')) expect(wrapper.find(link.attributes('href')).exists()).toBe(true);
    expect(landingDestination(`/p/tisi/${slug}`)).toBe(`/p/tisi/${slug}`);
    await wrapper.find('.menu').trigger('click');
    expect(wrapper.find('#audience-nav').classes()).toContain('open');
    await wrapper.find('#audience-nav').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('#audience-nav').classes()).not.toContain('open');
    expect(wrapper.findAll('details').length).toBeGreaterThan(1);
    wrapper.unmount();
  });
  it('replaces the bundled placeholder but preserves uploaded hero choices', () => {
    expect(resolveTisiLandingConfig({ pageMeta: { heroImageUrl: '/assets/careers/heroes/colorado-photo.png' } }).heroImageUrl).toBe('/assets/tisi/home-hero.webp');
    expect(resolveTisiLandingConfig({ pageMeta: { heroImageUrl: '/uploads/approved.jpg' } }).heroImageUrl).toBe('/uploads/approved.jpg');
  });
});
