import { describe, expect, it } from 'vitest';
import { parseMileagePaste, mergeMileage } from '../accountabilityMileage';
describe('accountability tracker imports', () => {
  it('accepts spreadsheet tabs and normalizes US dates', () => {
    const rows = parseMileagePaste('Date\tFrom\tTo\tPurpose\tMiles\tNotes\n9/2/2026\tHome office\tSchool\tMeeting\t12.5\tRound trip', '2026-09');
    expect(rows[0]).toMatchObject({ date: '2026-09-02', start: 'Home office', miles: 12.5, notes: 'Round trip' });
  });
  it('accepts quoted CSV commas and multiline notes', () => {
    const rows = parseMileagePaste('Trip Date,Origin,Destination,Business Purpose,Distance,Notes\r\n2026-09-02,"Denver, CO",School,Meeting,10,"First line\nSecond line"', '2026-09');
    expect(rows[0].start).toBe('Denver, CO'); expect(rows[0].notes).toContain('\n');
  });
  it('rejects invalid dates, other months, missing columns, and invalid mileage', () => {
    for (const line of ['2026-08-01,A,B,Meeting,10', '2026-09-31,A,B,Meeting,10', '2026-09-01,A,B,Meeting,-10', '2026-09-01,A,B,Meeting,abc']) expect(() => parseMileagePaste(`Date,From,To,Purpose,Miles\n${line}`, '2026-09')).toThrow();
    expect(() => parseMileagePaste('Date,Miles\n2026-09-02,10', '2026-09')).toThrow(/start/);
  });
  it('skips duplicate trips both within the paste and against saved entries', () => {
    const [trip] = parseMileagePaste('Date,From,To,Purpose,Miles\n2026-09-02,Office,School,Meeting,10', '2026-09');
    const merged = mergeMileage([{ ...trip, id: 'existing' }], [trip, { ...trip, start: ' OFFICE ' }, { ...trip, miles: 12 }], () => 'new');
    expect(merged.skipped).toBe(2); expect(merged.rows).toHaveLength(2); expect(merged.rows[1].id).toBe('new');
  });
});
