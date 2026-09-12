import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import api from '../../../services/api';
import Admin from '../PublicMarketingPagesAdminView.vue';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
const workspace = { name: 'MarketingDesignWorkspace', props: ['page'], emits: ['asset', 'busy'], template: '<div class="workspace-stub" />' };
let record;
async function openEditor() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/public-marketing-pages', component: Admin }] });
  await router.push(`/admin/public-marketing-pages?page=${record.slug}`);
  const wrapper = mount(Admin, { global: { plugins: [router], stubs: { MarketingDesignWorkspace: workspace } } });
  await flushPromises();
  return wrapper;
}
beforeEach(() => {
  vi.clearAllMocks();
  record = { id: 1, slug: 'tisi', title: 'Inner Strength Institute', pageType: 'marketing_landing', heroTitle: 'Build Inner Strength', isActive: false, brandingJson: { landing: { customFutureOption: 'keep me' } } };
  api.get.mockImplementation(async url => ({ data: url === '/platform/public-marketing-pages' ? { pages: [record] } : [] }));
  api.put.mockResolvedValue({ data: {} });
});
describe('marketing editor save workflow', () => {
  it('opens the selected page, previews unsaved edits, and preserves unrelated landing configuration', async () => {
    const wrapper = await openEditor();
    const component = wrapper.findComponent(workspace);
    expect(component.props('page').slug).toBe('tisi');
    component.vm.$emit('asset', { target: 'hero', url: '/uploads/real-crop.png' });
    await flushPromises();
    expect(component.props('page').heroImageUrl).toBe('/uploads/real-crop.png');
    await wrapper.find('.pmp-save-row .btn-primary').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenCalledOnce();
    const payload = api.put.mock.calls[0][1];
    expect(payload.heroImageUrl).toBe('/uploads/real-crop.png');
    expect(payload.brandingJson.landing.customFutureOption).toBe('keep me');
    expect(payload.isActive).toBe(false);
    wrapper.unmount();
  });
  it('previews PTCO and preserves its template when saving hero artwork', async () => {
    record = { id: 2, slug: 'ptco', title: 'Plot Twist Co.', pageType: 'marketing_hub', heroTitle: 'Your next chapter', isActive: false, brandingJson: { landingTemplate: 'ptco', logoUrl: '/assets/ptco/logo-flat.webp' } };
    const wrapper = await openEditor();
    const component = wrapper.findComponent(workspace);
    expect(component.props('page').slug).toBe('ptco');
    component.vm.$emit('asset', { target: 'hero', url: '/uploads/ptco-hero.webp' });
    await flushPromises();
    await wrapper.find('.pmp-save-row .btn-primary').trigger('click'); await flushPromises();
    expect(api.put.mock.calls[0][1].brandingJson.landingTemplate).toBe('ptco');
    expect(api.put.mock.calls[0][1].heroImageUrl).toBe('/uploads/ptco-hero.webp');
    expect(api.put.mock.calls[0][1].brandingJson.landing).toBeUndefined();
    wrapper.unmount();
  });
  it('does not save during a crop upload', async () => {
    const wrapper = await openEditor();
    wrapper.findComponent(workspace).vm.$emit('busy', true); await flushPromises();
    expect(wrapper.find('.pmp-save-row .btn-primary').attributes('disabled')).toBeDefined();
    await wrapper.find('.pmp-save-row .btn-primary').trigger('click');
    expect(api.put).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('preserves Rise settings and previews banner and enrollment edits without a tenant', async () => {
    record = { id: 3, slug: 'rise', title: 'Rise Revive', pageType: 'marketing_hub', isActive: true, brandingJson: { landingTemplate: 'rise', riseWebsite: { enrollmentUrl: '', futureOption: 'preserved' } } };
    const wrapper = await openEditor();
    const component = wrapper.findComponent(workspace);
    await wrapper.find('[data-rise-field="enrollmentUrl"]').setValue('/join/actual-rise');
    component.vm.$emit('asset', { target: 'cta', url: '/uploads/rise-banner.webp' });
    await flushPromises();
    expect(component.props('page').branding.riseWebsite.enrollmentUrl).toBe('/join/actual-rise');
    expect(component.props('page').branding.riseWebsite.ctaImageUrl).toBe('/uploads/rise-banner.webp');
    await wrapper.find('.pmp-save-row .btn-primary').trigger('click'); await flushPromises();
    const payload = api.put.mock.calls[0][1];
    expect(payload.brandingJson.landingTemplate).toBe('rise');
    expect(payload.brandingJson.riseWebsite.futureOption).toBe('preserved');
    expect(payload.brandingJson.landing).toBeUndefined();
    expect(payload.isActive).toBe(true);
    wrapper.unmount();
  });
  it('keeps invalid JSON and unfinished published content from being silently saved', async () => {
    record.isActive = true;
    const wrapper = await openEditor();
    await wrapper.find('.pmp-save-row .btn-primary').trigger('click'); await flushPromises();
    expect(api.put).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Resolve the page readiness items');
    const json = wrapper.find('textarea[placeholder*=programThemePrimary]');
    await json.setValue('{invalid');
    await wrapper.find('.pmp-save-row .btn-primary').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('must be a valid JSON object');
    expect(api.put).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('rejects unsafe Rise enrollment destinations before publishing', async () => {
    record = { id: 3, slug: 'rise', title: 'Rise Revive', pageType: 'marketing_hub', isActive: true, brandingJson: {} };
    const wrapper = await openEditor();
    await wrapper.find('[data-rise-field="enrollmentUrl"]').setValue('javascript:alert(1)');
    await wrapper.find('.pmp-save-row .btn-primary').trigger('click'); await flushPromises();
    expect(api.put).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('must use an HTTPS URL');
    wrapper.unmount();
  });
});
