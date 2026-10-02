// Presentation decisions only. These helpers never authorize records or features.
export function isClinicalClient(record = {}) {
  const type = String(record?.client_type || '').trim().toLowerCase();
  if (type) return ['clinical', 'school'].includes(type);
  return ['clinical', 'school'].includes(String(record?.organization_type || '').toLowerCase());
}
export function isClinicalWorkspacePath(path = '') {
  return /\/(?:note-aid|admin\/clinical-note-generator)(?:[/?#]|$)/.test(path)
    || /\/counseling\/(?:session|room)\//.test(path)
    || /\/admin\/clients\/\d+(?:[/?#]|$)/.test(path);
}
export function clinicalReturnPath({ previous, current, slug = '', guardian = false } = {}) {
  // Use only same-app history. Never accept an external or script URL as a return target.
  if (typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('//')
      && !/[\\\u0000-\u001f]/.test(previous) && previous !== current
      && !isClinicalWorkspacePath(previous) && !/\/(?:login|logout)(?:[/?#]|$)/.test(previous)) return previous;
  const prefix = slug ? `/${encodeURIComponent(slug)}` : '';
  return `${prefix}/${guardian ? 'guardian' : 'dashboard'}`;
}

// A selected nonclinical service/client always wins over the tenant's clinical work.
// Unknown or mixed-purpose hubs stay tenant branded until a clinical context is selected.
export function isMentalHealthWorkspace({ client, practiceCategory, learningAid = false, tenant } = {}) {
  const category = String(practiceCategory || '').trim().toLowerCase();
  if (learningAid || (category && category !== 'mental_health')) return false;
  if (client) return isClinicalClient(client);
  if (category === 'mental_health') return true;
  const type = String(tenant?.organization_type || '').toLowerCase();
  if (['learning', 'school', 'program', 'life_coach', 'consultant'].includes(type)) return false;
  return type === 'clinical' || tenant?.business_type === 'mental_health';
}
