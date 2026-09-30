export function summaryItems(value) {
  if (!value) return [];
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
export function buildExchangeEmail({ listing, link }) {
  const demographics = listing.demographics || {};
  const preferences = listing.preferences || {};
  const sections = [
    ['Age', summaryItems(demographics.ageBand)],
    ['Gender', summaryItems(demographics.gender)],
    ['Presenting problems', summaryItems(listing.presentingProblems)],
    ['Presenting problem source', [listing.presentingProblemSource, listing.presentingProblemUpdatedAt ? new Date(listing.presentingProblemUpdatedAt).toISOString().slice(0, 10) : null].filter(Boolean)],
    ['Diagnoses', summaryItems(listing.diagnoses)],
    ['Modality', summaryItems(({ in_person: 'In person', virtual: 'Virtual', either: 'In person or virtual' })[preferences.modality] || preferences.modality)],
    ['Insurance', summaryItems(preferences.insurance)]
  ].filter(([, values]) => values.length);
  const intro = 'A new client is available in the exchange. Review the shared information and claim the client if you are interested. Multiple providers may claim; the current provider or support team chooses the assignment.';
  return {
    text: `${intro}\n\n${sections.map(([label, values]) => `${label}:\n${values.map(value => `- ${value}`).join('\n')}`).join('\n\n')}\n\nView client and claim: ${link}`,
    html: `<p>${intro}</p>${sections.map(([label, values]) => `<h3>${label}</h3><ul>${values.map(value => `<li style="white-space:pre-wrap">${escapeHtml(value)}</li>`).join('')}</ul>`).join('')}<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;background:#1f6b4a;color:white;border-radius:8px;text-decoration:none">View client and claim</a></p>`
  };
}
