/**
 * Consolidates multiple timeline candidates on the same calendar day into one trip row.
 */

import { isCoordinateLabel } from './companyCarHistoricalMatch.service.js';

function canonicalPlaceKey(label) {
  const s = String(label || '').toLowerCase().trim();
  if (!s) return '';
  if (/windchime|437\s*windchime/.test(s)) return 'windchime';
  if (/masters|master's/.test(s)) return 'masters';
  if (/crest/.test(s)) return 'crest';
  if (/larkspur/.test(s)) return 'larkspur';
  if (/denver/.test(s)) return 'denver';
  if (/tesla/.test(s)) return 'tesla';
  if (/target/.test(s)) return 'target';
  if (/walmart/.test(s)) return 'walmart';
  if (/sam's|sams\b/.test(s)) return 'sams';
  if (/home depot/.test(s)) return 'home_depot';
  if (/car wash|super star|superstar|super carwash/.test(s)) return 'car_wash';
  if (/charge|supercharger|charging/.test(s)) return 'charge';
  if (/school|academy|elementary|high school|middle school/.test(s)) return 'school';
  if (/client/.test(s)) return 'client';
  return s.replace(/\s+/g, ' ').slice(0, 80);
}

function addLocationInOrder(locations, keys, label) {
  const raw = String(label || '').trim();
  if (!raw || isCoordinateLabel(raw)) return;
  const key = canonicalPlaceKey(raw);
  if (!key) return;
  if (keys.has(key)) return;
  keys.add(key);
  locations.push(raw);
}

export function consolidateCandidatesByDay(candidates) {
  const byDate = new Map();

  for (const c of candidates || []) {
    if (!c?.driveDate) continue;
    if (!byDate.has(c.driveDate)) byDate.set(c.driveDate, []);
    byDate.get(c.driveDate).push(c);
  }

  const consolidated = [];

  for (const driveDate of [...byDate.keys()].sort()) {
    const dayTrips = byDate.get(driveDate);
    dayTrips.sort((a, b) => Date.parse(a.startTime || 0) - Date.parse(b.startTime || 0));

    if (dayTrips.length === 1) {
      const one = { ...dayTrips[0] };
      const locs = [];
      const keys = new Set();
      addLocationInOrder(locs, keys, one.originLabel || one.origin);
      for (const d of one.destinations || []) addLocationInOrder(locs, keys, d);
      if (one.destinationLabel || one.destination) {
        addLocationInOrder(locs, keys, one.destinationLabel || one.destination);
      }
      one.destinationsText = locs.length ? locs.join(', ') : '';
      one.destinations = locs;
      consolidated.push(one);
      continue;
    }

    const locations = [];
    const keys = new Set();
    let miles = 0;
    let startLatLng = null;
    let endLatLng = null;

    for (const t of dayTrips) {
      miles += Number(t.miles || 0);
      if (!startLatLng && t.startLatLng) startLatLng = t.startLatLng;
      addLocationInOrder(locations, keys, t.originLabel || t.origin);
      for (const d of t.destinations || []) addLocationInOrder(locations, keys, d);
      addLocationInOrder(locations, keys, t.destinationLabel || t.destination);
      if (t.endLatLng) endLatLng = t.endLatLng;
    }

    const first = dayTrips[0];
    const last = dayTrips[dayTrips.length - 1];
    const destinationsText = locations.length ? locations.join(', ') : '';

    consolidated.push({
      ...first,
      driveDate,
      miles: Math.round(miles * 100) / 100,
      origin: locations[0] || first.origin,
      destination: locations[locations.length - 1] || last.destination,
      originLabel: locations[0] || first.originLabel,
      destinationLabel: locations[locations.length - 1] || last.destinationLabel,
      destinations: locations,
      destinationsText,
      startTime: first.startTime,
      endTime: last.endTime,
      startLatLng,
      endLatLng,
      consolidatedCount: dayTrips.length
    });
  }

  return consolidated;
}
