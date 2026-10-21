import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  replace: vi.fn(),
  query: {}
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: m.query, params: { organizationSlug: 'itsco' } }),
  useRouter: () => ({ replace: m.replace, push: vi.fn() })
}));
vi.mock('../../services/api', () => ({
  default: { get: m.get, post: m.post }
}));
vi.mock('../admin/OfficeCoverageFlagsView.vue', () => ({
  default: { template: '<div>Reported conflicts</div>' }
}));
import View from '../admin/OfficeApprovalsView.vue';
const request = (key, name, source) => ({
  key,
  providerName: name,
  sourceLabel: source,
  startDate: '2026-10-30',
  frequencyLabel: 'Every 2 weeks',
  timezone: 'America/Denver',
  slots: [{ startHour: 17, endHour: 19 }],
  roomRequest: true
});
const requests = [
  request('intake:878', 'Randy', 'Availability request'),
  request('booking:36', 'Chase', 'Calendar request'),
  request('booking:39', 'Halle', 'Calendar request')
];
const context = {
  request: requests[0],
  rooms: [
    {
      roomId: 5,
      officeId: 1,
      officeName: 'Windchime',
      roomLabel: '#5',
      available: false,
      reason: 'Already booked on November 13',
      requested: true
    },
    {
      roomId: 6,
      officeId: 1,
      officeName: 'Windchime',
      roomLabel: '#6',
      available: true,
      timezone: 'America/Denver',
      window: {
        startDate: '2026-10-30',
        checkedDates: ['2026-10-30', '2026-11-13']
      }
    }
  ],
  warnings: [],
  window: { startDate: '2026-10-30' },
  horizon: 'All remaining requested occurrences.'
};
beforeEach(() => {
  vi.clearAllMocks();
  m.query = {};
  m.get.mockImplementation(async (url) => ({
    data: url.endsWith('/context') ? context : { requests }
  }));
  m.post.mockResolvedValue({ data: { ok: true } });
});
const mountView = () =>
  mount(View, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } }
  });
it('shows Randy, Chase and Halle in one queue without switching request-source tabs', async () => {
  const w = mountView();
  await flushPromises();
  for (const name of ['Randy', 'Chase', 'Halle'])
    expect(w.text()).toContain(name);
  expect(w.findAll('.request')).toHaveLength(3);
  expect(w.text()).not.toContain('Calendar / Provider Update requests');
  w.unmount();
});
it('shows recurrence conflicts, requires an available room and confirms the precise room before deciding', async () => {
  const w = mountView();
  await flushPromises();
  await w.find('.request').trigger('click');
  await flushPromises();
  expect(w.text()).toContain('Already booked on November 13');
  const radios = w.findAll('input[type=radio]');
  expect(radios[0].attributes('disabled')).toBeDefined();
  let button = w.findAll('button').find((b) => b.text() === 'Review approval');
  expect(button.attributes('disabled')).toBeDefined();
  await radios[1].setValue();
  expect(button.attributes('disabled')).toBeUndefined();
  await button.trigger('click');
  expect(w.find('.confirmation').text()).toContain('#6');
  expect(w.find('.confirmation').text()).toContain('5pm–7pm');
  await w
    .findAll('button')
    .find((b) => b.text() === 'Confirm approval')
    .trigger('click');
  await flushPromises();
  expect(m.post).toHaveBeenCalledWith(
    '/office-schedule/approvals/intake%3A878/decision',
    expect.objectContaining({ action: 'approve', roomId: 6 })
  );
  w.unmount();
});
it('does not enable approval after failed conflict loading', async () => {
  m.get.mockImplementation(async (url) => {
    if (url.endsWith('/context')) throw new Error('network failure');
    return { data: { requests } };
  });
  const w = mountView();
  await flushPromises();
  await w.find('.request').trigger('click');
  await flushPromises();
  expect(w.text()).toContain('Approval is disabled');
  expect(w.findAll('button').some((b) => b.text() === 'Confirm approval')).toBe(
    false
  );
  w.unmount();
});
it('requires acknowledgment of an existing provider reservation and supports direct notification links', async () => {
  m.query = { request: 'intake:878' };
  m.get.mockImplementation(async (url) => ({
    data: url.endsWith('/context')
      ? {
          ...context,
          warnings: [
            {
              message: 'Already reserved in Room 4',
              startAt: '2026-10-30 23:00:00'
            }
          ]
        }
      : { requests }
  }));
  const w = mountView();
  await flushPromises();
  await w.findAll('input[type=radio]')[1].setValue();
  const approve = w
    .findAll('button')
    .find((b) => b.text() === 'Review approval');
  expect(approve.attributes('disabled')).toBeDefined();
  await w.find('input[type=checkbox]').setValue(true);
  expect(approve.attributes('disabled')).toBeUndefined();
  expect(w.find('.workspace').classes()).toContain('detail-open');
  await w.find('.back').trigger('click');
  expect(w.find('.workspace').classes()).not.toContain('detail-open');
  w.unmount();
});
it('requires a typed denial reason and sends it with the decision from an embedded review',async()=>{
 const w=mount(View,{props:{embedded:true,requestKey:'intake:878'},global:{stubs:{RouterLink:true}}});
 await flushPromises();
 expect(w.find('.queue').exists()).toBe(false);
 await w.findAll('button').find(b=>b.text()==='Deny request').trigger('click');
 const confirm=w.get('.confirmation .btn-danger');
 expect(confirm.attributes('disabled')).toBeDefined();
 await w.get('textarea').setValue('Requested times need to be changed; please contact the CPA.');
 expect(confirm.attributes('disabled')).toBeUndefined();await confirm.trigger('click');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/office-schedule/approvals/intake%3A878/decision',expect.objectContaining({action:'deny',approverComment:'Requested times need to be changed; please contact the CPA.'}));
 expect(w.emitted('decided')).toBeTruthy();w.unmount();
});
