/**
 * Parses Google Timeline / Location History JSON exports into driving trip candidates.
 * Supports phone export (semanticSegments) and Takeout Semantic Location History (timelineObjects).
 */

const VEHICLE_ACTIVITY_RE = /vehicle|driving|car|automobile|passenger|IN_PASSENGER/i;
const MIN_TRIP_MILES = 0.3;

function parseLatLng(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') {
    if (raw.latitudeE7 != null && raw.longitudeE7 != null) {
      return {
        lat: Number(raw.latitudeE7) / 1e7,
        lng: Number(raw.longitudeE7) / 1e7
      };
    }
    if (raw.lat != null && raw.lng != null) {
      const lat = Number(raw.lat);
      const lng = Number(raw.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    if (raw.latLng) return parseLatLng(raw.latLng);
  }
  const s = String(raw);
  const m = s.match(/([-+]?\d+(?:\.\d+)?)\s*°?\s*,\s*([-+]?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function latLngLabel(latLng) {
  if (!latLng) return null;
  return `${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`;
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

function haversineMeters(a, b) {
  if (!a || !b) return 0;
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pathDistanceMeters(pathPoints) {
  let total = 0;
  for (let i = 1; i < pathPoints.length; i++) {
    total += haversineMeters(pathPoints[i - 1], pathPoints[i]);
  }
  return total;
}

function normalizeSemanticType(raw) {
  const s = String(raw || '').toUpperCase();
  if (s.includes('HOME')) return 'HOME';
  if (s.includes('WORK')) return 'WORK';
  return s;
}

function displayNameFromCandidate(candidate) {
  if (!candidate) return null;
  const dn = candidate.placeDisplayName;
  if (typeof dn === 'string' && dn.trim()) return dn.trim();
  if (dn?.text) return String(dn.text).trim();
  if (candidate.name) return String(candidate.name).trim();
  return null;
}

function visitInfo(segment) {
  const visit = segment?.visit || segment?.placeVisit;
  if (!visit) return null;

  const candidate = visit.topCandidate || visit.location || null;
  const location = visit.location || candidate?.placeLocation || null;

  const displayName =
    displayNameFromCandidate(candidate) ||
    (visit.location?.name ? String(visit.location.name).trim() : null) ||
    (visit.location?.address ? String(visit.location.address).trim() : null) ||
    (location?.name ? String(location.name).trim() : null) ||
    (location?.address ? String(location.address).trim() : null);

  const semantic = normalizeSemanticType(
    candidate?.semanticType || visit.location?.semanticType || visit.semanticType
  );

  let label = displayName;
  if (!label && semantic === 'HOME') label = 'Home';
  if (!label && semantic === 'WORK') label = 'Work';

  const latLng =
    parseLatLng(candidate?.placeLocation?.latLng) ||
    parseLatLng(candidate?.placeLocation) ||
    parseLatLng(visit.location) ||
    parseLatLng(location);

  if (!label && candidate?.placeId) label = null;

  return { label, latLng, semantic };
}

function visitLabel(segment) {
  return visitInfo(segment)?.label || null;
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
  const top = act.topCandidate;
  if (top?.type) return top.type;
  if (act.activityType) return act.activityType;
  const activities = act.activities || [];
  if (activities.length) {
    const best = activities.reduce(
      (a, b) => (Number(b?.probability || 0) > Number(a?.probability || 0) ? b : a),
      activities[0]
    );
    return best?.activityType || best?.type || null;
  }
  return null;
}

function extractDistanceMeters(segment) {
  const act = segment?.activity || segment?.activitySegment;
  if (act) {
    const d = Number(act.distanceMeters ?? act.distance ?? 0);
    if (Number.isFinite(d) && d > 0) return d;
  }
  const path = segment?.timelinePath;
  if (Array.isArray(path) && path.length >= 2) {
    const points = path
      .map((p) => parseLatLng(p?.point || p?.latLng || p))
      .filter(Boolean);
    return pathDistanceMeters(points);
  }
  return 0;
}

function extractLatLngPair(segment) {
  const act = segment?.activity || segment?.activitySegment;
  if (act) {
    const start =
      parseLatLng(act.start?.latLng || act.start) ||
      parseLatLng(act.startLocation?.latLng || act.startLocation);
    const end =
      parseLatLng(act.end?.latLng || act.end) ||
      parseLatLng(act.endLocation?.latLng || act.endLocation);
    return { start, end };
  }

  const path = segment?.timelinePath;
  if (Array.isArray(path) && path.length >= 2) {
    const first = parseLatLng(path[0]?.point || path[0]?.latLng || path[0]);
    const last = parseLatLng(path[path.length - 1]?.point || path[path.length - 1]?.latLng || path[path.length - 1]);
    return { start: first, end: last };
  }

  return { start: null, end: null };
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
  return (
    segment?.startTime ||
    segment?.activitySegment?.duration?.startTimestamp ||
    segment?.placeVisit?.duration?.startTimestamp ||
    null
  );
}

function segmentEndTime(segment) {
  return (
    segment?.endTime ||
    segment?.activitySegment?.duration?.endTimestamp ||
    segment?.placeVisit?.duration?.endTimestamp ||
    null
  );
}

function isMovementSegment(segment) {
  if (segment?.activity || segment?.activitySegment) return true;
  const path = segment?.timelinePath;
  return Array.isArray(path) && path.length >= 2;
}

function isVisitSegment(segment) {
  return !!(segment?.visit || segment?.placeVisit);
}

function buildCandidatesFromSegments(segments) {
  const sorted = [...segments].sort((a, b) => {
    const ta = Date.parse(segmentStartTime(a) || 0);
    const tb = Date.parse(segmentStartTime(b) || 0);
    return ta - tb;
  });

  const candidates = [];
  let prevVisit = null;

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];

    if (isVisitSegment(seg)) {
      prevVisit = visitInfo(seg) || prevVisit;
      continue;
    }

    if (!isMovementSegment(seg)) continue;

    const activityType = extractActivityType(seg);
    const distanceMeters = extractDistanceMeters(seg);
    const miles = metersToMiles(distanceMeters);

    if (miles < MIN_TRIP_MILES) continue;
    if (!isVehicleActivity(activityType) && miles < 1 && !seg?.timelinePath) continue;

    const startIso = segmentStartTime(seg);
    const endIso = segmentEndTime(seg);
    const driveDate = toDateStringFromIso(startIso);
    if (!driveDate) continue;

    const { start: startLatLng, end: endLatLng } = extractLatLngPair(seg);

    let nextVisit = null;
    for (let j = i + 1; j < sorted.length; j++) {
      if (isVisitSegment(sorted[j])) {
        nextVisit = visitInfo(sorted[j]);
        break;
      }
    }

    const origin = prevVisit?.label || null;
    const destination = nextVisit?.label || null;

    candidates.push({
      rowIndex: candidates.length + 1,
      driveDate,
      startTime: startIso,
      endTime: endIso,
      miles,
      distanceMeters,
      activityType: activityType || (seg?.timelinePath ? 'timelinePath' : null),
      origin,
      destination,
      startLatLng: startLatLng || prevVisit?.latLng || null,
      endLatLng: endLatLng || nextVisit?.latLng || null,
      destinations: [destination].filter(Boolean),
      originLabel: origin,
      destinationLabel: destination
    });

    if (nextVisit) prevVisit = nextVisit;
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
