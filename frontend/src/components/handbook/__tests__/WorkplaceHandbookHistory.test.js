import { it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
import api from '../../../services/api';
import History from '../WorkplaceHandbookHistory.vue';
const months = [{ id: 2, title: 'November updates', period_label: 'November 2026', availability: 'Draft · Not published', entry_count: 3 }, { id: 1, title: 'October updates', period_label: 'October 2026', availability: 'Communicated update', entry_count: 1 }];
beforeEach(() => { vi.resetAllMocks(); api.get.mockImplementation(async url => ({ data: url.endsWith('/history') ? { months } : { digest: months.find(m => url.endsWith('/'+m.id)), entries: [{ id: 1, subject: 'Role development', changed_content: url.endsWith('/2') ? '<p>Proposed November changes</p><script>bad()</script>' : '<p>Original October wording</p>' }] } })); });
it('switches monthly editions without replacing October and sanitizes changes', async () => {
  const w = mount(History, { props: { agencyId: 2 } }); await flushPromises();
  expect(w.text()).toContain('Proposed changes'); expect(w.find('script').exists()).toBe(false);
  await w.findAll('nav button')[1].trigger('click'); await flushPromises();
  expect(w.text()).toContain('Original October wording'); expect(w.find('.draft-note').exists()).toBe(false);
  expect(w.findAll('nav button')[1].attributes('aria-current')).toBe('true');
  expect(api.get).toHaveBeenLastCalledWith('/provider-update/handbook/history/1', { params: { agencyId: 2 } }); w.unmount();
});
it('ignores a stale month response after selecting another edition', async () => {
  const w = mount(History, { props: { agencyId: 2 } }); await flushPromises(); let resolve;
  api.get.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await w.findAll('nav button')[0].trigger('click'); await w.findAll('nav button')[1].trigger('click'); await flushPromises();
  resolve({ data: { digest: months[0], entries: [{ id: 4, changed_content: 'Stale content' }] } }); await flushPromises();
  expect(w.text()).toContain('Original October wording'); expect(w.text()).not.toContain('Stale content'); w.unmount();
});
it('retries failures and closes without acknowledging or editing an update', async () => {
  api.get.mockRejectedValueOnce(new Error('offline'));
  const w = mount(History, { props: { agencyId: 2 } }); await flushPromises();
  expect(w.get('[role="alert"]').text()).toContain('could not be loaded'); await w.get('[role="alert"] button').trigger('click'); await flushPromises();
  expect(w.text()).toContain('November 2026'); await w.get('header button').trigger('click'); expect(w.emitted('close')).toHaveLength(1); w.unmount();
});
