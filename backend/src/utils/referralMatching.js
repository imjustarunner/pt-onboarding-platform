export const REFERRAL_SERVICES = [
  { id: 'psychology', label: 'Psychology', pattern: /\bpsychologists?\b|\bpsychology\b/i },
  { id: 'psychiatry', label: 'Psychiatry', pattern: /\bpsychiatr(?:y|ists?|ic)\b/i },
  { id: 'psychological_testing', label: 'Psychological testing', pattern: /\bpsychological (?:test\w*|assess\w*|evaluat\w*)\b/i },
  { id: 'neuropsychological_testing', label: 'Neuropsychological testing', pattern: /\bneuropsych\w*\b/i },
  { id: 'medication_management', label: 'Medication management', pattern: /\bmedication(?: management)?\b|\bprescriber\b/i },
  { id: 'adhd_evaluation', label: 'ADHD evaluation', pattern: /\bADHD\b/i },
  { id: 'autism_evaluation', label: 'Autism evaluation', pattern: /\bautism\b/i },
  { id: 'therapy', label: 'Therapy / counseling', pattern: /\btherap(?:y|ist)\b|\bcounsel\w*\b/i }
];
export function serviceTags(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = []; } }
  return Array.isArray(value) ? [...new Set(value.filter(v => REFERRAL_SERVICES.some(s => s.id === v)))] : [];
}
export function detectReferralServices(text) {
  return REFERRAL_SERVICES.filter(s => s.pattern.test(String(text || ''))).map(s => s.id);
}
export function matchingDetails(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = {}; } }
  const raw = value && typeof value === 'object' ? value : {};
  const age = v => v !== '' && v != null && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 120 ? Number(v) : null;
  return { ageMin: age(raw.ageMin), ageMax: age(raw.ageMax),
    languages: Array.isArray(raw.languages) ? [...new Set(raw.languages.filter(v => typeof v === 'string').map(v => v.trim().slice(0,80)).filter(Boolean))].slice(0,30) : [],
    appointmentFormats: Array.isArray(raw.appointmentFormats) ? [...new Set(raw.appointmentFormats.filter(v => ['telehealth','in_person'].includes(v)))] : [] };
}
export function suggestReferralEntries(entries, services, limit = 3) {
  const selected = [], uncovered = new Set(services);
  // Cover requested services first so "psychology or psychiatry" can include both.
  while (selected.length < limit) {
    const candidates = entries.filter(e => !selected.includes(e)).map(e => ({ entry:e, coverage:e.matchedServices.filter(s => uncovered.has(s)).length }));
    candidates.sort((a,b) => b.coverage - a.coverage);
    if (!candidates.length) break;
    const chosen = candidates[0].entry;
    selected.push(chosen);
    chosen.matchedServices.forEach(s => uncovered.delete(s));
  }
  return selected.map(e => e.id);
}
export function matchReferrals(entries, { services = [], request = '', location = '', insurance = '', age = '', language = '', appointmentFormat = '' } = {}) {
  location = String(location || '').trim(); insurance = String(insurance || '').trim(); language = String(language || '').trim();
  const requestedAge = age === '' || age == null ? null : Number(age);
  if (requestedAge !== null && (!Number.isInteger(requestedAge) || requestedAge < 0 || requestedAge > 120)) throw Object.assign(new Error('Enter an age from 0 to 120.'),{status:400});
  if (appointmentFormat && !['telehealth','in_person'].includes(appointmentFormat)) throw Object.assign(new Error('Choose telehealth or in person.'),{status:400});
  const wanted = serviceTags(services).length ? serviceTags(services) : detectReferralServices(request);
  if (!wanted.length) return { services: [], entries: [], suggestedEntryIds: [], warning: 'Select a service to find referral options.' };
  const matches = entries.filter(e => Number(e.is_active) === 1 && e.approval_status === 'approved')
    .map(e => ({ ...e, matchedServices: serviceTags(e.service_tags).filter(s => wanted.includes(s)) }))
    .filter(e => e.matchedServices.length)
    .filter(e => !location.trim() || String(e.address || '').toLowerCase().includes(location.trim().toLowerCase()))
    .filter(e => !insurance.trim() || String(e.insurances_accepted || '').toLowerCase().includes(insurance.trim().toLowerCase()))
    .filter(e => {
      const details = matchingDetails(e.matching_details);
      return (requestedAge === null || (details.ageMin !== null && details.ageMax !== null && requestedAge >= details.ageMin && requestedAge <= details.ageMax))
        && (!language || details.languages.some(v => v.toLowerCase() === language.toLowerCase()))
        && (!appointmentFormat || details.appointmentFormats.includes(appointmentFormat));
    })
    .sort((a,b) => b.matchedServices.length - a.matchedServices.length || a.name.localeCompare(b.name));
  return { services: wanted, entries: matches, suggestedEntryIds: suggestReferralEntries(matches, wanted), warning: 'Matches use recorded directory information. Practices with missing details are excluded when those filters are selected. Confirm availability and coverage directly with each practice.' };
}
const escape = v => String(v || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const safeUrl = value => { try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
export function referralEmailContent({ entries, name = '', support = true }) {
  const greeting = name.trim() ? `Hi ${name.trim()},` : 'Hello,';
  const intro = 'Here are referral options from our network that may be helpful:';
  const closing = `Please contact the practices directly to confirm services, availability and insurance. ${support ? 'If you would like help narrowing the options, reply to this email and our support team will help.' : 'Reply to this email if you would like help narrowing the options.'}`;
  const lines = entries.map(e => {
    const label = e.organization_name || e.name;
    const services = serviceTags(e.service_tags).map(id => REFERRAL_SERVICES.find(s => s.id === id).label).join(', ');
    return { label, services, phone: e.phone || '', website: safeUrl(e.website) };
  });
  return {
    subject: 'Your referral options | Inner Strength',
    text: `${greeting}\n\n${intro}\n\n${lines.map(e => `${e.label}${e.services ? ` — ${e.services}` : ''}\n${[e.phone,e.website].filter(Boolean).join(' | ')}`).join('\n\n')}\n\n${closing}`,
    html: `<div style="font-family:Arial,sans-serif;color:#0f172a;font-size:15px;line-height:1.6"><p>${escape(greeting)}</p><p>${intro}</p>${lines.map(e => `<div style="margin:18px 0;padding:0 0 0 14px;border-left:3px solid #1e40af"><strong>${escape(e.label)}</strong>${e.services ? `<br>${escape(e.services)}` : ''}<br>${escape(e.phone)}${e.website ? ` · <a href="${escape(e.website)}" style="color:#1e40af">Visit website</a>` : ''}</div>`).join('')}<p>${closing}</p></div>`
  };
}
