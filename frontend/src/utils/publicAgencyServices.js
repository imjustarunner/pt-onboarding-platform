/**
 * Helpers for public agency-services provider list → book page navigation.
 */

export function normalizePublicProvider(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = Number(raw.id || raw.providerId || raw.provider_id || 0) || 0;
  if (!id) return null;
  return {
    ...raw,
    id,
    providerId: id,
    displayName:
      raw.displayName ||
      `${raw.firstName || raw.first_name || ''} ${raw.lastName || raw.last_name || ''}`.trim() ||
      'Provider'
  };
}

export function normalizePublicProviders(list) {
  return (Array.isArray(list) ? list : []).map(normalizePublicProvider).filter(Boolean);
}

export function listPathForServiceType(serviceType) {
  const t = String(serviceType || '').toLowerCase();
  if (t === 'consulting' || t === 'consultant') return 'consultants';
  if (t === 'tutoring' || t === 'tutor') return 'tutors';
  if (t === 'counseling' || t === 'counselor') return 'counselors';
  return 'coaches';
}

export function providerBookPath(slug, providerId, { serviceType = '', slotStart = '', programType = '' } = {}) {
  const s = String(slug || '').trim();
  const id = Number(providerId || 0);
  if (!s || !id) return '';
  const q = new URLSearchParams();
  if (serviceType) q.set('serviceType', String(serviceType).toLowerCase());
  if (slotStart) q.set('slotStart', String(slotStart));
  if (programType) q.set('programType', String(programType).toUpperCase());
  const qs = q.toString();
  return `/${encodeURIComponent(s)}/book/${id}${qs ? `?${qs}` : ''}`;
}

export function resolvePublicServiceType({ query = {}, meta = {}, path = '' } = {}) {
  const fromQuery = String(query.serviceType || '').toLowerCase();
  if (['counseling', 'tutoring', 'coaching', 'consulting'].includes(fromQuery)) return fromQuery;
  const fromMeta = String(meta.serviceType || '').toLowerCase();
  if (['counseling', 'tutoring', 'coaching', 'consulting'].includes(fromMeta)) return fromMeta;
  const p = String(path || '');
  if (p.includes('find-consultant') || p.includes('consult')) return 'consulting';
  if (p.includes('find-tutor') || p.includes('tutor')) return 'tutoring';
  if (p.includes('find-counselor') || p.includes('counsel')) return 'counseling';
  return 'coaching';
}
