import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const http = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: http }));
import AccessSetup from '../OnboardingAccessSetup.vue';
let wrapper;
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); });
describe('optional onboarding accounts', () => {
  it('defaults Workspace and TherapyNotes off while keeping Grasshopper fields', async () => {
    http.get.mockResolvedValue({ data: { onboarding: { credentials: {} } } });
    http.patch.mockResolvedValue({ data: {} });
    wrapper = mount(AccessSetup, { props: { userId: 2 } }); await flushPromises();
    expect(wrapper.findAll('input[type=checkbox]').every(input => !input.element.checked)).toBe(true);
    expect(wrapper.text()).toContain('Grasshopper extension'); expect(wrapper.text()).toContain('Grasshopper PIN');
    expect(wrapper.text()).not.toContain('Workspace temporary password'); expect(wrapper.text()).not.toContain('TherapyNotes username');
    await wrapper.findAll('input[type=checkbox]')[1].setValue(true);
    expect(wrapper.text()).toContain('TherapyNotes username');
    await wrapper.get('input[name="employee-2-therapynotesLogin"]').setValue('devon');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(http.patch).toHaveBeenCalledWith('/users/2/lifecycle/credentials', expect.objectContaining({ workspaceEnabled: false, therapynotesEnabled: true, therapynotesLogin: 'devon' }));
    expect(http.patch.mock.calls[0][1]).not.toHaveProperty('workspaceTempPassword');
  });
  it('does not erase existing credentials when an account is disabled', async () => {
    http.get.mockResolvedValue({ data: { onboarding: { credentials: { workspaceEnabled: true, workspaceTempPassword: 'saved-secret' } } } });
    http.patch.mockResolvedValue({ data: {} });
    wrapper = mount(AccessSetup, { props: { userId: 2 } }); await flushPromises();
    await wrapper.findAll('input[type=checkbox]')[0].setValue(false);
    await wrapper.vm.save();
    expect(http.patch.mock.calls[0][1]).not.toHaveProperty('workspaceTempPassword');
    expect(http.patch.mock.calls[0][1].workspaceEnabled).toBe(false);
  });
});
