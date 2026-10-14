import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useInterviewQuestion } from '../useInterviewQuestion';
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('../../services/api', () => ({ default: api }));
let wrapper, state;
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); api.get.mockResolvedValue({ data: { question: { id: 0, text: '' } } }); });
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
async function open(enabled = ref(true)) {
  wrapper = mount({ setup() { state = useInterviewQuestion({ endpoint: '/interview-question', enabled }); return () => null; } });
  await flushPromises();
}
it('replaces and clears the shared question and ignores an older poll response', async () => {
  await open(); let resolve;
  api.get.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await vi.advanceTimersByTimeAsync(2000);
  api.put.mockResolvedValueOnce({ data: { question: { id: 2, text: 'New question' } } });
  await state.display('New question');
  resolve({ data: { question: { id: 1, text: 'Old question' } } }); await flushPromises();
  expect(state.question.value.text).toBe('New question');
  api.put.mockResolvedValueOnce({ data: { question: { id: 3, text: '' } } });
  await state.display(''); expect(state.question.value.text).toBe('');
  expect(api.put).toHaveBeenLastCalledWith('/interview-question', { text: '' }, expect.objectContaining({ skipGlobalLoading: true }));
});
it('stops polling and clears the question after leaving or ending access', async () => {
  const enabled = ref(false); await open(enabled); expect(api.get).not.toHaveBeenCalled();
  api.get.mockResolvedValue({ data: { question: { id: 1, text: 'Hello' } } });
  enabled.value = true; await flushPromises(); expect(state.question.value.text).toBe('Hello');
  enabled.value = false; await flushPromises(); expect(state.question.value.text).toBe('');
  await vi.advanceTimersByTimeAsync(10000); expect(api.get).toHaveBeenCalledTimes(1);
});
it('retains the current question and reports a failed replacement', async () => {
  api.get.mockResolvedValue({ data: { question: { id: 1, text: 'Current question' } } });
  await open(); api.put.mockRejectedValue(new Error('offline')); await state.display('Replacement');
  expect(state.question.value.text).toBe('Current question'); expect(state.error.value).toContain('not updated');
});
