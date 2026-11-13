import User from '../models/User.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';

export async function resolveOfficeSessionAgency({ providerId, officeLocationId, agencyId }) {
  const [providerAgencies, officeAgencies] = await Promise.all([
    User.getAgencies(providerId), OfficeLocationAgency.listAgenciesForOffice(officeLocationId)
  ]);
  const allowed = new Set((providerAgencies || []).map(row => Number(row.id)));
  const shared = (officeAgencies || []).map(row => Number(row.id)).filter(id => allowed.has(id));
  const selected = Number(agencyId || 0);
  if (selected && shared.includes(selected)) return selected;
  if (!selected && shared.length === 1) return shared[0];
  throw Object.assign(new Error(selected
    ? 'The selected agency must include this provider and have access to this office.'
    : 'Select the agency for this office session.'), { status: selected ? 403 : 400 });
}
