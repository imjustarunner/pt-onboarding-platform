/**
 * Smart Disclosure — living EN/ES provider disclosure parallel to Smart School ROI.
 * Hogwarts-gated until rollout.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import {
  determineLicenseStatus,
  isBachelorsCredentialText
} from '../utils/credentialNormalization.js';
import {
  DEFAULT_DISCLOSURE_STATE,
  extractLicenseTypeKey,
  listEditableRegulatoryBoards,
  mergeRegulatoryBoardSettings,
  resolveRegulatoryBoard
} from '../utils/disclosureRegulatoryBoards.js';
import {
  FALLBACK_ITSCO_BUSINESS_ENTITY,
  resolveDisclosureBusinessEntity
} from '../utils/disclosureBusinessEntity.js';
import { decryptIntakeSubmissionRows } from './intakeResponsesEncryption.service.js';
import AgencySchoolIntakeMaster from '../models/AgencySchoolIntakeMaster.model.js';

const DEMO_SCHOOL_SLUGS = new Set(['hogwarts']);

/** Living chart prefers currentProviders; signed snapshot is historical fallback only. */
export function pickLivingDisclosureParties(currentProviders = [], signedProviders = []) {
  const live = Array.isArray(currentProviders) ? currentProviders : [];
  const signed = Array.isArray(signedProviders) ? signedProviders : [];
  return live.length ? live : signed;
}

const DEFAULT_COPY_EN = {
  title: 'DISCLOSURE STATEMENT',
  introHtml: `<p>This document is MANDATORY for all mental health professions in Colorado. The specific agency within the Department that has responsibility specifically for licensed and unlicensed psychotherapists is:</p>
<p><em>Department of Regulatory Agencies<br/>Division of Profession and Occupations<br/>Healthcare Professions Programs<br/>State Board Specific to Each Clinician/Provider is Listed with Each Individual<br/>1560 Broadway, Suite 1350 Denver, Colorado 80202 (303) 894-7800</em></p>
<p>The purpose of this document is to explain the levels of regulation applicable to mental health professionals under the Mental Health Practice Act and the differences between licensure, registration, and certification, including the educational, experience, and training requirements applicable to the particular level of regulation. The direct entity covered by this document can be found below, as well as the Clinicians and Providers who are employees of that entity.</p>
<p><em>Note: The Clinicians and Providers listed below are subject to change. This document will be sent, acknowledged, and signed by clients or their parent/guardian’s at the time of intake and accurate information about their specific clinician/provider will be listed.</em></p>`,
  doraHtml: '',
  rightsHtml: `<p><strong>Client Rights and Disclosures:</strong></p>
<p>(I) I understand that I am entitled to receive information about the methods of therapy, the techniques used, the duration of therapy, if known, and the fee structure.</p>
<p>(II) I understand that I may seek a second opinion from another therapist or may terminate therapy at any time.</p>
<p>(III) I understand that In a professional relationship such as this, sexual intimacy is never appropriate and should be reported to the board that licenses, registers, or certifies the licensee, registrant, or certificate holder.</p>
<p>(IV) I understand that the information I provided during my therapy sessions is legally confidential in the case of individuals licensed, certified, or registered under Colorado’s Regulatory agencies, except for certain legal exceptions that will be identified by the licensee, registrant, or certificate holder should any such situation arise during therapy.</p>
<p>(V) I understand that my records may not be maintained for longer than seven years, subject to changes in state or federal law.</p>`,
  levelsOfRegulationHtml: `<p><strong>Levels of Regulation Applicable</strong></p>
<p>The levels of regulated titles and licenses vary in educational experience, training, and experience requirements. Candidate and unlicensed providers practice under supervision of a licensed clinician.</p>`,
  acknowledgmentText: 'I have read the preceding information on our Disclosure Statement and understand my rights as a client or as the client’s responsible party.',
  fullyLicensedHeading: 'FULLY LICENSED PROVIDERS',
  preLicensedHeading: 'PRE-LICENSED PROVIDERS UNDER SUPERVISION',
  unlicensedHeading: 'UNLICENSED PROVIDERS UNDER SUPERVISION'
};

const DEFAULT_COPY_ES = {
  title: 'DECLARACION DE DIVULGACION',
  introHtml: `<p>Este documento es OBLIGATORIO para todas las profesiones de salud mental en Colorado.</p>
<p><em>Department of Regulatory Agencies<br/>Division of Profession and Occupations<br/>1560 Broadway, Suite 1350 Denver, Colorado 80202 (303) 894-7800</em></p>
<p>El proposito de este documento es explicar los niveles de regulacion aplicables a los profesionales de salud mental. La entidad cubierta y los clinicos/proveedores empleados aparecen a continuacion.</p>
<p><em>Nota: Los clinicos y proveedores listados estan sujetos a cambio.</em></p>`,
  doraHtml: '',
  rightsHtml: `<p><strong>Derechos del cliente y divulgaciones:</strong></p>
<p>(I) Tengo derecho a recibir informacion sobre metodos, tecnicas, duracion y estructura de honorarios.</p>
<p>(II) Puedo buscar una segunda opinion o terminar la terapia en cualquier momento.</p>
<p>(III) La intimidad sexual nunca es apropiada y debe reportarse a la junta correspondiente.</p>
<p>(IV) La informacion es confidencial salvo excepciones legales identificadas por el profesional.</p>
<p>(V) Los registros no se mantienen mas de siete anos, sujeto a cambios de ley.</p>`,
  levelsOfRegulationHtml: `<p><strong>Niveles de regulacion aplicables</strong></p>
<p>Los titulos regulados varian en educacion, formacion y experiencia. Los candidatos y no licenciados practican bajo supervision.</p>`,
  acknowledgmentText: 'He leido la informacion anterior de la Declaracion de Divulgacion y entiendo mis derechos como cliente o como parte responsable del cliente.',
  fullyLicensedHeading: 'PROVEEDORES CON LICENCIA COMPLETA',
  preLicensedHeading: 'PROVEEDORES PRE-LICENCIADOS BAJO SUPERVISION',
  unlicensedHeading: 'PROVEEDORES SIN LICENCIA BAJO SUPERVISION'
};

export function isSmartDisclosureDemoSchool(org) {
  const slug = String(org?.slug || org?.portal_url || '').trim().toLowerCase();
  return DEMO_SCHOOL_SLUGS.has(slug);
}

export function isSmartDisclosureForm(link) {
  return String(link?.form_type || '').toLowerCase() === 'smart_disclosure';
}

export function hasProgrammedDisclosureStep(link) {
  let steps = link?.intake_steps;
  if (typeof steps === 'string') {
    try { steps = JSON.parse(steps); } catch { steps = []; }
  }
  return (Array.isArray(steps) ? steps : []).some((s) => {
    const t = String(s?.type || '').trim().toLowerCase();
    return t === 'smart_disclosure' || t === 'disclosure';
  });
}

function parseJsonMaybe(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function normalizeLocale(locale) {
  return String(locale || 'en').trim().toLowerCase().startsWith('es') ? 'es' : 'en';
}

function defaultCopy(locale) {
  return normalizeLocale(locale) === 'es' ? { ...DEFAULT_COPY_ES } : { ...DEFAULT_COPY_EN };
}

function mapLicenseStatusToCategory(status) {
  if (status === 'licensed') return 'FULLY_LICENSED';
  if (status === 'prelicensed') return 'PRE_LICENSED';
  return 'UNLICENSED';
}

function categorizeProvider({
  credential = '',
  licenseNumber = '',
  serviceProvider = '',
  title = '',
  role = ''
} = {}) {
  const { status } = determineLicenseStatus({
    credential: credential || licenseNumber || serviceProvider,
    title,
    role
  });
  if (status !== 'unknown') return mapLicenseStatusToCategory(status);

  const blob = `${credential} ${licenseNumber} ${serviceProvider}`.toLowerCase();
  if (/(candidate|lpcc|mftc|swc|psychologist candidate)/.test(blob)) return 'PRE_LICENSED';
  if (/(intern|bachelor|peer specialist|unlicensed|in-process|in process)/.test(blob)) return 'UNLICENSED';
  if (/(lpc|lcsw|csw|mft|lsw|lac|psychologist)/.test(blob) && !/candidate/.test(blob)) return 'FULLY_LICENSED';
  if (!String(licenseNumber || '').trim() && /intern|bachelor|peer/.test(blob)) return 'UNLICENSED';
  return String(licenseNumber || '').trim() ? 'FULLY_LICENSED' : 'UNLICENSED';
}

function pickInfoValue(info, keys = []) {
  for (const key of keys) {
    const value = String(info?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

/**
 * Disclosure packets only need graduate-level education: degree, school, and
 * when (completed / expected). Strip GPAs, honors, dean's lists, minors, etc.
 */
export function formatDisclosureEducation(rawEducation) {
  const raw = String(rawEducation || '').replace(/\r/g, '\n').trim();
  if (!raw) return null;

  const cleaned = raw
    .replace(/\bGPA\s*[:#]?\s*\d+(\.\d+)?\b/gi, ' ')
    .replace(/\bDeans?\s+Academic\s+Honor\s+List\b/gi, ' ')
    .replace(/\bDean'?s\s+List\b/gi, ' ')
    .replace(/\b(Cum\s+Laude|Magna\s+Cum\s+Laude|Summa\s+Cum\s+Laude|With\s+Honors?|Honor(?:s)?\s+Roll)\b/gi, ' ')
    .replace(/\bMinor(?:s)?\s*:\s*[^\n|;]+/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const chunks = cleaned
    .split(/\n+|(?<=\.)\s+(?=[A-Z])|(?<=\))\s+(?=[A-Z])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const mastersLike = chunks.filter((line) =>
    /\b(master(?:'?s)?|masters|m\.?a\.?\b|m\.?s\.?\b|m\.?s\.?w\.?\b|m\.?ed\.?\b|graduate\s+program|grad(?:uate)?\s+program|in[- ]process)\b/i.test(line)
  );

  if (!mastersLike.length) {
    // Prefer a compact master's sentence if the blob mentions one but line-splitting missed it.
    const compact = cleaned.replace(/\s+/g, ' ').trim();
    const masterSentence = compact.match(
      /[^.]{0,120}\b(master(?:'?s)?|m\.?a\.?\b|m\.?s\.?\b|m\.?s\.?w\.?\b|m\.?ed\.?\b)[^.]{0,160}/i
    );
    return masterSentence ? masterSentence[0].trim() : null;
  }

  return mastersLike
    .filter((line) => !/\b(high\s+school|secondary)\b/i.test(line))
    .slice(0, 2)
    .join(' · ');
}

function resolveProviderEducation(info, { role = '' } = {}) {
  const education = pickInfoValue(info, ['education_history', 'grad_program_info']);
  const formatted = formatDisclosureEducation(education);
  if (formatted) return formatted;
  if (String(role || '').toLowerCase() === 'intern') return 'In-Process';
  return null;
}

function isDisclosureEligibleUserStatus(status) {
  const s = String(status || '').trim().toUpperCase();
  if (!s) return true;
  return !['ARCHIVED', 'PROSPECTIVE', 'INACTIVE_EMPLOYEE', 'TERMINATED_PENDING', 'PREHIRE_OPEN', 'PREHIRE_CLOSED', 'DENIED', 'WITHDRAWN'].includes(s);
}

/** Roles that belong on a disclosure statement (clinical / providing care). */
export const DISCLOSURE_CLINICAL_ROLES = [
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'supervisor',
  'clinical_practice_assistant',
  'qbha',
  'facilitator',
  'tutor'
];

export function normalizeDisclosureRole(role) {
  const raw = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (raw === 'cpa' || raw === 'clinical_practice_asst') return 'clinical_practice_assistant';
  return raw;
}

export function isDisclosureClinicalRole(role) {
  return DISCLOSURE_CLINICAL_ROLES.includes(normalizeDisclosureRole(role));
}

export function isNonClinicalDisclosureTitle(title) {
  const t = String(title || '').trim().toLowerCase();
  if (!t) return false;
  return /credentialing specialist/.test(t)
    || /billing\s*(?:&|and)\s*support/.test(t);
}

export function parseDisclosureIncludeFlag(raw) {
  if (raw === true || raw === 1 || raw === '1') return 1;
  if (raw === false || raw === 0 || raw === '0') return 0;
  return null;
}

/**
 * Per-tenant disclosure membership.
 * includeOnDisclosure 1/0 is an explicit override; NULL means Auto:
 * clinical agency/profile role, or an admin who actually supervises at this tenant.
 */
export function shouldIncludeOnDisclosure({
  includeOnDisclosure = null,
  effectiveRole = '',
  isActingSupervisor = false
} = {}) {
  const flag = parseDisclosureIncludeFlag(includeOnDisclosure);
  if (flag === 1) return true;
  if (flag === 0) return false;
  if (isActingSupervisor) return true;
  if (normalizeDisclosureRole(effectiveRole) === 'supervisor') return true;
  return isDisclosureClinicalRole(effectiveRole);
}

const HOGWARTS_DEMO_FULL_NAMES = new Set([
  'sirius black',
  'alastor moody',
  'kingsley shacklebolt',
  'nymphadora tonks',
  'severus snape',
  'minerva mcgonagall',
  'albus dumbledore',
  'harry potter',
  'hermione granger',
  'ron weasley',
  'rubeus hagrid',
  'filius flitwick',
  'pomona sprout',
  'draco malfoy',
  'luna lovegood',
  'neville longbottom',
  'remus lupin',
  'dolores umbridge',
  'robin williams',
  'piper finch',
  'qr tester',
  'sloppy lady',
  'admin one',
  'ada lovelace',
  'karen kool'
]);

function isHogwartsDemoIdentity(row = {}) {
  const first = String(row.first_name || '').trim().toLowerCase();
  const last = String(row.last_name || '').trim().toLowerCase();
  const full = String(row.fullName || `${first} ${last}`).trim().toLowerCase().replace(/\s+/g, ' ');
  const hay = [first, last, row.email, row.username, full]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  if (/\bhogwarts\b|\bdurmstrang\b|@hogwarts\.|@durmstrang\./i.test(hay)) return true;
  if (HOGWARTS_DEMO_FULL_NAMES.has(full)) return true;
  if (/^super\s*admin$|^admin\s*user$|^test\s*user$|^qr\s*tester$/i.test(full)) return true;
  return false;
}

/** Exported for packet roster filtering. */
export function isDemoPacketIdentity(row = {}) {
  return Number(row.is_demo) === 1 || isHogwartsDemoIdentity(row);
}

export function formatSupervisorTypeLabel(type) {
  const raw = String(type || '').trim();
  if (!raw) return 'Clinical';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function resolveProviderTitle(row, info) {
  return String(row?.title || '').trim()
    || pickInfoValue(info, ['itsco_position'])
    || null;
}

function resolveLicenseNumber(info, row) {
  return pickInfoValue(info, [
    'provider_credential_license_type_number',
    'license_type_number',
    'license_type_and_number'
  ]) || String(row?.credential || '').trim() || '';
}

function deriveServiceProviderLabel({ credential = '', role = '', category = '' } = {}) {
  if (String(category || '').toUpperCase() !== 'UNLICENSED') return null;
  const cred = String(credential || '').trim();
  const upper = cred.toUpperCase();
  const roleNorm = normalizeDisclosureRole(role);
  if (roleNorm === 'clinical_practice_assistant' || roleNorm === 'qbha' || /\bCPA\b/.test(upper)) {
    return 'Clinical Practice Assistant';
  }
  if (roleNorm === 'provider_plus') return cred || 'Provider Plus';
  if (roleNorm === 'tutor' || /\bTUTOR\b/.test(upper)) return 'Tutor';
  if (/\bINTERN\b/.test(upper) || roleNorm === 'intern' || roleNorm === 'intern_plus') return 'Intern';
  if (/\bPEER\s*SPECIALIST\b/i.test(cred)) return 'Peer Specialist';
  if (isBachelorsCredentialText(cred)) return "Bachelor's";
  if (/in[- ]?process/i.test(cred)) return 'In-Process';
  return cred || null;
}

function fingerprintProvider(row) {
  const base = [
    row.userId,
    row.fullName,
    row.licenseNumber,
    row.credential,
    row.education,
    row.regulatoryBoard,
    (row.supervisors || []).map((s) => `${s.fullName}:${s.type}`).join('|')
  ].join('::');
  return crypto.createHash('sha256').update(base).digest('hex').slice(0, 32);
}

async function loadAgencyRegulatoryBoardOverrides(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return {};
  try {
    const [rows] = await pool.execute(
      `SELECT regulatory_boards_json
       FROM agency_disclosure_settings
       WHERE agency_id = ?
       ORDER BY CASE WHEN locale = 'en' THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [aid]
    );
    return parseJsonMaybe(rows?.[0]?.regulatory_boards_json) || {};
  } catch {
    return {};
  }
}

export async function loadAgencyDisclosureSettings(agencyId, locale = 'en') {
  const loc = normalizeLocale(locale);
  try {
    const [rows] = await pool.execute(
      `SELECT terminology_json, business_entity_json, regulatory_boards_json
       FROM agency_disclosure_settings
       WHERE agency_id = ? AND locale = ?
       LIMIT 1`,
      [agencyId, loc]
    );
    const regulatoryBoardOverrides = parseJsonMaybe(rows?.[0]?.regulatory_boards_json)
      || await loadAgencyRegulatoryBoardOverrides(agencyId);
    return {
      terminology: parseJsonMaybe(rows?.[0]?.terminology_json) || {},
      businessEntity: parseJsonMaybe(rows?.[0]?.business_entity_json) || {},
      regulatoryBoardOverrides,
      regulatoryBoards: mergeRegulatoryBoardSettings(regulatoryBoardOverrides, DEFAULT_DISCLOSURE_STATE),
      regulatoryBoardRows: listEditableRegulatoryBoards(regulatoryBoardOverrides, DEFAULT_DISCLOSURE_STATE)
    };
  } catch {
    const regulatoryBoardOverrides = await loadAgencyRegulatoryBoardOverrides(agencyId);
    return {
      terminology: {},
      businessEntity: {},
      regulatoryBoardOverrides,
      regulatoryBoards: mergeRegulatoryBoardSettings(regulatoryBoardOverrides, DEFAULT_DISCLOSURE_STATE),
      regulatoryBoardRows: listEditableRegulatoryBoards(regulatoryBoardOverrides, DEFAULT_DISCLOSURE_STATE)
    };
  }
}

export async function upsertAgencyDisclosureSettings({
  agencyId,
  locale,
  terminology,
  businessEntity,
  regulatoryBoards,
  actorUserId
}) {
  const loc = normalizeLocale(locale);
  const termJson = terminology ? JSON.stringify(terminology) : null;
  const entJson = businessEntity ? JSON.stringify(businessEntity) : null;
  const boardsJson = regulatoryBoards !== undefined && regulatoryBoards !== null
    ? JSON.stringify(regulatoryBoards)
    : null;
  await pool.execute(
    `INSERT INTO agency_disclosure_settings
      (agency_id, locale, terminology_json, business_entity_json, regulatory_boards_json, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       terminology_json = COALESCE(VALUES(terminology_json), terminology_json),
       business_entity_json = COALESCE(VALUES(business_entity_json), business_entity_json),
       regulatory_boards_json = COALESCE(VALUES(regulatory_boards_json), regulatory_boards_json),
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [agencyId, loc, termJson, entJson, boardsJson, actorUserId || null]
  );
  if (boardsJson !== null && loc !== 'en') {
    await pool.execute(
      `INSERT INTO agency_disclosure_settings
        (agency_id, locale, terminology_json, business_entity_json, regulatory_boards_json, updated_by_user_id)
       VALUES (?, 'en', NULL, NULL, ?, ?)
       ON DUPLICATE KEY UPDATE
         regulatory_boards_json = VALUES(regulatory_boards_json),
         updated_by_user_id = VALUES(updated_by_user_id)`,
      [agencyId, boardsJson, actorUserId || null]
    ).catch(() => {});
  }
  return loadAgencyDisclosureSettings(agencyId, loc);
}

const DISCLOSURE_USER_INFO_KEYS = [
  'provider_credential',
  'provider_credential_license_type_number',
  'license_type_number',
  'license_type_and_number',
  'education_history',
  'grad_program_info',
  'itsco_position'
];

async function loadUserInfoMap(userIds) {
  const ids = (userIds || []).map(Number).filter(Boolean);
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const keyPlaceholders = DISCLOSURE_USER_INFO_KEYS.map(() => '?').join(',');
  const map = new Map();
  try {
    const [rows] = await pool.execute(
      `SELECT uiv.user_id, uifd.field_key, uiv.value
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
       WHERE uiv.user_id IN (${placeholders})
         AND uifd.field_key IN (${keyPlaceholders})`,
      [...ids, ...DISCLOSURE_USER_INFO_KEYS]
    );
    for (const r of rows || []) {
      const uid = Number(r.user_id);
      if (!map.has(uid)) map.set(uid, {});
      const key = String(r.field_key);
      const value = String(r.value || '').trim();
      if (!value) continue;
      if (!map.get(uid)[key]) {
        map.get(uid)[key] = value;
      }
    }
  } catch {
    // table/fields may not exist yet
  }
  return map;
}

export async function listDisclosureProviders({ agencyId, schoolOrganizationId, regulatoryBoardOverrides = {} }) {
  const schoolId = Number(schoolOrganizationId || 0);
  const aid = Number(agencyId || 0);
  if (!aid) return [];

  const activeUserClause = `
    AND COALESCE(u.is_active, 1) = 1
    AND (u.is_archived IS NULL OR u.is_archived = FALSE)
    AND UPPER(COALESCE(u.status, 'ACTIVE_EMPLOYEE')) NOT IN (
      'ARCHIVED', 'PROSPECTIVE', 'INACTIVE_EMPLOYEE', 'TERMINATED_PENDING',
      'PREHIRE_OPEN', 'PREHIRE_CLOSED', 'DENIED', 'WITHDRAWN'
    )
  `;

  const schoolProviders = [];
  if (schoolId) {
    try {
      const [rows] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.credential, u.email, u.role, u.title, u.status, u.is_demo
         FROM provider_school_assignments psa
         JOIN users u ON u.id = psa.provider_user_id
         WHERE psa.school_organization_id = ?
           AND COALESCE(psa.is_active, 1) = 1
           ${activeUserClause}
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [schoolId]
      );
      schoolProviders.push(...(rows || []));
    } catch {
      // ignore
    }
  }

  let agencyProviders = [];
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT
          u.id, u.first_name, u.last_name, u.credential, u.email, u.role, u.title, u.status, u.is_demo,
          u.has_supervisor_privileges,
          ua.agency_role, ua.agency_position, ua.include_on_disclosure
       FROM user_agencies ua
       JOIN users u ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND COALESCE(ua.is_active, 1) = 1
         ${activeUserClause}
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [aid]
    );
    agencyProviders = rows || [];
  } catch {
    try {
      const [rows] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.credential, u.email, u.role, u.title, u.status
         FROM user_agencies ua
         JOIN users u ON u.id = ua.user_id
         WHERE ua.agency_id = ?
           AND COALESCE(ua.is_active, 1) = 1
           ${activeUserClause}
         ORDER BY u.last_name ASC, u.first_name ASC`,
        [aid]
      );
      agencyProviders = rows || [];
    } catch {
      agencyProviders = [];
    }
  }

  const membershipByUserId = new Map();
  for (const row of agencyProviders) {
    const id = Number(row.id);
    if (!id) continue;
    membershipByUserId.set(id, row);
  }

  const actingSupervisorIds = new Set();
  try {
    const assignments = await SupervisorAssignment.findByAgency(aid);
    for (const a of assignments || []) {
      const sid = Number(a.supervisor_id || 0);
      if (sid) actingSupervisorIds.add(sid);
    }
  } catch {
    // ignore
  }

  const seen = new Set();
  const ordered = [];
  for (const row of [...schoolProviders, ...agencyProviders]) {
    const id = Number(row.id);
    if (!id || seen.has(id)) continue;
    if (!isDisclosureEligibleUserStatus(row.status)) continue;
    if (isHogwartsDemoIdentity(row) || Number(row.is_demo) === 1) continue;
    const membership = membershipByUserId.get(id) || row;
    const fromSchool = schoolProviders.some((s) => Number(s.id) === id);
    const effectiveRole = String(membership.agency_role || row.role || '').trim() || row.role;
    const effectiveTitle = String(membership.agency_position || row.title || '').trim() || row.title;
    const roleNorm = normalizeDisclosureRole(effectiveRole);
    const isActingSupervisor = actingSupervisorIds.has(id)
      || roleNorm === 'supervisor'
      || (
        Number(membership.has_supervisor_privileges || row.has_supervisor_privileges || 0) === 1
        && (roleNorm === 'admin' || roleNorm === 'super_admin')
      );
    if (!shouldIncludeOnDisclosure({
      includeOnDisclosure: membership.include_on_disclosure,
      effectiveRole,
      isActingSupervisor
    })) continue;
    ordered.push({
      ...row,
      ...membership,
      role: effectiveRole,
      title: effectiveTitle,
      _schoolFirst: fromSchool
    });
  }

  const infoMap = await loadUserInfoMap(ordered.map((r) => r.id));
  const out = [];
  for (const row of ordered) {
    const info = infoMap.get(Number(row.id)) || {};
    let supervisors = [];
    try {
      const assignments = await SupervisorAssignment.findBySupervisee(row.id, aid);
      supervisors = (assignments || [])
        .filter((a) => {
          const status = String(a.supervisor_status || a.status || '').toUpperCase();
          const active = a.supervisor_is_active == null ? true : !!a.supervisor_is_active;
          if (!active) return false;
          if (status && !isDisclosureEligibleUserStatus(status)) return false;
          const name = String(`${a.supervisor_first_name || ''} ${a.supervisor_last_name || ''}`).trim();
          if (isHogwartsDemoIdentity({
            first_name: a.supervisor_first_name,
            last_name: a.supervisor_last_name,
            email: a.supervisor_email,
            fullName: name
          })) return false;
          return true;
        })
        .map((a) => ({
          fullName: String(`${a.supervisor_first_name || a.first_name || ''} ${a.supervisor_last_name || a.last_name || ''}`).trim()
            || String(a.supervisor_name || '').trim()
            || 'Supervisor',
          type: formatSupervisorTypeLabel(a.supervisor_type || a.type || 'clinical'),
          credential: String(a.supervisor_credential || a.credential || '').trim() || null
        }));
    } catch {
      supervisors = [];
    }

    const credential = pickInfoValue(info, ['provider_credential']) || String(row.credential || '').trim() || '';
    const licenseNumber = resolveLicenseNumber(info, row);
    const title = resolveProviderTitle(row, info);
    const category = categorizeProvider({
      credential,
      licenseNumber,
      title,
      role: row.role
    });
    const serviceProvider = deriveServiceProviderLabel({
      credential,
      role: row.role,
      category
    });
    const licenseTypeKey = extractLicenseTypeKey({ credential, licenseNumber });
    const regulatoryBoard = resolveRegulatoryBoard({
      licenseTypeKey,
      credential,
      licenseNumber,
      tenantBoards: regulatoryBoardOverrides,
      state: DEFAULT_DISCLOSURE_STATE,
      category
    });
    const fullName = String(`${row.first_name || ''} ${row.last_name || ''}`).trim() || row.email || `User ${row.id}`;
    const provider = {
      id: Number(row.id),
      userId: Number(row.id),
      fullName,
      title,
      credential: credential || null,
      licenseTypeKey,
      licenseNumber: category === 'UNLICENSED'
        ? (serviceProvider || licenseNumber || null)
        : (licenseNumber || null),
      serviceProvider: serviceProvider || null,
      education: resolveProviderEducation(info, { role: row.role }),
      regulatoryBoard,
      supervisors,
      category,
      schoolAssigned: !!row._schoolFirst
    };
    provider.credentialFingerprint = fingerprintProvider(provider);
    out.push(provider);
  }
  return out;
}

export async function buildSmartDisclosureContext({
  link = null,
  boundClient = null,
  organization = null,
  agency = null,
  locale = null
} = {}) {
  const schoolOrg = organization || null;
  const orgType = String(schoolOrg?.organization_type || 'school').trim().toLowerCase();
  const isSchoolFamilyOrg = !!schoolOrg && ['school', 'program', 'learning'].includes(orgType);
  // Enabled for any school-family org, programmed disclosure steps, or standalone smart_disclosure forms.
  // Demo Hogwarts people remain filtered via isDemoPacketIdentity in listDisclosureProviders.
  const enabled = isSmartDisclosureDemoSchool(schoolOrg)
    || isSmartDisclosureForm(link)
    || hasProgrammedDisclosureStep(link)
    || isSchoolFamilyOrg;
  if (!enabled) {
    return null;
  }

  const agencyId = Number(agency?.id || boundClient?.agency_id || link?.agency_id || 0);
  const schoolId = Number(schoolOrg?.id || boundClient?.organization_id || link?.organization_id || 0);
  const loc = normalizeLocale(locale || link?.language_code || schoolOrg?.language_code || 'en');
  const settings = agencyId
    ? await loadAgencyDisclosureSettings(agencyId, loc)
    : {
      terminology: {},
      businessEntity: {},
      regulatoryBoardOverrides: {},
      regulatoryBoards: mergeRegulatoryBoardSettings({}, DEFAULT_DISCLOSURE_STATE)
    };
  const copy = { ...defaultCopy(loc), ...(settings.terminology || {}) };
  const businessEntity = resolveDisclosureBusinessEntity(agency, settings.businessEntity);

  const providers = agencyId
    ? await listDisclosureProviders({
      agencyId,
      schoolOrganizationId: schoolId,
      regulatoryBoardOverrides: settings.regulatoryBoardOverrides || {}
    })
    : [];

  const contentHash = crypto.createHash('sha256').update(JSON.stringify({
    copy, businessEntity, providers: providers.map((p) => p.credentialFingerprint)
  })).digest('hex').slice(0, 40);

  return {
    enabled: true,
    locale: loc,
    contentHash,
    agency: agencyId ? { id: agencyId, name: agency?.name || null } : null,
    school: schoolId ? { id: schoolId, name: schoolOrg?.name || null, slug: schoolOrg?.slug || null } : null,
    client: boundClient ? {
      id: Number(boundClient.id),
      fullName: boundClient.full_name || boundClient.fullName || null
    } : null,
    businessEntity,
    copy,
    providers,
    sections: [
      { id: 'intro', title: copy.title, html: copy.introHtml },
      ...(copy.doraHtml ? [{ id: 'dora', title: null, html: copy.doraHtml }] : []),
      ...(copy.levelsOfRegulationHtml
        ? [{ id: 'levels', title: null, html: copy.levelsOfRegulationHtml }]
        : [])
    ]
  };
}

export function normalizeSmartDisclosureResponse({ disclosureContext = {}, intakeData = {}, signedAt = new Date() } = {}) {
  const payload = intakeData?.smartDisclosure || {};
  const fromPayload = Array.isArray(payload.providers) ? payload.providers : [];
  const fromContext = Array.isArray(disclosureContext.providers) ? disclosureContext.providers : [];
  const providers = fromPayload.length ? fromPayload : fromContext;
  return {
    locale: normalizeLocale(payload.locale || disclosureContext.locale || 'en'),
    signedAt: signedAt instanceof Date ? signedAt.toISOString() : String(signedAt || ''),
    acknowledged: payload.acknowledged === true || payload.acknowledged === 1,
    signerName: String(payload.signerName || payload.signer?.name || '').trim() || null,
    signerEmail: String(payload.signerEmail || payload.signer?.email || '').trim() || null,
    contentHash: payload.contentHash || disclosureContext.contentHash || null,
    providers: providers.map((p) => ({
      ...p,
      id: Number(p.id || p.userId || 0) || null,
      fullName: p.fullName || null,
      title: p.title || null,
      category: p.category || null,
      licenseNumber: p.licenseNumber || null,
      credential: p.credential || null,
      education: p.education || null,
      serviceProvider: p.serviceProvider || null,
      supervisors: Array.isArray(p.supervisors) ? p.supervisors : [],
      regulatoryBoard: p.regulatoryBoard || null,
      credentialFingerprint: p.credentialFingerprint || fingerprintProvider(p)
    })),
    signatureData: payload.signatureData || null
  };
}

export function validateSmartDisclosureResponse(response) {
  const missing = [];
  if (!response?.acknowledged) missing.push('acknowledgment');
  if (!response?.signatureData && !response?.signerName) missing.push('signature');
  if (!Array.isArray(response?.providers) || !response.providers.length) missing.push('providers');
  return { valid: missing.length === 0, missing };
}

export function buildSmartDisclosureHtml({ disclosureContext = {}, response = {}, signedAt = new Date() } = {}) {
  const copy = disclosureContext.copy || defaultCopy(disclosureContext.locale);
  const entity = disclosureContext.businessEntity || FALLBACK_ITSCO_BUSINESS_ENTITY;
  const providers = response.providers || disclosureContext.providers || [];
  const renderGroups = (list) => {
    const groups = [
      { key: 'FULLY_LICENSED', label: copy.fullyLicensedHeading, items: [] },
      { key: 'PRE_LICENSED', label: copy.preLicensedHeading, items: [] },
      { key: 'UNLICENSED', label: copy.unlicensedHeading, items: [] }
    ];
    for (const p of list) {
      const g = groups.find((x) => x.key === p.category) || groups[2];
      g.items.push(p);
    }
    return groups.map((g) => `
    <h3>${escapeHtml(g.label)}</h3>
    ${g.items.map((p) => `
      <div class="prov">
        <p><strong>Name:</strong> ${escapeHtml(p.fullName || '')}${p.title ? `, <em>${escapeHtml(p.title)}</em>` : ''}</p>
        ${p.licenseNumber ? `<p><strong>License #:</strong> ${escapeHtml(p.licenseNumber)}</p>` : ''}
        ${p.serviceProvider && p.category === 'UNLICENSED' ? `<p><strong>Service Provider:</strong> ${escapeHtml(p.serviceProvider)}</p>` : ''}
        ${p.education ? `<p><strong>Education:</strong> ${escapeHtml(p.education)}</p>` : ''}
        ${(p.supervisors || []).map((s) => `<p><strong>Supervisor:</strong> ${escapeHtml(s.fullName)}${s.type ? `, ${escapeHtml(s.type)}` : ''}</p>`).join('')}
        ${p.regulatoryBoard ? `<p><strong>Specific Regulatory Board:</strong> ${escapeHtml(p.regulatoryBoard)}</p>` : ''}
      </div>
    `).join('') || '<p><em>None listed.</em></p>'}
  `).join('');
  };
  const schoolTeam = providers.filter((p) => p.schoolAssigned);
  const rest = providers.filter((p) => !p.schoolAssigned);
  const providerHtml = schoolTeam.length
    ? `<h2>Assigned to this school</h2>${renderGroups(schoolTeam)}<h2>All current providers</h2>${renderGroups(rest)}`
    : renderGroups(providers);

  const when = signedAt
    ? (signedAt instanceof Date ? signedAt.toLocaleString() : String(signedAt || ''))
    : '';
  const sig = String(response.signatureData || '').trim();
  const sigImg = sig.startsWith('data:image/')
    ? sig
    : (sig.length > 80 ? `data:image/png;base64,${sig}` : '');
  const signedBlock = (response.acknowledged || sigImg || response.signerName)
    ? `${sigImg ? `<div class="sig"><img src="${escapeHtml(sigImg)}" alt="Signature" /></div>` : ''}
    <p><strong>Signed:</strong> ${escapeHtml(response.signerName || '')}${when ? ` · ${escapeHtml(when)}` : ''}</p>`
    : `<p><em>Current care-team Smart Disclosure — not yet acknowledged for this client. This is not the Release of Information.</em></p>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(copy.title)}</title>
  <style>
    body{font-family:Georgia,serif;color:#111;max-width:800px;margin:24px auto;padding:0 16px;line-height:1.45}
    h1{text-align:center;font-size:22px;letter-spacing:.04em}
    h2{margin-top:28px;font-size:15px;letter-spacing:.04em}
    h3{margin-top:18px;font-size:13px;letter-spacing:.04em}
    .entity{text-align:center;margin:18px 0}
    .prov{margin:12px 0 18px}
    .ack{margin-top:28px;padding-top:12px;border-top:1px solid #ccc}
    .sig img{max-height:64px;max-width:280px}
  </style></head><body>
  <h1>${escapeHtml(copy.title)}</h1>
  ${copy.introHtml || ''}
  <div class="entity">
    <p><strong>Business Entity:</strong> ${escapeHtml(entity.name || '')}</p>
    <p><strong>Business Address:</strong> ${escapeHtml(entity.address || '')}</p>
    <p><strong>Phone Number:</strong> ${escapeHtml(entity.phone || '')}</p>
  </div>
  ${providerHtml}
  ${copy.rightsHtml || ''}
  ${copy.levelsOfRegulationHtml || ''}
  <div class="ack">
    <p>${escapeHtml(copy.acknowledgmentText || '')}</p>
    ${signedBlock}
  </div>
  </body></html>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function persistDisclosureAcknowledgement({
  clientId,
  agencyId,
  schoolOrganizationId = null,
  intakeSubmissionId = null,
  clientPhiDocumentId = null,
  languageCode = 'en',
  signedAt = new Date(),
  signerName = null,
  signerEmail = null,
  contentHash = null,
  providers = [],
  createdByUserId = null
}) {
  const cid = Number(clientId || 0);
  const aid = Number(agencyId || 0);
  if (!cid || !aid) return null;
  const [result] = await pool.execute(
    `INSERT INTO client_disclosure_acknowledgements
      (client_id, agency_id, school_organization_id, intake_submission_id, client_phi_document_id,
       language_code, signed_at, signer_name, signer_email, content_hash, providers_json, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cid,
      aid,
      schoolOrganizationId || null,
      intakeSubmissionId || null,
      clientPhiDocumentId || null,
      normalizeLocale(languageCode),
      signedAt instanceof Date ? signedAt : new Date(signedAt || Date.now()),
      signerName || null,
      signerEmail || null,
      contentHash || null,
      JSON.stringify(providers || []),
      createdByUserId || null
    ]
  );
  await pool.execute(
    `UPDATE clients SET disclosure_required = 0 WHERE id = ?`,
    [cid]
  ).catch(() => {});
  return { id: result.insertId };
}

export async function getLatestDisclosureAcknowledgement(clientId) {
  const cid = Number(clientId || 0);
  if (!cid) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT *
       FROM client_disclosure_acknowledgements
       WHERE client_id = ?
       ORDER BY signed_at DESC, id DESC
       LIMIT 1`,
      [cid]
    );
    const row = rows?.[0] || null;
    if (!row) return null;
    return {
      ...row,
      providers: parseJsonMaybe(row.providers_json) || []
    };
  } catch {
    return null;
  }
}

export async function syncDisclosureRequiredForProviderAssign({ clientId, providerUserId }) {
  const cid = Number(clientId || 0);
  const pid = Number(providerUserId || 0);
  if (!cid || !pid) return { disclosureRequired: false };
  const latest = await getLatestDisclosureAcknowledgement(cid);
  if (!latest) {
    await pool.execute(`UPDATE clients SET disclosure_required = 1 WHERE id = ?`, [cid]).catch(() => {});
    return { disclosureRequired: true, reason: 'no_prior_disclosure' };
  }
  const providers = Array.isArray(latest.providers) ? latest.providers : [];
  const covered = providers.some((p) => Number(p.id || p.userId || 0) === pid);
  const required = !covered;
  await pool.execute(
    `UPDATE clients SET disclosure_required = ? WHERE id = ?`,
    [required ? 1 : 0, cid]
  ).catch(() => {});
  return { disclosureRequired: required, reason: covered ? 'on_signed_list' : 'provider_not_on_signed_list' };
}

export async function getClientDisclosureStatus(clientId) {
  const cid = Number(clientId || 0);
  if (!cid) return null;
  const [clients] = await pool.execute(
    `SELECT id, agency_id, organization_id, disclosure_required, full_name
     FROM clients WHERE id = ? LIMIT 1`,
    [cid]
  );
  const client = clients?.[0];
  if (!client) return null;

  let agencyId = null;
  if (client.organization_id) {
    try {
      agencyId = await AgencySchoolIntakeMaster.resolveParentAgencyIdForSchool(client.organization_id);
    } catch {
      agencyId = null;
    }
  }
  if (!agencyId) agencyId = Number(client.agency_id) || null;

  let latest = await getLatestDisclosureAcknowledgement(cid);
  if (!latest) {
    try {
      const [phiRows] = await pool.execute(
        `SELECT id, uploaded_at, document_title, original_name, document_type
         FROM client_phi_documents
         WHERE client_id = ? AND removed_at IS NULL
           AND (
             LOWER(COALESCE(document_type, '')) LIKE '%disclosure%'
             OR LOWER(COALESCE(document_title, '')) LIKE '%disclosure%'
             OR LOWER(COALESCE(original_name, '')) LIKE '%disclosure%'
           )
           AND LOWER(CONCAT(
             COALESCE(document_type, ''), ' ',
             COALESCE(document_title, ''), ' ',
             COALESCE(original_name, '')
           )) NOT LIKE '%release of information%'
           AND LOWER(CONCAT(
             COALESCE(document_type, ''), ' ',
             COALESCE(document_title, ''), ' ',
             COALESCE(original_name, '')
           )) NOT LIKE '%school_roi%'
         ORDER BY id DESC
         LIMIT 1`,
        [cid]
      );
      const phi = phiRows?.[0];
      const phiBlob = `${phi?.document_type || ''} ${phi?.document_title || ''} ${phi?.original_name || ''}`.toLowerCase();
      if (phi && (phiBlob.includes('disclosure statement') || String(phi.document_type || '').toLowerCase() === 'disclosure')) {
        latest = {
          id: null,
          signed_at: phi.uploaded_at,
          language_code: null,
          signer_name: null,
          content_hash: null,
          providers: [],
          client_phi_document_id: phi.id
        };
      }
    } catch {
      // ignore
    }
  }
  if (!latest) {
    try {
      const [isdRows] = await pool.execute(
        `SELECT isd.id, isd.signed_at, isd.audit_trail, dt.name AS document_template_name
         FROM intake_submission_documents isd
         LEFT JOIN document_templates dt ON dt.id = isd.document_template_id
         WHERE isd.signed_pdf_path IS NOT NULL
           AND (
             isd.client_id = ?
             OR EXISTS (
               SELECT 1 FROM intake_submissions s
               WHERE s.id = isd.intake_submission_id AND s.client_id = ?
             )
             OR EXISTS (
               SELECT 1 FROM intake_submission_clients isc
               WHERE isc.intake_submission_id = isd.intake_submission_id AND isc.client_id = ?
             )
           )
         ORDER BY COALESCE(isd.signed_at, isd.id) DESC
         LIMIT 40`,
        [cid, cid, cid]
      );
      const disclosureRow = (isdRows || []).find((row) => {
        let trail = row.audit_trail;
        if (typeof trail === 'string') {
          try { trail = JSON.parse(trail); } catch { trail = {}; }
        }
        if (trail?.smartSchoolRoi || trail?.roiResponse) return false;
        if (trail?.smartDisclosure === true || trail?.disclosure) return true;
        const blob = `${row.document_template_name || ''} ${trail?.documentName || ''}`.toLowerCase();
        if (blob.includes('release of information')) return false;
        if (blob.includes('disclosure agreement') && !blob.includes('disclosure statement')) return false;
        return blob.includes('disclosure statement');
      });
      if (disclosureRow) {
        let trail = disclosureRow.audit_trail;
        if (typeof trail === 'string') {
          try { trail = JSON.parse(trail); } catch { trail = {}; }
        }
        latest = {
          id: disclosureRow.id,
          signed_at: disclosureRow.signed_at,
          language_code: null,
          signer_name: trail?.signerName || null,
          content_hash: trail?.documentReference || null,
          providers: [],
          client_phi_document_id: null
        };
      }
    } catch {
      // ignore
    }
  }
  if (!latest) {
    try {
      const [subs] = await pool.execute(
        `SELECT s.id, s.submitted_at, s.intake_data,
                s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id
         FROM intake_submissions s
         LEFT JOIN intake_submission_clients isc ON isc.intake_submission_id = s.id
         WHERE (s.client_id = ? OR isc.client_id = ?)
         GROUP BY s.id, s.submitted_at, s.intake_data,
                  s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id
         ORDER BY COALESCE(s.submitted_at, s.id) DESC
         LIMIT 5`,
        [cid, cid]
      );
      decryptIntakeSubmissionRows(subs || []);
      for (const row of subs || []) {
        const data = parseJsonMaybe(row.intake_data) || {};
        const disc = data.smartDisclosure || data.disclosure;
        if (disc && (disc.acknowledged || disc.signatureData)) {
          latest = {
            id: null,
            signed_at: disc.signedAt || disc.acknowledgedAt || row.submitted_at,
            language_code: disc.locale || null,
            signer_name: disc.signerName || null,
            content_hash: disc.contentHash || null,
            providers: Array.isArray(disc.providers) ? disc.providers : [],
            client_phi_document_id: null
          };
          break;
        }
      }
    } catch {
      // ignore
    }
  }

  const required = client.disclosure_required === 1 || client.disclosure_required === true;
  let currentProviders = [];
  if (agencyId) {
    try {
      currentProviders = await listDisclosureProviders({
        agencyId,
        schoolOrganizationId: Number(client.organization_id) || 0
      });
    } catch {
      currentProviders = [];
    }
  }
  const signedProviders = Array.isArray(latest?.providers) ? latest.providers : [];
  // Living chart roster is always currentProviders; signed snapshot remains historical evidence.
  const parties = pickLivingDisclosureParties(currentProviders, signedProviders);
  return {
    agencyId,
    agency_id: agencyId,
    schoolOrganizationId: Number(client.organization_id) || null,
    disclosureRequired: required,
    status: required ? 're_sign_needed' : (latest ? 'current' : 'missing'),
    currentProviders,
    parties,
    lastAcknowledgement: latest ? {
      id: latest.id,
      signedAt: latest.signed_at,
      languageCode: latest.language_code,
      signerName: latest.signer_name,
      contentHash: latest.content_hash,
      providers: signedProviders,
      parties: signedProviders,
      clientPhiDocumentId: latest.client_phi_document_id
    } : null,
    previewNote: required
      ? 'A newly assigned provider is not on the last signed disclosure. A new acknowledgment is required.'
      : (latest
        ? 'Showing the current school-first agency care team. The last signed acknowledgment is kept as historical evidence.'
        : 'No signed Smart Disclosure on file yet. The document below is the current school and agency care-team disclosure — it is not the Release of Information.')
  };
}
