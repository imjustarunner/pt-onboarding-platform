import { shallowMount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: null, refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), post: vi.fn(), theme: vi.fn() }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('../../store/branding', () => ({ useBrandingStore: () => ({ loginBackground: '#fff', fetchAgencyTheme: mocks.theme }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.replace, push: mocks.push }), useRoute: () => ({ params: {} }) }));
vi.mock('../../utils/router', () => ({ getDashboardRoute: () => '/admin' }));
vi.mock('../../services/api', () => ({ default: { post: mocks.post } }));
import View from '../ChangePasswordView.vue';
const mountView = () => shallowMount(View, { global: { stubs: { RouterLink: true } } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = reactive({ user: { id: 7, requiresPasswordChange: true, passwordExpired: true }, refreshUser: mocks.refresh });
});
describe('password-change arrival', () => {
  it('waits for the server and recovers a Google member with stale cached expiry flags', async () => {
    let resolve;
    mocks.refresh.mockImplementation(() => new Promise(r => { resolve = r; }));
    const wrapper = mountView();
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('120-day');
    mocks.auth.user = { id: 7, authMethod: 'google', requiresPasswordChange: false, passwordExpired: false };
    resolve(mocks.auth.user); await flushPromises();
    expect(mocks.replace).toHaveBeenCalledWith('/admin');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(mocks.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('still shows the forced password form when the server confirms password expiry', async () => {
    mocks.refresh.mockResolvedValue(mocks.auth.user);
    const wrapper = mountView(); await flushPromises();
    expect(wrapper.find('#currentPassword').exists()).toBe(true);
    expect(wrapper.text()).toContain('120-day limit');
    expect(wrapper.find('[aria-label="Cancel"]').exists()).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('offers retry instead of trusting stale expiry after a failed refresh', async () => {
    mocks.refresh.mockResolvedValueOnce(undefined);
    const wrapper = mountView(); await flushPromises();
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).toContain('couldn’t verify');
    mocks.auth.user = { id: 7, authMethod: 'google', requiresPasswordChange: false };
    mocks.refresh.mockResolvedValue(mocks.auth.user);
    await wrapper.find('button').trigger('click'); await flushPromises();
    expect(mocks.replace).toHaveBeenCalledWith('/admin');
    wrapper.unmount();
  });
});
