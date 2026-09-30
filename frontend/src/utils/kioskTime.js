// Kiosk display endpoints return office-local wall digits, not UTC instants.
// Format those digits without applying the tablet's timezone a second time.
export function formatKioskTime(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/);
  if (!match) return '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}
