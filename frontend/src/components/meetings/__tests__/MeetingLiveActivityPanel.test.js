import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: m }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 4, role: 'provider', firstName: 'Attendee' } }) }));
vi.mock('../../../composables/useMeetingI18n.js', async () => {
  const { ref } = await import('vue');
  return { t: text => text, useMeetingLang: () => ref('en'), batchTranslateMessages: vi.fn() };
});
import Panel from '../MeetingLiveActivityPanel.vue';
let wrapper;
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });

it('keeps chat editable and preserves a draft while a slow refresh is in flight', async () => {
  let finish;
  m.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  wrapper = mount(Panel, { props: { eventId: 7, joinIdentity: 'user-4' } });
  await flushPromises();
  await wrapper.get('[aria-label="Chat message"]').setValue('I have a question');
  await vi.advanceTimersByTimeAsync(12000);
  expect(m.get).toHaveBeenCalledTimes(1);
  expect(m.get.mock.calls[0][1].timeout).toBe(10000);
  expect(wrapper.get('[aria-label="Chat message"]').element.disabled).toBe(false);
  finish({ data: { activity: [] } }); await flushPromises();
  expect(wrapper.get('[aria-label="Chat message"]').element.value).toBe('I have a question');
});

it('preserves unsent text after a failed send and permits retry without rejoining', async () => {
  m.get.mockResolvedValue({ data: { activity: [] } });
  m.post.mockRejectedValueOnce(new Error('Temporarily unavailable')).mockResolvedValueOnce({ data: { id: 17 } });
  wrapper = mount(Panel, { props: { eventId: 7, joinIdentity: 'user-4' } });
  await flushPromises();
  const input = wrapper.get('[aria-label="Chat message"]');
  await input.setValue('Can you hear me?'); await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(input.element.value).toBe('Can you hear me?'); expect(input.element.disabled).toBe(false);
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(m.post.mock.calls[0][2].timeout).toBe(10000);
  expect(input.element.value).toBe(''); expect(wrapper.text()).toContain('Can you hear me?');
});
