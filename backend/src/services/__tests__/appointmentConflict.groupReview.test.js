import { expect, it, vi } from 'vitest';
const helpers = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: helpers }));
vi.mock('../providerCalendarBusy.service.js', () => ({ readProviderCalendarBusy: async () => [] }));
vi.mock('../publicProviderHold.service.js', () => ({ withProviderSelectionLock: vi.fn() }));
vi.mock('../privateReplacementSlots.service.js', () => ({ readPrivateReplacementSlots: async () => [] }));
import { reviewGroupSupervisionOverlap, assertAppointmentWindowAvailable } from '../appointmentConflict.service.js';

it('reviews all affected dates and invalidates consent when a supervision session changes', async () => {
  const dates = ['2026-11-30', '2026-12-14'];
  const occurrences = dates.map(date => ({startAt:`${date}T17:00:00Z`,endAt:`${date}T18:00:00Z`}));
  const rows = dates.map((date,i) => ({id:i+1,start_at:`${date} 17:00:00`,end_at:`${date} 18:00:00`}));
  helpers.execute.mockResolvedValue([rows]);
  const res = {status:vi.fn(),json:vi.fn()};
  res.status.mockReturnValue(res);
  const req = {user:{id:9},body:{reviewGroupSupervision:true}};
  const context = {providerId:9,occurrences,timeZone:'America/Denver'};
  expect(await reviewGroupSupervisionOverlap(req,res,context)).toBeNull();
  expect(res.json.mock.calls[0][0].error).toMatchObject({code:'REVIEW_GROUP_SUPERVISION_OVERLAP',dates});
  req.body.confirmedGroupSupervisionOverlap = res.json.mock.calls[0][0].error.review;
  const reviewed = await reviewGroupSupervisionOverlap(req,res,context);
  expect(reviewed.map(group=>group.id)).toEqual([1,2]);
  expect(await reviewGroupSupervisionOverlap(req,res,{...context,providerId:99})).toEqual([]);
  rows[0].end_at='2026-11-30 17:50:00';
  expect(await reviewGroupSupervisionOverlap(req,res,context)).toBeNull();
  const db = {execute:vi.fn(async query => [/SELECT id,start_at,end_at,updated_at FROM appointments/.test(query) ? [{id:111}] : []])};
  const request = {providerUserId:9,startAt:occurrences[0].startAt,endAt:occurrences[0].endAt,acknowledgedGroupSupervision:reviewed};
  await expect(assertAppointmentWindowAvailable(db,request)).rejects.toMatchObject({code:'PROVIDER_TIME_CONFLICT'});
});
