import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
const mocks = vi.hoisted(() => ({ resume: vi.fn(), logout: vi.fn() }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7, role: 'admin' }, logout: mocks.logout }) }));
vi.mock('../../store/branding', () => ({ useBrandingStore: () => ({ displayName: 'Test Brand', effectivePrimaryColor: '#245c45' }) }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { name: 'Test Agency' } }) }));
vi.mock('../../services/api', () => ({ default: { post: vi.fn().mockResolvedValue({ data: {} }) } }));
vi.mock('../../utils/activityTracker', () => ({
  resumeSession: mocks.resume, resetActivityTimer: vi.fn(), reportTimedownDismissed: vi.fn(),
  pauseIdleForSessionExtend: vi.fn(), clearSessionExtendPause: vi.fn()
}));
import StatusPromptModal from '../StatusPromptModal.vue';
import { useSessionLockStore } from '../../store/sessionLock';
import { closeStatusPrompt } from '../../utils/statusPromptBridge';
let wrapper;
beforeEach(() => {
  setActivePinia(createPinia()); localStorage.clear(); vi.clearAllMocks();
  const store = useSessionLockStore();
  store.setLockConfig({ nonHourlyAdminSession: true });
  store.warningActive = true; store.warningSecondsLeft = 600;
});
afterEach(() => { wrapper?.unmount(); closeStatusPrompt(); useSessionLockStore().dismissWarning(); vi.useRealTimers(); });
const root = () => document.getElementById('pt-status-prompt-root');
describe('status prompt security integration', () => {
  it('reactively displays the shared countdown through expiry without renewing it', async () => {
    vi.useFakeTimers();
    const store = useSessionLockStore();
    const expire = vi.fn(() => { store.lock(); });
    store.showWarning(600, expire);
    wrapper = mount(StatusPromptModal);
    expect(root().querySelector('#pt-sp-countdown').textContent).toBe('10:00');
    await vi.advanceTimersByTimeAsync(599000);
    expect(root().querySelector('#pt-sp-countdown').textContent).toBe('0:01');
    expect(expire).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(root()).toBeNull();
    expect(mocks.resume).not.toHaveBeenCalled();
  });
  it('leaves the PIN screen in control when a passcode is required', () => {
    useSessionLockStore().lock();
    wrapper = mount(StatusPromptModal);
    expect(root()).toBeNull();
  });
  it('does not dismiss the warning when the server rejects resume', async () => {
    mocks.resume.mockResolvedValue(false);
    wrapper = mount(StatusPromptModal);
    root().querySelector('.pt-sp-btn-primary').click();
    await flushPromises(); await nextTick();
    expect(useSessionLockStore().warningActive).toBe(true);
    expect(root()).not.toBeNull();
  });
});
