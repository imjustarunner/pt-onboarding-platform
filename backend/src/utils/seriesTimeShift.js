/**
 * Wall-time helpers for shifting recurring session times without TZ drift.
 * Accepts "YYYY-MM-DD HH:MM:SS", "YYYY-MM-DDTHH:MM:SS", or date-only.
 */

export function parseWallParts(raw) {
  const s = String(raw || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  return {
    y: Number(m[1]),
    mo: Number(m[2]),
    d: Number(m[3]),
    h: m[4] != null ? Number(m[4]) : 0,
    mi: m[5] != null ? Number(m[5]) : 0,
    s: m[6] != null ? Number(m[6]) : 0
  };
}

export function formatWallDateTime(parts) {
  if (!parts) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${parts.y}-${pad(parts.mo)}-${pad(parts.d)} ${pad(parts.h)}:${pad(parts.mi)}:${pad(parts.s || 0)}`;
}

export function wallPartsToUtcMs(parts) {
  if (!parts) return null;
  return Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s || 0);
}

export function utcMsToWallParts(ms) {
  const d = new Date(ms);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    s: d.getUTCSeconds()
  };
}

export function durationMinutesBetween(startRaw, endRaw) {
  const a = parseWallParts(startRaw);
  const b = parseWallParts(endRaw);
  if (!a || !b) return 60;
  const mins = Math.round((wallPartsToUtcMs(b) - wallPartsToUtcMs(a)) / 60000);
  return Number.isFinite(mins) && mins > 0 ? mins : 60;
}

/**
 * Apply new start/end clock times onto an occurrence while keeping its calendar date.
 * Uses the date from the occurrence's current start; duration from newStart→newEnd.
 */
export function applyClockTimesToOccurrence({
  occurrenceStartRaw,
  newStartRaw,
  newEndRaw
}) {
  const occ = parseWallParts(occurrenceStartRaw);
  const ns = parseWallParts(newStartRaw);
  const ne = parseWallParts(newEndRaw);
  if (!occ || !ns || !ne) return null;
  const durMins = durationMinutesBetween(newStartRaw, newEndRaw);
  const startParts = {
    y: occ.y,
    mo: occ.mo,
    d: occ.d,
    h: ns.h,
    mi: ns.mi,
    s: ns.s || 0
  };
  const endParts = utcMsToWallParts(wallPartsToUtcMs(startParts) + durMins * 60000);
  return {
    startAt: formatWallDateTime(startParts),
    endAt: formatWallDateTime(endParts),
    startDate: `${String(startParts.y).padStart(4, '0')}-${String(startParts.mo).padStart(2, '0')}-${String(startParts.d).padStart(2, '0')}`,
    endDate: `${String(endParts.y).padStart(4, '0')}-${String(endParts.mo).padStart(2, '0')}-${String(endParts.d).padStart(2, '0')}`,
    durationMinutes: durMins
  };
}
