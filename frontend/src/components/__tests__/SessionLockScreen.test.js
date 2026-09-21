import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
const mocks = vi.hoisted(() => ({ resume: vi.fn() }));
vi.mock('../../utils/activityTracker', () => ({ resumeSession: mocks.resume }));
vi.mock('../../store/branding', () => ({ useBrandingStore: () => ({ displayLogoUrl: null }) }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { slug: 'itsco' } }) }));
vi.mock('../../utils/loginRedirect', () => ({ getCurrentPortalSlugFromHostCache: () => '', getCurrentPortalSlugFromPath: () => '' }));
import SessionLockScreen from '../SessionLockScreen.vue';
import { useSessionLockStore } from '../../store/sessionLock';
let wrapper;
beforeEach(() => { setActivePinia(createPinia()); mocks.resume.mockReset(); useSessionLockStore().setLockConfig({ pinRequired: true, pinLength: 6, useLockScreen: true }); });
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });
describe('Quick View unlock screen', () => {
  it('uses the existing mobile session background while retaining the PIN form', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    wrapper = mount(SessionLockScreen, { props: { isLocked: true }, global: { stubs: { teleport: true, BrandingLogo: true } } });
    expect(wrapper.find('video').exists()).toBe(false);
    expect(wrapper.get('.session-lock-background').attributes('src')).toBe('/branding/session/MobileBackground.png');
    expect(wrapper.get('input').attributes('maxlength')).toBe('6');
  });
  it('uses the tenant timeout video and falls back to its matching poster', async () => {
    wrapper = mount(SessionLockScreen, { props: { isLocked: true }, global: { stubs: { teleport: true, BrandingLogo: true } } });
    expect(wrapper.get('video source').attributes('src')).toBe('/branding/session/ITSCOTimedown.mp4');
    await wrapper.get('video').trigger('error');
    expect(wrapper.get('.session-lock-background').attributes('src')).toBe('/branding/session/ITSCOTimedown.png');
  });
  it('does not label initial verification as a lock or show a fake zero countdown', () => {
    useSessionLockStore().setLockConfig(null);
    wrapper = mount(SessionLockScreen, { props: { isLocked: true }, global: { stubs: { teleport: true, BrandingLogo: true } } });
    expect(wrapper.text()).toContain('Checking sign-in');
    expect(wrapper.text()).not.toContain('Session Locked');
    expect(wrapper.text()).not.toContain('Automatic logout');
    expect(wrapper.find('video').exists()).toBe(false);
    expect(wrapper.find('.session-lock-background').exists()).toBe(false);
    expect(wrapper.find('.session-checking').exists()).toBe(true);
  });
  it('shows the countdown only when a real warning deadline exists', () => {
    const store=useSessionLockStore();store.warningActive=true;store.warningSecondsLeft=90;
    wrapper = mount(SessionLockScreen, { props: { isLocked: true }, global: { stubs: { teleport: true, BrandingLogo: true } } });
    expect(wrapper.text()).toContain('Session Locked');
    expect(wrapper.text()).toContain('Automatic logout in 1:30');
  });
  it('accepts six digits including a leading zero, and unlocks only after verification', async () => {
    wrapper = mount(SessionLockScreen, { props: { isLocked: true }, global: { stubs: { teleport: true, BrandingLogo: true } } });
    expect(wrapper.text()).toContain('6-digit Quick View passcode');
    const input = wrapper.get('input');
    expect(input.attributes('maxlength')).toBe('6');
    await input.setValue('012345');
    mocks.resume.mockResolvedValue(true);
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.resume).toHaveBeenCalledWith('012345');
    expect(wrapper.emitted('unlock')).toHaveLength(1);
  });
  it('stays covered after an incorrect code and does not emit unlock', async () => {
    wrapper = mount(SessionLockScreen, { props: { isLocked: true }, global: { stubs: { teleport: true, BrandingLogo: true } } });
    await wrapper.get('input').setValue('654321');
    mocks.resume.mockRejectedValue({ response: { data: { error: { message: 'Incorrect code' } } } });
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.emitted('unlock')).toBeUndefined();
    expect(wrapper.text()).toContain('Incorrect code');
    expect(wrapper.get('input').element.value).toBe('');
  });
});
