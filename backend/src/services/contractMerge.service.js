/**
 * Employment contract merge + pay table renderer.
 */
import pool from '../config/database.js';
import PayrollCompensationLevel from '../models/PayrollCompensationLevel.model.js';
import HiringResumeParse from '../models/HiringResumeParse.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import {
  classifyPayCategory,
  determineLicenseStatus
} from '../utils/credentialNormalization.js';
import {
  DISCLOSURE_LICENSE_TYPES,
  extractLicenseTypeKey,
  resolveRegulatoryBoard
} from '../utils/disclosureRegulatoryBoards.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TOKEN_ALIASES = {
  CANDIDATE_NAME: 'EMPLOYEE_FULL_NAME',
  Direct_Rate: 'DIRECT_RATE',
  EFFECTIVE_DATE: 'EXECUTION_DATE',
  UNIVERSITY_NAME: 'UNIVERSITY'
};

function normalizeTokens(tokens = {}) {
  const out = { ...tokens };
  for (const [alias, canonical] of Object.entries(TOKEN_ALIASES)) {
    if (out[alias] != null && out[alias] !== '' && (out[canonical] == null || out[canonical] === '')) {
      out[canonical] = out[alias];
    }
    if (out[canonical] != null && out[canonical] !== '' && (out[alias] == null || out[alias] === '')) {
      out[alias] = out[canonical];
    }
  }
  return out;
}

function replaceTokens(html, tokens = {}) {
  let out = String(html || '');
  const merged = normalizeTokens(tokens);
  for (const [key, value] of Object.entries(merged)) {
    const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    out = out.replace(re, value == null ? '' : String(value));
  }
  return out;
}

function findUnresolvedTokens(html) {
  const matches = String(html || '').match(/\{\{\s*[A-Z0-9_]+\s*\}\}/g) || [];
  return [...new Set(matches.map((m) => m.replace(/[{}\s]/g, '')))];
}

function parseJsonValue(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function formatPostalAddress(parts = []) {
  return parts.map((p) => String(p || '').trim()).filter(Boolean).join(', ');
}

export function formatAgencyAddress(agency = {}) {
  const line1 = String(agency.street_address || '').trim();
  const cityStateZip = [
    [agency.city, agency.state].filter(Boolean).join(', '),
    agency.postal_code
  ].filter(Boolean).join(' ');
  return formatPostalAddress([line1, cityStateZip]);
}

export function formatOfficeAddress(office = {}) {
  return formatAgencyAddress(office);
}

function pickDegreeFromResume(summary) {
  const education = Array.isArray(summary?.education) ? summary.education : [];
  const row = education.find((e) => e?.degree) || education[0];
  if (!row) return '';
  const degree = String(row.degree || '').trim();
  const field = String(row.field || '').trim();
  if (degree && field) return `${degree} in ${field}`;
  return degree || field || '';
}

function pickUniversityFromResume(summary) {
  const education = Array.isArray(summary?.education) ? summary.education : [];
  const row = education.find((e) => e?.school) || education[0];
  return String(row?.school || '').trim();
}

function inferCredentialKeyFromResume(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const licenses = Array.isArray(summary.licensesAndCertifications) ? summary.licensesAndCertifications : [];
  for (const lic of licenses) {
    const key = extractLicenseTypeKey({ credential: lic?.name || '' });
    if (key) return key;
  }
  const hints = summary.credentialingHints || {};
  const status = String(hints.likelyLicensureStatus || '').toLowerCase();
  if (status === 'intern') return 'INTERN';
  return null;
}

export function resolveCredentialLabel(credentialKey) {
  const key = String(credentialKey || '').trim().toUpperCase();
  if (!key) return null;
  const row = DISCLOSURE_LICENSE_TYPES.find((r) => r.key === key);
  return row?.label || null;
}

export function formatLicenseTypeDisplay({ credential = '', credentialKey = null, degree = '' } = {}) {
  const key = credentialKey || extractLicenseTypeKey({ credential });
  const label = resolveCredentialLabel(key);
  const parts = [];
  if (label) parts.push(label);
  else if (credential) parts.push(String(credential).trim());
  const deg = String(degree || '').trim();
  if (deg) parts.push(deg);
  return parts.join(', ');
}

function inferRoleLabel({ jobTitle = '', roleType = '', credential = '', role = '' } = {}) {
  const rt = String(roleType || '').trim();
  if (rt) {
    const lower = rt.toLowerCase();
    if (lower.includes('intern') || lower.includes('student')) return 'Student';
    if (lower.includes('facilitat')) return 'Facilitator';
    if (lower.includes('provider')) return 'Provider';
    return rt.charAt(0).toUpperCase() + rt.slice(1);
  }
  const roleLower = String(role || '').trim().toLowerCase();
  if (roleLower === 'intern' || roleLower === 'intern_plus') return 'Student';
  const t = String(jobTitle).toLowerCase();
  if (t.includes('intern') || t.includes('practicum') || t.includes('student')) return 'Student';
  if (t.includes('facilitat')) return 'Facilitator';
  const cred = String(credential || '').toUpperCase();
  if (/\bINTERN\b/.test(cred)) return 'Student';
  return 'Provider';
}

function inferServiceFocus({ userServiceFocus = '', jobDescription = null } = {}) {
  const fromUser = String(userServiceFocus || '').trim();
  if (fromUser) return fromUser;
  let tags = [];
  try {
    tags = typeof jobDescription?.tags_json === 'string'
      ? JSON.parse(jobDescription.tags_json)
      : (jobDescription?.tags_json || []);
  } catch {
    tags = [];
  }
  if (!Array.isArray(tags)) tags = [];
  const serviceTag = tags.find((tag) => /school|office|community|based|counsel/i.test(String(tag || '')));
  if (serviceTag) return String(serviceTag).trim();
  const title = String(jobDescription?.title || '').trim();
  if (/school/i.test(title)) return 'School-Based Counseling';
  if (/office/i.test(title)) return 'Office-Based Counseling';
  return '';
}

export function inferCompensationFromCredential({
  credential = '',
  jobTitle = '',
  title = '',
  role = '',
  isHourlyWorker = false
} = {}) {
  const pay = classifyPayCategory({ credential, jobTitle, title, role, isHourlyWorker });
  const license = determineLicenseStatus({ credential, jobTitle, title, role, isHourlyWorker });
  const credentialKey = extractLicenseTypeKey({ credential });
  return {
    compensationCategory: pay.category,
    compensationLevel: 1,
    payCategoryLabel: pay.label,
    payCategoryReason: pay.reason,
    licenseStatus: license.status,
    licenseStatusReason: license.reason,
    credentialKey,
    licenseType: formatLicenseTypeDisplay({ credential, credentialKey }),
    licensingBoard: resolveRegulatoryBoard({ licenseTypeKey: credentialKey, credential })
      || 'The Department of Regulatory Agencies (DORA)',
    roleLabel: inferRoleLabel({ jobTitle, credential, role })
  };
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

function resolveClauseKeys(rawKeys, jobDescClauseKey) {
  const keys = Array.isArray(rawKeys) ? [...rawKeys] : [];
  const jdKey = String(jobDescClauseKey || 'JOB_DESC_LPC').trim().toUpperCase();
  return keys.map((k) => (String(k).toUpperCase() === 'JOB_DESC_DYNAMIC' ? jdKey : k));
}

export async function loadContractBundle({ agencyId, configId, templateId, jobDescClauseKey }) {
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
  clauseKeys = resolveClauseKeys(clauseKeys, jobDescClauseKey);
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

export async function getAgencyBuilderDefaults(agencyId) {
  const [agencyRows] = await pool.execute(
    `SELECT id, name, street_address, city, state, postal_code FROM agencies WHERE id = ? LIMIT 1`,
    [agencyId]
  );
  const agency = agencyRows?.[0] || null;
  let offices = [];
  try {
    offices = await OfficeLocation.findByAgencyMembership(agencyId);
    if (!offices?.length) offices = await OfficeLocation.findByAgency(agencyId);
  } catch {
    offices = [];
  }
  return {
    agency: agency
      ? {
          id: agency.id,
          name: agency.name,
          address: formatAgencyAddress(agency)
        }
      : null,
    offices: (offices || []).map((o) => ({
      id: o.id,
      name: o.name,
      address: formatOfficeAddress(o)
    })),
    credentialOptions: DISCLOSURE_LICENSE_TYPES
  };
}

export async function autofillTokensForCandidate({
  agencyId,
  candidateUserId,
  credentialOverride = null,
  officeLocationId = null
} = {}) {
  const [userRows] = await pool.execute(
    `SELECT id, first_name, last_name, email, work_email, personal_email, title, credential, service_focus, role
     FROM users WHERE id = ? LIMIT 1`,
    [candidateUserId]
  );
  const user = userRows?.[0];
  const agencyDefaults = await getAgencyBuilderDefaults(agencyId);
  const agency = agencyDefaults.agency;

  let jobTitle = '';
  let jobDescription = '';
  let jobDescriptionRow = null;
  let serviceFocus = '';
  let jobDescClauseKey = 'JOB_DESC_LPC';
  let defaultConfigId = null;
  let roleType = '';
  try {
    const [hp] = await pool.execute(
      `SELECT hp.applied_role, hp.job_description_id,
              jd.title, jd.description_text, jd.job_desc_clause_key, jd.default_contract_config_id,
              jd.role_type, jd.tags_json
       FROM hiring_profiles hp
       LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
       WHERE hp.candidate_user_id = ?
       ORDER BY hp.updated_at DESC, hp.id DESC
       LIMIT 1`,
      [candidateUserId]
    );
    jobDescriptionRow = hp?.[0] || null;
    jobTitle = jobDescriptionRow?.title || jobDescriptionRow?.applied_role || user?.title || '';
    jobDescription = jobDescriptionRow?.description_text || '';
    roleType = String(jobDescriptionRow?.role_type || '').trim();
    if (jobDescriptionRow?.job_desc_clause_key) jobDescClauseKey = jobDescriptionRow.job_desc_clause_key;
    if (jobDescriptionRow?.default_contract_config_id) defaultConfigId = jobDescriptionRow.default_contract_config_id;
    serviceFocus = inferServiceFocus({
      userServiceFocus: user?.service_focus,
      jobDescription: jobDescriptionRow
    });
  } catch {
    jobTitle = user?.title || '';
    serviceFocus = String(user?.service_focus || '').trim();
  }

  const resumeParse = await HiringResumeParse.findLatestStructuredByCandidateUserId(candidateUserId).catch(() => null);
  const resumeSummary = parseJsonValue(resumeParse?.extracted_json);
  const degree = pickDegreeFromResume(resumeSummary);
  const university = pickUniversityFromResume(resumeSummary);
  const resumeCredentialKey = inferCredentialKeyFromResume(resumeSummary);

  let credential = String(credentialOverride ?? user?.credential ?? '').trim();
  if (!credential && resumeCredentialKey) {
    credential = resolveCredentialLabel(resumeCredentialKey) || resumeCredentialKey;
  }
  const credentialKey = extractLicenseTypeKey({ credential }) || resumeCredentialKey;

  const payInference = inferCompensationFromCredential({
    credential,
    jobTitle,
    title: user?.title,
    role: user?.role
  });
  const pay = await PayrollCompensationLevel.getForUser(agencyId, candidateUserId).catch(() => null);

  let assignedOffice = null;
  const officeId = Number(officeLocationId) || null;
  if (officeId) {
    assignedOffice = agencyDefaults.offices.find((o) => Number(o.id) === officeId) || null;
    if (!assignedOffice) {
      const [officeRows] = await pool.execute(
        `SELECT id, name, street_address, city, state, postal_code
         FROM office_locations WHERE id = ? LIMIT 1`,
        [officeId]
      );
      const row = officeRows?.[0];
      if (row) {
        assignedOffice = { id: row.id, name: row.name, address: formatOfficeAddress(row) };
      }
    }
  }
  if (!assignedOffice) {
    try {
      const [officeRows] = await pool.execute(
        `SELECT ol.id, ol.name, ol.street_address, ol.city, ol.state, ol.postal_code
         FROM user_office_locations uol
         JOIN office_locations ol ON ol.id = uol.office_location_id
         WHERE uol.user_id = ? AND uol.is_active = 1
         ORDER BY uol.is_primary DESC, uol.created_at DESC, uol.id DESC
         LIMIT 1`,
        [candidateUserId]
      );
      const row = officeRows?.[0];
      if (row) {
        assignedOffice = { id: row.id, name: row.name, address: formatOfficeAddress(row) };
      }
    } catch {
      assignedOffice = null;
    }
  }

  const today = new Date();
  const executionDate = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const expiration = new Date(today);
  expiration.setDate(expiration.getDate() + 14);

  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
  const roleLabel = inferRoleLabel({
    jobTitle,
    roleType,
    credential,
    role: user?.role
  });
  const licenseType = formatLicenseTypeDisplay({ credential, credentialKey, degree });
  const licensingBoard = resolveRegulatoryBoard({ licenseTypeKey: credentialKey, credential })
    || 'The Department of Regulatory Agencies (DORA)';

  const compensationCategory = pay?.category != null
    ? String(pay.category)
    : (payInference.compensationCategory != null ? String(payInference.compensationCategory) : '3');

  return {
    EMPLOYEE_FULL_NAME: fullName,
    CANDIDATE_NAME: fullName,
    EMPLOYEE_FIRST_NAME: user?.first_name || '',
    EMPLOYEE_LAST_NAME: user?.last_name || '',
    EMPLOYEE_EMAIL: user?.personal_email || user?.email || '',
    COMPANY_NAME: agency?.name || 'ITSCO, LLC',
    COMPANY_ADDRESS: agency?.address || '437 Windchime Place, Colorado Springs, CO 80919',
    JOB_TITLE: jobTitle,
    JOB_DESCRIPTION: jobDescription,
    SERVICE_FOCUS: serviceFocus,
    ROLE_LABEL: roleLabel,
    EXECUTION_DATE: executionDate,
    EFFECTIVE_DATE: executionDate,
    EXPIRATION_DATE: expiration.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    START_DATE: '',
    END_DATE: '',
    INTERNSHIP_END_DATE: '',
    ORIGINAL_AGREEMENT_DATE: '',
    SUPERVISOR_NAME: '',
    MIN_HOURS: '',
    CREDENTIAL: credential,
    CREDENTIAL_KEY: credentialKey || '',
    DEGREE: degree,
    LICENSE_TYPE: licenseType,
    LICENSE_INFO: licenseType,
    LICENSURE_DEADLINE: '',
    LICENSING_BOARD: licensingBoard,
    UNIVERSITY: university,
    UNIVERSITY_NAME: university,
    ADJUSTMENT_REASON: '',
    DIRECT_RATE: pay?.direct_rate != null ? `$${Number(pay.direct_rate).toFixed(2)}` : '',
    INDIRECT_RATE: pay?.indirect_rate != null ? `$${Number(pay.indirect_rate).toFixed(2)}` : '',
    Direct_Rate: pay?.direct_rate != null ? `$${Number(pay.direct_rate).toFixed(2)}` : '',
    RATE_CONFIG_KEY: pay?.label || '',
    COMPENSATION_CATEGORY: compensationCategory,
    COMPENSATION_LEVEL: pay?.level != null ? String(pay.level) : '1',
    JOB_DESC_CLAUSE_KEY: jobDescClauseKey,
    DEFAULT_CONFIG_ID: defaultConfigId,
    PAY_BYPASS: pay?.bypass ? 1 : 0,
    PAY_LABEL: pay?.label || '',
    ASSIGNED_OFFICE_ID: assignedOffice?.id ? String(assignedOffice.id) : '',
    ASSIGNED_OFFICE_NAME: assignedOffice?.name || '',
    ASSIGNED_OFFICE_ADDRESS: assignedOffice?.address || '',
    JOB_DESCRIPTION_ID: jobDescriptionRow?.job_description_id ? String(jobDescriptionRow.job_description_id) : '',
    ROLE_TYPE: roleType
  };
}

export async function renderContractHtml({
  agencyId,
  configId,
  templateId,
  tokens = {},
  compensationCategory,
  compensationLevel,
  jobDescClauseKey
}) {
  const mergedInput = normalizeTokens(tokens);
  const jdKey = jobDescClauseKey || mergedInput.JOB_DESC_CLAUSE_KEY || 'JOB_DESC_LPC';
  const { config, template, clauses } = await loadContractBundle({
    agencyId,
    configId,
    templateId,
    jobDescClauseKey: jdKey
  });
  const mergedTokens = {
    ...mergedInput,
    RATE_CONFIG_KEY: mergedInput.RATE_CONFIG_KEY || config.rate_config_key || ''
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

  const bodyParts = clauses.map((c) => {
    const body = replaceTokens(c.body_html, mergedTokens);
    if (/^\s*<h[1-3]/i.test(c.body_html || '') || /^\s*<p/i.test(body)) return body;
    const heading = c.title ? `<h2 style="margin-top:1.4em;">${escapeHtml(c.title)}</h2>` : '';
    return `${heading}${body}`;
  });

  const font = template?.font_family || 'Georgia, serif';
  const css = template?.css_extras || '';
  const companyName = escapeHtml(mergedTokens.COMPANY_NAME || '');
  const companyAddress = escapeHtml(mergedTokens.COMPANY_ADDRESS || '');
  const brandHeader = companyName
    ? `<header class="contract-brand" style="border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:24px;">
  <div style="font-size:1.35rem;font-weight:700;letter-spacing:0.02em;">${companyName}</div>
  ${companyAddress ? `<div style="font-size:0.85rem;color:#475569;margin-top:4px;">${companyAddress}</div>` : ''}
</header>`
    : '';
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
  body { font-family: ${font}; color: #111; line-height: 1.45; max-width: 800px; margin: 0 auto; padding: 24px; }
  h1,h2,h3 { color: #0f172a; }
  table { width: 100%; }
  ${css}
</style></head><body>
${brandHeader}
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
  renderContractHtml,
  getAgencyBuilderDefaults,
  inferCompensationFromCredential,
  formatLicenseTypeDisplay
};
