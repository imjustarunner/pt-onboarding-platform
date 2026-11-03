import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ModuleAssignmentDialog from '../../admin/ModuleAssignmentDialog.vue';
import UserSpecificDocumentUploadDialog from '../../documents/UserSpecificDocumentUploadDialog.vue';
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 21, role: 'supervisor' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ userAgencies: [{ id: 999, name: 'Another agency' }], fetchUserAgencies: vi.fn() }) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
import api from '../../../services/api';

describe('supervision assignment organization scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: [{ id: 81, first_name: 'DEMO', last_name: 'Provider', email: 'demo@example.com' }] });
    api.post.mockImplementation(path => Promise.resolve({ data: { id: path === '/tasks' ? 700 : 900 } }));
    api.put.mockResolvedValue({ data: {} });
  });
  it.each([450, null])('scopes individual module assignments when agencyId is %s', async agencyId => {
    const wrapper = mount(ModuleAssignmentDialog, { props: { module: { id: 9, title: 'DEMO module' }, preSelectedUserId: 81, ...(agencyId ? { agencyId } : {}) } });
    await flushPromises();
    await wrapper.find('form').trigger('submit'); await flushPromises();
    const [path, task] = api.post.mock.calls[0];
    expect(path).toBe('/tasks'); expect(task.assignedToUserId).toBe(81);
    if (agencyId) expect(task.assignedToAgencyId).toBe(450); else expect(task).not.toHaveProperty('assignedToAgencyId');
    expect(wrapper.emitted('assigned')).toHaveLength(1);
  });
  it.each([450, null])('scopes uploaded document tasks when agencyId is %s', async agencyId => {
    const wrapper = mount(UserSpecificDocumentUploadDialog, { props: { userId: 81, ...(agencyId ? { agencyId } : {}) } });
    const input = wrapper.find('input[type=file]');
    Object.defineProperty(input.element, 'files', { value: [new File(['DEMO QA PDF'], 'DEMO-policy.pdf', { type: 'application/pdf' })] });
    await input.trigger('change'); await wrapper.find('form').trigger('submit'); await flushPromises();
    const [path, task] = api.post.mock.calls[0];
    expect(path).toBe('/tasks'); expect(task.assignedToUserId).toBe(81); expect(task.taskType).toBe('document');
    if (agencyId) expect(task.assignedToAgencyId).toBe(450); else expect(task).not.toHaveProperty('assignedToAgencyId');
    expect(api.post.mock.calls[1][0]).toBe('/user-specific-documents/upload');
    expect(api.post.mock.calls[1][1].get('taskId')).toBe('700');
    expect(api.put).toHaveBeenCalledWith('/tasks/700', { referenceId: 900 });
    expect(wrapper.emitted('uploaded')).toHaveLength(1);
  });
});
