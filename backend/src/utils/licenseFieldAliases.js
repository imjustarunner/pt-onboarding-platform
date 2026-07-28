/**
 * License EAV fields may exist under legacy and canonical keys.
 * Canonical keys are the single source of truth after consolidation.
 */
export const LICENSE_FIELD_ALIAS_GROUPS = Object.freeze([
  {
    canonical: 'provider_credential_license_type_number',
    aliases: ['license_type_number', 'license_type_and_number'],
  },
  {
    canonical: 'provider_credential_license_issued_date',
    aliases: ['license_issued', 'license_issued_date'],
  },
  {
    canonical: 'provider_credential_license_expiration_date',
    aliases: [
      'license_expires',
      'license_expiration_date',
      'license_expires_date',
    ],
  },
]);

export function allKeysInLicenseAliasGroup(group) {
  return [group.canonical, ...(group.aliases || [])];
}

/**
 * Pick the best value across a group of field keys using meaningful + updated_at rules.
 */
export function pickBestLicenseGroupEntry(keys, { valueByKey, metaByKey, isMeaningful }) {
  let best = null;
  for (const key of keys || []) {
    const k = String(key || '').trim();
    if (!k) continue;
    const value = valueByKey?.get?.(k);
    const meta = metaByKey?.get?.(k) || {};
    const fieldType = meta.fieldType || '';
    const meaningful = meta.meaningful ?? isMeaningful?.(value, fieldType);
    if (!meaningful) continue;
    const updatedAtMs = Number(meta.updatedAtMs || 0);
    const rowId = Number(meta.id || 0);
    if (
      !best ||
      updatedAtMs > best.updatedAtMs ||
      (updatedAtMs === best.updatedAtMs && rowId > best.rowId)
    ) {
      best = { key: k, value, updatedAtMs, rowId, fieldType };
    }
  }
  return best;
}
