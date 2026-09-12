import User from '../models/User.model.js';

// Billing is an agency permission in addition to the user's clinical role.
export async function hasSchedulingBillingAccess(user, agencyId) {
  if (!user?.id || !Number(agencyId)) return false;
  const role = String(user.role || user.effectiveRole || '').toLowerCase();
  if (role === 'super_admin') return true;
  const agencies = await User.getAgencies(user.id);
  if (!(agencies || []).some((a) => Number(a.id) === Number(agencyId))) return false;
  if (role === 'admin') return true;
  const ids = await User.listBillingAgencyIds(user.id);
  return ids.some((id) => Number(id) === Number(agencyId));
}

// Applied at the response boundary, including nested change previews and timelines.
export function stripSchedulingFinancials(value) {
  if (Array.isArray(value)) return value.map(stripSchedulingFinancials);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => item !== undefined && !/(amount|price|fee|cost|charge)(Cents|_|$)|(^|_)rate($|_)|Rate(Cents|$)|financial|claimPayload|claim_payload|insurance_payload/i.test(key)
      && !(/balance/i.test(key) && (item === null || typeof item !== 'object'))
      && !['billingNotes', 'billing_notes', 'raw_json', 'payload_json', 'insurance_outstanding', 'insurance_paid'].includes(key))
    .map(([key, item]) => [key, stripSchedulingFinancials(key === 'billing' && item ? { ...item, notes: undefined } : item)]));
}

export async function schedulingResponseForUser(user, agencyId, payload) {
  return await hasSchedulingBillingAccess(user, agencyId) ? payload : stripSchedulingFinancials(payload);
}
