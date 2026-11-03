import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlannedOutModal from '../PlannedOutModal.vue';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../../../../services/api', () => ({ default: api }));
beforeEach(() => { vi.clearAllMocks(); api.post.mockResolvedValue({ data: { plannedOut: { id: 35 },review:{token:'review-token',items:[],unchanged:[]} } }); });

describe('planned-out duration entry', () => {
  it.each(['am', 'pm'])('shows and submits the date and %s half-day window', async part => {
    const w = mount(PlannedOutModal, { props: { agencyId: 2 } });
    await w.get('input[value="half_day"]').setValue();
    expect(w.findAll('input[type="date"]')).toHaveLength(1);
    expect(w.findAll('input[type="datetime-local"]')).toHaveLength(0);
    await w.get('input[type="date"]').setValue('2026-10-06');
    const half = w.findAll('select').find(s => s.find('option[value="am"]').exists());
    expect(half.text()).toContain('8:00 AM–12:00 PM');
    expect(half.text()).toContain('12:00 PM–5:00 PM');
    await half.setValue(part);
    expect(w.get('[role="status"]').text()).toContain('10/6');
    await w.get('form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/planned-outs/preview', expect.objectContaining({ spanType: 'half_day', startDate: '2026-10-06', halfDayPart: part, timeZone: expect.any(String) }), expect.any(Object));
    w.unmount();
  });

  it('previews both dates for a multi-day hourly absence', async () => {
    const w = mount(PlannedOutModal, { props: { agencyId: 2 } });
    const inputs = w.findAll('input[type="datetime-local"]');
    await inputs[0].setValue('2026-10-06T10:00');
    await inputs[1].setValue('2026-10-13T13:00');
    expect(w.get('[role="status"]').text()).toContain('10/6');
    expect(w.get('[role="status"]').text()).toContain('10/13');
    await inputs[1].setValue('2026-10-05T13:00');
    await w.get('form').trigger('submit');
    expect(api.post).not.toHaveBeenCalled();
    expect(w.text()).toContain('Choose an end date and time after the start.');
    w.unmount();
  });

  it('switches from half-day to all-day dates and submits an exclusive end', async () => {
    const w = mount(PlannedOutModal, { props: { agencyId: 2 } });
    await w.get('input[value="half_day"]').setValue();
    await w.get('input[value="all_day"]').setValue();
    const dates = w.findAll('input[type="date"]');
    expect(dates).toHaveLength(2);
    await dates[0].setValue('2026-10-06'); await dates[1].setValue('2026-10-06');
    await w.get('form').trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/planned-outs/preview', expect.objectContaining({ spanType: 'all_day', startDate: '2026-10-06', endDate: '2026-10-07' }), expect.any(Object));
    w.unmount();
  });
});

it('reviews twice and requires explicit approval before saving or canceling',async()=>{
  const w=mount(PlannedOutModal,{props:{agencyId:2,initialDate:'2026-11-16'}});
  await w.get('form').trigger('submit');await flushPromises();
  expect(api.post.mock.calls.map(c=>c[0])).toEqual(['/planned-outs/preview']);
  expect(w.text()).toContain('Nothing has been canceled or sent yet');
  await w.findAll('button').find(b=>b.text()==='Review final Planned Out').trigger('click');await flushPromises();
  const confirm=w.findAll('button').find(b=>b.text()==='Confirm Planned Out and cancel items');
  expect(confirm.element.disabled).toBe(true);expect(api.post.mock.calls.every(c=>c[0].endsWith('/preview'))).toBe(true);
  await w.get('input[type="checkbox"]').setValue(true);await confirm.trigger('click');await flushPromises();
  expect(api.post.mock.lastCall).toEqual(['/planned-outs',expect.objectContaining({cancelScheduledItems:true,cancellationReviewToken:'review-token'}),expect.any(Object)]);
  w.unmount();
});
