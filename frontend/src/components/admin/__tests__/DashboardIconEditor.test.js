import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import DashboardIconEditor from '../DashboardIconEditor.vue';

const state = vi.hoisted(() => ({ auth: null, branding: null, apply: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => state.auth }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ applyBrandingResponse: state.apply }) }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => state.branding }));
vi.mock('../../../services/api', () => ({ default: { put: state.put, post: state.post } }));
let wrapper;
function render() {
  wrapper = mount(DashboardIconEditor, { attachTo: document.body,
    props: { iconKey: 'overview', label: 'Overview' },
    global: { stubs: { IconSelector: { template: '<button class="library-choice" @click="$emit(\'update:modelValue\', 57)">Choose library icon</button>' } } }
  });
  return wrapper;
}
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
beforeEach(() => {
  vi.resetAllMocks();
  state.auth = reactive({ user: { role: 'super_admin' } });
  state.branding = reactive({ dashboardIconOrganization: { id: 2, name: 'ITSCO' }, get dashboardIconEditingTarget() { return this.dashboardIconOrganization; }, setPlatformBrandingFromResponse: vi.fn(), getDashboardIconOverrideId: () => null, prefetchIconIds: vi.fn(), iconFilePathCache: {} });
  state.put.mockResolvedValue({ data: { id: 2, theme_settings: {} } });
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('inline dashboard icon editor', () => {
  it('edits the platform without creating a tenant assignment', async () => {
    state.branding.dashboardIconOrganization = { id: null, name: 'Plot Twist HQ', isPlatform: true };
    state.put.mockResolvedValue({ data: { id: 12, dashboard_icon_overrides: { dashboard: { overview: 57 } } } });
    render(); await wrapper.find('button').trigger('click');
    expect(document.querySelector('[role="dialog"]').textContent).toContain('platform dashboard');
    document.querySelector('.library-choice').click(); await flushPromises();
    button('Save icon').click(); await flushPromises();
    expect(state.put).toHaveBeenCalledWith('/platform-branding/dashboard-icons', { surface: 'dashboard', key: 'overview', iconId: 57 });
    expect(state.branding.setPlatformBrandingFromResponse).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }));
    expect(state.apply).not.toHaveBeenCalled();
  });

  it('uploads platform icons to the platform library', async () => {
    state.branding.dashboardIconOrganization = { id: null, name: 'Plot Twist HQ', isPlatform: true };
    state.post.mockResolvedValue({ data: { id: 88, file_path: 'icons/new.png' } });
    render(); await wrapper.find('button').trigger('click');
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [new File(['png'], 'New icon.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change')); await flushPromises();
    expect(state.post.mock.calls[0][1].get('agencyId')).toBe('null');
  });

  it('shows the edit control only for a superadmin with an organization', async () => {
    render(); expect(wrapper.find('button').attributes('aria-label')).toBe('Edit Overview icon');
    state.auth.user.role = 'admin'; await flushPromises(); expect(wrapper.find('button').exists()).toBe(false);
    state.auth.user.role = 'super_admin'; state.branding.dashboardIconOrganization = null;
    await flushPromises(); expect(wrapper.find('button').exists()).toBe(false);
  });
  it('saves to the organization captured on open and updates shared branding immediately', async () => {
    render(); await wrapper.find('button').trigger('click');
    expect(document.querySelector('[role="dialog"]').textContent).toContain('ITSCO');
    document.querySelector('.library-choice').click(); await flushPromises();
    state.branding.dashboardIconOrganization = { id: 9, name: 'Demo' };
    button('Save icon').click(); await flushPromises();
    expect(state.put).toHaveBeenCalledWith('/agencies/2/dashboard-icons', { surface: 'dashboard', key: 'overview', iconId: 57 });
    expect(state.apply).toHaveBeenCalledWith({ id: 2, theme_settings: {} });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('keeps the dialog open and previous assignment intact after a failed save', async () => {
    state.put.mockRejectedValue(new Error('offline'));
    render(); await wrapper.find('button').trigger('click');
    document.querySelector('.library-choice').click(); await flushPromises();
    button('Save icon').click(); await flushPromises();
    expect(document.querySelector('[role="alert"]').textContent).toContain('previous icon is unchanged');
    expect(state.apply).not.toHaveBeenCalled(); expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
  it('uploads to the tenant library before assigning the new icon', async () => {
    state.post.mockResolvedValue({ data: { id: 88, file_path: 'icons/new.png' } });
    render(); await wrapper.find('button').trigger('click');
    const input = document.querySelector('input[type="file"]');
    const file = new File(['png'], 'New icon.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change')); await flushPromises();
    expect(state.post.mock.calls[0][0]).toBe('/icons/upload');
    expect(state.post.mock.calls[0][1].get('agencyId')).toBe('2');
    expect(state.put).not.toHaveBeenCalled();
    button('Save icon').click(); await flushPromises();
    expect(state.put.mock.calls[0][1].iconId).toBe(88);
  });
  it('rejects unsupported uploads without sending a request', async () => {
    render(); await wrapper.find('button').trigger('click');
    const input = document.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [new File(['pdf'], 'file.pdf', { type: 'application/pdf' })] });
    input.dispatchEvent(new Event('change')); await flushPromises();
    expect(state.post).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]').textContent).toContain('SVG, PNG or JPG');
  });
  it('restores the inherited icon and supports cancel without a write', async () => {
    render(); await wrapper.find('button').trigger('click'); button('Cancel').click(); await flushPromises();
    expect(state.put).not.toHaveBeenCalled();
    await wrapper.find('button').trigger('click'); button('Use original / inherited icon').click(); await flushPromises();
    button('Save icon').click(); await flushPromises(); expect(state.put.mock.calls[0][1].iconId).toBeNull();
  });
});
