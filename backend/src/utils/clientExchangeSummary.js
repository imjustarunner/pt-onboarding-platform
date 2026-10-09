import { exchangeSafeText } from './clientExchangePrivacy.js';
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
    preferences: { ...saved.preferences, ...additional.preferences },
    diagnoses: [...new Set([...summaryItems(saved.diagnoses), ...summaryItems(additional.diagnoses)])],
    presentingProblems: [...new Set([...summaryItems(saved.presentingProblems), ...summaryItems(additional.presentingProblems)])]
  };
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
export function buildExchangeEmail({ listing, link, client = {} }) {
  const lines=exchangeNotificationSummary({listing,client});
  const intro='New client added to the exchange. This is a possible match while you are open for new clients. Unknown preferences may still match; review the client’s needs before requesting. An assignment is not automatic.';
  return {
    text:`${intro}\n\n${lines.join('\n')}\n\nReview and request in the app: ${link}\nThis notification mailbox does not accept replies.`,
    html:`<p>${intro}</p><ul>${lines.map(line=>`<li>${escapeHtml(line)}</li>`).join('')}</ul><p><a href="${escapeHtml(link)}">Review and request in the app</a></p><p>This notification mailbox does not accept replies.</p>`
  };
}
