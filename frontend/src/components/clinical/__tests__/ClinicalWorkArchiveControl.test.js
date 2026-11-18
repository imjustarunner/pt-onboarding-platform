import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Control from '../ClinicalWorkArchiveControl.vue';
import api from '../../../services/api';
const state = vi.hoisted(() => ({ role: 'admin', previewMode: false }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 1, role: state.role } }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ meta: { auricwellPreview: state.previewMode } }) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../utils/noteAidWorkQueue.js', () => ({ fetchWorkQueueFromApi: vi.fn() }));
const target = { type: 'claim', id: 30 };
const preview = { version: 'a'.repeat(64), summary: { counts: { sessions: 1, claims: 1, notes: 1, myWork: 1 }, sessions: [{ id: 10, serviceCode: '90837', dateOfService: '2026-11-18' }] } };
let wrapper;
const button = text => wrapper.findAll('button').find(node => node.text().includes(text));
beforeEach(() => {
  state.role = 'admin'; state.previewMode = false; vi.clearAllMocks();
  api.post.mockResolvedValue({ data: preview }); api.get.mockResolvedValue({ data: { items: [] } });
});
afterEach(() => wrapper?.unmount());
function mountControl(props = {}) { wrapper = mount(Control, { props: { agencyId: 2, target, ...props }, global: { stubs: { Teleport: true } } }); }
it.each(['provider', 'support', 'assistant'])('does not offer %s an archive action', role => {
  state.role = role; mountControl(); expect(wrapper.find('button').exists()).toBe(false);
});
it('does not offer archive actions in preview mode', () => {
  state.previewMode = true; mountControl(); expect(wrapper.find('button').exists()).toBe(false);
});
it('previews without mutating records and requires reason plus explicit review', async () => {
  mountControl(); await button('Archive test session').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/clinical-data/work-archives/preview', { agencyId: 2, target }, { skipGlobalLoading: true });
  expect(wrapper.text()).toContain('1 claims');
  expect(button('Archive reviewed records').element.disabled).toBe(true);
  await wrapper.find('textarea').setValue('Testing session from the initial rollout');
  expect(button('Archive reviewed records').element.disabled).toBe(true);
  await wrapper.find('input[type=checkbox]').setValue(true);
  expect(button('Archive reviewed records').element.disabled).toBe(false);
  api.post.mockResolvedValueOnce({ data: { archiveId: 7, summary: preview.summary } });
  await button('Archive reviewed records').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenLastCalledWith('/clinical-data/work-archives', { agencyId: 2, target, version: preview.version,
    reason: 'Testing session from the initial rollout', confirmation: 'ARCHIVE TEST RECORDS' }, { skipGlobalLoading: true });
  expect(wrapper.emitted('changed')).toHaveLength(1);
  expect(wrapper.text()).toContain('history is retained');
});
it('reports protected claim evidence without providing a destructive fallback', async () => {
  api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Submission history exists.' } } } });
  mountControl(); await button('Archive test session').trigger('click'); await flushPromises();
  expect(wrapper.find('[role=alert]').text()).toContain('Submission history');
  expect(button('Archive reviewed records')).toBeUndefined();
  expect(wrapper.text()).not.toContain('Delete');
});
it('preserves a stale-preview error and requires another explicit confirmation', async () => {
  mountControl(); await button('Archive test session').trigger('click'); await flushPromises();
  await wrapper.find('textarea').setValue('Testing session from the initial rollout');
  await wrapper.find('input[type=checkbox]').setValue(true);
  api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'The records changed. Refresh and review them again.' } } } });
  await button('Archive reviewed records').trigger('click'); await flushPromises();
  expect(wrapper.find('[role=alert]').text()).toContain('records changed');
  expect(wrapper.find('input[type=checkbox]').element.checked).toBe(false);
  expect(wrapper.emitted('changed')).toBeUndefined();
});
it('shows archived history and restores a group only with a reason in the same organization', async () => {
  api.get.mockResolvedValueOnce({ data: { items: [{ id: 7, reason: 'Testing rollout', archivedAt: '2026-11-18', archivedBy: 'Admin', clientName: 'Test client', summary: preview.summary }] } });
  mountControl({ target: null }); await button('Archived test records').trigger('click'); await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/clinical-data/work-archives', { params: { agencyId: 2 }, skipGlobalLoading: true });
  expect(wrapper.text()).toContain('Testing rollout');
  expect(button('Restore this group').element.disabled).toBe(true);
  await wrapper.find('textarea').setValue('Reviewed and ready to resume this session');
  api.post.mockResolvedValueOnce({ data: { restored: true } });
  await button('Restore this group').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenLastCalledWith('/clinical-data/work-archives/7/restore', { agencyId: 2, reason: 'Reviewed and ready to resume this session' }, { skipGlobalLoading: true });
  expect(wrapper.text()).toContain('Normal review and billing requirements still apply');
});
