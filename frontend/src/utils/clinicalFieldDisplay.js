/**
 * Shared helpers for reading clinical profile EAV fields in overview/snapshot views.
 */

export const CLINICAL_FIELD_ALIASES = Object.freeze({
  license_type_number: ['provider_credential_license_type_number'],
  license_issued: ['provider_credential_license_issued_date'],
  license_expires: ['provider_credential_license_expiration_date'],
  age_specialty: ['provider_marketing_age_specialty'],
  modality: ['provider_marketing_treatment_modalities'],
  specialties_general: ['provider_marketing_specialties'],
  groups: ['provider_marketing_focus', 'provider_marketing_groups'],
  npi_number: ['provider_identity_npi_number']
});

export function expandFieldKeys(keys) {
  const out = [];
  const seen = new Set();
  for (const raw of keys || []) {
    const k = String(raw || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    for (const alias of CLINICAL_FIELD_ALIASES[k] || []) {
      if (!seen.has(alias)) {
        seen.add(alias);
        out.push(alias);
      }
    }
  }
  return out;
}

export function findFieldByKeys(fieldByKey, keys) {
  for (const key of expandFieldKeys(keys)) {
    const f = fieldByKey?.get?.(key);
    if (f) return f;
  }
  return null;
}

export function findAllFieldsByKeys(fieldByKey, keys) {
  const out = [];
  const seenIds = new Set();
  for (const key of expandFieldKeys(keys)) {
    const f = fieldByKey?.get?.(key);
    if (!f || seenIds.has(f.id)) continue;
    seenIds.add(f.id);
    out.push(f);
  }
  return out;
}

export function parseMultiSelect(raw, field) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const s = String(raw ?? '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed
        .map((x) => {
          if (x && typeof x === 'object') {
            const opt = (field?.options || []).find(
              (o) => String(o?.value ?? o?.label ?? '') === String(x?.value ?? x?.label ?? '')
            );
            return String(opt?.label ?? x?.label ?? x?.value ?? '').trim();
          }
          const opt = (field?.options || []).find((o) => String(o?.value ?? '') === String(x));
          return String(opt?.label ?? x ?? '').trim();
        })
        .filter(Boolean);
    }
  } catch {
    // fall through
  }
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

export function optionLabel(field, raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const opt = (field?.options || []).find((o) => String(o?.value ?? o?.label ?? '') === s);
  return String(opt?.label ?? s);
}

export function formatClinicalFieldValue(field) {
  const raw = field?.value;
  if (raw === null || raw === undefined || raw === '') return '';
  if (field?.field_type === 'multi_select') return parseMultiSelect(raw, field);
  if (field?.field_type === 'boolean') {
    const s = String(raw).toLowerCase();
    if (s === 'true' || s === 'yes' || s === '1') return 'Yes';
    if (s === 'false' || s === 'no' || s === '0') return 'No';
    return String(raw);
  }
  if (field?.field_type === 'select') return optionLabel(field, raw);
  if (field?.field_type === 'date') {
    const d = new Date(String(raw).slice(0, 10));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  if (field?.field_type === 'file') return raw ? 'File on record' : '';
  return String(raw).trim();
}

export function formatSnapshotValue(fieldByKey, spec) {
  const values = [];
  for (const key of expandFieldKeys(spec?.fieldKeys || [])) {
    const f = fieldByKey.get(key);
    if (!f) continue;
    const v = formatClinicalFieldValue(f);
    if (Array.isArray(v)) values.push(...v);
    else if (v) values.push(v);
  }
  const uniq = [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
  if (!uniq.length) return '—';
  return uniq.slice(0, 4).join(', ');
}
