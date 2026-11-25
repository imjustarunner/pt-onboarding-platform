export function resolveNarrivaToolForService({ serviceCode, programId = null, sessionMode = null, underlyingServiceCode = null, assessmentKind = null } = {}, mappings = {}) {
  const code = String(underlyingServiceCode || serviceCode || '').trim().toUpperCase();
  if (!code) return null;
  if(code==='H0031' && assessmentKind==='additional')return 'clinical_h0031_additional';
  const mode = sessionMode || (programId ? 'group' : 'individual');
  const specific = `${code}:${mode === 'group' ? 'group' : 'individual'}`;
  if (Object.hasOwn(mappings, specific)) return mappings[specific] || null;
  return Object.hasOwn(mappings, code) ? mappings[code] || null : null;
}
