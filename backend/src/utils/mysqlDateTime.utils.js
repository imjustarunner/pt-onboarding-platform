const pad2 = (n) => String(n).padStart(2, '0');

function formatUtcDateTime(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function formatLocalDateTime(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * Coerce API / ISO-8601 / datetime-local values to a MySQL DATETIME literal (YYYY-MM-DD HH:MM:SS).
 * RFC3339 with Z is mapped using UTC components so it matches frontend Date#toISOString().
 */
export function toMysqlDateTimeOrNull(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatUtcDateTime(value);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) {
    return raw.slice(0, 19);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return null;
    return formatUtcDateTime(d);
  }
  // datetime-local style without offset: keep wall time (space instead of T)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?$/.test(raw)) {
    const noFrac = raw.replace(/\.\d+$/, '');
    const withSeconds = noFrac.length === 16 ? `${noFrac}:00` : noFrac;
    return withSeconds.replace('T', ' ').slice(0, 19);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  if (/Z|[+-]\d{2}:?\d{2}$/.test(raw)) {
    return formatUtcDateTime(d);
  }
  return formatLocalDateTime(d);
}
