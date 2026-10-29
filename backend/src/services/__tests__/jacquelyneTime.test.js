import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), rate: vi.fn(), assigned: vi.fn(), create: vi.fn(), resubmit: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/PayrollTimeClaim.model.js', () => ({ default: { create: m.create, resubmit: m.resubmit } }));
vi.mock('../../models/PayrollRate.model.js', () => ({ default: { findBestRate: m.rate } }));
vi.mock('../../models/PayrollUserIndirectServiceAssignment.model.js', () => ({ default: { hasEnabledAssignmentsForTypes: m.assigned } }));
import { jacquelyneAdminRate, listJacquelyneHuddles, validateJacquelyneTime, persistJacquelyneTimeClaim } from '../jacquelyneTime.service.js';
import { isJacquelyneHuddle } from '../../utils/jacquelyneTimePolicy.js';
import { categoryGroupFromPayBucket, serviceCodeForCategoryGroup } from '../../utils/hourlyDualRateContract.js';
const type = key => ({ id: 900, agency_id: 2, type_key: `jacquelyne_${key}`, pay_bucket: key.startsWith('team') || key === 'office_management' ? 'support' : 'admin' });
const make = (key = 'translation') => ({ agencyId: 2, userId: 485, claimDate: '2026-10-29', payload: { categoryGroup: 'admin_duties', allocations: [{ serviceTypeId: 900, serviceTypeKey: `jacquelyne_${key}`, minutes: 30, note: 'Helped the support team obtain information.' }], totalMinutes: 30 } });
beforeEach(() => { vi.clearAllMocks(); m.rate.mockResolvedValue({ rate_amount: '25.00' }); m.assigned.mockResolvedValue(true); m.execute.mockResolvedValue([[type('translation')]]); });
describe('employee-scoped rates and activities', () => {
 it('maps the third category to Admin Time without changing support or indirect', () => {
  expect(categoryGroupFromPayBucket('admin')).toBe('admin_duties');
  expect(serviceCodeForCategoryGroup('admin_duties')).toBe('Admin Time');
  expect(serviceCodeForCategoryGroup(categoryGroupFromPayBucket('support'))).toBe('MEETING');
  expect(categoryGroupFromPayBucket('indirect')).toBe('indirect_service');
 });
 it('uses the dated $25 rate only for Jacquelyne in ITSCO', async () => {
  const args = { agencyId: 2, userId: 485, asOf: '2026-10-29' };
  expect(await jacquelyneAdminRate(args)).toBe(25);
  expect(await jacquelyneAdminRate({ ...args, userId: 486 })).toBeNull();
  expect(await jacquelyneAdminRate({ ...args, agencyId: 3 })).toBeNull();
  expect(await jacquelyneAdminRate({ ...args, asOf: '2026-10-28' })).toBeNull();
  expect(m.rate).toHaveBeenCalledTimes(1);
 });
 it('permits assigned translation and canonicalizes the bucket', async () => {
  const args = make(); await validateJacquelyneTime(args);
  expect(args.payload.allocations[0].payBucket).toBe('admin');
 });
 it.each([{ userId: 486 }, { agencyId: 3 }])('rejects another employee or agency, including spoofed labels', async patch => {
  await expect(validateJacquelyneTime({ ...make(), ...patch })).rejects.toMatchObject({ status: 403 });
 });
 it('rejects disabled assignments and prevents category/rate substitution', async () => {
  m.assigned.mockResolvedValue(false);
  await expect(validateJacquelyneTime(make())).rejects.toMatchObject({ status: 403 });
  m.assigned.mockResolvedValue(true);
  const args=make(); args.payload.categoryGroup='support_activity';
  await expect(validateJacquelyneTime(args)).rejects.toMatchObject({ status: 400 });
 });
 it('requires a real private type instead of an invented allocation', async () => {
  m.execute.mockResolvedValue([[]]);
  await expect(validateJacquelyneTime(make())).rejects.toMatchObject({ status: 400 });
 });
 it('requires an activity note and the administrator who directed outreach', async () => {
  m.execute.mockResolvedValue([[type('outreach')]]);
  const args=make('outreach');
  await expect(validateJacquelyneTime(args)).rejects.toThrow('administrator');
  args.payload.approvedBy='Michael'; await expect(validateJacquelyneTime(args)).resolves.toBeUndefined();
  args.payload.allocations[0].note=''; await expect(validateJacquelyneTime(args)).rejects.toThrow('note');
 });
 it('keeps office and team activity at Support Activity', async () => {
  m.execute.mockResolvedValue([[type('office_management')]]);
  const args=make('office_management');args.payload.categoryGroup='support_activity';
  await expect(validateJacquelyneTime(args)).resolves.toBeUndefined();
  expect(args.payload.allocations[0].payBucket).toBe('support');
 });
});
describe('scheduled onboarding huddles', () => {
 const meeting={id:77,title:'Denver onboarding',date:'2026-10-29',start_at:new Date('2026-10-29T15:00:00Z'),end_at:new Date('2026-10-29T16:00:00Z'),event_timezone:'America/Denver'};
 beforeEach(() => { m.execute.mockImplementation(async sql => sql.includes('payroll_indirect_service_types') ? [[type('onboarding')]] : sql.includes('FROM provider_schedule_events') ? [[meeting]] : [[]]); });
 it('requires an assigned huddle on the work date and caps the duration', async () => {
  const args=make('onboarding'); await expect(validateJacquelyneTime(args)).rejects.toThrow('scheduled');
  args.payload.scheduleEventId=77; await expect(validateJacquelyneTime(args)).resolves.toBeUndefined();
  args.payload.allocations[0].minutes=61; await expect(validateJacquelyneTime(args)).rejects.toThrow('duration');
  args.payload.allocations[0].minutes=30; args.claimDate='2026-10-30'; await expect(validateJacquelyneTime(args)).rejects.toThrow('date');
 });
 it('rejects duplicate automatic or manual huddle time; edits exclude their own record', async () => {
  const args=make('onboarding');args.payload.scheduleEventId=77;args.claimId=123;
  m.execute.mockImplementation(async (sql,params) => sql.includes('payroll_indirect_service_types') ? [[type('onboarding')]] : sql.includes('FROM provider_schedule_events') ? [[meeting]] : params[2]===123 ? [[]] : [[{id:123}]]);
  await expect(validateJacquelyneTime(args)).resolves.toBeUndefined();
  delete args.claimId; await expect(validateJacquelyneTime(args)).rejects.toMatchObject({status:409});
 });
 it('does not return huddles or apply huddle policy to anyone else', async () => {
  expect(await listJacquelyneHuddles({agencyId:2,userId:486})).toEqual([]);
  expect(m.execute).not.toHaveBeenCalled();
  expect(isJacquelyneHuddle({agency_id:2,kind:'HUDDLE'},485)).toBe(true);
  expect(isJacquelyneHuddle({agency_id:2,kind:'TEAM_MEETING'},485)).toBe(false);
  expect(isJacquelyneHuddle({agency_id:2,kind:'HUDDLE'},486)).toBe(false);
 });
});

it('does not write a duplicate huddle when automatic recording holds the lock', async () => {
 const db={execute:vi.fn().mockResolvedValue([[{acquired:0}]]),release:vi.fn()};
 const args=make('onboarding');args.payload.scheduleEventId=77;
 await expect(persistJacquelyneTimeClaim(args,{dbPool:{getConnection:async()=>db}})).rejects.toMatchObject({status:409});
 expect(m.create).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalledOnce();
});
it('rechecks automatic attendance under the shared lock and releases it on rejection', async () => {
 const meeting={id:77,title:'Onboarding',start_at:new Date('2026-10-29T15:00:00Z'),end_at:new Date('2026-10-29T16:00:00Z')};
 const db={execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('payroll_indirect_service_types')?[[type('onboarding')]]:sql.includes('FROM provider_schedule_events')?[[meeting]]:sql.includes('FROM payroll_time_claims')?[[{id:80}]]:[[]]),release:vi.fn()};
 const args=make('onboarding');args.payload.scheduleEventId=77;
 await expect(persistJacquelyneTimeClaim(args,{dbPool:{getConnection:async()=>db}})).rejects.toMatchObject({status:409});
 expect(m.create).not.toHaveBeenCalled();expect(db.execute).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)',['meeting-compensation:77']);expect(db.release).toHaveBeenCalledOnce();
});
