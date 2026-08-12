/**
 * Parses Google Timeline / Location History JSON exports into driving trip candidates.
 * Supports phone export (semanticSegments) and Takeout Semantic Location History (timelineObjects).
 */

const VEHICLE_ACTIVITY_RE = /vehicle|driving|car|automobile|passenger/i;
const MIN_TRIP_MILES = 0.3;

function parseLatLng(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && raw.latitudeE7 != null && raw.longitudeE7 != null) {
    return {
      lat: Number(raw.latitudeE7) / 1e7,
      lng: Number(raw.longitudeE7) / 1e7
    };
  }
  const s = String(raw);
  const m = s.match(/([-+]?\d+(?:\.\d+)?)\s*°?\s*,\s*([-+]?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function toDateStringFromIso(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function metersToMiles(meters) {
  const m = Number(meters);
  if (!Number.isFinite(m) || m <= 0) return 0;
  return Math.round((m / 1609.344) * 100) / 100;
}

function isVehicleActivity(activityType) {
  const t = String(activityType || '').trim();
  if (!t) return false;
  if (/walk|cycle|bike|run|foot|stationary|still/i.test(t)) return false;
  return VEHICLE_ACTIVITY_RE.test(t) || t === 'UNKNOWN_ACTIVITY_TYPE';
}

function extractActivityType(segment) {
  const act = segment?.activity || segment?.activitySegment;
  if (!act) return null;
  const top = act.topCandidate || act.topCandidate?.type ? act.topCandidate : null;
  if (top?.type) return top.type;
  if (act.activityType) return act.activityType;
  const activities = act.activities || [];
  const best = activities.reduce((a, b) => (Number(b?.probability || 0) > Number(a?.probability || 0) ? b : a), activities[0]);
  return best?.activityType || best?.type || null;
}

function extractDistanceMeters(segment) {
  const act = segment?.activity || segment?.activitySegment;
  if (!act) return 0;
  const d = Number(act.distanceMeters ?? act.distance ?? 0);
  return Number.isFinite(d) ? d : 0;
}

function extractLatLngPair(segment) {
  const act = segment?.activity || segment?.activitySegment;
  if (!act) return { start: null, end: null };
  const start = parseLatLng(act.start?.latLng || act.startLocation?.latLng || act.startLocation);
  const end = parseLatLng(act.end?.latLng || act.endLocation?.latLng || act.endLocation);
  return { start, end };
}

function visitLabel(visitSegment) {
  const visit = visitSegment?.visit || visitSegment?.placeVisit;
  if (!visit) return null;
  const top = visit.topCandidate || visit.location?.name ? visit : null;
  const candidate = top?.topCandidate || visit.topCandidate;
  const semantic = candidate?.semanticType || visit.location?.semanticType;
  if (semantic === 'HOME') return 'Home';
  if (semantic === 'WORK') return 'Work';
  const loc = parseLatLng(candidate?.placeLocation?.latLng || visit.location?.latLng);
  if (loc) return `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
  return null;
}

function normalizeSegments(root) {
  if (!root || typeof root !== 'object') return { format: 'unknown', segments: [] };

  if (Array.isArray(root.semanticSegments)) {
    return { format: 'semanticSegments', segments: root.semanticSegments };
  }

  if (Array.isArray(root.timelineObjects)) {
    return { format: 'timelineObjects', segments: root.timelineObjects };
  }

  if (Array.isArray(root)) {
    return { format: 'array', segments: root };
  }

  return { format: 'unknown', segments: [] };
}

function segmentStartTime(segment) {
  return segment?.startTime || segment?.activitySegment?.duration?.startTimestamp || segment?.placeVisit?.duration?.startTimestamp || null;
}

function buildCandidatesFromSegments(segments) {
  const sorted = [...segments].sort((a, b) => {
    const ta = Date.parse(segmentStartTime(a) || 0);
    const tb = Date.parse(segmentStartTime(b) || 0);
    return ta - tb;
  });

  const candidates = [];
  let prevVisitLabel = null;

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    const hasActivity = !!(seg?.activity || seg?.activitySegment);
    const hasVisit = !!(seg?.visit || seg?.placeVisit);

    if (hasVisit) {
      prevVisitLabel = visitLabel(seg) || prevVisitLabel;
      continue;
    }

    if (!hasActivity) continue;

    const activityType = extractActivityType(seg);
    const distanceMeters = extractDistanceMeters(seg);
    const miles = metersToMiles(distanceMeters);

    if (miles < MIN_TRIP_MILES) continue;
    if (!isVehicleActivity(activityType) && miles < 1) continue;

    const startIso = segmentStartTime(seg);
    const endIso = seg?.endTime || seg?.activitySegment?.duration?.endTimestamp || null;
    const driveDate = toDateStringFromIso(startIso);
    if (!driveDate) continue;

    const { start: startLatLng, end: endLatLng } = extractLatLngPair(seg);

    let nextVisitLabel = null;
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j]?.visit || sorted[j]?.placeVisit) {
        nextVisitLabel = visitLabel(sorted[j]);
        break;
      }
    }

    const origin = prevVisitLabel || (startLatLng ? `${startLatLng.lat.toFixed(5)}, ${startLatLng.lng.toFixed(5)}` : null);
    const destination = nextVisitLabel || (endLatLng ? `${endLatLng.lat.toFixed(5)}, ${endLatLng.lng.toFixed(5)}` : null);

    candidates.push({
      rowIndex: candidates.length + 1,
      driveDate,
      startTime: startIso,
      endTime: endIso,
      miles,
      distanceMeters,
      activityType: activityType || null,
      origin,
      destination,
      startLatLng,
      endLatLng,
      destinations: [destination].filter(Boolean),
      originLabel: origin,
      destinationLabel: destination
    });

    if (nextVisitLabel) prevVisitLabel = nextVisitLabel;
  }

  return candidates;
}

export default class CompanyCarTimelineImportService {
  static parseJson(bufferOrText) {
    let root;
    try {
      const text = Buffer.isBuffer(bufferOrText) ? bufferOrText.toString('utf8') : String(bufferOrText || '');
      root = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid JSON file. Export Timeline from Google Maps and upload the .json file.');
    }

    const { format, segments } = normalizeSegments(root);
    if (!segments.length) {
      throw new Error('No timeline segments found. Expected semanticSegments or timelineObjects in the JSON export.');
    }

    const candidates = buildCandidatesFromSegments(segments);
    return {
      format,
      segmentCount: segments.length,
      candidates
    };
  }

  static filterCandidates(candidates, { fromDate = null, toDate = null, minMiles = MIN_TRIP_MILES } = {}) {
    const from = fromDate ? String(fromDate).slice(0, 10) : null;
    const to = toDate ? String(toDate).slice(0, 10) : null;
    const min = Number(minMiles) || MIN_TRIP_MILES;

    return (candidates || []).filter((c) => {
      if (!c.driveDate) return false;
      if (from && c.driveDate < from) return false;
      if (to && c.driveDate > to) return false;
      if (Number(c.miles) < min) return false;
      return true;
    });
  }
}
