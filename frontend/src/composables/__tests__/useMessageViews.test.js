import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessageViews } from '../useMessageViews';
import api from '../../services/api';
vi.mock('../../services/api', () => ({ default: { post: vi.fn() } }));
let wrapper, observer, threadId, enabled, messages;
let focused = true, visibility = 'visible';
class Observer {
  constructor(callback) { this.callback = callback; observer = this; }
  observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn();
  show(element, intersectionRatio = 1) { this.callback([{ target: element, isIntersecting: intersectionRatio > 0, intersectionRatio }]); }
}
async function tick(ms = 1000) { await vi.advanceTimersByTimeAsync(ms); await flushPromises(); }
const element = () => wrapper.find('[data-pulse-message-id]').element;
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); focused = true; visibility = 'visible';
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  api.post.mockResolvedValue({ data: { ok: true } });
  threadId = ref(10); enabled = ref(true); messages = ref([{ id: 20 }]);
  wrapper = mount(defineComponent({ setup() {
    const container = ref(null);
    useMessageViews({ threadId, enabled, messages, container });
    return () => h('div', { ref: container }, messages.value.map(message => h('div', { 'data-pulse-message-id': message.id }, 'Message')));
  } }), { attachTo: document.body });
});
afterEach(() => { wrapper.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('actual message visibility', () => {
  it('does not record an offscreen message, records a visible one once, and never advances unread state', async () => {
    await tick(); expect(api.post).not.toHaveBeenCalled();
    observer.show(element()); await tick();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/chat/threads/10/views', { messageIds: [20] }, { skipGlobalLoading: true });
    observer.show(element()); await tick(); expect(api.post).toHaveBeenCalledTimes(1);
  });
  it('requires continuous visibility and cancels a brief pass through the viewport', async () => {
    observer.show(element()); await tick(400); observer.show(element(), 0); await tick();
    expect(api.post).not.toHaveBeenCalled();
    observer.show(element()); await tick(); expect(api.post).toHaveBeenCalledTimes(1);
  });
  it.each(['hidden', 'blurred', 'modal'])('does not record while %s', async state => {
    if (state === 'hidden') visibility = 'hidden';
    if (state === 'blurred') focused = false;
    if (state === 'modal') document.body.insertAdjacentHTML('beforeend', '<div aria-modal="true"></div>');
    observer.show(element()); await tick(); expect(api.post).not.toHaveBeenCalled();
  });
  it('cancels a dwell when the tab is hidden and starts fresh when focused again', async () => {
    observer.show(element()); await tick(500);
    visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); await tick();
    expect(api.post).not.toHaveBeenCalled();
    visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
    await tick(500); expect(api.post).not.toHaveBeenCalled();
    await tick(500); expect(api.post).toHaveBeenCalledTimes(1);
  });
  it('resumes tracking after a modal closes and focus returns to the chat', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div aria-modal="true"></div>');
    observer.show(element()); await tick(); expect(api.post).not.toHaveBeenCalled();
    document.querySelector('[aria-modal]').remove(); document.dispatchEvent(new Event('focusin'));
    await tick(); expect(api.post).toHaveBeenCalledTimes(1);
  });
  it('drops old queued views when changing conversations and does not track secure messages', async () => {
    observer.show(element()); await tick(810);
    threadId.value = 11; messages.value = [{ id: 30 }]; await nextTick(); await tick();
    expect(api.post).not.toHaveBeenCalled();
    observer.show(element()); await tick(); expect(api.post.mock.calls[0].slice(0, 2)).toEqual(['/chat/threads/11/views', { messageIds: [30] }]);
    enabled.value = false; await nextTick(); observer.show(element()); await tick();
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it('retries a failed record while the message remains visible', async () => {
    api.post.mockRejectedValueOnce(new Error('offline'));
    observer.show(element()); await tick();
    expect(api.post).toHaveBeenCalledTimes(1);
    await tick(16000); expect(api.post).toHaveBeenCalledTimes(2);
    observer.show(element()); await tick(); expect(api.post).toHaveBeenCalledTimes(2);
  });
});
