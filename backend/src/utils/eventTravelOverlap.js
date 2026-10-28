const instant = value => value instanceof Date ? +value : Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(String(value)) ? value : String(value).replace(' ','T')+'Z');
/** The travel form accepts minutes. A checkout at 17:31:56 and departure entered
 * as 17:31 refer to the same displayed boundary, not another minute of work.
 * Keep the recorded attendance/payroll timestamps intact. */
export function overlapsRecordedAttendance(segment, attendance) {
  const start=instant(segment.startedAt),end=instant(segment.endedAt);
  let recordedStart=instant(attendance.startedAt),recordedEnd=instant(attendance.endedAt);
  if (![start,end,recordedStart,recordedEnd].every(Number.isFinite)) return true;
  if (start % 60000 === 0 && end % 60000 === 0) {
    recordedStart=Math.floor(recordedStart/60000)*60000;
    recordedEnd=Math.floor(recordedEnd/60000)*60000;
  }
  return recordedStart < end && recordedEnd > start;
}
