import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import OfficeScheduleView from '../OfficeScheduleView.vue';
import api from '../../services/api';
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { officeId: '1' }, params: { organizationSlug: 'one' } }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 10, role: 'super_admin' } }) }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 6, feature_flags: {} } }) }));
const days = ['2026-11-15', '2026-11-16'];
const hours = [13, 14, 15, 16];
const grid = { location: { timezone: 'America/Denver' }, rooms: [{ id: 4, name: 'Tutoring' }], days, hours,
  slots: days.flatMap(date => hours.map(hour => ({ roomId: 4, date, hour, state: 'open' }))) };
const people = [
  { id: 1, first_name: 'Melissa', last_name: 'Mendez', role: 'admin', agencyIds: [6], profile_photo_path: 'profiles/melissa.jpg' },
  { id: 2, first_name: 'Michael', last_name: 'Mendez', role: 'super_admin', agencyIds: [6, 8] }
];
let wrapper;
let directoryPeople;
let responseGrid;
beforeEach(() => {
  vi.clearAllMocks();
  directoryPeople = people.map(p => ({ ...p, agencyIds: [...p.agencyIds] }));
  responseGrid = grid;
  api.get.mockImplementation(async url => ({ data: url.endsWith('weekly-grid') ? responseGrid : url.endsWith('assignment-options')
    ? { agencies: [{ id: 6, name: 'One' }, { id: 8, name: 'Two' }], people: directoryPeople } : [] }));
  api.post.mockResolvedValue({ data: { ok: true } });
});
afterEach(() => wrapper?.unmount());
async function setup() {
  wrapper = mount(OfficeScheduleView, { global: { stubs: { RouterLink: true, ClinicalArtifactRetentionPanel: true, OfficeRoomPhotoButton: true, OfficeRoomPhotoGalleryModal: true } } });
  await flushPromises();
}
async function drag(first = 0, last = 6) {
  const cells = wrapper.findAll('.cell.slot');
  await cells[first].trigger('mousedown', { button: 0 });
  await cells[last].trigger('mouseenter');
  expect(wrapper.get('.selection-preview').text()).toContain('4 hours');
  expect(wrapper.get('.selection-preview').text()).toMatch(/1\s?PM–5\s?PM/);
  window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  await nextTick();
  // Simulate the browser click after release: it must not collapse the selected range.
  await cells[last].trigger('click');
  await flushPromises();
}
it.each([[0, 6], [6, 0]])('opens the complete range on release when dragging %i to %i', async (first, last) => {
  await setup();
  await drag(first, last);
  expect(wrapper.get('.modal').text()).toContain('4 hours');
  expect(wrapper.get('.modal').text()).toMatch(/1\s?PM–5\s?PM/);
  expect(wrapper.find('.selection-preview').exists()).toBe(false);
});
it.each(['WEEKLY', 'BIWEEKLY', 'EVERY_4_WEEKS'])('assigns the selected block and tenant to an administrator with %s recurrence', async frequency => {
  await setup(); await drag();
  await wrapper.get('.modal .person-search-select input').setValue('melissa');
  expect(wrapper.get('.modal [role="option"] img').attributes('src')).toContain('profiles/melissa.jpg');
  await wrapper.get('.modal [role="option"]').trigger('click');
  const recurrence = wrapper.findAll('.modal select').find(s => s.find('option[value="BIWEEKLY"]').exists());
  await recurrence.setValue(frequency);
  const assign = wrapper.findAll('.modal button').find(b => b.text() === 'Assign');
  expect(assign.attributes('disabled')).toBeUndefined();
  await assign.trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/office-slots/1/open-slots/assign', expect.objectContaining({
    roomId: 4, date: '2026-11-16', hour: 13, endHour: 17, assignedUserId: 1, agencyId: 6,
    assignmentMode: 'PROVIDER', recurrenceFrequency: frequency
  }));
});
it('clears a selected person when switching agencies and filters membership', async () => {
  await setup(); await drag();
  await wrapper.get('.modal .person-search-select input').setValue('melissa');
  await wrapper.get('.modal [role="option"]').trigger('click');
  await wrapper.get('#assignment-agency').setValue('8');
  await wrapper.get('.modal .person-search-select input').setValue('mendez');
  expect(wrapper.findAll('.modal [role="option"]')).toHaveLength(1);
  expect(wrapper.get('.modal [role="option"]').text()).toContain('Michael');
  expect(wrapper.findAll('.modal button').find(b => b.text() === 'Assign').attributes('disabled')).toBeDefined();
});
it('opens actions immediately for a selection spanning multiple days', async () => {
  await setup();
  const cells = wrapper.findAll('.cell.slot');
  await cells[0].trigger('mousedown', { button: 0 });
  await cells[3].trigger('mouseenter');
  window.dispatchEvent(new MouseEvent('mouseup'));
  await flushPromises();
  expect(wrapper.get('[aria-label="Selected hours"]').text()).toContain('4 hours');
  expect(wrapper.find('.modal').exists()).toBe(false);
});

it('updates the draft summary as recurrence, days, tenant, person and end time change', async () => {
  await setup(); await drag();
  expect(wrapper.get('.recurrence-summary').text()).toContain('One-time');
  await wrapper.get('.modal .person-search-select input').setValue('melissa');
  await wrapper.get('.modal [role="option"]').trigger('click');
  expect(wrapper.get('.recurrence-summary').text()).toContain('Melissa Mendez');
  expect(wrapper.get('.recurrence-summary').text()).toContain('Agency / tenant: One');
  const recurrence = wrapper.findAll('.modal select').find(s => s.find('option[value="BIWEEKLY"]').exists());
  for (const [value, label] of [['WEEKLY', 'Weekly'], ['BIWEEKLY', 'Every 2 weeks'], ['EVERY_4_WEEKS', 'Every 4 weeks']]) {
    await recurrence.setValue(value);
    expect(wrapper.get('.recurrence-summary').text()).toContain(label);
    expect(wrapper.get('.recurrence-summary').text()).not.toContain('One-time');
  }
  await wrapper.get('.weekday-check input').setValue(true);
  expect(wrapper.get('.recurrence-summary').text()).toContain('Days: Sun, Mon');
  const end = wrapper.findAll('.modal select').find(s => s.find('option[value="18"]').exists());
  await end.setValue('18');
  expect(wrapper.get('.modal').text()).toMatch(/1\s?PM–6\s?PM · 5 hours/);
  await recurrence.setValue('ONCE');
  expect(wrapper.get('.recurrence-summary').text()).toContain('One-time');
  expect(wrapper.get('.recurrence-summary').text()).not.toContain('Days:');
});
it('keeps Melissa selected when switching between eligible tenants without clinical access', async () => {
  directoryPeople[0].agencyIds.push(8);
  directoryPeople[0].has_provider_access = 0;
  await setup(); await drag();
  await wrapper.get('.modal .person-search-select input').setValue('melissa');
  await wrapper.get('.modal [role="option"]').trigger('click');
  await wrapper.get('#assignment-agency').setValue('8');
  expect(wrapper.get('.recurrence-summary').text()).toContain('Melissa Mendez');
  expect(wrapper.get('.recurrence-summary').text()).toContain('Agency / tenant: Two');
  const assign = wrapper.findAll('.modal button').find(b => b.text() === 'Assign');
  expect(assign.attributes('disabled')).toBeUndefined();
  await assign.trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/office-slots/1/open-slots/assign', expect.objectContaining({ assignedUserId: 1, agencyId: 8, assignmentMode: 'PROVIDER' }));
});
it('keeps the saved recurrence visible when inspecting an existing reservation', async () => {
  responseGrid = { ...grid, slots: grid.slots.map(s => ({ ...s, state: 'assigned_available', frequencyLabel: 'Every 4 weeks', assignedFrequency: 'EVERY_4_WEEKS' })) };
  await setup();
  await wrapper.get('.cell.slot').trigger('click'); await flushPromises();
  expect(wrapper.get('.recurrence-summary').text()).toContain('Every 4 weeks');
  expect(wrapper.get('.recurrence-summary').text()).not.toContain('One-time');
});

it.each(['2027-10-14', ''])('submits a seven-hour weekly assignment with end date %s', async until => {
  const date='2026-10-15';
  const hours=Array.from({length:8},(_,i)=>i+7);
  responseGrid={...grid,days:[date],hours,slots:hours.map(hour=>({roomId:4,date,hour,state:'open'}))};
  await setup();
  await wrapper.get('.cell.slot').trigger('click');await flushPromises();
  await wrapper.get('#assignment-end').setValue('14');
  await wrapper.get('#assignment-recurrence').setValue('WEEKLY');
  await wrapper.get('#assignment-until').setValue(until);
  await wrapper.get('.modal .person-search-select input').setValue('Michael');
  await wrapper.get('.modal [role="option"]').trigger('click');
  expect(wrapper.get('.modal').text()).toMatch(/7\s?AM–2\s?PM · 7 hours/);
  await wrapper.get('.slot-assignment-form .btn-primary').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/office-slots/1/open-slots/assign',expect.objectContaining({
    hour:7,endHour:14,assignedUserId:2,recurrenceFrequency:'WEEKLY',recurringUntilDate:until
  }));
});
