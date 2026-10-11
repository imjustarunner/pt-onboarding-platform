// Crisis locations verified against the operators' websites, 2026-10-10.
export const VACATION_SOURCES = [
  'https://www.988colorado.com/en/what-is-988',
  'https://diversushealth.org/mental-health-locations/diversus-health-lighthouse-walk-in-crisis-center/',
  'https://www.wellpower.org/crisis-services/'
];
export const VACATION_ROLES = ['provider', 'provider_plus', 'intern', 'intern_plus', 'facilitator', 'staff', 'support', 'admin', 'assistant_admin', 'super_admin', 'supervisor', 'clinical_director', 'tutor', 'schedule_manager', 'clinical_practice_assistant'];
export const TEMPLATE_KEYS = ['provider_colorado_springs', 'provider_denver', 'staff_colorado_springs', 'staff_denver'];
export function vacationTemplates() {
  return Object.fromEntries(TEMPLATE_KEYS.map(key => {
    const local = key.endsWith('_denver')
      ? 'Denver: WellPower Walk-In Crisis Center, 4353 E. Colfax Ave., Denver. Open 24/7. https://www.wellpower.org/crisis-services/'
      : 'Colorado Springs: Diversus Health Lighthouse Walk-In Crisis Center, 115 S. Parkside Dr., Colorado Springs. Open 24/7. Office: (719) 572-6100. https://diversushealth.org/mental-health-locations/diversus-health-lighthouse-walk-in-crisis-center/';
    return [key, `Hello,\n\nThank you for contacting {provider_name} at {agency_name}. I am out of the office until {return_at}. Please do not rely on this inbox for a timely response while I am away. I will review messages when I return.\n\n${key.startsWith('provider') ? 'For new services, appointment questions, or assistance that cannot wait for my return, contact {support_contact}. For nonurgent matters that can wait, I will respond after I return. Please follow any coverage plan we have already arranged.' : 'For assistance while I am away, contact {support_contact}. Employees should contact their agency’s administrative team through the app. Support response times depend on staff availability.'}\n\nFor immediate danger or a medical emergency, call 911 or go to the nearest emergency department. For suicide, emotional distress, or a mental health crisis, call or text 988, or visit https://www.988colorado.com. Do not wait for an email response.\n\n${local}\n\nThank you,\n{provider_name}`];
  }));
}
export function validateVacationTemplate(value) {
  if (typeof value !== 'string' || value.length > 10000 || !value.trim()) throw Object.assign(new Error('Enter a message of 1–10,000 characters.'), { status: 400 });
  const allowed = new Set(['provider_name', 'agency_name', 'return_at', 'support_contact']);
  if ([...value.matchAll(/\{([^{}]+)\}/g)].some(m => !allowed.has(m[1]))) throw Object.assign(new Error('Use only the listed message placeholders.'), { status: 400 });
  if (!value.includes('{return_at}')) throw Object.assign(new Error('Keep {return_at} in the message so the return time stays current.'), { status: 400 });
  return value.trim();
}
export function renderVacationTemplate(template, values) {
  return template.replace(/\{(provider_name|agency_name|return_at|support_contact)\}/g, (_, key) => String(values[key] ?? ''));
}
export function responderState(config, plannedOutActive, now = new Date()) {
  if (!config?.enabled) return 'off';
  if (!config.endsAt || !Number.isFinite(Date.parse(config.endsAt))) return 'off';
  if (new Date(config.endsAt) <= now) return 'expired';
  return plannedOutActive ? 'active' : 'waiting';
}
export function escapeReplyHtml(text) {
  return `<p>${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br/>')}</p>`;
}
