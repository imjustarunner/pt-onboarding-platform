export function formatScheduleClock(value, format = '12h') {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return String(value || '');
  const hour = Number(match[1]), minute = match[2];
  if (format === '24h') return `${String(hour).padStart(2,'0')}:${minute}`;
  return `${hour % 12 || 12}${minute === '00' ? '' : `:${minute}`} ${hour < 12 ? 'AM' : 'PM'}`;
}
