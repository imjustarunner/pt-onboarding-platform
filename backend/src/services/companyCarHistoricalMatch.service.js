/**
 * Matches consolidated timeline trips to historical examples (CSV training + DB)
 * using a ±0.7 mile tolerance and optional route-token similarity.
 * Coordinates are never shown — only matched historical destinations/reasons are filled in.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tokenizeDestinations } from './companyCarReasonInference.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const trainingData = JSON.parse(
  readFileSync(join(__dirname, '../data/companyCarTrainingPatterns.json'), 'utf8')
);

export const MATCH_TOLERANCE = 0.7;

/** Use stored miles, or derive from odometer when import left miles at 0. */
export function effectiveTripMiles(trip) {
  const m = Number(trip?.miles);
  if (Number.isFinite(m) && m > 0) return Math.round(m * 100) / 100;
  const start = Number(trip?.start_odometer_miles);
  const end = Number(trip?.end_odometer_miles);
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
    return Math.round((end - start) * 100) / 100;
  }
  return 0;
}

export function isCoordinateLabel(label) {
  const s = String(label || '').trim();
  if (!s) return false;
  return /^-?\d+\.\d{3,}\s*,\s*-?\d+\.\d{3,}$/.test(s);
}

export function splitDestinationsText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  return raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
}

function jaccard(setA, setB) {
  if (!setA.size && !setB.size) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union ? inter / union : 0;
}

export function milesWithinTolerance(a, b, tolerance = MATCH_TOLERANCE) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= tolerance;
}

function patternsFromDbTrips(trips = []) {
  const patterns = [];
  for (const trip of trips) {
    let destText = '';
    try {
      const arr = typeof trip.destinations_json === 'string'
        ? JSON.parse(trip.destinations_json)
        : trip.destinations_json;
      if (Array.isArray(arr)) destText = arr.join(', ');
    } catch {
      destText = '';
    }
    const reason = String(trip.reason_for_travel || '').trim();
    const miles = effectiveTripMiles(trip);
    if (!destText || !reason || reason === 'Imported' || reason === 'Business travel') continue;
    if (miles <= 0) continue;
    patterns.push({
      destinationsText: destText,
      reason,
      miles,
      source: 'database',
      driveDate: String(trip.drive_date || '').slice(0, 10)
    });
  }
  return patterns;
}

export function loadAllTrainingPatterns(dbTrips = []) {
  const csvPatterns = (trainingData?.patterns || []).map((p) => ({
    ...p,
    source: 'training'
  }));
  return [...csvPatterns, ...patternsFromDbTrips(dbTrips)];
}

/**
 * Score a candidate against a historical pattern.
 * Primary signal: miles within ±0.7. Secondary: route token overlap ≥ 0.7 when labels exist.
 */
export function scorePatternMatch({ miles, labelTokens = [] }, pattern, tolerance = MATCH_TOLERANCE) {
  const tripMiles = Number(miles);
  let score = 0;

  const patternMiles = Number(pattern.miles);
  if (Number.isFinite(tripMiles) && patternMiles > 0 && milesWithinTolerance(tripMiles, patternMiles, tolerance)) {
    const closeness = 1 - Math.min(Math.abs(tripMiles - patternMiles) / tolerance, 1);
    score = Math.max(score, tolerance + closeness * (1 - tolerance));
  }

  const patternTokens = tokenizeDestinations(pattern.destinationsText || '');
  const labelSet = new Set(labelTokens);
  const patternSet = new Set(patternTokens);

  if (labelSet.size > 0 && patternSet.size > 0) {
    const tokenScore = jaccard(labelSet, patternSet);
    if (tokenScore >= tolerance) {
      score = Math.max(score, tokenScore);
    }
  }

  return score;
}

export function findBestHistoricalMatch({
  miles,
  labelTokens = [],
  dbTrips = [],
  tolerance = MATCH_TOLERANCE
}) {
  const patterns = loadAllTrainingPatterns(dbTrips);
  let best = null;

  for (const pattern of patterns) {
    const score = scorePatternMatch({ miles, labelTokens }, pattern, tolerance);
    if (score < tolerance) continue;
    if (!best || score > best.score) {
      best = {
        ...pattern,
        score
      };
    }
  }

  return best;
}

export function extractInternalLabelTokens(candidate) {
  const parts = [
    candidate?.originLabel,
    candidate?.origin,
    ...(Array.isArray(candidate?.destinations) ? candidate.destinations : []),
    candidate?.destinationLabel,
    candidate?.destination
  ];

  const labels = parts
    .map((p) => String(p || '').trim())
    .filter((p) => p && !isCoordinateLabel(p) && p !== 'Home' && p !== 'Work');

  return tokenizeDestinations(labels.join(', '));
}

export function applyMatchToCandidate(candidate, match) {
  if (!match) {
    return {
      ...candidate,
      destinations: [],
      destinationsText: '',
      origin: '',
      destination: '',
      originLabel: '',
      destinationLabel: '',
      reasonForTravel: '',
      isWork: false,
      include: false,
      matched: false,
      matchScore: null,
      matchSource: null
    };
  }

  const destinationsText = String(match.destinationsText || '').trim();
  const destinations = splitDestinationsText(destinationsText);

  return {
    ...candidate,
    destinations,
    destinationsText,
    origin: destinations[0] || '',
    destination: destinations[destinations.length - 1] || '',
    originLabel: destinations[0] || '',
    destinationLabel: destinations[destinations.length - 1] || '',
    reasonForTravel: String(match.reason || '').trim(),
    isWork: true,
    include: true,
    matched: true,
    matchScore: match.score,
    matchSource: match.source
  };
}

export function isDuplicateExistingTrip(existingTrips, driveDate, miles, tolerance = MATCH_TOLERANCE) {
  const date = String(driveDate || '').slice(0, 10);
  if (!date) return false;
  return (existingTrips || []).some((t) => {
    const existingDate = String(t.drive_date || '').slice(0, 10);
    if (existingDate !== date) return false;
    return milesWithinTolerance(effectiveTripMiles(t), miles, tolerance);
  });
}

export function matchConsolidatedCandidate(candidate, dbTrips = [], tolerance = MATCH_TOLERANCE) {
  const labelTokens = extractInternalLabelTokens(candidate);
  const match = findBestHistoricalMatch({
    miles: candidate.miles,
    labelTokens,
    dbTrips,
    tolerance
  });
  return applyMatchToCandidate(candidate, match);
}
