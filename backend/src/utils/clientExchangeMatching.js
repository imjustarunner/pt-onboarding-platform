import { canonicalAge, normalizeClinicalFacets } from './providerFacetNormalization.js';
import { providerAvailabilityPreferences } from './providerAvailabilityReminders.js';
import { agencyFormatAllowed } from './providerAgencyAvailability.js';
import { restrictPublicInsurances } from './publicProviderPresentation.js';
import { FOCUS_GROUPS } from '../../../frontend/src/navigation/providerFocus.js';

export function ageRange(value) {
  const raw = String(canonicalAge(value) || value || '').trim().replace(/[–—]/g, '-');
  const range = raw.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return [Number(range[1]), Number(range[2])];
  const plus = raw.match(/(\d+)\s*\+/);
  if (plus) return [Number(plus[1]), 120];
  if (/^\d+$/.test(raw)) return [Number(raw), Number(raw)];
  return null;
}

export function clientAge(client, now = new Date()) {
  if (!client?.date_of_birth) return null;
  const dob = new Date(client.date_of_birth);
  if (!Number.isFinite(dob.getTime())) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) age--;
  return age >= 0 && age <= 120 ? age : null;
}

export function normalizedProviderGender(value) {
  const gender = String(value || '').toLowerCase().trim();
  if (/^(female|woman|women|she\/her)\b/.test(gender)) return 'female';
  if (/^(male|man|men|he\/him)\b/.test(gender)) return 'male';
  if (/^(nonbinary|non-binary|non binary|they\/them)\b/.test(gender)) return 'nonbinary';
  return gender;
}

export function matchesExchangeListing({ user, profile, facets = {}, listing, client, now }) {
  const availability = providerAvailabilityPreferences(user, profile);
  if (!availability.seesClients || (!availability.intakeStatusByFormat && !availability.acceptingNewClients)) return false;
  const modality = String(listing.preferences?.modality || listing.preferences?.preferredModality || '').toLowerCase();
  const formatOpen = (format, enabled) => enabled && (availability.intakeStatusByFormat
    ? agencyFormatAllowed(availability, format) : !['waitlist','unavailable','closed'].includes(profile?.details?.[format==='IN_PERSON'?'officeAvailability':'virtualAvailability']));
  const inPerson = formatOpen('IN_PERSON', availability.inPerson), virtual = formatOpen('VIRTUAL', availability.virtual);
  if (modality === 'in_person' ? !inPerson : modality === 'virtual' ? !virtual : !inPerson && !virtual) return false;
  const preferredGender = normalizedProviderGender(listing.preferences?.providerGender);
  const providerGender = normalizedProviderGender(profile?.details?.gender);
  if (['male','female','nonbinary'].includes(preferredGender) && ['male','female','nonbinary'].includes(providerGender) && preferredGender !== providerGender) return false;
  const focus = profile?.details?.clinicalFocus;
  const known = (group, fallback) => focus?.reviewed
    ? FOCUS_GROUPS.find(g=>g.key===group).options.filter(v=>!(focus.excluded?.[group]||[]).includes(v))
    : (fallback || []);
  const age = clientAge(client, now);
  const requestedAge = age == null ? ageRange(listing.demographics?.ageBand) : [age, age];
  const ages = known('ageGroups', facets.ageGroups);
  if (requestedAge && (ages.length || focus?.reviewed) && !ages.some(value => {
    const supported = ageRange(value);
    return supported && supported[0] <= requestedAge[0] && supported[1] >= requestedAge[1];
  })) return false;
  const taxonomy = FOCUS_GROUPS.find(g=>g.key==='specialties').options;
  // Free-text narratives that do not map to a known topic remain unknown, not a rejection.
  const concerns = normalizeClinicalFacets({ specialties: listing.presentingProblems || [] }).specialties.filter(v=>taxonomy.includes(v));
  const specialties = normalizeClinicalFacets({specialties:known('specialties',facets.specialties)}).specialties;
  if (concerns.some(v=>(focus?.excluded?.specialties||[]).includes(v))) return false;
  if (concerns.length && (specialties.length || focus?.reviewed) && !specialties.some(v=>concerns.includes(v))) return false;
  const requested = listing.preferences?.matchingPreferences || {};
  for (const group of FOCUS_GROUPS) {
    const wants = (Array.isArray(requested[group.key]) ? requested[group.key] : []).filter(v=>group.options.includes(v));
    if (wants.some(v=>(focus?.excluded?.[group.key]||[]).includes(v))) return false;
    const supports = known(group.key, facets[group.key]);
    if (wants.length && (supports.length || focus?.reviewed) && !wants.some(v=>supports.includes(v))) return false;
  }
  const service = String(listing.serviceType || '').toLowerCase();
  const population = {individual:'Individuals',family:'Families',couples:'Couples'}[service];
  const populations = known('populations',facets.populations);
  if (population && (populations.length || focus?.reviewed) && !populations.includes(population)) return false;
  const norm = v => String(v||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  const insurance = norm(listing.preferences?.insurance || client?.insurance_type_label);
  const isUnknown = ['','unknown','notprovided','notspecified','other','unlisted','tbd'].includes(insurance);
  if (!isUnknown) {
    if ((profile?.excludedInsurances||[]).some(v=>norm(v)===insurance)) return false;
    const insurances = profile?.insurances || [];
    if (!restrictPublicInsurances([insurance], profile?.insuranceCredential || {}).length) return false;
    if ((insurances.length || profile?.insuranceEligibilityKnown) && !insurances.some(v=>norm(v)===insurance)) return false;
  }
  return true;
}
