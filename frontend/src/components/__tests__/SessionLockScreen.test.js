import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
const mocks = vi.hoisted(() => ({ resume: vi.fn() }));
vi.mock('../../utils/activityTracker', () => ({ resumeSession: mocks.resume }));
vi.mock('../../store/branding', () => ({ useBrandingStore: () => ({ displayLogoUrl: null }) }));
import SessionLockScreen from '../SessionLockScreen.vue';
import { useSessionLockStore } from '../../store/sessionLock';
let wrapper;
beforeEach(() => { setActivePinia(createPinia()); mocks.resume.mockReset(); useSessionLockStore().setLockConfig({ pinRequired: true, pinLength: 6, useLockScreen: true }); });
afterEach(() => { wrapper?.unmount(); });
describe('Quick View unlock screen', () => {
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
