import { expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrehireReferenceGate from '../PrehireReferenceGate.vue';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));

it('waits for confirmation and a successful readiness recheck before opening pre-hire', async () => {
  api.get.mockResolvedValueOnce({ data: { ready: false, sendable: 2, message: 'Send first.' } })
    .mockResolvedValueOnce({ data: { ready: true, sendable: 0 } });
  api.post.mockResolvedValueOnce({ data: { sent: [{ id: 85 }], errors: [] } });
  const wrapper = mount(PrehireReferenceGate, { props: { userId: 42, agencyId: 2, cancellable: true } });
  await flushPromises();
  expect(api.post).not.toHaveBeenCalled();
  expect(wrapper.emitted('ready')).toBeUndefined();
  await wrapper.get('.btn-primary').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/hiring/candidates/42/reference-requests/send', { onlyIfNotSent: true },
    { params: { agencyId: 2 }, skipGlobalLoading: true });
  expect(wrapper.emitted('ready')).toHaveLength(1);
  wrapper.unmount();
});
