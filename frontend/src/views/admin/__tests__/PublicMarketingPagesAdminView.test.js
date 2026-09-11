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
  await router.push('/admin/public-marketing-pages?page=tisi');
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
  it('does not save during a crop upload', async () => {
    const wrapper = await openEditor();
    wrapper.findComponent(workspace).vm.$emit('busy', true); await flushPromises();
    expect(wrapper.find('.pmp-save-row .btn-primary').attributes('disabled')).toBeDefined();
    await wrapper.find('.pmp-save-row .btn-primary').trigger('click');
    expect(api.put).not.toHaveBeenCalled(); wrapper.unmount();
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
});
