export function resolveNarrivaToolForService({ serviceCode, programId = null, sessionMode = null, underlyingServiceCode = null } = {}, mappings = {}) {
  const code = String(underlyingServiceCode || serviceCode || '').trim().toUpperCase();
  if (!code) return null;
  const mode = sessionMode || (programId ? 'group' : 'individual');
  const specific = `${code}:${mode === 'group' ? 'group' : 'individual'}`;
  if (Object.hasOwn(mappings, specific)) return mappings[specific] || null;
  return Object.hasOwn(mappings, code) ? mappings[code] || null : null;
}
