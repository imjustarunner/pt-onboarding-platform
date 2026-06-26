import pool from '../config/database.js';
import {
  ALL_CLINICAL_FACET_FIELD_KEYS,
  CLINICAL_FACET_GROUPS,
  FACET_FIELD_ALIASES,
  normalizeFacetFieldKey
} from '../constants/clinicalFacetFields.js';

const INDEX_FIELD_KEYS = [...new Set([...ALL_CLINICAL_FACET_FIELD_KEYS, ...Object.keys(FACET_FIELD_ALIASES)])];

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

function bucketForFieldKey(fieldKey) {
  const normalized = normalizeFacetFieldKey(fieldKey);
  for (const [group, keys] of Object.entries(CLINICAL_FACET_GROUPS)) {
    if (keys.includes(normalized) || keys.includes(fieldKey)) return group;
  }
  return null;
}

function pushUnique(arr, val) {
  const v = String(val || '').trim();
  if (!v) return;
  if (!arr.includes(v)) arr.push(v);
}

/**
 * Read indexed clinical facets for one or more providers (from provider_search_index).
 */
export async function listClinicalFacetsForUsers(userIds, { agencyId = null } = {}) {
  const ids = Array.from(new Set((userIds || []).map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0)));
  const out = new Map();
  for (const id of ids) out.set(id, emptyFacets());
  if (!ids.length) return out;

  const idPlaceholders = ids.map(() => '?').join(',');
  const keyPlaceholders = INDEX_FIELD_KEYS.map(() => '?').join(',');
  const params = [...ids];
  let agencySql = '';
  if (agencyId) {
    agencySql = ' AND agency_id = ?';
    params.push(Number(agencyId));
  }
  params.push(...INDEX_FIELD_KEYS);

  const [rows] = await pool.execute(
    `SELECT user_id, field_key, value_text, value_option
     FROM provider_search_index
     WHERE user_id IN (${idPlaceholders})${agencySql}
       AND field_key IN (${keyPlaceholders})`,
    params
  );

  for (const r of rows || []) {
    const uid = Number(r.user_id);
    if (!out.has(uid)) continue;
    const facets = out.get(uid);
    const rawKey = String(r.field_key || '').trim();
    const val = String(r.value_option || r.value_text || '').trim();
    if (!val) continue;

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
    out.set(uid, facets);
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
