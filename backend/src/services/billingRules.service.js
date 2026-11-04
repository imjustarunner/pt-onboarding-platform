import pool from '../config/database.js';
import { deriveCredentialTier, eligibleServiceCodesForTier, isServiceCodeDeniedForTier } from '../utils/clinicalServiceCodeEligibility.js';

/** Codes that stay off for every credential until a practice turns them on for one person. */
export const OPT_IN_SERVICE_CODES = ['H0002'];

export const COLORADO_CREDENTIAL_TIERS = [
  {
    id: 'qbha',
    label: 'QBHA',
    detail: 'Qualified behavioral health assistant. Community, outreach, skills, and education codes only.'
  },
  {
    id: 'bachelors',
    label: "Bachelor's",
    detail: "QBHA codes plus bachelor's counseling, assessment, and case management. Colorado default: codes that start with 9 stay off."
  },
  {
    id: 'intern_plus',
    label: 'Intern, prelicensed, and fully licensed',
    detail: 'Interns, candidates, prelicensed clinicians, and fully licensed clinicians (LPC, LCSW, LMFT, LSW, psychologist). They can use the practice catalog, including psychotherapy. Opt-in codes stay off until turned on for that person.'
  }
];

const INTERN_CATALOG_CODES = ['90785', '90791', '90832', '90834', '90837', '90839', '90840', '90846', '90847', '90853', '99051'];

const CODE_LABELS = {
  H0002: 'Behavioral health screening',
  H0004: 'Behavioral health counseling and therapy',
  H0023: 'Behavioral health outreach',
  H0025: 'Behavioral health prevention education',
  H0031: 'Mental health assessment',
  H0032: 'Mental health service plan development',
  H2014: 'Skills training and development',
  H2015: 'Comprehensive community support',
  H2016: 'Comprehensive community support, day',
  H2017: 'Psychosocial rehabilitation',
  H2018: 'Psychosocial rehabilitation, day',
  H2021: 'Community-based wraparound',
  H2022: 'Community-based wraparound, day',
  H2033: 'Multisystemic therapy',
  T1017: 'Targeted case management',
  S9454: 'Stress management class',
  97535: 'Self-care / home management training',
  90785: 'Interactive complexity add-on',
  90791: 'Psychiatric diagnostic evaluation',
  90832: 'Psychotherapy, 30 minutes',
  90834: 'Psychotherapy, 45 minutes',
  90837: 'Psychotherapy, 60 minutes',
  90839: 'Psychotherapy for crisis, first 60 minutes',
  90840: 'Psychotherapy for crisis, each additional 30 minutes',
  90846: 'Family psychotherapy without the client present',
  90847: 'Family psychotherapy with the client present',
  90853: 'Group psychotherapy',
  99051: 'Services provided in the office, after posted hours'
};

function codeOf(entry) {
  if (entry && typeof entry === 'object') {
    return String(entry.code || entry.service_code || entry.serviceCode || '').trim().toUpperCase();
  }
  return String(entry || '').trim().toUpperCase();
}

export function coloradoDefaultCodes() {
  const qbha = eligibleServiceCodesForTier('qbha') || [];
  const bachelors = eligibleServiceCodesForTier('bachelors') || [];
  return [...new Set([...qbha, ...bachelors, ...INTERN_CATALOG_CODES, ...OPT_IN_SERVICE_CODES])].sort();
}

export function credentialAllows(tier, code, overrides = new Map()) {
  const serviceCode = codeOf(code);
  const credentialTier = String(tier || '').trim().toLowerCase() || 'unknown';
  if (!serviceCode) return false;
  const saved = overrides.get(`${credentialTier}|${serviceCode}`);
  if (saved !== undefined) return saved;
  if (OPT_IN_SERVICE_CODES.includes(serviceCode)) return false;
  if (credentialTier === 'intern_plus') return !isServiceCodeDeniedForTier(credentialTier, serviceCode);
  const list = eligibleServiceCodesForTier(credentialTier);
  if (!Array.isArray(list)) return !isServiceCodeDeniedForTier(credentialTier, serviceCode);
  return list.includes(serviceCode);
}

export function filterServiceCodesForCredential(codes, tier, overrides = new Map(), granted = []) {
  if (!Array.isArray(codes)) return codes;
  const allow = new Set((granted || []).map((code) => codeOf(code)).filter(Boolean));
  const objectRows = codes.some((entry) => entry && typeof entry === 'object');
  const kept = codes.filter((entry) => {
    const serviceCode = codeOf(entry);
    return serviceCode && (credentialAllows(tier, serviceCode, overrides) || allow.has(serviceCode));
  });
  const present = new Set(kept.map(codeOf));
  for (const serviceCode of OPT_IN_SERVICE_CODES) {
    if (!allow.has(serviceCode) || present.has(serviceCode)) continue;
    kept.push(objectRows ? { code: serviceCode, label: CODE_LABELS[serviceCode] || serviceCode } : serviceCode);
    present.add(serviceCode);
  }
  return kept;
}

function missingTable(error) {
  return error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146;
}

export async function loadCredentialOverrides(stateCode = 'CO') {
  const overrides = new Map();
  try {
    const [rows] = await pool.execute(
      `SELECT credential_tier, service_code, allowed
       FROM billing_credential_code_rules
       WHERE state_code = ?`,
      [String(stateCode || 'CO').toUpperCase()]
    );
    for (const row of rows || []) {
      overrides.set(`${String(row.credential_tier || '').toLowerCase()}|${codeOf(row.service_code)}`, Number(row.allowed) === 1);
    }
  } catch (error) {
    if (missingTable(error)) return overrides;
    throw error;
  }
  return overrides;
}

export async function grantedServiceCodesForProvider(agencyId, userId) {
  const agency = Number(agencyId);
  const user = Number(userId);
  if (!agency || !user) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT service_code
       FROM provider_service_code_grants
       WHERE agency_id = ? AND user_id = ? AND is_enabled = 1`,
      [agency, user]
    );
    return (rows || []).map((row) => codeOf(row.service_code)).filter(Boolean);
  } catch (error) {
    if (missingTable(error)) return [];
    throw error;
  }
}

export async function saveCredentialRule({ stateCode = 'CO', serviceCode, credentialTier, allowed, actorUserId }) {
  const code = codeOf(serviceCode);
  const tier = String(credentialTier || '').trim().toLowerCase();
  if (!code || !COLORADO_CREDENTIAL_TIERS.some((item) => item.id === tier)) {
    throw Object.assign(new Error('Choose a service code and a Colorado credential group.'), { status: 400 });
  }
  await pool.execute(
    `INSERT INTO billing_credential_code_rules
       (state_code, service_code, credential_tier, allowed, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), updated_by_user_id = VALUES(updated_by_user_id)`,
    [String(stateCode).toUpperCase(), code, tier, allowed ? 1 : 0, Number(actorUserId) || null]
  );
}

async function providerBelongsToAgency(agencyId, userId) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM user_agencies
     WHERE agency_id = ? AND user_id = ? AND COALESCE(is_active, 1) = 1
     LIMIT 1`,
    [Number(agencyId), Number(userId)]
  );
  return Boolean(rows?.length);
}

export async function saveProviderServiceGrant({ agencyId, userId, serviceCode, enabled, actorUserId }) {
  const code = codeOf(serviceCode);
  if (!OPT_IN_SERVICE_CODES.includes(code)) {
    throw Object.assign(new Error('That service is controlled by the Colorado credential rules, not a person exception.'), { status: 400 });
  }
  if (!(await providerBelongsToAgency(agencyId, userId))) {
    throw Object.assign(new Error('That person is not on this practice.'), { status: 404 });
  }
  await pool.execute(
    `INSERT INTO provider_service_code_grants
       (agency_id, user_id, service_code, is_enabled, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), updated_by_user_id = VALUES(updated_by_user_id)`,
    [Number(agencyId), Number(userId), code, enabled ? 1 : 0, Number(actorUserId) || null]
  );
}

export async function listBillingRuleProviders(agencyId) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.credential, u.role, ua.agency_role
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE COALESCE(ua.is_active, 1) = 1
       AND COALESCE(u.is_active, 1) = 1
       AND (u.sees_clients = 1 OR u.has_provider_access = 1)
     ORDER BY u.first_name, u.last_name, u.id`,
    [Number(agencyId)]
  );
  let grants = [];
  try {
    const [grantRows] = await pool.execute(
      `SELECT user_id, service_code
       FROM provider_service_code_grants
       WHERE agency_id = ? AND is_enabled = 1`,
      [Number(agencyId)]
    );
    grants = grantRows || [];
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  const byUser = new Map();
  for (const grant of grants) {
    const id = Number(grant.user_id);
    if (!byUser.has(id)) byUser.set(id, []);
    byUser.get(id).push(codeOf(grant.service_code));
  }
  return (rows || []).map((row) => {
    const tier = deriveCredentialTier({
      userRole: row.agency_role || row.role,
      providerCredentialText: row.credential
    });
    return {
      id: Number(row.id),
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || `Provider ${row.id}`,
      credential: row.credential || '',
      tier,
      grants: byUser.get(Number(row.id)) || []
    };
  });
}

export async function coloradoBillingRules(agencyId) {
  const overrides = await loadCredentialOverrides('CO');
  const descriptions = new Map();
  try {
    const [rows] = await pool.execute(
      `SELECT service_code, description
       FROM agency_medical_service_codes
       WHERE agency_id = ?`,
      [Number(agencyId)]
    );
    for (const row of rows || []) descriptions.set(codeOf(row.service_code), String(row.description || '').trim());
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  const extraCodes = [...overrides.keys()].map((key) => key.split('|')[1]).filter(Boolean);
  const codes = [...new Set([...coloradoDefaultCodes(), ...extraCodes])].sort().map((serviceCode) => {
    const tiers = {};
    const sources = {};
    for (const tier of COLORADO_CREDENTIAL_TIERS) {
      const key = `${tier.id}|${serviceCode}`;
      tiers[tier.id] = credentialAllows(tier.id, serviceCode, overrides);
      sources[tier.id] = overrides.has(key) ? 'practice_update' : 'colorado_default';
    }
    return {
      code: serviceCode,
      description: descriptions.get(serviceCode) || CODE_LABELS[serviceCode] || serviceCode,
      tiers,
      sources,
      optIn: OPT_IN_SERVICE_CODES.includes(serviceCode)
    };
  });
  return {
    stateCode: 'CO',
    title: 'Colorado defaults',
    tiers: COLORADO_CREDENTIAL_TIERS,
    codes,
    optInCodes: OPT_IN_SERVICE_CODES,
    providers: await listBillingRuleProviders(agencyId)
  };
}
