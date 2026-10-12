import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { buildHandbookHolidayToasts, handbookHolidayDates } from '../../utils/handbookHolidayToasts.js';
import { validateToast, saveToast, deleteToast, listToasts, practiceToastAgency, requireToastOperator } from '../toastAnnouncements.service.js';

describe('one-time handbook holiday seed', () => {
  const rows = buildHandbookHolidayToasts();
  const byDate = (date, kind) => rows.find((r) => r.seed_key === `handbook-office-holidays:${date}:${kind}`);
  it('matches all three handbook policies and the committed seed', () => {
    const actual = execFileSync(process.execPath, ['src/scripts/generateHandbookHolidayToastSeed.js'], { cwd: new URL('../../../', import.meta.url), encoding: 'utf8' });
    expect(actual).toBe(readFileSync(new URL('../../../../database/migrations/1617_seed_handbook_holiday_toasts.sql', import.meta.url), 'utf8'));
    expect(new Set(rows.map((r) => r.seed_key)).size).toBe(rows.length);
    expect(actual).toContain('ON DUPLICATE KEY UPDATE seed_key = VALUES(seed_key)');
  });
  it('reminds Friday for a Monday holiday, using Denver midnight and DST', () => {
    const row = byDate('2027-01-18', 'reminder');
    expect(row.starts_at).toBe('2027-01-15T07:00:00.000Z');
    expect(row.ends_at).toBe('2027-01-18T07:00:00.000Z');
    expect(byDate('2027-09-06', 'reminder').starts_at).toBe('2027-09-03T06:00:00.000Z');
  });
  it('groups Thanksgiving, Friday and the weekend and returns Monday', () => {
    const row = byDate('2026-11-26', 'closed');
    expect(row.returnDate).toBe('2026-11-30');
    expect(row.message).toContain('closed today');
    expect(row.message).toContain('Day after Thanksgiving');
    expect(byDate('2026-11-27', 'closed')).toBeUndefined();
  });
  it('skips adjacent holidays across the year boundary', () => {
    expect(byDate('2026-12-31', 'closed').returnDate).toBe('2027-01-04');
    expect(byDate('2026-12-31', 'reminder').starts_at).toBe('2026-12-30T07:00:00.000Z');
    expect(byDate('2027-01-01', 'closed')).toBeUndefined();
    expect(byDate('2027-12-31', 'closed').returnDate).toBe('2028-01-03');
  });
  it('does not invent weekend observance and leaves clinical schedules alone', () => {
    expect(byDate('2027-07-04', 'closed').returnDate).toBe('2027-07-05');
    expect(rows.every((r) => r.message.includes('This closure applies to administrative offices only; provider appointments and services follow their individual schedules.'))).toBe(true);
    expect(handbookHolidayDates(2027).find(([, name]) => name === 'Memorial Day')[0]).toBe('2027-05-31');
    expect(rows.every((r) => new Date(r.ends_at) - new Date(r.starts_at) <= 14 * 86400000)).toBe(true);
  });
});

describe('toast validation and scope', () => {
  const input = { title: 'Support closed', message: 'We return Monday.', starts_at: '2027-01-01T07:00:00Z', ends_at: '2027-01-04T07:00:00Z' };
  it('accepts scheduled toasts and drafts but rejects splashes, invalid dates, long windows and empty published messages', () => {
    expect(validateToast(input, Date.parse('2026-10-12')).message).toBe(input.message);
    expect(validateToast({ ...input, message: '', publish_status: 'draft' }).publishStatus).toBe('draft');
    for (const bad of [{ display_type: 'splash' }, { message: '' }, { starts_at: 'bad' }, { ends_at: input.starts_at }, { ends_at: '2027-02-04T07:00:00Z' }, { message: 'x'.repeat(1201) }, { publish_status: 'oops' }]) {
      expect(() => validateToast({ ...input, ...bad })).toThrow();
    }
  });
  it('allows practice admins/support permission and operators, never patients or another practice through input', async () => {
    const ctx = { actorType: 'staff', agencyId: 7, permissions: ['announcements'], profile: {} };
    expect(practiceToastAgency(ctx, true)).toBe(7);
    expect(practiceToastAgency({ ...ctx, permissions: ['admin'] }, true)).toBe(7);
    expect(() => practiceToastAgency({ ...ctx, actorType: 'patient' }, true)).toThrow();
    expect(() => practiceToastAgency({ ...ctx, permissions: [] }, true)).toThrow();
    expect(() => practiceToastAgency({ ...ctx, agencyId: null }, true)).toThrow();
    expect(() => requireToastOperator(ctx)).toThrow();
    expect(() => requireToastOperator({ profile: { operator: true } })).not.toThrow();
    const db = { execute: vi.fn().mockResolvedValue([{ insertId: 42 }]) };
    await saveToast({ agencyId: 7, accountId: 'operator', input: { ...input, agency_id: 99, delivery_scope: 'auricwell_support' } }, db);
    expect(db.execute.mock.calls[0][1].slice(5)).toEqual([7, null, 'operator', 'agency']);
  });
  it('uses separate practice/platform scopes for reads and every mutation', async () => {
    const db = { execute: vi.fn().mockResolvedValue([{ affectedRows: 0 }]) };
    await expect(saveToast({ agencyId: 7, id: 42, input }, db)).rejects.toMatchObject({ status: 404 });
    expect(db.execute.mock.calls[0][0]).toContain("agency_id = ? AND delivery_scope = 'agency'");
    expect(db.execute.mock.calls[0][1].slice(-2)).toEqual([42, 7]);
    await expect(deleteToast({ id: 42 }, db)).rejects.toMatchObject({ status: 404 });
    expect(db.execute.mock.calls[1][0]).toContain("agency_id IS NULL AND delivery_scope = 'auricwell_support'");
    db.execute.mockResolvedValue([[]]);
    await listToasts({ agencyId: 7, active: true, includeSupport: true }, db);
    expect(db.execute.mock.calls[2][0]).toContain("publish_status = 'published'");
    expect(db.execute.mock.calls[2][0]).toContain('ends_at > UTC_TIMESTAMP()');
    expect(db.execute.mock.calls[2][0]).toContain('JSON_LENGTH(recipient_user_ids) = 0');
    expect(db.execute.mock.calls[2][1]).toEqual([7]);
  });
});
