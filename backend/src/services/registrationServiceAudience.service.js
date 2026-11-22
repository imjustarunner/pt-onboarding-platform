import pool from '../config/database.js';
import { readChartTypes } from './clientChartTypes.service.js';

export function registrationAudience(row) {
  if (Number(row.medicaid_eligible ?? row.medicaidEligible ?? 0) === 1) return 'clinical';
  const value = row.registration_audience ?? row.registrationAudience ?? 'any';
  if (!['any','clinical','learning'].includes(value)) {
    throw Object.assign(new Error('Choose Any client, Clinical or Learning for registration.'), {status:400});
  }
  return value;
}

export async function requireRegistrationAudience(row, clientId, agencyId, db = pool) {
  const audience = registrationAudience(row);
  if (audience === 'any') return;
  const profile = await readChartTypes(Number(clientId),Number(agencyId),db,{checkContact:false});
  if (!profile.types.includes(audience)) {
    throw Object.assign(new Error(`This offering requires ${audience === 'clinical' ? 'Clinical' : 'Learning'} services in this agency.`), {status:409});
  }
}

export function registrationPriceCents(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) {
    throw Object.assign(new Error('Enter a valid registration fee.'),{status:400});
  }
  return value;
}

// The event query aliases company_events as ce. Both rosters materialize their published sessions.
export const registrationSessionCountSql = `CASE WHEN EXISTS (SELECT 1 FROM skills_groups sg
  WHERE sg.company_event_id=ce.id AND sg.agency_id=ce.agency_id)
  THEN (SELECT COUNT(*) FROM skill_builders_event_sessions s WHERE s.company_event_id=ce.id AND s.starts_at>=NOW())
  WHEN EXISTS (SELECT 1 FROM company_event_session_dates d WHERE d.company_event_id=ce.id)
  THEN (SELECT COUNT(*) FROM company_event_session_dates d WHERE d.company_event_id=ce.id AND d.starts_at>=NOW())
  WHEN ce.starts_at>=NOW() AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ce.recurrence_json,'$.frequency')),'none')='none'
  THEN 1 ELSE 0 END`;

export function eventRegistrationPrice(row) {
  const perSession = row.program_cost_billing_mode==='per_session';
  const unitCents = registrationPriceCents(Math.round(100*Number((perSession ? row.per_session_cost_dollars : row.program_cost_dollars) || 0)));
  const sessionCount = perSession ? Number(row.remaining_sessions || 0) : 1;
  return {priceMode:perSession ? 'per_session' : 'total', unitCents, sessionCount,
    priceCents:registrationPriceCents(unitCents * sessionCount)};
}
