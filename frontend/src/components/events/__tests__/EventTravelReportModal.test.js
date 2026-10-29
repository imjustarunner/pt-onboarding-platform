import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import EventTravelReportModal from '../EventTravelReportModal.vue';
import api from '../../../services/api';
import { eventTravelDefaultForm } from '../../../navigation/eventTravel';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
let wrapper, options;
const report = { eventId: 8, eventTitle: 'School fair', eventDate: '2026-10-29', eventAddress: '10 Event St', timezone: 'America/Denver',
  totalMinutes: 40, totalMiles: 10, segments: [], flags: [], form: { ...eventTravelDefaultForm(), materialsPickup: 'already_had', materialsReturn: 'kept', eventDate: '2026-10-29' } };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-31T20:00:00Z'));
  options = { homeAddress: '40 Home St, Denver, CO', events: [{ id: 8, title: 'School fair', address: '10 Event St', dates: ['2026-10-29'] }], offices: [{ id: 4, name: 'Main office', address: '20 Office St' }], schools: [], reports: [] };
  api.get.mockImplementation(async () => ({ data: options })); api.post.mockImplementation(async url => ({ data: url.endsWith('/preview') ? report : { id: 66, report } }));
});
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); vi.useRealTimers(); });
async function open(props = {}) { wrapper = mount(EventTravelReportModal, { props: { agencyId: 2, ...props }, global: { stubs: { Teleport: true } } }); await flushPromises(); return wrapper; }
const submitStep = async () => { await wrapper.get('form').trigger('submit'); await flushPromises(); };
async function chooseEvent() { await wrapper.get('select').setValue(8); await submitStep(); }
async function alreadyHadMaterials() { await wrapper.findAll('select')[0].setValue('already_had'); await wrapper.findAll('select')[1].setValue('kept'); await submitStep(); }
async function times() {
  const fields = wrapper.findAll('.etr-leg input[type="datetime-local"]');
  for (let i = 0; i < fields.length; i++) await fields[i].setValue(`2026-10-29T${i < 2 ? '09' : '15'}:${i % 2 ? '20' : '00'}`);
}
describe('Event travel reimbursement wizard', () => {
  it('opens a requested assigned event/date and preselects the employee’s approved mileage for time-only reporting', async () => {
    options.approvedMileageClaims = [{ id: 193, drive_date: '2026-10-29', applied_amount: '9.66', end_location: 'School fair' }];
    await open({ initialEventId: 8, initialEventDate: '2026-10-29', initialMileageClaimId: 193 });
    expect(wrapper.get('select[aria-label="Assigned event"]').element.value).toBe('8');
    expect(wrapper.get('select[aria-label="Event date"]').element.value).toBe('2026-10-29');
    expect(wrapper.get('select[aria-label="Existing mileage reimbursement"]').element.value).toBe('193');
    expect(wrapper.text()).toContain('no additional mileage claim will be created');
    await submitStep(); await alreadyHadMaterials(); await times(); await submitStep();
    expect(api.post).toHaveBeenCalledWith('/me/company-events/8/travel-report/preview', expect.objectContaining({ existingMileageClaimId: 193 }));
  });
  it('does not accept a link to an unassigned event or an unavailable mileage reimbursement', async () => {
    await open({ initialEventId: 999, initialEventDate: '2026-10-29', initialMileageClaimId: 193 });
    expect(wrapper.text()).toContain('not available for your account');
    expect(wrapper.get('select[aria-label="Assigned event"]').element.value).toBe('');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('prefills home and event addresses without asking exception checkbox questions', async () => {
    await open(); await chooseEvent();
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0);
    await alreadyHadMaterials();
    expect(wrapper.get('select[aria-label="Where did you leave from?"]').element.value).toBe('home');
    expect(wrapper.get('select[aria-label="Where did you go after the event / materials dropoff?"]').element.value).toBe('home');
    expect(wrapper.text()).toContain('40 Home St, Denver, CO');
    expect(wrapper.findAll('.etr-route-address').map(el => el.text())).toEqual(['40 Home St, Denver, CO → 10 Event St', '10 Event St → 40 Home St, Denver, CO']);
    expect(wrapper.text()).toContain('Time spent collecting, loading, or returning materials');
  });
  it('requires the coordinator to save a missing event address instead of asking employees to type it', async () => {
    options.events[0].address = ''; await open(); await wrapper.get('select').setValue(8);
    expect(wrapper.text()).toContain('Your coordinator needs to save the venue address');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    await submitStep(); expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Which event did you work?');
  });
  it('lists assigned events and submits one combined report after review and attestation', async () => {
    await open(); expect(api.get).toHaveBeenCalledWith('/me/company-events/travel-options', { params: { agencyId: 2 } });
    expect(wrapper.text()).toContain('School fair'); await chooseEvent(); expect(wrapper.text()).toContain('What happened with the materials?');
    await alreadyHadMaterials(); expect(wrapper.text()).toContain('Your actual trips'); await times(); await submitStep();
    expect(api.post).toHaveBeenCalledWith('/me/company-events/8/travel-report/preview', expect.objectContaining({ eventDate: '2026-10-29', materialsPickup: 'already_had', officeLocationId: 4 }));
    expect(wrapper.text()).toContain('Review your report'); expect(api.post).toHaveBeenCalledTimes(1);
    await submitStep(); expect(api.post).toHaveBeenCalledTimes(1);
    await wrapper.get('input[type="checkbox"]').setValue(true); await submitStep();
    expect(api.post).toHaveBeenLastCalledWith('/me/company-events/8/travel-report', expect.objectContaining({ attestation: true, intervals: { 'outbound-0': expect.objectContaining({ startedAt: new Date('2026-10-29T09:00').toISOString() }), 'inbound-0': expect.any(Object) } }));
    expect(wrapper.text()).toContain('Report submitted'); expect(wrapper.emitted('submitted')[0][0].id).toBe(66);
    expect(api.post.mock.calls.some(([url]) => url.includes('/time-claims') || url.includes('/mileage-claims'))).toBe(false);
  });
  it('builds office stops for pickup and dropoff without charging the whole route as a round trip', async () => {
    await open(); await chooseEvent();
    await wrapper.findAll('select')[0].setValue('before_event');
    await wrapper.findAll('select')[3].setValue('after_event');
    await submitStep();
    expect(wrapper.findAll('.etr-leg input[type="datetime-local"]')).toHaveLength(8);
    expect(wrapper.text()).toContain('Home → Main office'); expect(wrapper.text()).toContain('Main office → School fair');
    expect(wrapper.text()).toContain('School fair → Main office'); expect(wrapper.text()).toContain('Main office → Home');
  });
  it('keeps the completed inputs available when preview fails', async () => {
    await open(); await chooseEvent(); await alreadyHadMaterials(); await times();
    api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Correct your event checkout first' } } } }); await submitStep();
    expect(wrapper.text()).toContain('Correct your event checkout first'); expect(wrapper.findAll('input[type="datetime-local"]')[0].element.value).toBe('2026-10-29T09:00');
  });
  it('opens an existing report for corrections with its revision, instead of creating a duplicate', async () => {
    options.reports = [{ id: 66, eventId: 8, eventDate: '2026-10-29', revision: 3, locked: false, report }];
    await open(); await wrapper.get('select').setValue(8);
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    await wrapper.findAll('button').find(b => b.text() === 'Open to review or correct').trigger('click');
    await submitStep(); await times(); await submitStep();
    expect(api.post).toHaveBeenLastCalledWith('/me/company-events/8/travel-report/preview', expect.objectContaining({ expectedRevision: 3 }));
  });
  it('shows an approved report without offering an independent time or mileage edit', async () => {
    options.reports = [{ id: 66, eventId: 8, eventDate: '2026-10-29', revision: 3, locked: true, report }];
    await open(); await wrapper.get('select').setValue(8); await wrapper.findAll('button').find(b => b.text() === 'View report').trigger('click');
    expect(wrapper.text()).toContain('Submitted report'); expect(wrapper.find('button[type="submit"]').exists()).toBe(false); expect(api.post).not.toHaveBeenCalled();
  });
  it('provides an empty state when there are no assignments', async () => {
    options.events = []; await open(); expect(wrapper.text()).toContain('No assigned events'); expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
  });
});

it('identifies the exact reversed trip before an API call and retains the entries',async()=>{
 await open();await chooseEvent();await alreadyHadMaterials();await times();
 const fields=wrapper.findAll('.etr-leg input[type="datetime-local"]');
 await fields[1].setValue('2026-10-29T08:20');await submitStep();
 expect(wrapper.text()).toContain('To the event (home → event): arrival must be after departure');
 expect(api.post).not.toHaveBeenCalled();expect(fields[1].element.value).toBe('2026-10-29T08:20');
});

it('updates multi-school travel fields when actual stops are skipped or reordered', async () => {
  options.events[0].outreachTripId=3;
  options.events[0].outreachStops=[{id:10,name:'First school',address:'First address'},{id:11,name:'Second school',address:'Second address'},{id:12,name:'Third school',address:'Third address'}];
  await open(); await chooseEvent(); await alreadyHadMaterials();
  expect(wrapper.findAll('.etr-leg')).toHaveLength(4);
  const stopChecks=wrapper.findAll('input[type="checkbox"]');
  await stopChecks[1].setValue(false); await flushPromises();
  expect(wrapper.findAll('.etr-leg')).toHaveLength(3);
  const up=wrapper.findAll('button').find(b=>b.text()==='Move up');
  await up.trigger('click'); await flushPromises();
  const labels=wrapper.findAll('.etr-leg strong').map(el=>el.text());
  expect(labels[0]).toBe('Home → Third school');
  expect(labels[1]).toBe('Third school → First school');
  expect(wrapper.findAll('.etr-leg input[type="datetime-local"]')).toHaveLength(6);
});
