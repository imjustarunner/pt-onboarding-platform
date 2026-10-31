import { createHash } from 'node:crypto';
import { exchangeCheckCanBeWaived, exchangeCheckLabel, exchangeFitScore } from '../../../frontend/src/navigation/clientExchangePolicy.js';
import { eligibleExchangeProvider } from './clientExchangeProvider.js';
import { canonicalAge, normalizeClinicalFacets } from './providerFacetNormalization.js';
import { providerAvailabilityPreferences } from './providerAvailabilityReminders.js';
import { agencyFormatAllowed } from './providerAgencyAvailability.js';
import { restrictPublicInsurances } from './publicProviderPresentation.js';
import { clinicalMatchingSpecialties, specialtiesOverlap, hasExcludedSpecialty } from '../../../frontend/src/navigation/clientMatching.js';
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

export function exchangeInsuranceLabel(...values) {
  return values.find(value => !['','unknown','notprovided','notspecified','other','unlisted','tbd'].includes(
    String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  )) || null;
}

export function exchangeNeedsOpenings(listing) {
  const preferences = listing.preferences || {}, schedule = preferences.schedule || {};
  return Boolean(schedule.days?.length || schedule.periods?.length || schedule.windows?.length
    || (String(preferences.modality || '').toLowerCase() !== 'virtual' && ['Denver', 'Colorado Springs'].includes(preferences.serviceLocation)));
}

function stableSnapshot(value) {
  if (Array.isArray(value)) return value.map(stableSnapshot).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableSnapshot(value[key])]));
  return value;
}

/** The decision and its explanation share one implementation, so audits cannot drift. */
export function evaluateExchangeMatch({ user, profile, facets = {}, listing, client, now, agency, slots, waivers = [] }) {
  const checks = [];
  const check = (field, ok, pass, fail, known = true) => checks.push({ field, status: !known ? 'unknown' : ok ? 'pass' : 'fail', reason: !known ? pass : ok ? pass : fail });
  check('account', eligibleExchangeProvider(user, agency), 'Provider account is active.', 'An active provider account in this agency is required; inactive and demo accounts cannot request.');
  if (listing.currentProviderUserId) check('assigned', Number(user?.id) !== Number(listing.currentProviderUserId), 'Provider is not already assigned.', 'This provider is already assigned to the client.');
  if (listing.targetProviderUserId) check('direct_referral', Number(user?.id) === Number(listing.targetProviderUserId), 'Direct referral recipient matches.', 'Referral is addressed to a different provider.');
  const availability = providerAvailabilityPreferences(user, profile);
  check('accepting', availability.seesClients && (availability.intakeStatusByFormat ? ['IN_PERSON', 'VIRTUAL'].some(format => agencyFormatAllowed(availability, format)) : availability.acceptingNewClients),
    'Provider sees clients and has intake availability.', 'Provider is closed or waitlisted. A request is allowed, but intake availability must be opened before care begins.');
  const modality = String(listing.preferences?.modality || listing.preferences?.preferredModality || '').toLowerCase();
  const formatOpen = (format, enabled) => availability.seesClients && enabled && (availability.intakeStatusByFormat
    ? agencyFormatAllowed(availability, format) : availability.acceptingNewClients && !['waitlist','unavailable','closed'].includes(profile?.details?.[format==='IN_PERSON'?'officeAvailability':'virtualAvailability']));
  const inPerson = formatOpen('IN_PERSON', availability.inPerson), virtual = formatOpen('VIRTUAL', availability.virtual);
  const wantsFormat = modality === 'virtual' ? 'virtual visits' : modality === 'in_person' ? 'in-person visits' : 'in-person or virtual visits';
  const formatState = (name, enabled, open, key) => !availability.seesClients ? `${name}: not seeing clients`
    : !enabled ? `${name}: not offered` : open ? `${name}: open to new clients`
    : (availability.intakeStatusByFormat?.[key] ?? profile?.details?.[key === 'VIRTUAL' ? 'virtualAvailability' : 'officeAvailability'] ?? (availability.waitlistEnabled ? 'waitlist' : 'unavailable')) === 'waitlist'
      ? `${name}: waitlisted` : `${name}: closed to new clients`;
  const formatDescription = `Client requests ${wantsFormat}. Provider lists ${formatState('in person', availability.inPerson, inPerson, 'IN_PERSON')}; ${formatState('virtual', availability.virtual, virtual, 'VIRTUAL')}.`;
  check('format', modality === 'in_person' ? inPerson : modality === 'virtual' ? virtual : inPerson || virtual,
    formatDescription, `${formatDescription} You may request, but the visit format and availability must be agreed with the client and support team before assignment.`);
  const preferredGender = normalizedProviderGender(listing.preferences?.providerGender);
  const providerGender = normalizedProviderGender(profile?.details?.gender);
  const noGenderPreference = !preferredGender || /^(any|either|all|none|no preference|no_preference|no-preference|not specified|unspecified|not provided)$/.test(preferredGender);
  const genderKnown = ['male','female','nonbinary'].includes(preferredGender) && ['male','female','nonbinary'].includes(providerGender);
  check('provider_gender', noGenderPreference || preferredGender === providerGender,
    noGenderPreference ? 'No therapist gender preference specified; any provider gender passes.' : genderKnown ? 'Preferred provider gender matches.' : `Client prefers a ${preferredGender} therapist; provider gender is not recorded or cannot be verified.`,
    `Client prefers a ${preferredGender} therapist; provider lists ${providerGender}.`, noGenderPreference || genderKnown);
  const qualification=listing.preferences?.providerQualification;
  if(qualification) {
    const credential=String(user?.credential || profile?.insuranceCredential?.credential || '').trim();
    const independent=/\b(?:LPC|LCSW|LMFT|LMHC|LP|LAC)\b/i.test(credential) || /\blicensed psychologist\b/i.test(user?.title || '');
    const provisional=/\b(?:LPCC|LSW|SWC|MFTC)\b/i.test(credential);
    const allowed=independent || qualification==='licensed_or_provisional' && provisional;
    check('qualification',allowed,'Recorded credentials meet the requested provider license requirement.',
      `Client requests ${qualification==='independent'?'an independently licensed clinician':'a licensed or provisionally licensed clinician'}. Provider credentials: ${credential || 'not recorded'}. Verify qualifying credentials before requesting or assigning this client.`);
  }
  const focus = profile?.details?.clinicalFocus;
  const known = (group, fallback) => focus?.reviewed
    ? FOCUS_GROUPS.find(g=>g.key===group).options.filter(v=>!(focus.excluded?.[group]||[]).includes(v))
    : (fallback || []);
  const age = clientAge(client, now);
  const requestedAge = age == null ? ageRange(listing.demographics?.ageBand) : [age, age];
  const ages = known('ageGroups', facets.ageGroups);
  const ageKnown = !!requestedAge && !!(ages.length || focus?.reviewed);
  check('age', ageKnown && ages.some(value => {
    const supported = ageRange(value);
    return supported && supported[0] <= requestedAge[0] && supported[1] >= requestedAge[1];
  }), ageKnown ? 'Provider serves the requested client age range.' : 'Client age or provider age coverage is unknown.', `Client age: ${requestedAge && requestedAge[0] === requestedAge[1] ? requestedAge[0] : listing.demographics?.ageBand}. Provider age ranges: ${ages.join(', ') || 'none selected'}. You may request this client with support review of the age difference.`, ageKnown);
  const concerns = [...new Set([
    ...normalizeClinicalFacets({specialties:listing.presentingProblems||[]}).specialties,
    ...clinicalMatchingSpecialties(listing)
  ])];
  const specialties = normalizeClinicalFacets({specialties:known('specialties',facets.specialties)}).specialties;
  check('clinical_exclusions', !hasExcludedSpecialty(concerns, focus?.excluded?.specialties||[]), 'No recognized clinical concern is explicitly excluded.', 'Provider explicitly excludes a recognized clinical concern.');
  const diagnosticConcerns=clinicalMatchingSpecialties({diagnoses:listing.diagnoses});
  const clinicalKnown = !!(specialties.length || focus?.reviewed);
  check('diagnoses', !diagnosticConcerns.some(need=>!specialtiesOverlap([need],specialties)),
    clinicalKnown && diagnosticConcerns.length ? 'Provider covers every recognized diagnosis category.' : 'No recognized diagnosis or provider specialty coverage to verify.',
    'Provider does not cover every recognized diagnosis category.', clinicalKnown && diagnosticConcerns.length > 0);
  check('concerns', specialtiesOverlap(concerns,specialties),
    clinicalKnown && concerns.length ? 'Recognized clinical needs overlap provider specialties.' : 'Clinical concern or provider specialty coverage is unknown.',
    'Recognized clinical needs do not overlap provider specialties.', clinicalKnown && concerns.length > 0);
  const requested = listing.preferences?.matchingPreferences || {};
  for (const group of FOCUS_GROUPS) {
    const wants = (Array.isArray(requested[group.key]) ? requested[group.key] : []).filter(v=>group.options.includes(v));
    if (!wants.length) continue;
    const excluded = group.key==='specialties' ? hasExcludedSpecialty(wants,focus?.excluded?.specialties||[]) : wants.some(v=>(focus?.excluded?.[group.key]||[]).includes(v));
    check(`${group.key}_exclusions`, !excluded, `No selected ${group.label || group.key} preference is explicitly excluded.`, `Provider explicitly excludes a selected ${group.label || group.key} preference.`);
    const supports = known(group.key, facets[group.key]);
    const hasCoverage = !!(supports.length || focus?.reviewed);
    check(group.key, group.key==='specialties'?specialtiesOverlap(wants,supports):wants.some(v=>supports.includes(v)),
      hasCoverage ? `Selected ${group.label || group.key} preferences overlap.` : `Provider ${group.label || group.key} coverage is unknown.`,
      `Selected ${group.label || group.key} preferences do not overlap.`, hasCoverage);
  }
  const service = String(listing.serviceType || '').toLowerCase();
  const population = {individual:'Individuals',family:'Families',couples:'Couples'}[service];
  const populations = known('populations',facets.populations);
  check('service', populations.includes(population), population && (populations.length || focus?.reviewed) ? 'Provider supports the requested service type.' : 'Service type coverage is not verified.',
    'Provider does not support the requested service type.', !!population && !!(populations.length || focus?.reviewed));
  const norm = v => String(v||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  const insuranceLabel = exchangeInsuranceLabel(client?.insurance_type_label, listing.preferences?.insurance);
  const insurance = norm(insuranceLabel);
  const categoryOnly = ['commercial','commercialother','commercialinsurance','privateinsurance'].includes(insurance);
  const insuranceKnown = !['','unknown','notprovided','notspecified','other','unlisted','tbd'].includes(insurance);
  if (['selfpay','privatepay','none','uninsured'].includes(insurance)) check('insurance', true, 'Client has selected self-pay or no insurance; confirm payment arrangements.', '');
  else if (insuranceKnown) {
    check('insurance_exclusions', !(profile?.excludedInsurances||[]).some(v=>norm(v)===insurance), 'Insurance is not explicitly excluded.', `Provider excludes ${insuranceLabel}; requests and assignment are blocked.`);
    check('insurance_credential', restrictPublicInsurances([insurance], profile?.insuranceCredential || {}).length > 0, 'Insurance credential rules allow this referral.', 'Provider credentials do not allow this insurance.');
    const insurances = profile?.insurances || [];
    const coverageKnown = !categoryOnly;
    check('insurance', insurances.some(v=>norm(v)===insurance), coverageKnown ? 'Provider accepts the client insurance.' : categoryOnly ? 'Only a commercial insurance category was supplied; the specific plan must be confirmed.' : 'Provider insurance acceptance is unknown.', `Provider is not verified to accept ${insuranceLabel}. Insurance eligibility must be confirmed before requesting or assigning this client.`, coverageKnown);
  } else check('insurance', true, 'Client insurance is unspecified.', '', false);
  const schedule = listing.preferences?.schedule || {};
  const hasSchedule = schedule.days?.length || schedule.periods?.length || schedule.windows?.length;
  if (exchangeNeedsOpenings(listing) && slots != null) {
    const field = hasSchedule ? 'schedule' : 'location_availability';
    check(field, slots.some(slot => exchangeSlotMatches(slot, listing.preferences, now)), 'A published opening matches the requested location, days, times and format.',
      'No published opening matches the requested location, days, times and format in the next four weeks. A request is allowed, but a suitable opening must be arranged before care begins.');
  } else checks.push({field:'schedule',status:'unknown',reason:'Availability for the requested location, days and times requires confirmation before care begins.'});
  if (modality !== 'virtual' && (!listing.preferences?.serviceLocation || ['Other location','Not yet decided'].includes(listing.preferences.serviceLocation))) {
    checks.push({field:'location',status:'unknown',reason:'Confirm the in-person service location with the referring team.'});
  }
  const applicable={format:['virtual','in_person'].includes(modality),provider_gender:!noGenderPreference,
    age:!!requestedAge,clinical_exclusions:concerns.length>0,diagnoses:diagnosticConcerns.length>0,concerns:concerns.length>0,
    service:!!population,insurance:insuranceKnown,insurance_credential:insuranceKnown,insurance_exclusions:insuranceKnown,
    schedule:!!hasSchedule,location:modality!=='virtual' && !!listing.preferences?.serviceLocation};
  for(const item of checks) {
    item.applicable=applicable[item.field] ?? true;
    if(!item.applicable && item.status==='unknown')item.reason='Not specified on this referral; this does not lower the match score or block a match.';
  }
  // A waiver is valid only for the same recorded matching inputs. Changes require a fresh review.
  const snapshot = JSON.stringify(stableSnapshot({ requestedAge, serviceType: listing.serviceType || '', concerns, diagnosticConcerns,
    preferences: { modality, providerGender: preferredGender, providerQualification:qualification || '', matchingPreferences: requested, schedule: { days: schedule.days || [], periods: schedule.periods || [], windows: schedule.windows || [], timezone: schedule.timezone || '' }, serviceLocation: listing.preferences?.serviceLocation || '' },
    availability, gender: providerGender, focus: focus || {}, facets }));
  for (const item of checks) {
    item.label = exchangeCheckLabel(item.field);
    item.fingerprint = createHash('sha256').update(`${snapshot}:${item.field}:${item.status}:${item.reason}`).digest('hex');
    item.canWaive = item.applicable !== false && exchangeCheckCanBeWaived(item.field) && item.status !== 'pass';
    const waiver = waivers.find(w => w.field === item.field && w.fingerprint === item.fingerprint);
    if (item.canWaive && waiver) {
      item.originalStatus = item.status;
      item.originalReason = item.reason;
      item.status = 'pass';
      item.waiver = waiver;
      item.canWaive = false;
    }
  }
  const hardFields = new Set(['account','assigned','direct_referral','clinical_exclusions','diagnoses','concerns','service','insurance','insurance_credential','insurance_exclusions','qualification']);
  const code = field => ({account:'provider_account',assigned:'current_provider',accepting:'intake_closed',format:'format_availability',clinical_exclusions:'excluded_specialty',diagnoses:'diagnosis',concerns:'specialty'}[field] || field);
  const reason = check => ({ code: code(check.field), message: check.reason, fingerprint: check.fingerprint });
  const hard = check => hardFields.has(check.field) || (check.field.endsWith('_exclusions') && check.field !== 'ageGroups_exclusions');
  const blockers = checks.filter(c => c.status === 'fail' && hard(c)).map(reason);
  const adjustments = checks.filter(c => c.status === 'fail' && !hard(c)).map(reason);
  const review = checks.filter(c => c.status === 'unknown' && c.applicable !== false).map(reason);
  const requiredReview=checks.filter(c=>c.applicable && c.status==='unknown' && ['schedule','provider_gender','location','insurance'].includes(c.field)).map(reason);
  const canRequest = blockers.length === 0, matched = canRequest && adjustments.length === 0 && requiredReview.length===0;
  const canNotify = matched && checks.filter(c => ['accepting', 'format'].includes(c.field)).every(c => (c.originalStatus || c.status) === 'pass');
  return { matched, checks, ...exchangeFitScore(checks), canAssign: matched, assignmentBlockers: [...blockers, ...adjustments,...requiredReview], status: matched ? 'match' : 'not_match', canRequest, canNotify, blockers, adjustments, review };
}

export function evaluateExchangeListing(input) { return evaluateExchangeMatch(input); }

export function matchesExchangeListing(input) {
  return evaluateExchangeMatch(input).matched;
}

/** Compare every constraint against the same opening, in the client's time zone. */
export function exchangeSlotMatches(slot, preferences = {}, now = new Date()) {
  if (!(Date.parse(slot.startAt) > +now) || !(Date.parse(slot.endAt) > Date.parse(slot.startAt))) return false;
  const modality = String(preferences.modality || '').toLowerCase();
  if (modality === 'in_person' && slot.format !== 'IN_PERSON' || modality === 'virtual' && slot.format !== 'VIRTUAL') return false;
  if (slot.format === 'IN_PERSON' && ['Denver','Colorado Springs'].includes(preferences.serviceLocation)
    && String(slot.city || '').toLowerCase() !== preferences.serviceLocation.toLowerCase()) return false;
  const schedule = preferences.schedule || {};
  const timeZone = schedule.timezone || slot.timeZone || 'America/Denver';
  let parts, endParts;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    parts = Object.fromEntries(fmt.formatToParts(new Date(slot.startAt)).map(p => [p.type, p.value]));
    endParts = Object.fromEntries(fmt.formatToParts(new Date(slot.endAt)).map(p => [p.type, p.value]));
  } catch { return false; }
  const start = `${parts.hour}:${parts.minute}`, end = `${endParts.hour}:${endParts.minute}`;
  if (parts.weekday !== endParts.weekday || end <= start) return false;
  if (schedule.days?.length && !schedule.days.includes(parts.weekday)) return false;
  const periods = { morning: ['00:00','12:00'], afternoon: ['12:00','17:00'], after_school: ['15:00','19:00'], evening: ['17:00','24:00'], pm: ['12:00','24:00'] };
  if (schedule.periods?.length && !schedule.periods.some(p => periods[p] && start >= periods[p][0] && end <= periods[p][1])) return false;
  if (schedule.windows?.length && !schedule.windows.some(w => (!w.day || w.day === parts.weekday) &&
    (w.end ? start >= w.start && end <= w.end : start === w.start))) return false;
  return true;
}
