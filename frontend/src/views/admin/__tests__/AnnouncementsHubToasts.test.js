import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ agency: { currentAgency: { id: 7 } }, auth: { user: { role: 'support' } }, get: vi.fn(), put: vi.fn(), request: vi.fn() }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mock.agency }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => mock.auth }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'itsco' } }) }));
vi.mock('../../../services/api', () => ({ default: { get: mock.get, put: mock.put, request: mock.request } }));
import AnnouncementsHub from '../AnnouncementsHubView.vue';
beforeEach(() => {
  vi.clearAllMocks(); mock.agency.currentAgency = { id: 7 }; mock.auth.user = { role: 'support' };
  mock.get.mockImplementation(async (path) => ({ data: path.endsWith('/list') ? [{ id: 42, title: 'Office closure', message: 'Closed today. Return Monday.', display_type: 'toast', status: 'scheduled', audience: 'everyone', starts_at: new Date(Date.now() + 86400000).toISOString(), ends_at: new Date(Date.now() + 2 * 86400000).toISOString() }] : path.endsWith('/users') ? [] : {} }));
  mock.put.mockResolvedValue({}); mock.request.mockResolvedValue({ data: [] });
});
it('edits a seeded toast without converting it to a banner', async () => {
  const w = mount(AnnouncementsHub, { global: { stubs: { RouterLink: true } } }); await flushPromises();
  await w.get('tbody tr').trigger('click');
  const editor = w.get('.ann-side');
  expect(editor.findAll('select').some((s) => s.element.value === 'toast')).toBe(true);
  await editor.findAll('button').find((b) => b.text() === 'Submit').trigger('click'); await flushPromises();
  expect(mock.put).toHaveBeenCalledWith('/agencies/7/announcements/42', expect.objectContaining({ display_type: 'toast' }));
  w.unmount();
});
it('offers only the support toast manager in platform context', async () => {
  mock.agency.currentAgency = null; mock.auth.user.role = 'super_admin';
  const w = mount(AnnouncementsHub, { global: { stubs: { RouterLink: true } } }); await flushPromises();
  expect(w.text()).toContain('AuricWell support announcements');
  expect(w.find('.ann-quick').exists()).toBe(false);
  expect(mock.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/platform/toast-announcements' }));
  w.unmount();
});
