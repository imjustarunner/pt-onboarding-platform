import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeOutreachEventConfig, syncOutreachTripEvent, assertOutreachTripActor } from '../outreachTripEvent.service.js';
const config = { enabled: true, assigneeUserIds: [485, 12], startTime: '09:00', endTime: '12:00', timezone: 'America/Denver' };
const trip = () => ({ id: 3, agency_id: 2, title: 'Denver visits', status: 'planned', planned_date: '2026-11-02', outreachEvent: normalizeOutreachEventConfig(config, '2026-11-02'),
  stops: [{ id: 10, outreach_school_id: 20, school_name: 'First school', address: '100 Main Street, Denver, CO' }, { id: 11, outreach_school_id: 21, school_name: 'Second school', address: '200 Main Street, Denver, CO' }] });
let db, hasAttendance, eligible;
beforeEach(() => {
  hasAttendance = false; eligible = [{ id: 485 }, { id: 12 }];
  db = { execute: vi.fn(async sql => {
    if (sql === 'SELECT role FROM users WHERE id = ?') return [[{role:'admin'}]];
    if (sql.includes('SELECT DISTINCT u.id')) return [eligible];
    if (sql.includes('SELECT 1 FROM skill_builders_event_kiosk_punches')) return [hasAttendance ? [{ 1: 1 }] : []];
    if (sql.includes('SELECT u.id FROM users')) return [[{ id: 7 }]];
    return [{ insertId: 100, affectedRows: 1 }];
  }) };
});

describe('Outreach Hub event assignment', () => {
  it.each([
    [{ ...config, assigneeUserIds: [] }, '2026-11-02'],
    [{ ...config, assigneeUserIds: [1.5] }, '2026-11-02'],
    [{ ...config, endTime: '08:30' }, '2026-11-02'],
    [{ ...config, timezone: 'not-a-zone' }, '2026-11-02'],
    [config, '2026-02-30'], [config, '2026-99-99'], [config, null]
  ])('rejects invalid assignments and dates', (value, day) => {
    expect(() => normalizeOutreachEventConfig(value, day)).toThrow();
  });
  it('creates one event with the complete route, active assignees and DST-correct times', async () => {
    const id = await syncOutreachTripEvent(db, 2, trip(), 7);
    expect(id).toBe(100);
    const insert = db.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO company_events'));
    expect(insert[1][5].toISOString()).toBe('2026-11-02T16:00:00.000Z');
    expect(insert[1][6].toISOString()).toBe('2026-11-02T19:00:00.000Z');
    expect(insert[1][4]).toContain('Second school');
    expect(db.execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO company_event_provider_assignments')).map(([,args]) => args)).toEqual([[100,12],[100,485]]);
    expect(db.execute.mock.calls.some(([sql]) => sql.includes('payroll_time_claims'))).toBe(false);
  });
  it('reuses the linked event on edits and removes stale assignments', async () => {
    const previous = { ...trip(), company_event_id: 100 };
    const changed = { ...previous, outreachEvent: { ...previous.outreachEvent, assigneeUserIds: [485] } };
    expect(await syncOutreachTripEvent(db, 2, changed, 7, previous)).toBe(100);
    expect(db.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO company_events'))).toBe(false);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('provider_user_id NOT IN'), [100,485]);
  });
  it('rejects foreign/inactive assignees and missing venue addresses before creating an event', async () => {
    eligible = [{ id: 12 }];
    await expect(syncOutreachTripEvent(db, 2, trip(), 7)).rejects.toThrow('active employee');
    eligible = [{ id: 485 },{ id: 12 }];
    const missing = trip(); missing.stops[1].address = '';
    await expect(syncOutreachTripEvent(db, 2, missing, 7)).rejects.toThrow('street address');
    expect(db.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO company_events'))).toBe(false);
  });
  it('blocks rescheduling, reassignment and cancellation once work has been recorded', async () => {
    hasAttendance = true; const previous = { ...trip(), company_event_id: 100 };
    for (const patch of [{ planned_date: '2026-11-03' }, { outreachEvent: { ...config, assigneeUserIds: [485] } }, { status: 'cancelled' }]) {
      await expect(syncOutreachTripEvent(db, 2, { ...previous, ...patch }, 7, previous)).rejects.toThrow('attendance or a travel/payroll report');
    }
    expect(db.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE company_events'))).toBe(false);
  });
  it('permits title corrections without changing recorded attendance', async () => {
    hasAttendance = true; const previous = { ...trip(), company_event_id: 100 };
    previous.outreachEvent = { endTime:'12:00', enabled:true, timezone:'America/Denver', startTime:'09:00', assigneeUserIds:[485,12] };
    await expect(syncOutreachTripEvent(db, 2, { ...previous, title: 'Corrected title' }, 7, previous)).resolves.toBe(100);
  });
  it('cancels an unused event and revokes its assignments when disabled', async () => {
    const previous = { ...trip(), company_event_id: 100 };
    await syncOutreachTripEvent(db, 2, { ...previous, outreachEvent: { enabled: false } }, 7, previous);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('is_active = 0'), [7,100,2]);
    expect(db.execute).toHaveBeenCalledWith('DELETE FROM company_event_provider_assignments WHERE company_event_id = ?', [100]);
  });
  it('requires agency-scoped Outreach Hub access', async () => {
    db.execute.mockResolvedValue([[]]);
    await expect(assertOutreachTripActor(db, 2, 7)).rejects.toMatchObject({ status:403 });
  });
});

it('does not allow a provider to self-authorize an Outreach Event', async () => {
  db.execute.mockImplementation(async sql => sql === 'SELECT role FROM users WHERE id = ?' ? [[{role:'provider_plus'}]] : [[]]);
  await expect(syncOutreachTripEvent(db,2,trip(),485)).rejects.toMatchObject({status:403});
  expect(db.execute.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
});
