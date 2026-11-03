import { exchangeSafeText } from './clientExchangePrivacy.js';
import { exchangeInsuranceLabel } from './clientExchangeMatching.js';
export function summaryItems(value) {
  if (value == null || value === '') return [];
  if (typeof value === 'number') return Number.isFinite(value) ? [String(value)] : [];
  if (typeof value === 'string') {
    try { return summaryItems(JSON.parse(value)); } catch { return [value.trim()].filter(Boolean); }
  }
  if (Array.isArray(value)) return [...new Set(value.flatMap(summaryItems))];
  if (typeof value === 'object') {
    const code = value.code || value.icd10_code;
    const description = value.description || value.name || value.label;
    if (code || description) return [[code, description].filter(Boolean).join(' — ')];
    return Object.values(value).flatMap(summaryItems);
  }
  return [];
}

export function mergeExchangeSummary(saved, additional = {}) {
  return {
    ...saved,
    demographics: { ...additional.demographics, ...saved.demographics },
    preferences: { ...saved.preferences, ...additional.preferences,
      insurance: exchangeInsuranceLabel(saved.preferences?.insurance, additional.preferences?.insurance) },
    diagnoses: [...new Set([...summaryItems(saved.diagnoses), ...summaryItems(additional.diagnoses)])],
    presentingProblems: [...new Set([...summaryItems(saved.presentingProblems), ...summaryItems(additional.presentingProblems)])]
  };
}

/** Open listings follow chart edits, including explicit clears. Legacy referral-only
 * choices remain a fallback when that field has never been recorded on the chart. */
export function mergeCurrentExchangeSummary(saved, additional = {}, client = {}) {
  const summary = mergeExchangeSummary(saved, additional);
  let intake = client.intake_preferences_json || {};
  if (typeof intake === 'string') { try { intake = JSON.parse(intake); } catch { intake = {}; } }
  if (Object.hasOwn(intake, 'exchangeMatchingConcern')) {
    summary.presentingProblems = summaryItems(saved.presentingProblems);
    summary.preferences.sharedMatchingConcern = saved.preferences?.sharedMatchingConcern || null;
  }
  if (Object.hasOwn(intake, 'exchangeMatchingScheduleNotes')) summary.preferences.sharedSchedulingNotes = saved.preferences?.sharedSchedulingNotes ?? '';
  const sources = {
    matchingPreferences: ['matchingPreferences'], modality: ['preferredModality'],
    providerGender: ['preferredProviderGender'], providerQualification: ['providerQualification'],
    serviceLocation: ['serviceLocation', 'preferred_service_location'],
    schedule: ['exchangeSchedule', 'preferredDays', 'preferredTimes', 'preferredTimeOfDay', 'preferredTimeZone', 'preferredSchedulingNotes']
  };
  for (const [field, keys] of Object.entries(sources)) {
    if (keys.some(key => Object.hasOwn(intake || {}, key))) summary.preferences[field] = saved.preferences?.[field] ?? null;
  }
  if (saved.preferences?.serviceLocationSource === 'home_address') {
    const currentChoice = sources.serviceLocation.some(key => Object.hasOwn(intake || {}, key));
    if (currentChoice || !additional.preferences?.serviceLocation) {
      summary.preferences.serviceLocation = saved.preferences.serviceLocation;
      summary.preferences.serviceLocationSource = 'home_address';
    } else summary.preferences.serviceLocationSource = 'preference';
  }
  return summary;
}

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
/** Keep notification summaries brief; never include names, initials, dates of birth or raw notes. */
export function exchangeNotificationSummary({listing,client={}}) {
  const compact = value => summaryItems(value).map(v=>exchangeSafeText(v,client).replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,2).map(v=>v.length>100?v.slice(0,97)+'…':v);
  const age = compact(listing.demographics?.ageBand).join(', ') || 'Not provided';
  const concerns = compact(listing.presentingProblems), diagnoses = compact(listing.diagnoses);
  const type = {individual:'Individual therapy',family:'Family therapy',couples:'Couples therapy'}[String(listing.serviceType||'').toLowerCase()] || 'Therapy type not provided';
  return [`Age: ${age}`, ...(diagnoses.length?[`Diagnosis: ${diagnoses.join('; ')}`]:[]), ...(concerns.length?[`Presenting concerns: ${concerns.join('; ')}`]:[]), type];
}
export function buildExchangeEmail({ listing, link, client = {}, availabilityLink }) {
  const lines=exchangeNotificationSummary({listing,client});
  const intro='New client added to the exchange. This is a possible match while you are open for new clients. Unknown preferences may still match; review the client’s needs before requesting. An assignment is not automatic.';
  const availabilityHelp = 'No longer accepting new clients? Open your availability settings, choose “Waitlisted” or “Closed” under New-client status, and select “Save availability.” This stops future Client Exchange matches for this agency. Existing clients and appointments stay unchanged.';
  return {
    text:`${intro}\n\n${lines.join('\n')}\n\nReview and request in the app: ${link}${availabilityLink ? `\n\n${availabilityHelp}\nUpdate my availability: ${availabilityLink}` : ''}\nThis notification mailbox does not accept replies.`,
    html:`<p>${intro}</p><ul>${lines.map(line=>`<li>${escapeHtml(line)}</li>`).join('')}</ul><p><a href="${escapeHtml(link)}">Review and request in the app</a></p>${availabilityLink ? `<p>${availabilityHelp}</p><p><a href="${escapeHtml(availabilityLink)}">Update my availability</a></p>` : ''}<p>This notification mailbox does not accept replies.</p>`
  };
}
