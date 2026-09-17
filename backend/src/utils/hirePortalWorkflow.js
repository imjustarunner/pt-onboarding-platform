export const PREEMPLOYMENT_FIELDS = [
  ['personal_email', 'Email', 'email', true],
  ['permanent_personal_email', 'Permanent personal email (if different)', 'email'],
  ['full_legal_name', 'Full legal name', 'text', true],
  ['prior_names', 'Prior names', 'textarea'],
  ['preferred_name', 'Preferred name', 'text'],
  ['provider_credential', 'Credentials', 'text'],
  ['date_of_birth', 'Date of birth', 'date', true],
  ['state_of_birth', 'State of birth', 'text'],
  ['mailing_address', 'Mailing address', 'textarea'],
  ['cell_number', 'Cell phone number', 'phone'],
  ['previous_addresses', 'Previous addresses', 'textarea'],
  ['education_information', 'Education, specializations and years conferred', 'textarea']
].map(([key, label, type, required = false]) => ({ key, label, type, required }));

export const PREEMPLOYMENT_KEYS = new Set(PREEMPLOYMENT_FIELDS.map((f) => f.key).concat([
  'legal_name', 'birthdate', 'dob', 'prior_name', 'previous_names', 'personal_phone',
  'professional_headshot', 'headshot', 'resume', 'preferred_email_format'
]));
export const jsonObject = (value) => {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
};
export const safePortalUrl = (value) => {
  try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
};
const resourceKey = (value) => {
  const key = String(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  return /^(background|job-description|agreement|work-email|profile|headshot|resume|handbook|account|review)$|^(task|doc)-/.test(key) ? `resource-${key}`.slice(0, 60) : key;
};
export function sanitizeWorkflow(input) {
  const raw = jsonObject(input);
  return {
    bannerUrl: safePortalUrl(raw.bannerUrl), tagline: String(raw.tagline || '').slice(0, 160),
    supervisorName: String(raw.supervisorName || '').trim().slice(0, 180),
    supervisorUserId: Number(raw.supervisorUserId) > 0 ? Number(raw.supervisorUserId) : null,
    supervisorRole: raw.supervisorRole === true,
    supervisorTemplateId: Number(raw.supervisorTemplateId) > 0 ? Number(raw.supervisorTemplateId) : null,
    supervisorClause: String(raw.supervisorClause || '').trim().slice(0, 12000),
    excludedResourceIds: (Array.isArray(raw.excludedResourceIds) ? raw.excludedResourceIds : []).map(resourceKey).slice(0, 80),
    resources: (Array.isArray(raw.resources) ? raw.resources : []).slice(0, 80).map((r, i) => ({
      id: resourceKey(r.id || `resource-${i}`),
      title: String(r.title || '').trim().slice(0, 200),
      phase: r.phase === 'onboarding' ? 'onboarding' : 'pre_hire',
      kind: ['video', 'meeting', 'link', 'acknowledgement', 'upload', 'document'].includes(r.kind) ? r.kind : 'link',
      templateId: Number(r.templateId) > 0 ? Number(r.templateId) : null,
      url: safePortalUrl(r.url), required: r.required !== false,
      instructions: String(r.instructions || '').slice(0, 4000)
    })).filter((r) => r.id && r.title)
  };
}
export function composeWorkflow(agency, job, person) {
  const layers = [agency, job, person].map(jsonObject);
  const resources = new Map();
  for (const layer of layers) for (const r of sanitizeWorkflow(layer).resources) resources.set(r.id, r);
  const merged = {};
  for (const layer of layers) for (const [key, value] of Object.entries(layer)) if (value !== '' && value != null) merged[key] = value;
  const excluded = new Set(layers.flatMap(l => sanitizeWorkflow(l).excludedResourceIds));
  return sanitizeWorkflow({ ...merged, resources: [...resources.values()].filter(r => !excluded.has(r.id)) });
}
export function validatePreemployment(input, complete = false) {
  const data = {};
  for (const f of PREEMPLOYMENT_FIELDS) {
    data[f.key] = String(input?.[f.key] || '').trim().slice(0, f.type === 'textarea' ? 8000 : 255);
    if (complete && f.required && !data[f.key]) throw Object.assign(new Error(`${f.label} is required.`), { status: 400 });
    if (data[f.key] && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data[f.key])) throw Object.assign(new Error(`Enter a valid ${f.label.toLowerCase()}.`), { status: 400 });
    if (data[f.key] && f.type === 'date') {
      const date = new Date(`${data[f.key]}T12:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data[f.key]) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data[f.key] || date > new Date()) throw Object.assign(new Error('Enter a valid date of birth.'), { status: 400 });
    }
  }
  return data;
}
export function summarizeSteps(steps) {
  const required = steps.filter((s) => s.required !== false && s.kind !== 'review');
  const completed = required.filter((s) => s.complete).length;
  return { total: required.length, completed, percent: required.length ? Math.round(completed * 100 / required.length) : 0, allDone: required.length > 0 && completed === required.length };
}
