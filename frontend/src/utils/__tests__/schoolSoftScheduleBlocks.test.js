import { expect, it } from 'vitest';
import { schoolSoftScheduleBlocks, schoolSoftBlocksInCell } from '../schoolSoftScheduleBlocks.js';
const base = { agencyId: 450, providerId: 7, clientId: 100, schoolId: 20, date: '2026-11-03', timeZone: 'America/Denver', clientName: 'Synthetic student', schoolName: 'Demo school', canceled: false };
it('positions exact school minutes from UTC and retained school wall times consistently after DST', () => {
  const row = { ...base, slots: [{ startTime: '10:28:00', endTime: '11:21:00' }] };
  const [wall] = schoolSoftScheduleBlocks([row]);
  const [utc] = schoolSoftScheduleBlocks([{ ...row, slots: [{ startAt: '2026-11-03T17:28:00Z', endAt: '2026-11-03T18:21:00Z' }] }]);
  expect(wall.wallStart).toEqual(utc.wallStart);
  expect(wall.startAt).toBe('2026-11-03T17:28:00.000Z');
  expect(wall.timeLabel).toBe('10:28 AM–11:21 AM');
  const [block] = schoolSoftBlocksInCell([wall], base.date, 10, 0, 60);
  expect(block.timedSlice.topPct).toBeCloseTo(28 / 60 * 100);
  expect(block.timedSlice.heightPct).toBeCloseTo(53 / 60 * 100);
  expect(schoolSoftBlocksInCell([wall], base.date, 11, 0, 60)).toHaveLength(0);
  expect(schoolSoftBlocksInCell([wall], base.date, 11, 0, 60, true)).toHaveLength(1);
  expect(schoolSoftBlocksInCell([wall], base.date, 10, 15, 15)[0].timedSlice.topPct).toBeCloseTo(13 / 15 * 100);
});
it('uses the selected calendar zone and date, including when the date changes', () => {
  const [block] = schoolSoftScheduleBlocks([{ ...base, slots: [{ startAt: '2026-11-04T02:00:00Z', endAt: '2026-11-04T03:00:00Z' }] }], 'America/Los_Angeles');
  expect(block.displayDate).toBe('2026-11-03'); expect(block.timeLabel).toBe('6 PM–7 PM');
  expect(schoolSoftBlocksInCell([block], '2026-11-03', 18, 0, 60)).toHaveLength(1);
  expect(schoolSoftBlocksInCell([block], '2026-11-04', 18, 0, 60)).toHaveLength(0);
});
it('never invents a time for missing or invalid slots; retains distinct slots and deduplicates repeats', () => {
  const rows = [{ ...base, slots: [] }, { ...base, clientId: 101, slots: [{ startTime: '09:00', endTime: '' }, { startTime: '25:00', endTime: '26:00' }] }];
  const blocks = schoolSoftScheduleBlocks(rows);
  expect(blocks).toHaveLength(2); expect(blocks.every(b => b.untimed && b.startAt === null && b.timeLabel === 'Time not set')).toBe(true);
  expect(schoolSoftBlocksInCell(blocks, base.date, 0, 0, 60)).toEqual([]);
  const slot = { startTime: '09:00', endTime: '09:45' };
  expect(schoolSoftScheduleBlocks([{ ...base, slots: [slot, slot, { startTime: '14:00', endTime: '14:30' }] }])).toHaveLength(2);
});
it('retains failure and per-recipient receipt distinctions without making a sent email a confirmed receipt', () => {
  const project = delivery => schoolSoftScheduleBlocks([{ ...base, canceled: true, delivery }])[0];
  expect(project({ sent: 1, failed: 1 }).status.tone).toBe('attention');
  expect(project({ sent: 0 }).status.label).toContain('needs attention');
  expect(project({ sent: 1, deliveries: [{ status: 'sent', receiptRequired: true }] }).status.label).toContain('awaiting receipt');
  expect(project({ sent: 1, deliveries: [{ status: 'sent', receiptConfirmedAt: '2026-11-02 20:00:00' }] }).status.label).toContain('receipt confirmed');
  expect(project({ sent: 1 }).status.label).toBe('Canceled · email sent');
});

it('honors the explicit 24-hour preference without changing placement',()=>{
 const rows=[{...base,slots:[{startTime:'14:00',endTime:'15:30'}]}];
 const [normal]=schoolSoftScheduleBlocks(rows,'America/Denver');
 const [military]=schoolSoftScheduleBlocks(rows,'America/Denver','24h');
 expect(normal.timeLabel).toBe('2 PM–3:30 PM');expect(military.timeLabel).toBe('14:00–15:30');expect(normal.startAt).toBe(military.startAt);
});
