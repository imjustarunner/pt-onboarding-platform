export function sessionAttendanceState(session) {
  const correction = String(session?.attendanceCorrectionType || '').toUpperCase();
  if (correction === 'MISSED') return 'missed';
  if (correction === 'EXCUSED') return 'excused';
  const status = String(session?.status || '').toUpperCase();
  if (status === 'CANCELLED' || status === 'RESCHEDULED') return 'cancelled';
  if (Number(session?.totalSeconds) > 0) return 'attended';
  if (status === 'MISSED') return 'missed';
  return 'unknown';
}
export function supervisionSessionCounts(sessions = []) {
  const result = {total:sessions.length, attended:0, missed:0, excused:0, cancelled:0, unknown:0};
  sessions.forEach(session => result[sessionAttendanceState(session)]++);
  return result;
}
export const sessionAttendanceLabels = {attended:'Attended',missed:'Missed supervision',excused:'Excused absence',cancelled:'Cancelled / rescheduled',unknown:'No attendance outcome recorded'};
export function safeTranscriptUrl(value) {
  try { const url = new URL(String(value || '')); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
