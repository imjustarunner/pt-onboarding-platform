import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), user: { id: 3, role: 'admin' } }));
vi.mock('../../../../services/api', () => ({ default: { get: m.get, post: m.post, put: m.put } }));
vi.mock('../../../../store/auth', () => ({ useAuthStore: () => ({ user: m.user }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: vi.fn() }) }));
import SchoolStaffPanel from '../SchoolStaffPanel.vue';
const staff = { id: 42, first_name: 'School', last_name: 'Contact', email: 'contact@school.example', status: 'ACTIVE_EMPLOYEE', is_school_admin: true, is_active: false, phone_number: '303-555-0123' };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  m.get.mockResolvedValue({ data: { staff: [staff], schoolPhoneNumber: '303-555-0100' } });
  m.post.mockResolvedValue({ data: {} }); m.put.mockResolvedValue({ data: {} });
});
async function open() {
  const wrapper = mount(SchoolStaffPanel, { props: { schoolOrganizationId: 20 }, global: { stubs: { 'router-link': true } } });
  await flushPromises(); return wrapper;
}
describe('school staff phone defaults', () => {
  it.each(['', '303-555-0123'])('adds staff with an optional override (%s)', async phone => {
    const wrapper = await open();
    const form = wrapper.find('.ssp-add-section');
    expect(form.text()).toContain('Leave blank to use the school main number: 303-555-0100');
    expect(form.find('input[type="tel"]').element.value).toBe('');
    await form.find('input[type="email"]').setValue('new@school.example');
    await form.find('input[type="tel"]').setValue(phone);
    await form.findAll('button').find(b => b.text() === 'Add staff').trigger('click');
    await flushPromises();
    expect(m.post).toHaveBeenCalledWith('/school-portal/20/school-staff', expect.objectContaining({ phoneNumber: phone || undefined }));
    expect(form.find('input[type="tel"]').element.value).toBe('');
    wrapper.unmount();
  });
  it('lets an existing staff override be cleared to restore the school default', async () => {
    const wrapper = await open();
    await wrapper.find('button[title="Edit"]').trigger('click');
    const modal = wrapper.find('.ssp-modal');
    expect(modal.find('input[type="tel"]').element.value).toBe('303-555-0123');
    await modal.find('input[type="tel"]').setValue('');
    await modal.findAll('button').find(b => b.text() === 'Save').trigger('click');
    await flushPromises();
    expect(m.put).toHaveBeenCalledWith('/school-portal/20/school-staff/42', expect.objectContaining({ phoneNumber: '' }));
    wrapper.unmount();
  });
  it('shows the school number even before the first staff member is added', async () => {
    m.get.mockResolvedValue({ data: { staff: [], schoolPhoneNumber: '303-555-0100' } });
    const wrapper = await open();
    expect(wrapper.find('.ssp-add-section').text()).toContain('303-555-0100');
    wrapper.unmount();
  });

});
