export const FAMILY_WELCOME_NAME = 'Family Welcome & Follow-Up';
export const FAMILY_WELCOME_TAGLINE = 'Introduce yourself to new families and follow up until you connect.';
export const FAMILY_WELCOME_SECTION_ID = 'my-family-welcome';
export const FAMILY_WELCOME_SEARCH_TERMS = [
  'family welcome', 'auto message', 'parent email', 'client email', 'auto client', 'auto parent',
  'auto welcome', 'school welcome', 'school email', 'school message', 'follow-up', 'follow up'
];
export const PROFILE_LINK_TOKEN = '{{profile_link}}';
export const FAMILY_WELCOME_PROFILE_PROMPT = 'Your email does not include your profile link. Please use the add profile link button in the body of your email.';

export const FAMILY_WELCOME_MESSAGES = [
  { field: 'template', step: 'initial_email', label: '1 · Welcome email', when: 'When you are assigned', subject: 'Introduction & Next Steps for Counseling Services' },
  { field: 'smsTemplate', step: 'second_contact', label: '2 · Follow-up text at 48 hours', when: '48 hours later, with permission to text', subject: 'Text message', sms: true },
  { field: 'secondTemplate', step: 'second_contact', label: '2 · Follow-up email at 48 hours', when: '48 hours later, when texting is not available', subject: 'Following Up About Counseling Services' },
  { field: 'finalTemplate', step: 'final_contact', label: '3 · Final email at 96 hours', when: '96 hours after the welcome', subject: 'Final Follow-Up About Counseling Services' }
];

const REQUIRED = ['{{parent_name}}', '{{provider_name}}', '{{school_name}}', '{{service_day}}'];
const FIELD_LABELS = { parent_name: 'Parent name', provider_name: 'My name', school_name: 'School name', service_day: 'Service day', agency_name: 'Agency name', profile_link: 'Add profile link' };
export function familyWelcomeFields(sms = false) {
  return [...REQUIRED, sms ? '{{agency_name}}' : PROFILE_LINK_TOKEN].map(token => ({ token, label: FIELD_LABELS[token.slice(2, -2)] }));
}


export function requiredTokens(sms = false) {
  return sms ? REQUIRED.slice(0, 2) : REQUIRED;
}

export function validateFamilyWelcomeTemplate(text = '', sms = false) {
  const value = String(text || '');
  const missing = requiredTokens(sms).filter(token => !value.includes(token));
  if (missing.length) return `Use the buttons to add: ${missing.map(token => FIELD_LABELS[token.slice(2, -2)]).join(', ')}.`;
  if (value.trim().length < (sms ? 40 : 80) || value.length > (sms ? 1000 : 6000)) {
    return sms ? 'Keep your text between 40 and 1,000 characters.' : 'Keep your message between 80 and 6,000 characters.';
  }
  if (/<[^>]*>/.test(value)) return 'Use plain text in your message.';
  const allowed = sms ? [...REQUIRED, '{{agency_name}}'] : [...REQUIRED, PROFILE_LINK_TOKEN];
  if ([...value.matchAll(/{{\s*([^}]+)\s*}}/g)].some(match => !allowed.includes(`{{${match[1]}}}`))) return 'Use only the supported personalization fields.';
  if (/{{|}}/.test(value.replace(/{{(?:parent_name|provider_name|school_name|service_day|agency_name|profile_link)}}/g, ''))) return 'An automatic field is incomplete. Remove it and insert it again using its button.';
  return '';
}

export function welcomeMissingProfileLink(draft = {}) {
  return !String(draft.template || '').includes(PROFILE_LINK_TOKEN);
}

export function renderFamilyWelcome(text, values = {}) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (token, key) => values[key] ?? token);
}

export function insertAtCursor(textarea, current, insert) {
  const value = String(current || '');
  if (!textarea || typeof textarea.selectionStart !== 'number') return `${value}${value.endsWith('\n') || !value ? '' : '\n'}${insert}`;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd ?? start;
  return `${value.slice(0, start)}${insert}${value.slice(end)}`;
}
