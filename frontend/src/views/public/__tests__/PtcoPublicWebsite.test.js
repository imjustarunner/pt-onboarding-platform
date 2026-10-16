import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import Website from '../PtcoPublicWebsite.vue';
import Intake from '../../../components/ptco/PtcoBusinessIntake.vue';
import api from '../../../services/api';
import brands from '../../../content/ptcoBrandPortfolio.json';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const wrappers = [];
async function setup(path = '/p/ptco') {
  const router = createRouter({ history:createMemoryHistory(), routes:[{path:'/p/ptco/:section?/:service?',component:Website}] });
  await router.push(path);
  const wrapper = mount(Website, { global:{plugins:[router],stubs:{PublicResourcesMenu:true,PublicWebsiteProviderLinks:true,PtcoPartnerships:true,PublicWebsiteContactForm:true}} });
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({data:{page:{heroTitle:'Legacy headline',heroImageUrl:'/legacy-michael.png',branding:{contentPages:[{slug:'services',heroImageUrl:'/legacy-michael.png'}]}}}});
});
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));
describe('Plot Twist Co service discovery', () => {
  it('shows the complete brand portfolio before website service details, with website and package links', async () => {
    const { wrapper } = await setup('/p/ptco/services/website');
    const portfolio = wrapper.find('#brand-portfolio');
    expect(portfolio.exists()).toBe(true);
    expect(wrapper.find('.ptco-service-detail').element.firstElementChild.id).toBe('brand-portfolio');
    expect(portfolio.findAll('[data-brand]')).toHaveLength(16);
    for (const brand of brands) {
      const card = portfolio.find(`[data-brand="${brand.id}"]`);
      expect(card.find('h3').text()).toBe(brand.name);
      if (brand.status) {
        expect(card.text()).toContain(brand.status);
        expect(card.find(`a[href="${brand.website}"]`).exists()).toBe(false);
      } else expect(card.find('a[target="_blank"]').attributes('href')).toBe(brand.website);
      const guide = card.find(`a[href="/assets/ptco/brand-packages/${brand.id}.html"]`);
      expect(guide.attributes('target')).toBe('_blank');
      expect(guide.attributes('rel')).toBe('noopener noreferrer');
      expect(guide.attributes('aria-label')).toBe(`View ${brand.name} brand package (opens in a new tab)`);
      expect(card.find('a[download]').exists()).toBe(false);
    }
    expect(portfolio.find('[data-brand="auricwell"] a').attributes('href')).toBe('https://auricwell.com');
    expect(portfolio.find('[data-brand="fundthred"] a').attributes('href')).toBe('https://fundtred.com');
    expect(wrapper.find('.ptco-service-hero .ptco-button').text()).toContain('Explore our work');
  });
  it('filters the portfolio by category and restores all brands', async () => {
    const { wrapper, router } = await setup('/p/ptco/services/website');
    const filters = wrapper.findAll('.ptco-portfolio-filters button');
    await filters.find(button => button.text().includes('Care & community')).trigger('click');
    expect(wrapper.findAll('[data-brand]')).toHaveLength(6);
    expect(wrapper.find('[data-brand="itsco"]').exists()).toBe(true);
    expect(wrapper.find('[data-brand="auricwell"]').exists()).toBe(false);
    expect(wrapper.find('.ptco-portfolio-toolbar [role="status"]').text()).toBe('6 brands');
    await filters[0].trigger('click');
    expect(wrapper.findAll('[data-brand]')).toHaveLength(16);
    await wrapper.find('.ptco-portfolio-closing a').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.service).toBe('website');
    await router.push('/p/ptco/services/medical-billing');
    expect(wrapper.find('#brand-portfolio').exists()).toBe(false);
  });
  it('leads with billing and opens a dedicated page from the catalog', async () => {
    const { wrapper,router } = await setup();
    expect(wrapper.findAll('.ptco-service-card')).toHaveLength(8);
    expect(wrapper.find('.ptco-service-card').text()).toContain('Medical Billing');
    expect(wrapper.find('#powered-by-plottwistco').exists()).toBe(false);
    expect(wrapper.html()).not.toContain('legacy-michael');
    await wrapper.find('.ptco-service-card').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/p/ptco/services/medical-billing');
    expect(wrapper.find('h1').text()).toBe('Medical Billing & Revenue Cycle');
    expect(wrapper.text()).toContain('Billing in your existing EHR');
    expect(wrapper.text()).toContain('New contracts starting in 2027');
    expect(wrapper.text()).toContain('Both options are quote-only');
    expect(wrapper.text()).not.toMatch(/\d+%/);
    expect(wrapper.find('a[href="https://auricwell.com"]').text()).toContain('Explore AuricWell');
    await wrapper.find('.ptco-quote-card .ptco-button').trigger('click');
    await flushPromises();
    expect(wrapper.findComponent(Intake).props()).toMatchObject({service:'medical-billing',path:'operations'});
  });
  it('keeps partnership selection in the URL and opens the full service scope', async () => {
    const { wrapper,router } = await setup('/p/ptco/services');
    await wrapper.findAll('.ptco-service-switch button')[1].trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.query.view).toBe('partnership');
    expect(wrapper.find('.ptco-partnership-panel').exists()).toBe(true);
    expect(wrapper.findAll('.ptco-partnership-panel li')).toHaveLength(8);
    await wrapper.find('.ptco-partnership-banner .ptco-button').trigger('click');
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe('Full-Service Partnership');
  });
  it('connects financial management to the supplied standalone FundThred website', async () => {
    const { wrapper } = await setup('/p/ptco/services/financial');
    expect(wrapper.find('.ptco-option-grid a[href="https://fundtred.com"]').text()).toContain('Explore FundThred');
    expect(wrapper.find('.ptco-quote-card .ptco-button').attributes('href')).toContain('service=financial');
  });
  it('links people operations to the established standalone Plotline website', async () => {
    const { wrapper } = await setup('/p/ptco/services/people');
    expect(wrapper.find('.ptco-option-grid a[href="https://plotlinepo.com"]').text()).toContain('Explore Plotline');
  });
  it('preserves old service bookmarks and shows unknown services as not found', async () => {
    const { wrapper,router } = await setup('/p/ptco/services#credentialing');
    expect(router.currentRoute.value.path).toBe('/p/ptco/services/credentialing');
    expect(wrapper.text()).toContain('Choose credentialing on its own');
    await router.push('/p/ptco/services/unknown');
    await flushPromises();
    expect(wrapper.find('h1').text()).toBe('Page not found');
  });
});
