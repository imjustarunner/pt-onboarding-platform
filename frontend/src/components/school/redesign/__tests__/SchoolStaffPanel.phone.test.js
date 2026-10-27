import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), user: { id: 3, role: 'admin' } }));
vi.mock('../../../../services/api', () => ({ default: { get: m.get, post: m.post, put: m.put } }));
vi.mock('../../../../store/auth', () => ({ useAuthStore: () => ({ user: m.user }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: vi.fn() }) }));
import SchoolStaffPanel from '../SchoolStaffPanel.vue';
const staff = { id: 42, first_name: 'School', last_name: 'Contact', email: 'contact@school.example', status: 'ACTIVE_EMPLOYEE', is_school_admin: true, is_active: false, phone_number: '303-555-0123' };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); m.user.role = 'admin';
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

describe('visible staff phone numbers', () => {
  it('displays an explicit override on the staff card', async () => {
    const wrapper = await open();
    expect(wrapper.find('a[href="tel:303-555-0123"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('(Staff override)');
    wrapper.unmount();
  });
  it('displays the inherited school number without creating an override', async () => {
    m.get.mockResolvedValue({ data: { staff: [{ ...staff, phone_number: null, effective_phone_number: '303-555-0100' }], schoolPhoneNumber: '303-555-0100' } });
    const wrapper = await open();
    expect(wrapper.find('a[href="tel:303-555-0100"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('(School main number)');
    await wrapper.find('button[title="Edit"]').trigger('click');
    expect(wrapper.find('.ssp-modal input[type="tel"]').element.value).toBe('');
    expect(m.put).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('restoring school staff access', () => {
  it('restores after confirmation and refreshes the account state', async () => {
    const wrapper = await open();
    expect(m.post).not.toHaveBeenCalled();
    m.post.mockResolvedValue({ data: { ok: true } });
    m.get.mockResolvedValue({ data: { staff: [{ ...staff, is_active: true }] } });
    await wrapper.findAll('button').find(b => b.text() === 'Restore account access').trigger('click');
    await flushPromises();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('password and school permissions will stay the same'));
    expect(m.post).toHaveBeenCalledExactlyOnceWith('/school-portal/20/school-staff/42/restore-access');
    expect(wrapper.text()).toContain('Account access restored.');
    expect(wrapper.findAll('button').some(b => b.text() === 'Restore account access')).toBe(false);
    wrapper.unmount();
  });
  it('does nothing when the administrator cancels', async () => {
    const wrapper = await open();
    window.confirm.mockReturnValue(false);
    await wrapper.findAll('button').find(b => b.text() === 'Restore account access').trigger('click');
    expect(m.post).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('shows a failed restoration without claiming success', async () => {
    const wrapper = await open();
    m.post.mockRejectedValue({ response: { data: { error: { message: 'School assignment no longer active.' } } } });
    await wrapper.findAll('button').find(b => b.text() === 'Restore account access').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('School assignment no longer active.');
    expect(wrapper.text()).not.toContain('Account access restored.');
    wrapper.unmount();
  });
  it('does not offer restoration to standard school staff', async () => {
    m.user.role = 'school_staff';
    const wrapper = await open();
    expect(wrapper.findAll('button').some(b => b.text() === 'Restore account access')).toBe(false);
    wrapper.unmount();
  });
});
