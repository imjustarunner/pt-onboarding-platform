// These existing catalog entries describe additions to another service. They
// remain available to billing, but are not primary appointment services.
export const CLINICAL_ADDON_CODES = new Set(['90785', '90840', '99051','96121','96131','96133','96137','96139']);

export function isClinicalAddon(code, row = {}) {
  return CLINICAL_ADDON_CODES.has(String(code || '').trim().toUpperCase())
    || row.isAddon === true || Number(row.is_addon || 0) === 1;
}

export function defaultClinicalNoteType(code) {
  return ['90791', 'H0031'].includes(String(code || '').trim().toUpperCase())
    ? 'INTAKE' : 'PROGRESS_NOTE';
}
