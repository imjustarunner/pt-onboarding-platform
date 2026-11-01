import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const state = vi.hoisted(() => ({ role: 'support', get: vi.fn(), post: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'demo' }, query: { agencyId: '450' }, path: '/demo/admin/audit-center' }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { role: state.role } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ agencies: [{ id: 450, name: 'Demo' }], userAgencies: [{ id: 450, name: 'Demo' }], currentAgency: { id: 450 }, fetchAgencies: vi.fn(), fetchUserAgencies: vi.fn() }) }));
vi.mock('../../../services/api', () => ({ default: { get: state.get, post: state.post } }));
vi.mock('../../../components/admin/SecurityEvidencePanel.vue', () => ({ default: { template: '<div />' } }));
import View from '../AuditCenterView.vue';
beforeEach(() => {
  vi.clearAllMocks(); state.role = 'support'; state.post.mockResolvedValue({});
  state.get.mockResolvedValue({ data: { items: [{ id: 7, log_type: 'user_activity', user_id: 1439, user_first_name: 'Alex', action_type: 'clinical_note_viewed', metadata: { clientId: 2297, noteId: 444 }, details_restricted: true, target_label: 'Note #444', link_access: 'clinical_access_required' }], pagination: { total: 1 }, diagnostics: { disabled_sources: [] } } });
});
it('opens support directly in agency audit review with useful record IDs and clear clinical restrictions', async () => {
  const wrapper = mount(View, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } }); await flushPromises();
  expect(state.get).toHaveBeenCalledWith('/activity-log/agency/450', expect.anything());
  expect(wrapper.text()).toContain('Note #444 · Clinical access required'); expect(wrapper.text()).toContain('noteId: 444');
  expect(wrapper.text()).not.toContain('Activity Data'); expect(wrapper.text()).not.toContain('Platform sessions');
  expect(wrapper.find('a[href*="clinical-note-generator"]').exists()).toBe(false);
  await wrapper.find('input[placeholder="Optional client ID"]').setValue('2297');
  await wrapper.findAll('button').find((button) => button.text() === 'Refresh').trigger('click'); await flushPromises();
  expect(state.get).toHaveBeenLastCalledWith('/activity-log/agency/450', expect.objectContaining({ params: expect.objectContaining({ clientId: 2297 }) })); wrapper.unmount();
});
it('warns that missing log sources prevent a completeness conclusion', async () => {
  state.get.mockResolvedValue({ data: { items: [], pagination: {}, diagnostics: { disabled_sources: [{ source: 'client_access' }] } } });
  const wrapper = mount(View); await flushPromises(); expect(wrapper.text()).toContain('Incomplete coverage: client_access'); wrapper.unmount();
});
