import { calendarWallDate } from './calendarWallClock.js';
import { zonedDatetimeLocalToIso } from './timezones.js';

export function schoolSoftScheduleStatus(row) {
  if (row.canceled === false) return { tone: 'scheduled', label: 'School soft schedule' };
  const delivery = row.delivery || {};
  if (!delivery.sent || ['held', 'skipped', 'failed', 'suppressed'].some(k => delivery[k] > 0)) {
    return { tone: 'attention', label: 'Canceled · contact needs attention' };
  }
  const sent = (delivery.deliveries || []).filter(d => d.status === 'sent');
  if (sent.length && sent.every(d => d.receiptConfirmedAt)) return { tone: 'sent', label: 'Canceled · receipt confirmed' };
  return { tone: 'sent', label: sent.some(d => d.receiptRequired && !d.receiptConfirmedAt)
    ? 'Canceled · awaiting receipt' : 'Canceled · email sent' };
}

const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const clock = date => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const validTime = time => /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(String(time || ''));

/** Display projections only: never create an appointment or change the saved soft schedule. */
export function schoolSoftScheduleBlocks(records = [], displayTimeZone = 'America/Denver') {
  const blocks = [];
  const seen = new Set();
  for (const row of records) {
    const status = schoolSoftScheduleStatus(row);
    const slots = row.slots?.length ? row.slots : [null];
    for (const slot of slots) {
      let startAt = slot?.startAt, endAt = slot?.endAt, start = null, end = null;
      try {
        // Older cancellation snapshots preserve school wall times instead of UTC instants.
        if (!startAt && validTime(slot?.startTime)) startAt = zonedDatetimeLocalToIso(`${row.date}T${slot.startTime}`, row.timeZone || displayTimeZone);
        if (!endAt && validTime(slot?.endTime)) endAt = zonedDatetimeLocalToIso(`${row.date}T${slot.endTime}`, row.timeZone || displayTimeZone);
        start = calendarWallDate(startAt, displayTimeZone);
        end = calendarWallDate(endAt, displayTimeZone);
      } catch { /* An incomplete slot belongs in Time not set, never at an invented time. */ }
      const timed = start && end && end > start;
      const key = `school-soft-${row.agencyId}-${row.providerId}-${row.date}-${row.clientId}-${row.schoolId}-${timed ? `${start.getTime()}-${end.getTime()}` : 'untimed'}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const timeLabel = timed ? `${clock(start)}–${clock(end)}` : 'Time not set';
      blocks.push({
        key, kind: 'school-soft', agencyId: row.agencyId, schoolOrgId: row.schoolId,
        clientName: row.clientName, schoolName: row.schoolName, record: row, status,
        isCancelled: row.canceled !== false, isClientSession: true, calendarLocationKind: 'school',
        canEdit: false, draggable: false, untimed: !timed,
        displayDate: timed ? dateKey(start) : row.date, displayTimeZone,
        startAt: timed ? startAt : null, endAt: timed ? endAt : null,
        wallStart: timed ? start : null, wallEnd: timed ? end : null,
        startTime: timed ? clock(start) : '', endTime: timed ? clock(end) : '', timeLabel,
        shortLabel: `${row.clientName || 'School client'}\n${timeLabel} · ${row.schoolName || 'School'}`,
        title: `${row.clientName || 'School client'} · ${row.schoolName || 'School'} · ${timed ? dateKey(start) : row.date} · ${timeLabel} · ${status.label}`
      });
    }
  }
  return blocks;
}

export function schoolSoftBlocksInCell(blocks, date, hour, minute, stepMinutes, expanded = false) {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const cellStart = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`).getTime();
  const cellMs = stepMinutes * 60000;
  return blocks.flatMap(block => {
    if (block.untimed || block.wallEnd <= dayStart || block.wallStart >= dayEnd) return [];
    const start = Math.max(block.wallStart.getTime(), dayStart.getTime());
    const end = Math.min(block.wallEnd.getTime(), dayEnd.getTime());
    if (start >= cellStart + cellMs || end <= cellStart || (!expanded && start < cellStart)) return [];
    return [{ ...block, spanBlock: true, timedSlice: {
      topPct: Math.max(0, (start - cellStart) / cellMs * 100),
      heightPct: (end - Math.max(start, cellStart)) / cellMs * 100
    } }];
  });
}
