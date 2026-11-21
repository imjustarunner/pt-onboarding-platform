import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ find: vi.fn(), create: vi.fn(), update: vi.fn(), list: vi.fn(), block: vi.fn(), notify: vi.fn(), resolve: vi.fn(), presence: vi.fn(), sync: vi.fn(), authorize: vi.fn(), execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn() }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 2, timezone: 'America/Denver' }) } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: async () => ({ id: 539, first_name: 'Katie' }), getAgencies: async () => [{ id: 2 }] } }));
vi.mock('../../models/PlannedOut.model.js', async importOriginal => ({ ...await importOriginal(), default: { tableExists: async () => true, findById: m.find, create: m.create, updateById: m.update, listForAgency: m.list } }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => ({
  execute: m.execute, beginTransaction: m.beginTransaction, commit: m.commit, rollback: m.rollback, release: () => {}, destroy: () => {}
}) } }));
vi.mock('../providerDayCancellation.controller.js', () => ({
  authorizeDayCancellation: m.authorize, isDayCancellationStaff: actor => ['admin', 'scheduler', 'super_admin'].includes(actor.role)
}));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { create: m.block, listForProvider: async () => [] } }));
vi.mock('../../models/UserPresenceStatus.model.js', () => ({ default: {} }));
vi.mock('../../models/Notification.model.js', () => ({ default: { markAsResolvedByRelatedEntity: m.resolve } }));
vi.mock('../../services/notificationDispatcher.service.js', () => ({ createNotificationAndDispatch: m.notify }));
vi.mock('../../services/plannedOutPresence.service.js', () => ({ applyPlannedOutPresenceForUser: m.presence }));
vi.mock('../../services/plannedOutScheduleSync.service.js', () => ({ syncScheduleEventFromPlannedOut: m.sync }));
vi.mock('../../services/plannedOutCancellation.service.js',()=>({preparePlannedOutCancellation:vi.fn(async()=>null),completePlannedOutCancellation:vi.fn(async()=>null)}));
import { preparePlannedOutCancellation } from '../../services/plannedOutCancellation.service.js';
import { createPlannedOut, previewPlannedOut, reviewPlannedOut } from '../plannedOuts.controller.js';

const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const request = body => ({ user: { id: 539, role: 'admin' }, params: { id: 35 }, body: { agencyId: 2, timeZone: 'America/Denver', ...body } });
const saved = payload => ({ id: payload.agencyId + 33, agency_id: payload.agencyId, user_id: payload.userId, status: payload.status || 'pending', span_type: payload.spanType, all_day: payload.allDay, start_at: payload.startAt, end_at: payload.endAt, start_date: payload.startDate, end_date: payload.endDate, time_zone: payload.timeZone, schedule_event_id: 340 });
beforeEach(() => {
  vi.clearAllMocks();
  m.execute.mockImplementation(async sql => sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : [[]]);
  m.authorize.mockResolvedValue(undefined);
  m.block.mockResolvedValue({ id: 340 });
  m.create.mockImplementation(async payload => saved(payload));
});

describe('planned-out dates and acknowledgment', () => {
  it.each([['am', '14:00:00', '18:00:00'], ['pm', '18:00:00', '23:00:00']])('saves a %s half day on the chosen date in the submitter timezone', async (halfDayPart, start, end) => {
    const res = response(), next = vi.fn();
    await createPlannedOut(request({ spanType: 'half_day', startDate: '2026-10-06', halfDayPart }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ spanType: 'half_day', startDate: '2026-10-06', startAt: `2026-10-06 ${start}`, endAt: `2026-10-06 ${end}` }), expect.any(Object));
    expect(m.block).toHaveBeenCalledWith(expect.objectContaining({ eventTimezone: 'America/Denver' }), expect.any(Object));
  });

  it('includes the later end date in submission notifications', async () => {
    const next = vi.fn();
    await createPlannedOut(request({ spanType: 'hours', startAt: '2026-10-06T10:00:00', endAt: '2026-10-13T13:00:00' }), response(), next);
    expect(next).not.toHaveBeenCalled();
    for (const [notification] of m.notify.mock.calls) {
      expect(notification.message).toContain('October 6, 2026');
      expect(notification.message).toContain('October 13, 2026');
      expect(notification.message).toContain('10:00 AM MDT');
      expect(notification.message).toContain('1:00 PM MDT');
    }
    expect(m.notify).toHaveBeenCalledTimes(2);
  });

  it('acknowledges a past absence without changing its dates or activating presence', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
    try {
      const row = { id: 35, agency_id: 2, user_id: 539, status: 'pending', span_type: 'hours', start_at: new Date('2026-10-06T16:00:00Z'), end_at: new Date('2026-10-06T19:00:00Z'), schedule_event_id: 340 };
      m.find.mockResolvedValue(row); m.update.mockResolvedValue({ ...row, status: 'approved' });
      const res = response(), next = vi.fn();
      await reviewPlannedOut(request({ action: 'acknowledge' }), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(m.update.mock.calls[0][1]).not.toHaveProperty('startAt');
      expect(m.update.mock.calls[0][1]).not.toHaveProperty('endAt');
      expect(m.presence).not.toHaveBeenCalled();
      expect(m.resolve).toHaveBeenCalledWith(2, 'planned_out', 35);
      expect(res.json.mock.calls[0][0].plannedOut.end_at).toBe('2026-10-06T19:00:00.000Z');
      expect(m.notify.mock.calls[0][0].message).toContain('October 6, 2026');
      expect(m.notify.mock.calls[0][0].message).not.toContain('October 13');
    } finally { vi.useRealTimers(); }
  });

  it('formats MySQL all-day dates without adding the exclusive last day', async () => {
    const row = { id: 35, agency_id: 2, user_id: 539, status: 'approved', all_day: true, span_type: 'all_day', start_date: new Date('2026-10-06T00:00:00Z'), end_date: new Date('2026-10-07T00:00:00Z') };
    m.find.mockResolvedValue(row); m.update.mockResolvedValue(row);
    const res = response(), next = vi.fn();
    await reviewPlannedOut(request({ action: 'acknowledge' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(m.notify.mock.calls[0][0].message).toContain('October 6, 2026 (all day)');
    expect(m.notify.mock.calls[0][0].message).not.toContain('October 7');
    expect(res.json.mock.calls[0][0].plannedOut.start_date).toBe('2026-10-06');
  });
});

it('returns a previously saved Planned Out for the same approved token without another block or record',async()=>{
 const row={id:35,agency_id:2,user_id:539,status:'pending',span_type:'all_day',all_day:1,start_date:'2026-11-26',end_date:'2026-11-27'};
 const execute = m.execute.getMockImplementation();
 m.execute.mockImplementation(async (...args) => args[0].includes('SELECT id, agency_id FROM planned_outs') ? [[{id:35,agency_id:2}]] : execute(...args));
 m.find.mockResolvedValue(row);
 const res=response(),next=vi.fn();
 await createPlannedOut(request({spanType:'all_day',startDate:'2026-11-26',endDate:'2026-11-27',cancellationReviewToken:'11111111-1111-4111-8111-111111111111'}),res,next);
 expect(next).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();expect(m.block).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0]).toMatchObject({alreadySaved:true,plannedOut:{id:35}});
});

it('reviews and saves the selected practices together on behalf of the provider', async () => {
  const req = request({ userId: 701, agencyIds: [2, 4], spanType: 'all_day', startDate: '2026-11-26' });
  req.user.role = 'scheduler';
  const res = response(), next = vi.fn();
  await previewPlannedOut(req, res, next);
  expect(m.authorize).toHaveBeenCalledWith(req.user, 701, [2, 4]);
  expect(preparePlannedOutCancellation).toHaveBeenCalledWith(expect.objectContaining({ agencyIds: [2, 4], providerId: 701 }), req.user, expect.any(Object));
  expect(m.create).not.toHaveBeenCalled();
  await createPlannedOut(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(m.block.mock.calls.map(([data]) => data.agencyId)).toEqual([2, 4]);
  expect(m.create.mock.calls.map(([data]) => [data.agencyId, data.userId, data.submittedByUserId])).toEqual([[2, 701, 539], [4, 701, 539]]);
  expect(m.commit).toHaveBeenCalledOnce();
  expect(m.notify.mock.calls.filter(([data]) => data.audienceJson?.admin).map(([data]) => data.agencyId)).toEqual([2, 4]);
  expect(res.json.mock.lastCall[0].plannedOuts.map(row => row.agency_id)).toEqual([2, 4]);
});

it('rolls back every selected organization when saving the second calendar block fails', async () => {
  const req = request({ agencyIds: [2, 4], spanType: 'all_day', startDate: '2026-11-26' });
  const failure = new Error('Could not write the second calendar');
  m.block.mockResolvedValueOnce({ id: 340 }).mockRejectedValueOnce(failure);
  const res = response(), next = vi.fn();
  await createPlannedOut(req, res, next);
  expect(next).toHaveBeenCalledWith(failure);
  expect(m.rollback).toHaveBeenCalledOnce();
  expect(m.commit).not.toHaveBeenCalled();
  expect(m.notify).not.toHaveBeenCalled();
});

it('rejects an unauthorized submitted practice before writing blocks', async () => {
  const req = request({ agencyIds: [2, 4], spanType: 'all_day', startDate: '2026-11-26' });
  m.authorize.mockRejectedValueOnce(Object.assign(new Error('Forbidden practice'), { status: 403 }));
  const res = response();
  await createPlannedOut(req, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(m.block).not.toHaveBeenCalled();
});
