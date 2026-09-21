import { CLINICAL_PROFILE_FIELDS } from '../utils/hireClinicalProfile.js';
import pool from '../config/database.js';
import {normalizeClinicalFacets} from '../utils/providerFacetNormalization.js';
import {
  ALL_CLINICAL_FACET_FIELD_KEYS,
  CLINICAL_FACET_GROUPS,
  FACET_FIELD_ALIASES,
  normalizeFacetFieldKey
} from '../constants/clinicalFacetFields.js';

export const INDEX_FIELD_KEYS = [...new Set([...ALL_CLINICAL_FACET_FIELD_KEYS, ...Object.keys(FACET_FIELD_ALIASES)])];

function emptyFacets() {
  return {
    specialties: [],
    modalities: [],
    ageGroups: [],
    populations: [],
    interventions: [],
    serviceSettings: [],
    summaryTags: []
  };
}

export function bucketForFieldKey(fieldKey) {
  const normalized = normalizeFacetFieldKey(fieldKey);
  for (const [group, keys] of Object.entries(CLINICAL_FACET_GROUPS)) {
    if (keys.includes(normalized) || keys.includes(fieldKey)) return group;
  }
  return null;
}

export const CLINICAL_INDEX_FIELD_KEYS = INDEX_FIELD_KEYS.filter(key=>bucketForFieldKey(key)!=='serviceSettings');

function pushUnique(arr, val) {
  const v = String(val || '').trim();
  if (!v) return;
  if (!arr.includes(v)) arr.push(v);
}

/**
 * Read saved clinical answers directly so a stale search index cannot hide or resurrect profile facts.
 */
export async function listClinicalFacetsForUsers(userIds, { agencyId = null, database = pool } = {}) {
  const ids = Array.from(new Set((userIds || []).map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0)));
  const out = new Map();
  for (const id of ids) out.set(id, emptyFacets());
  if (!ids.length) return out;

  const idPlaceholders = ids.map(() => '?').join(',');
  const keyPlaceholders = INDEX_FIELD_KEYS.map(() => '?').join(',');
  const params = [...ids];
  let agencySql = '';
  if (agencyId) {
    agencySql = ' AND (d.agency_id = ? OR d.agency_id IS NULL)';
    params.push(Number(agencyId));
  }
  params.push(...INDEX_FIELD_KEYS);

  const [rows] = await database.execute(
    `SELECT v.user_id,d.field_key,v.value AS value_text
     FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id
     WHERE v.user_id IN (${idPlaceholders})${agencySql}
       AND d.field_key IN (${keyPlaceholders})
     ORDER BY d.agency_id IS NULL ASC,v.updated_at DESC,v.id DESC`,
    params
  );

  const seen = new Set();
  const explicit = new Map();
  for (const r of rows || []) {
    const uid = Number(r.user_id);
    if (!out.has(uid)) continue;
    const facets = out.get(uid);
    const rawKey = String(r.field_key || '').trim();
    const answerKey=`${uid}:${normalizeFacetFieldKey(rawKey)}`;
    if(seen.has(answerKey))continue;seen.add(answerKey);
    const val = Array.isArray(r.value_text)?JSON.stringify(r.value_text):String(r.value_option || r.value_text || '').trim();
    if (!val) continue;

    // A reviewed structured answer, including [], supersedes older survey answers
    // for this category. Historical narrative stays stored and available for review.
    const canonical = CLINICAL_PROFILE_FIELDS.find(f => f.key === normalizeFacetFieldKey(rawKey));
    if (canonical) {
      let selected; try { selected = JSON.parse(val); } catch { /* legacy text */ }
      if (Array.isArray(selected) && selected.every(v => typeof v === 'string')) {
        const normalized = normalizeClinicalFacets({ [canonical.group]: selected });
        const misplaced = CLINICAL_PROFILE_FIELDS.some(f => f.group !== canonical.group && normalized[f.group]?.length);
        if (!misplaced && !normalized.reviewNeeded?.length) {
          explicit.set(`${uid}:${canonical.group}`, normalized[canonical.group] || []);
        }
      }
    }
    const bucket = bucketForFieldKey(rawKey);
    if (bucket && facets[bucket]) pushUnique(facets[bucket], val);
  }

  for (const [uid, facets] of out.entries()) {
    const tags = [
      ...facets.specialties.slice(0, 3),
      ...facets.modalities.slice(0, 2),
      ...facets.ageGroups.slice(0, 2)
    ];
    facets.summaryTags = [...new Set(tags)].slice(0, 6);
    const normalized = normalizeClinicalFacets(facets);
    for (const field of CLINICAL_PROFILE_FIELDS) {
      const key = `${uid}:${field.group}`;
      if (explicit.has(key)) {
        const selected = explicit.get(key);
        for (const value of normalized[field.group] || []) {
          if (!selected.includes(value)) normalized.reviewNeeded.push({ group: field.group, value });
        }
        normalized[field.group] = selected;
      }
    }
    normalized.summaryTags = [...new Set([...normalized.specialties.slice(0, 3), ...normalized.modalities.slice(0, 2), ...normalized.ageGroups.slice(0, 2)])].slice(0, 6);
    out.set(uid, normalized);
  }

  return out;
}

export async function listClinicalFacetsForUser(userId, opts = {}) {
  const map = await listClinicalFacetsForUsers([userId], opts);
  return map.get(Number(userId)) || emptyFacets();
}

export function formatFacetsSummary(facets) {
  const tags = facets?.summaryTags || [];
  return tags.length ? tags.join(' · ') : '';
}

export default {
  listClinicalFacetsForUser,
  listClinicalFacetsForUsers,
  formatFacetsSummary
};
