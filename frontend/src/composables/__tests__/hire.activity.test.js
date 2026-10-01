import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { useOnboardingActivity } from '../useOnboardingActivity.js';
import { usePortalIdle } from '../usePortalIdle.js';
import Signature from '../../components/adaptive-intake/AdaptiveSignatureCapture.vue';
let wrapper;
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(document, 'hasFocus').mockReturnValue(true); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible'); });
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('hiring activity and signing regressions', () => {
  it('captures a prefilled typed signature only after an explicit acknowledgement', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), fillText: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,c2ln');
    wrapper = mount(Signature, { props: { signerName: 'Test Candidate' }, global: { stubs: { SignaturePad: true } } });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.vm.capture();
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['data:image/png;base64,c2ln']);
    await wrapper.get('input').setValue('Changed Name');
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['']);
  });
  it('resumes promptly after typing in nested content and credits only server-reported seconds', async () => {
    const post = vi.fn(async (_url, body) => ({ data: { tracking: body.active, creditedSeconds: body.active ? 7 : 0 } }));
    const onCredit = vi.fn(); let activity;
    wrapper = mount(defineComponent({ setup() { activity = useOnboardingActivity({ enabled: ref(true), token: ref('qa'), http: { post }, onCredit }); return {}; }, template: '<div><iframe /></div>' }), { attachTo: document.body });
    await flushPromises(); await vi.advanceTimersByTimeAsync(125000);
    expect(activity.tracking.value).toBe(false);
    const before = post.mock.calls.length;
    wrapper.get('iframe').element.contentDocument.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    expect(post.mock.calls.length).toBe(before + 1);
    expect(post.mock.calls.at(-1)[1].active).toBe(true);
    expect(activity.tracking.value).toBe(true);
    expect(onCredit.mock.calls.every(([seconds]) => seconds === 7)).toBe(true);
  });
  it('hides an inactive portal and requires explicit resumption', async () => {
    let idle;
    wrapper = mount(defineComponent({ setup() { idle = usePortalIdle({ timeoutMs: 20000 }); return {}; }, template: '<div />' }));
    await vi.advanceTimersByTimeAsync(20000); expect(idle.locked.value).toBe(true);
    document.dispatchEvent(new Event('input')); expect(idle.locked.value).toBe(true);
    idle.resume(); expect(idle.locked.value).toBe(false);
    await vi.advanceTimersByTimeAsync(10000); document.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(10000); expect(idle.locked.value).toBe(false);
  });
});
