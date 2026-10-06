import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PostSchoolEventModal from '../PostSchoolEventModal.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { role: 'admin' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ agencies: [] }) }));
vi.mock('../../../services/schoolCoverageApi', () => ({ fetchProviderCoverageSummary: vi.fn() }));
const wrappers = [];
function render(props) {
  const wrapper = mount(PostSchoolEventModal, { props, global: { stubs: { Teleport: true } } });
  wrappers.push(wrapper);
  return wrapper;
}
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()); vi.clearAllMocks(); vi.useRealTimers(); });

describe('important date form', () => {
  it('posts an all-day fall break to the whole district without staffing', async () => {
    vi.useFakeTimers();
    api.post.mockResolvedValue({ data: { createdCount: 1, schoolCount: 4, isDistrictImportantDate: true } });
    const w = render({ agencyId: 1, districtName: 'D11', initialCategory: 'day_off', initialDate: '2026-10-19' });
    await flushPromises();
    expect(w.text()).toContain('Add district important date');
    expect(w.findAll('input[type="time"]')).toHaveLength(0);
    await w.find('input[type="text"]').setValue('Fall Break');
    await w.findAll('input[type="date"]')[1].setValue('2026-10-23');
    await w.find('.btn-primary').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/school-portal/school-events/district', expect.objectContaining({
      districtName: 'D11', title: 'Fall Break', category: 'day_off',
      startsAt: '2026-10-19T06:00:00.000Z', endsAt: '2026-10-24T05:59:59.000Z',
      outreachTableInvited: false, employeeReportTime: null
    }));
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('minProvidersPerSession');
    expect(w.text()).toContain('One district important date added, visible to 4 schools.');
  });
  it('hydrates and preserves the end date while editing all district copies', async () => {
    vi.useFakeTimers();
    api.put.mockResolvedValue({ data: { updatedCount: 4 } });
    const w = render({ agencyId: 1, schoolOrganizationId: 2, editEvent: {
      id: 10, category: 'day_off', title: 'Fall Break', districtBroadcastId: 'broadcast-1',
      startsAt: '2026-10-19T06:00:00.000Z', endsAt: '2026-10-24T05:59:59.000Z'
    } });
    await flushPromises();
    expect(w.findAll('input[type="date"]')[1].element.value).toBe('2026-10-23');
    await w.find('.btn-primary').trigger('click');
    await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/school-portal/school-events/district/broadcast-1', expect.objectContaining({ endsAt: '2026-10-24T05:59:59.000Z' }));
  });
  it('rejects an end date before the start date without saving', async () => {
    const w = render({ agencyId: 1, districtName: 'D11', initialCategory: 'day_off', initialDate: '2026-10-19' });
    await w.find('input[type="text"]').setValue('Fall Break');
    await w.findAll('input[type="date"]')[1].setValue('2026-10-18');
    await w.find('.btn-primary').trigger('click');
    expect(w.find('.error').text()).toContain('end date on or after');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('edits one shared district date with no per-school apply option', async () => {
    vi.useFakeTimers();
    api.put.mockResolvedValue({ data: { updatedCount: 1 } });
    const w = render({ agencyId: 1, editEvent: {
      id: 10, category: 'day_off', title: 'Fall Break', districtName: 'D11',
      isDistrictImportantDate: true, districtBroadcastId: 'shared-date',
      startsAt: '2026-10-19T06:00:00.000Z', endsAt: '2026-10-24T05:59:59.000Z'
    } });
    await flushPromises();
    expect(w.text()).toContain('one shared district date');
    expect(w.find('.district-wide').exists()).toBe(false);
    expect(w.find('option[value="open_house"]').exists()).toBe(false);
    await w.find('.btn-primary').trigger('click');
    await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/school-portal/school-events/district/shared-date', expect.objectContaining({ endsAt: '2026-10-24T05:59:59.000Z' }));
  });
  it('deletes a shared date through the district endpoint with a district-wide warning', async () => {
    vi.useFakeTimers();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockResolvedValue({ data: { deleted: true } });
    const w = render({ agencyId: 1, editEvent: { id: 10, category: 'day_off', title: 'Fall Break', isDistrictImportantDate: true, districtBroadcastId: 'shared-date' } });
    await flushPromises();
    await w.find('.btn-danger').trigger('click');
    await flushPromises();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('entire district'));
    expect(api.delete).toHaveBeenCalledWith('/school-portal/school-events/district-dates/10', { params: { agencyId: 1 } });
    confirm.mockRestore();
  });

});
