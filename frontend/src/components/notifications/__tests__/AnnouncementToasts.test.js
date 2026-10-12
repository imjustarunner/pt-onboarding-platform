import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AnnouncementToasts from '../AnnouncementToasts.vue';
const row = (id, patch = {}) => ({ id, title: `Closure ${id}`, message: 'Offices are closed today. We return Monday.', display_type: 'toast', publish_status: 'published', starts_at: '2026-11-26T07:00:00Z', ends_at: '2026-11-30T07:00:00Z', ...patch });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-26T12:00:00Z')); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });
it('shows live toasts only, queues notices, and persists dismissal through polling and remount', async () => {
  const loadItems = vi.fn().mockResolvedValue([row(1), row(2), row(3, { display_type: 'splash' }), row(4, { publish_status: 'draft' }), row(5, { starts_at: '2026-12-01T07:00:00Z' })]);
  const recordEvent = vi.fn();
  let w = mount(AnnouncementToasts, { props: { loadItems, recordEvent, storageKey: 'user:1:agency:7' } }); await flushPromises();
  expect(w.text()).toContain('Closure 1'); expect(w.text()).toContain('1 more announcement');
  expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'impression');
  await w.get('button').trigger('click'); await vi.advanceTimersByTimeAsync(60000);
  expect(w.text()).toContain('Closure 2'); expect(w.text()).not.toContain('Closure 1'); w.unmount();
  w = mount(AnnouncementToasts, { props: { loadItems, storageKey: 'user:1:agency:7' } }); await flushPromises();
  expect(w.text()).toContain('Closure 2');
  await w.setProps({ storageKey: 'user:2:agency:7' }); await flushPromises(); expect(w.text()).toContain('Closure 1');
  w.unmount(); const count = loadItems.mock.calls.length; await vi.advanceTimersByTimeAsync(60000); expect(loadItems).toHaveBeenCalledTimes(count);
});
it('removes expired toasts even when refreshing fails', async () => {
  const loadItems = vi.fn().mockResolvedValue([row(1, { ends_at: '2026-11-26T12:00:02Z' })]);
  const w = mount(AnnouncementToasts, { props: { loadItems, storageKey: 'user:1' } }); await flushPromises();
  expect(w.find('aside').exists()).toBe(true); loadItems.mockRejectedValue(new Error('offline'));
  await vi.advanceTimersByTimeAsync(2000); expect(w.find('aside').exists()).toBe(false); w.unmount();
});
it('ignores in-flight responses after switching agency', async () => {
  let resolveFirst;
  const loadItems = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValue([row(2)]);
  const w = mount(AnnouncementToasts, { props: { loadItems, storageKey: 'agency:1' } });
  await w.setProps({ storageKey: 'agency:2' }); await flushPromises();
  expect(w.text()).toContain('Closure 2'); resolveFirst([row(1)]); await flushPromises();
  expect(w.text()).not.toContain('Closure 1'); w.unmount();
});
it('resurfaces a revised notice and escapes announcement content', async () => {
  const loadItems = vi.fn().mockResolvedValue([row(1)]);
  const w = mount(AnnouncementToasts, { props: { loadItems, storageKey: 'user:1' } }); await flushPromises();
  await w.get('button').trigger('click');
  loadItems.mockResolvedValue([row(1, { updated_at: '2026-11-26T12:01:00Z', message: '<script>unsafe()</script>', delivery_scope: 'auricwell_support' })]);
  await vi.advanceTimersByTimeAsync(60000); expect(w.text()).toContain('AuricWell support');
  expect(w.text()).toContain('<script>'); expect(w.find('script').exists()).toBe(false); w.unmount();
});
