import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ProviderDayPlanner from '../ProviderDayPlanner.vue';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: api }));
const options = {
  timeZone: 'America/Denver',
  clients: [
    { id: 41, label: 'Alex Example', schools: [{ id: 50, days: ['Monday'] }] },
    { id: 42, label: 'Casey Example', schools: [], defaultLocationId: 5 },
    { id: 43, label: 'Jordan Example', schools: [], defaultLocationId: 5 }
  ],
  locations: [{ id: 5, name: 'Main office', placeOfService: '11', officeId: 1 },
    { id: 6, name: 'Oak School', placeOfService: '03', schoolId: 50 }],
  schoolSlots: [],
  services: ['90832', '90834', '90837'].map((serviceCode, index) => ({
    id: index + 1, serviceCode, name: 'Therapy', modality: 'EITHER', defaultDurationMinutes: 50
  }))
};

const button = (wrapper, label) => wrapper.findAll('button').find(item => item.text().includes(label));
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
  api.get.mockImplementation(async url => ({ data: url.endsWith('/options') ? options : { busy: [{ start: '08:00', end: '08:30' }], reservations: [] } }));
  api.post.mockImplementation(async (url, body) => ({ data: url.endsWith('/preview') ? {
    rows: body.rows.map(row => ({ ...row, officeRooms: [], errors: [], warnings: [] })),
    summary: { newAppointments: body.rows.length, existingAppointments: 0, blockedRows: 0 }, previewToken: 'checked'
  } : { complete: true, createdCount: body.rows.length, existingCount: 0 } }));
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers(); });

async function open() {
  wrapper = mount(ProviderDayPlanner, { props: { agencyId: 2, providerId: 7, initialDate: '2026-11-30' } });
  await flushPromises();
  return wrapper;
}

describe('provider day planner', () => {
  it('shows the assigned school weekday, places a client by drag, and updates the end when the code changes', async () => {
    await open();
    expect(wrapper.text()).toContain('Monday school roster');
    expect(wrapper.text()).toContain('Office clients');
    expect(wrapper.get('button[aria-label="8:00 AM, occupied"]').element.disabled).toBe(true);
    await button(wrapper, 'Alex Example').trigger('dragstart', { dataTransfer: { setData: vi.fn() } });
    await wrapper.get('button[aria-label="9:00 AM"]').trigger('drop');
    const row = wrapper.get('.draft-row');
    expect(row.findAll('select').map(field => field.element.value)).toEqual(['2', '6']);
    expect(row.findAll('input[type=time]').map(field => field.element.value)).toEqual(['09:00', '09:45']);
    await row.get('select').setValue('1');
    expect(row.findAll('input[type=time]')[1].element.value).toBe('09:30');
    await row.get('select').setValue('3');
    expect(row.findAll('input[type=time]')[1].element.value).toBe('10:00');
    await wrapper.get('input[type=date]').setValue('2026-12-01');
    await flushPromises();
    expect(wrapper.text()).not.toContain('Tuesday school roster');
    expect(wrapper.find('.draft-row').exists()).toBe(false);
    await wrapper.get('input[type=date]').setValue('2026-11-30');
    expect(wrapper.get('.draft-row').text()).toContain('Alex Example');
  });

  it('requests one revalidated room for the entire office block and saves only after a preview', async () => {
    await open();
    await button(wrapper, 'Casey Example').trigger('click');
    await wrapper.get('button[aria-label="9:15 AM"]').trigger('click');
    await button(wrapper, 'Jordan Example').trigger('click');
    await wrapper.get('button[aria-label="11:00 AM"]').trigger('click');
    expect(wrapper.text()).toContain('2 office visits · 1h 30m');
    const room = { officeId: 1, office: 'Main office', roomId: 10, room: 'Room A', date: '2026-11-30',
      weekday: 1, startHour: 9, endHour: 12, timeZone: 'America/Denver' };
    api.get.mockResolvedValueOnce({ data: { rooms: [room], awaiting: [] } });
    await button(wrapper, 'Find a room').trigger('click'); await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/auricwell-agenda-import/planner/office-options', expect.objectContaining({
      params: { agencyId: 2, providerId: 7, date: '2026-11-30', startTime: '09:15', endTime: '11:45' }
    }));
    api.post.mockResolvedValueOnce({ data: { id: 501 } });
    await button(wrapper, 'Request and use this office').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenLastCalledWith('/availability/office-requests', expect.objectContaining({
      preferredOfficeIds: [1], preferredRoomIds: [10], requirePreferredRoom: true,
      slots: [{ weekday: 1, startHour: 9, endHour: 12, roomId: 10 }]
    }), expect.any(Object));
    expect(wrapper.text()).toContain('Room request #501 is awaiting approval');
    expect(button(wrapper, 'Book appointments')).toBeUndefined();
    await button(wrapper, 'Check appointments').trigger('click'); await flushPromises();
    await button(wrapper, 'Book appointments').trigger('click'); await flushPromises();
    expect(api.post.mock.calls.map(([url]) => url)).toEqual(['/availability/office-requests',
      '/auricwell-agenda-import/planner/preview', '/auricwell-agenda-import/planner/commit']);
    expect(wrapper.emitted('saved')).toHaveLength(1);
  });
});
