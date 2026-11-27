import sanitizeHtml from 'sanitize-html';

export const PLOTLINE_EMPLOYMENT_SLUG = 'plotline_general_employment_v1';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

// The company supplies its terms. These sections give approved language a
// consistent layout and reusable fields without prescribing employment policy.
export const plotlineEmploymentClauses = [
  { key: 'PARTIES', title: 'Employment agreement', body: '<p><strong>{{COMPANY_NAME}}</strong> and <strong>{{CANDIDATE_NAME}}</strong></p><p>Position: {{JOB_TITLE}}<br>Start date: {{START_DATE}}</p>' },
  { key: 'ARRANGEMENT', title: 'Duties and work arrangements', body: '{{WORK_ARRANGEMENT}}' },
  { key: 'PAY', title: 'Compensation', body: '{{PAY_TERMS}}' },
  { key: 'TERMS', title: 'Additional terms', body: '{{ADDITIONAL_TERMS}}' }
];

const limits = {
  COMPANY_NAME: 255, CANDIDATE_NAME: 255, JOB_TITLE: 255, START_DATE: 100,
  WORK_ARRANGEMENT: 6000, PAY_TERMS: 6000, ADDITIONAL_TERMS: 16000
};

export function plotlineEmploymentContent({ clauses, tokens, companyName }) {
  const values = {};
  const unresolved = new Set();
  for (const [key, max] of Object.entries(limits)) {
    const input = key === 'COMPANY_NAME' ? companyName : tokens[key];
    const value = typeof input === 'string' ? input.trim() : '';
    if (value.length > max) throw Object.assign(new Error(`Shorten ${key.toLowerCase().replaceAll('_', ' ')} to ${max.toLocaleString('en-US')} characters.`), { status: 400 });
    if (!value && key !== 'ADDITIONAL_TERMS') unresolved.add(key);
    values[key] = value;
  }
  const sections = clauses.map(clause => {
    // An edited template may use any of the supplied fields. Never expand
    // arbitrary request properties into a contract's markup.
    const body = sanitizeHtml(String(clause.body_html || '').replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_, key) => {
      if (!Object.hasOwn(values, key)) { unresolved.add(key); return `{{${key}}}`; }
      return escape(values[key]).replace(/\r?\n/g, '<br>');
    }), { allowedSchemes: ['https', 'http', 'mailto', 'tel'], allowProtocolRelative: false });
    return body.trim() ? `<section><h2>${escape(clause.title)}</h2>${body}</section>` : '';
  }).join('');
  return { sections, unresolvedTokens: [...unresolved], values };
}
