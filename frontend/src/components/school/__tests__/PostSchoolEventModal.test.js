import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PostSchoolEventModal from '../PostSchoolEventModal.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: { users: [], providers: [] } }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
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

describe('school event fee tracking', () => {
  it('saves a paid fee and its follow-up note with the school event', async () => {
    vi.useFakeTimers();
    api.put.mockResolvedValue({ data: { id: 10 } });
    const wrapper = render({ agencyId: 1, schoolOrganizationId: 2, editEvent: {
      id: 10, category: 'open_house', title: 'Open House', requiresPayment: true, paymentAmount: 25,
      paymentPaid: false, paymentNotes: 'Waiting for payment link',
      startsAt: '2026-10-19T23:00:00.000Z', endsAt: '2026-10-20T01:00:00.000Z'
    } });
    await flushPromises();
    expect(wrapper.find('[data-testid="payment-amount"]').element.value).toBe('25');
    await wrapper.find('[data-testid="payment-paid"]').setValue(true);
    await wrapper.find('.pse-actions .btn-primary').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ requiresPayment: true, paymentAmount: 25, paymentPaid: true, paymentNotes: 'Waiting for payment link' }));
  });
});

describe('outreach venue address', () => {
  it('keeps typed venue fields during hub polling and hydrates a different event', async () => {
    const original = { id: 15, category: 'outreach', eventType: 'school_outreach', isGeneralOutreach: true,
      title: 'Testing', startsAt: '2026-10-26T23:00:00Z', endsAt: '2026-10-27T01:00:00Z' };
    const wrapper = render({ agencyId: 1, editEvent: original });
    await flushPromises();
    await wrapper.get('[aria-label="Venue name"]').setValue('Community center');
    await wrapper.get('[aria-label="Venue address"]').setValue('123 Main St, Denver, CO 80202');
    await wrapper.setProps({ editEvent: { ...original, providersAssigned: 2 } });
    expect(wrapper.get('[aria-label="Venue address"]').element.value).toBe('123 Main St, Denver, CO 80202');
    expect(wrapper.get('[aria-label="Venue name"]').element.value).toBe('Community center');
    await wrapper.setProps({ editEvent: { ...original, id: 16, eventLocationAddress: '456 Oak St, Denver, CO 80202' } });
    expect(wrapper.get('[aria-label="Venue address"]').element.value).toBe('456 Oak St, Denver, CO 80202');
  });
  const event = { id: 15, category: 'outreach', eventType: 'school_outreach', isGeneralOutreach: true,
    title: 'Testing', startsAt: '2026-10-26T23:00:00.000Z', endsAt: '2026-10-27T01:00:00.000Z' };
  it('lets a coordinator repair a missing address and retains it when reopened', async () => {
    vi.useFakeTimers();
    api.put.mockImplementation(async (url, body) => ({ data: { ...event, ...body } }));
    const wrapper = render({ agencyId: 1, editEvent: event });
    await flushPromises();
    await wrapper.get('[aria-label="Venue name"]').setValue('Community center');
    await wrapper.get('[aria-label="Venue address"]').setValue('123 Main St, Denver, CO 80202');
    await wrapper.find('.pse-actions .btn-primary').trigger('click'); await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/school-portal/school-events/district-outreach/15', expect.objectContaining({
      eventLocationName: 'Community center', eventLocationAddress: '123 Main St, Denver, CO 80202'
    }));
    const saved = wrapper.emitted('saved')[0][0];
    const reopened = render({ agencyId: 1, editEvent: saved }); await flushPromises();
    expect(reopened.get('[aria-label="Venue address"]').element.value).toBe('123 Main St, Denver, CO 80202');
  });
  it('requires the outreach address before saving, even without a venue name', async () => {
    const wrapper = render({ agencyId: 1, editEvent: event }); await flushPromises();
    await wrapper.find('.pse-actions .btn-primary').trigger('click'); await flushPromises();
    expect(wrapper.find('.error').text()).toContain('full street address');
    expect(api.put).not.toHaveBeenCalled();
  });
  it('includes the address when creating a new outreach event', async () => {
    vi.useFakeTimers(); api.post.mockResolvedValue({ data: { id: 16 } });
    const wrapper = render({ agencyId: 1, districtOutreach: true, initialCategory: 'outreach', initialDate: '2026-10-26' });
    await flushPromises();
    await wrapper.find('input[type="text"]').setValue('Community fair');
    await wrapper.get('[aria-label="Venue address"]').setValue('123 Main St, Denver, CO 80202');
    await wrapper.find('.pse-actions .btn-primary').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/school-portal/school-events/district-outreach', expect.objectContaining({ eventLocationAddress: '123 Main St, Denver, CO 80202' }));
  });
  it('does not add venue requirements to calendar-only dates', async () => {
    const wrapper = render({ agencyId: 1, districtName: 'D11', initialCategory: 'day_off' }); await flushPromises();
    expect(wrapper.find('[aria-label="Venue address"]').exists()).toBe(false);
  });
});
