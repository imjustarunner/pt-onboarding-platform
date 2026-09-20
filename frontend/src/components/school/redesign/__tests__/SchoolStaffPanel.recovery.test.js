import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), user: { id: 3, role: 'school_staff' } }));
vi.mock('../../../../services/api', () => ({ default: { get: m.get, post: m.post } }));
vi.mock('../../../../store/auth', () => ({ useAuthStore: () => ({ user: m.user }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: vi.fn() }) }));
import SchoolStaffPanel from '../SchoolStaffPanel.vue';
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  m.get.mockResolvedValue({ data: [{ id: 42, first_name: 'Eric', last_name: 'Sloan', email: 'eric@school.example', status: 'ACTIVE_EMPLOYEE' }] });
  m.post.mockResolvedValue({ data: { emailSent: true } });
});
async function open() {
  const wrapper = mount(SchoolStaffPanel, { props: { schoolOrganizationId: 20 }, global: { stubs: { 'router-link': true } } });
  await flushPromises();
  await wrapper.findAll('button').find((b) => b.text() === 'Send recovery email').trigger('click');
  return wrapper;
}
describe('school staff recovery email', () => {
  it('sends only after an explicit click and explains that recovery is optional', async () => {
    const wrapper = await open();
    expect(m.post).not.toHaveBeenCalled();
    const modal = wrapper.find('.ssp-modal');
    expect(modal.text()).toContain('They can ignore the email');
    expect(modal.text()).toContain('save a new password');
    expect(modal.text()).not.toContain('Generate temporary password');
    expect(modal.text()).not.toContain('Copy reset link');
    await modal.findAll('button').find((b) => b.text() === 'Send recovery email').trigger('click');
    await flushPromises();
    expect(m.post).toHaveBeenCalledExactlyOnceWith('/school-portal/20/school-staff/42/issue-reset-link', { sendEmail: true });
    expect(modal.text()).toContain('No password change is required');
    wrapper.unmount();
  });
  it('sends nothing when the staff member cancels', async () => {
    const wrapper = await open();
    await wrapper.find('.ssp-modal').findAll('button').find((b) => b.text() === 'Cancel').trigger('click');
    expect(m.post).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('shows send errors without claiming success', async () => {
    m.post.mockRejectedValue({ response: { data: { error: { message: 'Email delivery unavailable' } } } });
    const wrapper = await open();
    await wrapper.find('.ssp-modal').findAll('button').find((b) => b.text() === 'Send recovery email').trigger('click');
    await flushPromises();
    expect(wrapper.find('.ssp-modal').text()).toContain('Email delivery unavailable');
    expect(wrapper.find('.ssp-modal').text()).not.toContain('Recovery email sent.'); wrapper.unmount();
  });
});
