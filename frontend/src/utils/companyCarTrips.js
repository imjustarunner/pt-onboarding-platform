export function getTripMiles(trip) {
  const miles = Number(trip?.miles);
  if (Number.isFinite(miles) && miles > 0) return Math.round(miles * 100) / 100;
  const start = Number(trip?.start_odometer_miles);
  const end = Number(trip?.end_odometer_miles);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return Math.round((end - start) * 100) / 100;
  }
  return Number.isFinite(miles) ? miles : 0;
}

export function getDestinationsText(trip) {
  const json = trip?.destinations_json;
  if (!json) return '';
  try {
    const arr = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(arr) ? arr.join(', ') : '';
  } catch {
    return '';
  }
}

export function hasNoDestination(trip) {
  return !getDestinationsText(trip).trim();
}

export function hasNoReason(trip) {
  return !String(trip?.reason_for_travel || '').trim();
}

export function formatDateYmd(val) {
  if (!val) return '';
  const s = String(val);
  return s.slice(0, 10);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDateWithDay(val) {
  const ymd = formatDateYmd(val);
  if (!ymd) return '—';
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return `${DAY_NAMES[d.getDay()]} ${ymd}`;
}

export function milesWithinTolerance(a, b, tolerance = 2) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= tolerance;
}

export function sortTripsForDisplay(trips, sortMode = 'date') {
  const list = [...(trips || [])];
  if (sortMode === 'miles') {
    return list.sort((a, b) => getTripMiles(a) - getTripMiles(b));
  }
  if (sortMode === 'similar') {
    return list.sort((a, b) => {
      const ma = getTripMiles(a);
      const mb = getTripMiles(b);
      if (ma !== mb) return ma - mb;
      return formatDateYmd(a.drive_date).localeCompare(formatDateYmd(b.drive_date));
    });
  }
  // date desc (default API order)
  return list.sort((a, b) => {
    const da = formatDateYmd(a.drive_date);
    const db = formatDateYmd(b.drive_date);
    if (da !== db) return db.localeCompare(da);
    return Number(b.id) - Number(a.id);
  });
}

export function findSimilarTripIds(trips, anchorIds, tolerance = 2) {
  const anchors = (trips || []).filter((t) => anchorIds.includes(t.id));
  if (!anchors.length) return [];
  const anchorMiles = anchors.map((t) => getTripMiles(t));
  const minM = Math.min(...anchorMiles) - tolerance;
  const maxM = Math.max(...anchorMiles) + tolerance;
  return (trips || [])
    .filter((t) => {
      const m = getTripMiles(t);
      return m >= minM && m <= maxM;
    })
    .map((t) => t.id);
}
