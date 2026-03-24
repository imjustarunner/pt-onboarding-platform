import { drivingDistancesFromOrigin } from './googleDistanceMatrix.service.js';

/**
 * Only events guardians/public can actually register for.
 * Accepts any active intake link locked to the event: smart_registration, or intake with a
 * registration step (company_event_id binding is the authoritative signal).
 */
export const PUBLIC_REGISTRATION_SQL = `ce.registration_eligible = 1
       AND EXISTS (
         SELECT 1 FROM intake_links il
         WHERE il.company_event_id = ce.id
           AND il.is_active = 1
       )`;

export const PUBLIC_EVENT_SELECT = `ce.id, ce.title, ce.description, ce.splash_content,
       ce.public_hero_image_url, ce.public_listing_details, ce.in_person_public,
       ce.public_location_address, ce.public_location_lat, ce.public_location_lng,
       ce.public_age_min, ce.public_age_max,
       ce.public_session_label, ce.public_session_date_range,
       ce.starts_at, ce.ends_at, ce.timezone, ce.registration_eligible, ce.agency_id AS owning_agency_id,
       (SELECT il.public_key FROM intake_links il
        WHERE il.company_event_id = ce.id
          AND il.is_active = 1
        ORDER BY
          CASE WHEN LOWER(COALESCE(il.form_type, '')) = 'smart_registration' THEN 0 ELSE 1 END,
          il.id DESC
        LIMIT 1) AS registration_public_key`;

export function formatPublicEvent(row, sessionLocations = []) {
  const regKey = row.registration_public_key != null ? String(row.registration_public_key).trim() : '';
  const inPerson = !!(row.in_person_public === 1 || row.in_person_public === true);
  const lat = row.public_location_lat != null ? Number(row.public_location_lat) : null;
  const lng = row.public_location_lng != null ? Number(row.public_location_lng) : null;
  const owningAgencyIdRaw = row.owning_agency_id != null ? Number(row.owning_agency_id) : null;
  const ageMinRaw = row.public_age_min != null ? Number(row.public_age_min) : null;
  const ageMaxRaw = row.public_age_max != null ? Number(row.public_age_max) : null;
  const publicAgeMin = Number.isFinite(ageMinRaw) && ageMinRaw >= 0 ? ageMinRaw : null;
  const publicAgeMax = Number.isFinite(ageMaxRaw) && ageMaxRaw >= 0 ? ageMaxRaw : null;
  const out = {
    id: Number(row.id),
    title: row.title,
    description: row.description ? String(row.description) : null,
    splashContent: row.splash_content ? String(row.splash_content) : null,
    publicHeroImageUrl: row.public_hero_image_url ? String(row.public_hero_image_url).trim() : null,
    publicListingDetails: row.public_listing_details ? String(row.public_listing_details) : null,
    inPersonPublic: inPerson,
    publicLocationAddress: inPerson && row.public_location_address ? String(row.public_location_address).trim() : null,
    publicLocationLat: inPerson && Number.isFinite(lat) ? lat : null,
    publicLocationLng: inPerson && Number.isFinite(lng) ? lng : null,
    sessionLocations: Array.isArray(sessionLocations) ? sessionLocations : [],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone || 'UTC',
    registrationEligible: !!(row.registration_eligible === 1 || row.registration_eligible === true),
    registrationPublicKey: regKey || null,
    publicAgeMin,
    publicAgeMax,
    publicSessionLabel: row.public_session_label ? String(row.public_session_label).trim() : null,
    publicSessionDateRange: row.public_session_date_range ? String(row.public_session_date_range).trim() : null
  };
  if (Number.isFinite(owningAgencyIdRaw) && owningAgencyIdRaw > 0) {
    out.owningAgencyId = owningAgencyIdRaw;
  }
  return out;
}

async function fetchSessionLocationsByEventIds(conn, eventIds) {
  const map = new Map();
  const ids = [...new Set((eventIds || []).map((id) => Number(id)).filter((n) => n > 0))];
  if (!ids.length) return map;
  try {
    const ph = ids.map(() => '?').join(', ');
    const [sessionRows] = await conn.execute(
      `SELECT company_event_id, location_label, location_address, modality, session_date
       FROM skill_builders_event_sessions
       WHERE company_event_id IN (${ph})
         AND (session_date >= CURDATE() OR session_date IS NULL)
         AND TRIM(COALESCE(location_address, '')) != ''
       ORDER BY company_event_id ASC, session_date ASC`,
      ids
    );
    for (const r of sessionRows || []) {
      const eid = Number(r.company_event_id);
      if (!map.has(eid)) map.set(eid, []);
      const mod = String(r.modality || '').trim().toLowerCase();
      if (mod && mod !== 'in_person' && mod !== 'hybrid' && mod !== '') continue;
      map.get(eid).push({
        label: r.location_label ? String(r.location_label).trim() : null,
        address: String(r.location_address || '').trim(),
        modality: r.modality || null,
        sessionDate: r.session_date || null
      });
    }
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Unknown table') || e?.code === 'ER_NO_SUCH_TABLE') return map;
    throw e;
  }
  return map;
}

async function hydratePublicRows(conn, rows) {
  const ids = (rows || []).map((r) => Number(r.id)).filter((n) => n > 0);
  const locMap = await fetchSessionLocationsByEventIds(conn, ids);
  return (rows || []).map((r) => formatPublicEvent(r, locMap.get(Number(r.id)) || []));
}

export async function loadPublicAgencyEventRows(conn, agencyId) {
  const [rows] = await conn.execute(
    `SELECT ${PUBLIC_EVENT_SELECT}
     FROM company_events ce
     WHERE ce.agency_id = ?
       AND (ce.is_active = TRUE OR ce.is_active IS NULL)
       AND ce.ends_at >= NOW()
       AND ${PUBLIC_REGISTRATION_SQL}
     ORDER BY ce.starts_at ASC
     LIMIT 100`,
    [agencyId]
  );
  return hydratePublicRows(conn, rows || []);
}

export async function loadPublicProgramEventRows(conn, agencyId, programOrgId) {
  const [rows] = await conn.execute(
    `SELECT ${PUBLIC_EVENT_SELECT}
     FROM company_events ce
     WHERE ce.agency_id = ?
       AND ce.organization_id = ?
       AND (ce.is_active = TRUE OR ce.is_active IS NULL)
       AND ce.ends_at >= NOW()
       AND ${PUBLIC_REGISTRATION_SQL}
     ORDER BY ce.starts_at ASC
     LIMIT 100`,
    [agencyId, programOrgId]
  );
  return hydratePublicRows(conn, rows || []);
}

/** All public events for a program organization across every parent agency (same organization_id on company_events). */
export async function loadPublicProgramEventRowsMerged(conn, programOrgId) {
  const oid = Number(programOrgId);
  if (!Number.isFinite(oid) || oid <= 0) return [];
  const [rows] = await conn.execute(
    `SELECT ${PUBLIC_EVENT_SELECT}
     FROM company_events ce
     WHERE ce.organization_id = ?
       AND (ce.is_active = TRUE OR ce.is_active IS NULL)
       AND ce.ends_at >= NOW()
       AND ${PUBLIC_REGISTRATION_SQL}
     ORDER BY ce.starts_at ASC
     LIMIT 150`,
    [oid]
  );
  return hydratePublicRows(conn, rows || []);
}

/**
 * Public marketing hub when the source is an agency: events for that agency scoped to affiliated program org(s).
 * If no program orgs are affiliated, falls back to all agency events that pass the public registration gate.
 */
export async function loadPublicAgencyHubEventRows(conn, agencyId, programOrgIds) {
  const aid = Number(agencyId);
  if (!Number.isFinite(aid) || aid <= 0) return [];
  const ids = [...new Set((programOrgIds || []).map((id) => Number(id)).filter((n) => n > 0))];
  if (!ids.length) {
    return loadPublicAgencyEventRows(conn, aid);
  }
  const ph = ids.map(() => '?').join(', ');
  const [rows] = await conn.execute(
    `SELECT ${PUBLIC_EVENT_SELECT}
     FROM company_events ce
     WHERE ce.agency_id = ?
       AND ce.organization_id IN (${ph})
       AND (ce.is_active = TRUE OR ce.is_active IS NULL)
       AND ce.ends_at >= NOW()
       AND ${PUBLIC_REGISTRATION_SQL}
     ORDER BY ce.starts_at ASC
     LIMIT 150`,
    [aid, ...ids]
  );
  return hydratePublicRows(conn, rows || []);
}

function matrixOriginParams(origin) {
  if (!origin || typeof origin !== 'object') {
    const err = new Error('Invalid origin');
    err.code = 'MAPS_ORIGIN_INVALID';
    throw err;
  }
  const lat = origin.latitude != null ? Number(origin.latitude) : NaN;
  const lng = origin.longitude != null ? Number(origin.longitude) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { originLat: lat, originLng: lng };
  }
  const addr = String(origin.addressText || '').trim();
  if (addr) {
    return { originAddress: addr };
  }
  const err = new Error('Invalid origin: provide latitude/longitude or addressText');
  err.code = 'MAPS_ORIGIN_INVALID';
  throw err;
}

/**
 * Sort public events by shortest **driving** distance (Google Distance Matrix) from `origin` to the nearest
 * in-person venue (main public address or session locations). Uses Distance Matrix only (same API family as
 * school mileage); no Geocoding API. Requires GOOGLE_MAPS_API_KEY with Distance Matrix enabled.
 *
 * @param {Array} events
 * @param {{ latitude: number, longitude: number } | { addressText: string }} origin
 */
export async function attachDistanceScoresToPublicEvents(events, origin, _addrGeoCache = new Map()) {
  const matrixEntries = [];
  for (const ev of events) {
    const eid = ev.id;
    let v = 0;
    if (ev.inPersonPublic && ev.publicLocationLat != null && ev.publicLocationLng != null) {
      const key = `e${eid}_v${v++}`;
      matrixEntries.push({
        key,
        destination: `${ev.publicLocationLat},${ev.publicLocationLng}`,
        eventId: eid,
        label: ev.publicLocationAddress || 'Venue'
      });
    } else if (ev.inPersonPublic && ev.publicLocationAddress) {
      const key = `e${eid}_v${v++}`;
      matrixEntries.push({
        key,
        destination: String(ev.publicLocationAddress).trim(),
        eventId: eid,
        label: String(ev.publicLocationAddress).trim()
      });
    }
    for (const s of ev.sessionLocations || []) {
      if (!s?.address) continue;
      const key = `e${eid}_v${v++}`;
      matrixEntries.push({
        key,
        destination: String(s.address).trim(),
        eventId: eid,
        label: s.label ? String(s.label).trim() : String(s.address).trim()
      });
    }
  }

  if (!matrixEntries.length) {
    return (events || []).map((ev) => ({
      ...ev,
      drivingDistanceMeters: null,
      drivingDurationSeconds: null,
      drivingDurationText: null,
      distanceMeters: null,
      nearestVenueLabel: null
    }));
  }

  const dm = await drivingDistancesFromOrigin({
    ...matrixOriginParams(origin),
    entries: matrixEntries.map(({ key, destination }) => ({ key, destination }))
  });

  const bestByEvent = new Map();
  for (const row of matrixEntries) {
    const r = dm.get(row.key);
    if (!r?.ok || !Number.isFinite(r.meters)) continue;
    const prev = bestByEvent.get(row.eventId);
    if (!prev || r.meters < prev.meters) {
      bestByEvent.set(row.eventId, {
        meters: r.meters,
        durationSeconds: r.durationSeconds,
        durationText: r.durationText,
        label: row.label
      });
    }
  }

  const scored = (events || []).map((ev) => {
    const b = bestByEvent.get(ev.id);
    if (!b) {
      return {
        ...ev,
        drivingDistanceMeters: null,
        drivingDurationSeconds: null,
        drivingDurationText: null,
        distanceMeters: null,
        nearestVenueLabel: null
      };
    }
    return {
      ...ev,
      drivingDistanceMeters: b.meters,
      drivingDurationSeconds: b.durationSeconds,
      drivingDurationText: b.durationText,
      distanceMeters: b.meters,
      nearestVenueLabel: b.label
    };
  });

  scored.sort((a, b) => {
    const da = a.drivingDistanceMeters;
    const db = b.drivingDistanceMeters;
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  return scored;
}

export function respondNearestDistanceError(res, err) {
  const code = err?.code || '';
  if (code === 'MAPS_KEY_MISSING') {
    res.status(503).json({ error: { message: 'Driving directions are not configured.' } });
    return true;
  }
  if (code === 'MAPS_DISTANCE_MATRIX_FAILED' || code === 'MAPS_ORIGIN_INVALID') {
    res.status(503).json({
      error: {
        message:
          err?.message ||
          'Could not compute driving distances. Enable the Distance Matrix API for your Google Cloud project.'
      }
    });
    return true;
  }
  return false;
}
