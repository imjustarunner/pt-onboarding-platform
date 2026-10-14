import { FOCUS_GROUPS, focusMatch } from '../navigation/providerFocus.js';
import { clinicalMatchingSpecialties, hasExcludedSpecialty, specialtiesOverlap } from '../navigation/clientMatching.js';

export function enrollmentFormat(value) {
  const key = String(value || '').trim().toUpperCase().replace(/[ -]/g, '_');
  return ['VIRTUAL', 'TELEHEALTH'].includes(key) ? 'VIRTUAL' : ['IN_PERSON', 'OFFICE'].includes(key) ? 'IN_PERSON' : 'ALL';
}
export function enrollmentProviderStatus(provider, format = 'ALL') {
  const states = provider.intakeStatusByFormat;
  if (states) {
    const values = format === 'ALL' ? ['VIRTUAL', 'IN_PERSON'].map(f => states[f]) : [states[format]];
    return values.includes('accepting') ? 'accepting' : values.includes('waitlist') ? 'waitlist' : 'unavailable';
  }
  return provider.waitlist ? 'waitlist' : provider.acceptingNewClients === true ? 'accepting' : 'unavailable';
}
export function matchingEnrollmentProviders(providers, { format = 'ALL', preferences = [], presentingProblems = [] } = {}) {
  const needs = clinicalMatchingSpecialties({ presentingProblems });
  const score = p => preferences.reduce((total, choice) => total + focusMatch(p.clinicalFocus, choice).score, 0)
    + Number(specialtiesOverlap(needs, p.clinicalFocus?.top?.specialties || p.specialties || []));
  return providers.filter(p => enrollmentProviderStatus(p, format) !== 'unavailable'
    && preferences.every(choice => focusMatch(p.clinicalFocus, choice).eligible)
    && !hasExcludedSpecialty(needs, p.clinicalFocus?.excluded?.specialties || []))
    .map(p => ({ ...p, waitlist: enrollmentProviderStatus(p, format) === 'waitlist', acceptingNewClients: enrollmentProviderStatus(p, format) === 'accepting' }))
    .sort((a, b) => Number(a.waitlist) - Number(b.waitlist) || score(b) - score(a));
}
export function enrollmentMatchingOptions(providers, format = 'ALL') {
  const eligible = providers.filter(p => enrollmentProviderStatus(p, format) !== 'unavailable');
  return Object.fromEntries(FOCUS_GROUPS.map(group => [group.key, group.options.filter(option =>
    eligible.some(p => focusMatch(p.clinicalFocus, { [group.key]: [option] }).eligible))]));
}
export function providerEnrollmentEntry(query = {}) {
  const id = Number(query.providerId);
  if (query.enrollmentSource !== 'provider' || !Number.isSafeInteger(id) || id < 1) return {};
  return { enrollment_source: 'provider', requested_profile_provider_id: id,
    preferred_office_provider_ids: [String(id)], preferred_service_format: enrollmentFormat(query.format) };
}
