/**
 * Employment contract merge + pay table renderer.
 */
import pool from '../config/database.js';
import PayrollCompensationLevel from '../models/PayrollCompensationLevel.model.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceTokens(html, tokens = {}) {
  let out = String(html || '');
  for (const [key, value] of Object.entries(tokens)) {
    const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    out = out.replace(re, value == null ? '' : String(value));
  }
  // Leave unresolved tokens visible for preview debugging
  return out;
}

function findUnresolvedTokens(html) {
  const matches = String(html || '').match(/\{\{\s*[A-Z0-9_]+\s*\}\}/g) || [];
  return [...new Set(matches.map((m) => m.replace(/[{}\s]/g, '')))];
}

async function buildPayTableHtml({ agencyId, category, level, payMode }) {
  if (payMode === 'none') return '';
  const levels = await PayrollCompensationLevel.listForAgency(agencyId);
  const row = levels.find(
    (r) => Number(r.category) === Number(category) && Number(r.level) === Number(level)
  );
  if (!row) {
    return '<p><em>Pay table: compensation level not configured.</em></p>';
  }

  const cells = [
    ['Category', escapeHtml(row.category)],
    ['Level', escapeHtml(row.level)],
    ['Label', escapeHtml(row.label || '')],
    ['Direct rate', row.direct_rate != null ? `$${Number(row.direct_rate).toFixed(2)}` : '—'],
    ['Indirect rate', row.indirect_rate != null ? `$${Number(row.indirect_rate).toFixed(2)}` : '—']
  ];
  if (payMode === 'ffs' || row.has_ffs) {
    cells.push(['FFS rate', row.ffs_rate != null ? `$${Number(row.ffs_rate).toFixed(2)}` : '—']);
  }

  const rowsHtml = cells
    .map(([k, v]) => `<tr><th style="text-align:left;padding:4px 8px;">${k}</th><td style="padding:4px 8px;">${v}</td></tr>`)
    .join('');
  return `<table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;font-size:13px;"><tbody>${rowsHtml}</tbody></table>`;
}

export async function loadContractBundle({ agencyId, configId, templateId }) {
  const [cfgRows] = await pool.execute(
    `SELECT * FROM contract_configs WHERE id = ? AND agency_id = ? LIMIT 1`,
    [configId, agencyId]
  );
  const config = cfgRows?.[0] || null;
  if (!config) throw Object.assign(new Error('Contract config not found'), { status: 404 });

  const tplId = templateId || config.contract_template_id;
  let template = null;
  if (tplId) {
    const [tRows] = await pool.execute(
      `SELECT * FROM contract_templates WHERE id = ? AND agency_id = ? LIMIT 1`,
      [tplId, agencyId]
    );
    template = tRows?.[0] || null;
  }

  let clauseKeys = [];
  try {
    clauseKeys = typeof config.clause_keys_json === 'string'
      ? JSON.parse(config.clause_keys_json)
      : (config.clause_keys_json || []);
  } catch {
    clauseKeys = [];
  }
  if (!Array.isArray(clauseKeys) || !clauseKeys.length) {
    throw Object.assign(new Error('Config has no clauses'), { status: 400 });
  }

  const placeholders = clauseKeys.map(() => '?').join(',');
  const [clauseRows] = await pool.execute(
    `SELECT * FROM contract_clauses
     WHERE agency_id = ? AND clause_key IN (${placeholders}) AND is_active = 1`,
    [agencyId, ...clauseKeys]
  );
  const byKey = new Map((clauseRows || []).map((c) => [c.clause_key, c]));
  const ordered = clauseKeys.map((k) => byKey.get(k)).filter(Boolean);

  return { config, template, clauses: ordered, clauseKeys };
}

export async function autofillTokensForCandidate({ agencyId, candidateUserId }) {
  const [userRows] = await pool.execute(
    `SELECT id, first_name, last_name, email, work_email, personal_email
     FROM users WHERE id = ? LIMIT 1`,
    [candidateUserId]
  );
  const user = userRows?.[0];
  const [agencyRows] = await pool.execute(
    `SELECT id, name, street_address, city, state FROM agencies WHERE id = ? LIMIT 1`,
    [agencyId]
  );
  const agency = agencyRows?.[0];

  let jobTitle = '';
  let jobDescription = '';
  let serviceFocus = '';
  try {
    const [hp] = await pool.execute(
      `SELECT hp.applied_role, jd.title, jd.description_text, jd.job_desc_clause_key
       FROM hiring_profiles hp
       LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
       WHERE hp.candidate_user_id = ?
       LIMIT 1`,
      [candidateUserId]
    );
    jobTitle = hp?.[0]?.title || hp?.[0]?.applied_role || '';
    jobDescription = hp?.[0]?.description_text || '';
  } catch {
    /* ignore */
  }

  const pay = await PayrollCompensationLevel.getForUser(agencyId, candidateUserId).catch(() => null);
  const address = [agency?.street_address, agency?.city, agency?.state].filter(Boolean).join(', ');

  return {
    EMPLOYEE_FULL_NAME: `${user?.first_name || ''} ${user?.last_name || ''}`.trim(),
    EMPLOYEE_FIRST_NAME: user?.first_name || '',
    EMPLOYEE_LAST_NAME: user?.last_name || '',
    EMPLOYEE_EMAIL: user?.personal_email || user?.email || '',
    COMPANY_NAME: agency?.name || '',
    COMPANY_ADDRESS: address,
    JOB_TITLE: jobTitle,
    JOB_DESCRIPTION: jobDescription,
    SERVICE_FOCUS: serviceFocus,
    EFFECTIVE_DATE: new Date().toLocaleDateString(),
    START_DATE: '',
    END_DATE: '',
    SUPERVISOR_NAME: '',
    MIN_HOURS: '',
    LICENSE_INFO: '',
    UNIVERSITY: '',
    DIRECT_RATE: pay?.direct_rate != null ? `$${Number(pay.direct_rate).toFixed(2)}` : '',
    INDIRECT_RATE: pay?.indirect_rate != null ? `$${Number(pay.indirect_rate).toFixed(2)}` : '',
    RATE_CONFIG_KEY: '',
    COMPENSATION_CATEGORY: pay?.category != null ? String(pay.category) : '3',
    COMPENSATION_LEVEL: pay?.level != null ? String(pay.level) : '1'
  };
}

export async function renderContractHtml({
  agencyId,
  configId,
  templateId,
  tokens = {},
  compensationCategory,
  compensationLevel
}) {
  const { config, template, clauses } = await loadContractBundle({ agencyId, configId, templateId });
  const mergedTokens = {
    ...tokens,
    RATE_CONFIG_KEY: tokens.RATE_CONFIG_KEY || config.rate_config_key || ''
  };

  const category = compensationCategory || Number(mergedTokens.COMPENSATION_CATEGORY) || 3;
  const level = compensationLevel || Number(mergedTokens.COMPENSATION_LEVEL) || 1;
  const payTable = await buildPayTableHtml({
    agencyId,
    category,
    level,
    payMode: config.pay_mode
  });
  mergedTokens.INSERT_PAY_TABLE = payTable;

  const bodyParts = clauses.map((c, idx) => {
    const heading = c.title ? `<h2 style="margin-top:1.4em;">${idx + 1}. ${escapeHtml(c.title)}</h2>` : '';
    // Clauses already include their own headings in seed HTML — avoid double numbering when body starts with h2/h3
    const body = replaceTokens(c.body_html, mergedTokens);
    if (/^\s*<h[1-3]/i.test(c.body_html || '')) return body;
    return `${heading}${body}`;
  });

  const font = template?.font_family || 'Georgia, serif';
  const css = template?.css_extras || '';
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
  body { font-family: ${font}; color: #111; line-height: 1.45; max-width: 800px; margin: 0 auto; padding: 24px; }
  h1,h2,h3 { color: #0f172a; }
  table { width: 100%; }
  ${css}
</style></head><body>
${bodyParts.join('\n')}
</body></html>`;

  return {
    html,
    unresolvedTokens: findUnresolvedTokens(html.replace(/\{\{\s*INSERT_PAY_TABLE\s*\}\}/gi, '')),
    config,
    template
  };
}

export default {
  loadContractBundle,
  autofillTokensForCandidate,
  renderContractHtml
};
