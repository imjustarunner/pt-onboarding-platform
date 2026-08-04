/**
 * Parse schedule / office instants for UI positioning.
 *
 * - Values with an explicit timezone (Z / ±hh:mm) use Date's UTC conversion.
 * - Naked MySQL DATETIME / ISO-without-zone from provider_schedule_events are
 *   wall-clock local times (see toMysqlDateTimeWall) — parse as local, not UTC.
 */
export function parseScheduleInstant(raw) {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const s = String(raw || '').trim();
  if (!s) return null;

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || 0)
    );
  }

  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}
