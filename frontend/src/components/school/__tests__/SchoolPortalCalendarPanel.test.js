import { afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SchoolPortalCalendarPanel from '../SchoolPortalCalendarPanel.vue';
import { buildSchoolCalendarRange } from '../../../utils/schoolCalendarRange';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }) } }));
afterEach(() => vi.useRealTimers());

it('renders fall break on all five days, once in the list, and opens the same entry from each day', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  const event = { id: 1, title: 'Fall Break', eventType: 'school_day_off', timezone: 'America/Denver',
    ...buildSchoolCalendarRange({ date: '2026-10-19', endDate: '2026-10-23', timezone: 'America/Denver', allDay: true }) };
  const w = mount(SchoolPortalCalendarPanel, { props: { schoolOrganizationId: 2, canManage: true, externalEvents: [event] } });
  await flushPromises();
  expect(w.findAll('.cell').filter(c => c.find('.evt').exists()).map(c => c.find('.day-num').text())).toEqual(['19', '20', '21', '22', '23']);
  await w.findAll('.evt')[4].trigger('click');
  expect(w.emitted('edit-event')[0][0]).toEqual(event);
  await w.findAll('.view-toggle button')[1].trigger('click');
  await w.findAll('button').find(b => b.text() === 'Today').trigger('click');
  expect(w.findAll('.evt')).toHaveLength(5);
  await w.findAll('.view-toggle button')[2].trigger('click');
  expect(w.findAll('.list-row')).toHaveLength(1);
  expect(w.text()).toContain('Fri, Oct 23, 2026 · All day');
  w.unmount();
});
