import Agency from '../models/Agency.model.js';
import { isNluTutoringQaAgency } from '../utils/nluTutoringQaPolicy.js';

// Resolve the saved organization, never a caller-supplied brand or service label.
export async function nluTutoringVideoChoice(appointment) {
  if (!Number(appointment?.agencyId) || !['learning', 'tutoring'].includes(appointment?.businessType)) return false;
  const agency = await Agency.findById(appointment.agencyId);
  return ['nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up'].includes(String(agency?.slug || '').toLowerCase())
    || isNluTutoringQaAgency(agency);
}
