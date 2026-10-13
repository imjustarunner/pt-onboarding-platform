import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { normalizeEventOperations, mapEventOperations, assertEventRegistrationOpen } from '../../utils/companyEventOperations.js';
import { isEventCoordinator, validateEventOperations } from '../companyEventOperations.service.js';

beforeEach(() => vi.clearAllMocks());
describe('event fees and publication', () => {
  it('tracks an unpaid fee without requiring a known amount or changing attendee pricing', () => {
    const operations = normalizeEventOperations({ requiresPayment: true, programCostDollars: 200 });
    expect(mapEventOperations({ id: 1, operations_json: operations })).toMatchObject({ paymentOutstanding: true, paymentAmount: null });
    expect(operations).not.toHaveProperty('programCostDollars');
  });
  it('preserves omitted operational fields and records who first marked a fee paid', () => {
    const previous = { requiresPayment: true, paymentAmount: 25, paymentNotes: 'Waiting for contact', coordinatorUserIds: [3] };
    const paid = normalizeEventOperations({ paymentPaid: true }, previous, { actorUserId: 7, now: new Date('2026-10-13T18:00:00Z') });
    expect(paid).toMatchObject({ paymentAmount: 25, paymentNotes: 'Waiting for contact', paymentPaidByUserId: 7, paymentPaidAt: '2026-10-13T18:00:00.000Z', coordinatorUserIds: [3] });
    expect(normalizeEventOperations({ paymentPaid: true }, paid, { actorUserId: 8 })).toEqual(paid);
    expect(normalizeEventOperations({ paymentPaid: false }, paid).paymentPaidAt).toBeNull();
  });
  it.each([-1, '25junk', '1e3', '25.555', Infinity])('rejects invalid fee %s', value => {
    expect(() => normalizeEventOperations({ paymentAmount: value })).toThrow('amount');
  });
  it('uses explicit false and requires publication before anonymous registration', () => {
    expect(normalizeEventOperations({ publicRegistrationEnabled: 'false' }).publicRegistrationEnabled).toBe(false);
    expect(() => assertEventRegistrationOpen({ is_active: 1 })).toThrow('not available');
    expect(() => assertEventRegistrationOpen({ is_active: 1, operations_json: { publicRegistrationEnabled: true }, rsvp_deadline: '2020-01-01' })).toThrow('deadline');
  });
});
describe('delegated coordinator scope', () => {
  it('rejects self-granted coordinator rights and cross-agency users', async () => {
    await expect(validateEventOperations({ body: { coordinatorUserIds: [7] }, agencyId: 2, actorUserId: 7 })).rejects.toMatchObject({ status: 403 });
    expect(pool.execute).not.toHaveBeenCalled();
    pool.execute.mockResolvedValue([[]]);
    await expect(validateEventOperations({ body: { coordinatorUserIds: [7] }, agencyId: 2, actorUserId: 1, canAssignCoordinators: true })).rejects.toThrow('active staff');
  });
  it('checks both active agency membership and the exact delegated event', async () => {
    pool.execute.mockResolvedValue([[{ id: 1 }]]);
    expect(await isEventCoordinator({ userId: 7, agencyId: 2, eventId: 13 })).toBe(true);
    const [query, values] = pool.execute.mock.calls[0];
    expect(values).toEqual([7, 2, 13]);
    expect(query).toContain('AND e.id = ?');
    expect(query).toContain('ua.agency_id = e.agency_id');
    expect(query).toContain('u.role IN');
    expect(query).not.toContain("'client_guardian'");
  });
  it('does not let external school editors mark company fees paid or publish event pages', async () => {
    pool.execute.mockResolvedValue([[]]);
    for (const body of [{ requiresPayment: true }, { publicRegistrationEnabled: true }, { attendeeSmsEnabled: true }, { countsTowardOutreachCommitment: true }]) {
      await expect(validateEventOperations({ body, agencyId: 2, actorUserId: 30 })).rejects.toMatchObject({ status: 403 });
    }
  });
  it('preserves operational settings on a school detail edit without requiring a public actor', async () => {
    const existing = { operations_json: { requiresPayment: true, paymentPaid: true, paymentAmount: 25, coordinatorUserIds: [7] } };
    expect(await validateEventOperations({ body: { title: 'Updated title' }, existing, agencyId: 2 })).toMatchObject({ paymentPaid: true, paymentAmount: 25, coordinatorUserIds: [7] });
    expect(pool.execute).not.toHaveBeenCalled();
  });
});
