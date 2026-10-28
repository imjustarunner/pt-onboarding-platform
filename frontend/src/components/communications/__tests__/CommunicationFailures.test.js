import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Panel from '../CommunicationsCenterAutomation.vue';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), counts: vi.fn(), agency: { currentAgency: { id: 2 } } }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, post: m.post } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => m.agency }));
vi.mock('../../../store/communicationsCounts', () => ({ useCommunicationsCountsStore: () => ({ fetchCounts: m.counts }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn().mockResolvedValue() }) }));
let items;
const button = (w, text) => w.findAll('button').find(b => b.text() === text);
const mountPanel = () => mount(Panel, { props: { initialStatus: 'failed' }, global: { stubs: { RouterLink: true } } });
beforeEach(() => {
  vi.clearAllMocks();
  m.agency.currentAgency = { id: 2 };
  items = [{ id: 4220, channel: 'email', delivery_status: 'skipped', subject: 'Packet receipt', recipient_address: 'family@example.test', metadata: {} },
    { id: 4221, channel: 'email', delivery_status: 'bounced', subject: 'Portal alert', recipient_address: 'other@example.test', metadata: {} }];
  m.get.mockImplementation(async path => ({ data: path === '/communications/pending' ? { items: [...items], total: items.length }
    : path.endsWith('/detail') ? items.find(row => path.includes(`/${row.id}/`)) : [] }));
  m.post.mockImplementation(async (_path, { ids }) => { items = items.filter(row => !ids.includes(row.id)); return { data: { removed: ids.length } }; });
});
it('removes a skipped email from its details, closes the panel and refreshes counts', async () => {
  const w = mountPanel(); await flushPromises();
  await w.find('.cc-msg-row').trigger('click'); await flushPromises();
  await button(w, 'Remove from Failed').trigger('click'); await flushPromises();
  expect(m.post).toHaveBeenCalledWith('/communications/remove-failed', { agencyId: 2, ids: [4220] }, expect.any(Object));
  expect(w.find('.cc-detail-overlay').exists()).toBe(false);
  expect(w.findAll('.cc-msg-row')).toHaveLength(1);
  expect(w.text()).toContain('1 email removed from Failed');
  expect(w.emitted('counts-changed')).toHaveLength(1); expect(m.counts).toHaveBeenCalled();
  w.unmount();
});
it('removes selected bounced and skipped emails in one request', async () => {
  const w = mountPanel(); await flushPromises();
  await w.find('.cc-bulk-check input').setValue(true);
  await button(w, 'Remove selected from Failed').trigger('click'); await flushPromises();
  expect(m.post).toHaveBeenCalledWith('/communications/remove-failed', { agencyId: 2, ids: [4220, 4221] }, expect.any(Object));
  expect(w.findAll('.cc-msg-row')).toHaveLength(0);
  expect(w.text()).toContain('Delivery history retained'); w.unmount();
});
it('keeps the row and shows an error when removal fails', async () => {
  m.post.mockRejectedValue({ response: { data: { error: { message: 'Access denied' } } } });
  const w = mountPanel(); await flushPromises();
  await w.find('.cc-msg-row').trigger('click'); await flushPromises();
  await button(w, 'Remove from Failed').trigger('click'); await flushPromises();
  expect(w.find('.cc-detail-overlay').exists()).toBe(true);
  expect(w.text()).toContain('Access denied'); expect(m.counts).not.toHaveBeenCalled(); w.unmount();
});
it.each(['sent', 'pending'])('does not offer failed-list removal for %s mail', async delivery_status => {
  items = [{ ...items[0], delivery_status }];
  const w = mountPanel(); await flushPromises();
  await w.find('.cc-msg-row').trigger('click'); await flushPromises();
  expect(button(w, 'Remove from Failed')).toBeUndefined(); w.unmount();
});
