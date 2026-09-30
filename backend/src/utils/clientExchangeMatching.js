import { canonicalAge, normalizeClinicalFacets } from './providerFacetNormalization.js';
import { providerAvailabilityPreferences } from './providerAvailabilityReminders.js';

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

export function matchesExchangeListing({ user, profile, facets = {}, listing, client, now }) {
  const availability = providerAvailabilityPreferences(user, profile);
  if (!availability.seesClients || !availability.acceptingNewClients) return false;
  const modality = listing.preferences?.modality || listing.preferences?.preferredModality;
  if (modality === 'in_person' ? !availability.inPerson : modality === 'virtual' ? !availability.virtual : !availability.inPerson && !availability.virtual) return false;
  const age = clientAge(client, now);
  const requestedAge = age == null ? ageRange(listing.demographics?.ageBand) : [age, age];
  if (requestedAge && !(facets.ageGroups || []).some(value => {
    const supported = ageRange(value);
    return supported && supported[0] <= requestedAge[0] && supported[1] >= requestedAge[1];
  })) return false;
  const concerns = normalizeClinicalFacets({ specialties: listing.presentingProblems || [] }).specialties;
  if (concerns.length && !(facets.specialties || []).some(value => concerns.includes(value))) return false;
  const insurance = String(listing.preferences?.insurance || '').trim().toLowerCase();
  if (insurance && !(profile?.insurances || []).some(value => String(value).trim().toLowerCase() === insurance)) return false;
  return true;
}
