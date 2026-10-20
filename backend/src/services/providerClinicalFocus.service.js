import pool from '../config/database.js';
import ProviderPublicProfile from '../models/ProviderPublicProfile.model.js';
import ProviderSearchIndex from '../models/ProviderSearchIndex.model.js';
import { listClinicalFacetsForUser } from './providerClinicalFacets.service.js';
import { normalizeFocusAgeValues } from '../utils/providerFacetNormalization.js';
import { FACET_FIELD_ALIASES } from '../constants/clinicalFacetFields.js';
import { FOCUS_GROUPS, validateFocus, withSavedFocusChoices } from '../../../frontend/src/navigation/providerFocus.js';

export async function getProviderClinicalFocus(userId, agencyId) {
  const [profile, facets] = await Promise.all([
    ProviderPublicProfile.getForProvider({ providerUserId: userId }),
    listClinicalFacetsForUser(userId, { agencyId })
  ]);
  const saved = normalizeFocusAgeValues(profile?.details?.clinicalFocus);
  const groups = withSavedFocusChoices(FOCUS_GROUPS.map(group => ({ ...group, options: [...new Set([
    ...group.options, ...(facets[group.key] || [])
  ])] })), saved);
  // Older profiles have explicit selections; never silently enable every other area.
  const clinicalFocus = saved || {
    top: Object.fromEntries(groups.map(g => [g.key, (facets[g.key] || []).slice(0, 3)])),
    excluded: Object.fromEntries(groups.map(g => [g.key, g.options.filter(v => !(facets[g.key] || []).includes(v))]))
  };
  return { groups, clinicalFocus };
}

export async function saveProviderClinicalFocus(userId, agencyId, value, groups) {
  groups ||= (await getProviderClinicalFocus(userId, agencyId)).groups;
  const focus = { ...validateFocus(value, groups, { requireThree: true }), reviewedAt: new Date().toISOString() };
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
    for (const group of groups) {
      const [[definition]] = await db.execute(`SELECT id FROM user_info_field_definitions WHERE field_key=? AND parent_field_id IS NULL
        AND (agency_id IS NULL OR agency_id=?) ORDER BY (agency_id IS NOT NULL) DESC,id DESC LIMIT 1`, [group.field, agencyId]);
      if (!definition) throw Object.assign(new Error('Clinical profile fields are not configured.'), { status: 409 });
      // Every enabled matching choice must be reflected in the legacy profile fields, not just the top three.
      const selected = JSON.stringify(group.options.filter(v => !focus.excluded[group.key].includes(v)));
      await db.execute(`INSERT INTO user_info_values(user_id,field_definition_id,value) VALUES(?,?,?)
        ON DUPLICATE KEY UPDATE value=VALUES(value)`, [userId, definition.id, selected]);
      const aliases = [group.field, ...Object.keys(FACET_FIELD_ALIASES).filter(k => FACET_FIELD_ALIASES[k] === group.field)];
      await db.execute(`UPDATE user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id SET v.value=?
        WHERE v.user_id=? AND (d.agency_id IS NULL OR d.agency_id=?) AND d.field_key IN (${aliases.map(() => '?').join(',')})`,
      [selected, userId, agencyId, ...aliases]);
    }
    const json = JSON.stringify(focus);
    await db.execute(`INSERT INTO provider_public_profiles(user_id,public_details_json) VALUES(?,JSON_OBJECT('clinicalFocus',CAST(? AS JSON)))
      ON DUPLICATE KEY UPDATE public_details_json=JSON_SET(COALESCE(public_details_json,JSON_OBJECT()),'$.clinicalFocus',CAST(? AS JSON)),updated_at=CURRENT_TIMESTAMP`, [userId, json, json]);
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
  await ProviderSearchIndex.upsertForUserInAgency({ userId, agencyId, fieldKeys: groups.map(g => g.field) });
  return { groups, clinicalFocus: focus };
}
