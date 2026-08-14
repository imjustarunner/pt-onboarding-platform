import crypto from 'crypto';
import pool from '../config/database.js';
import SchoolPacketTemplate, { normalizeLocale } from '../models/SchoolPacketTemplate.model.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML } from '../content/schoolPacketTemplateDefault.en.js';
import { DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES } from '../content/schoolPacketTemplateDefault.es.js';
import { buildSchoolPrintablePacketContext } from './schoolPrintablePacket.service.js';
import OfficePacketTemplate from '../models/OfficePacketTemplate.model.js';
import { defaultOfficePacketHtml } from '../content/officePacketTemplateDefault.js';
import { normalizeOfficePacketVariant } from '../constants/officePrintablePacket.js';

export const PACKET_SECTION_KEYS = Object.freeze({
  INFORMED_GROUP_CONSENT: 'informed_group_consent',
  POLICY_SERVICES: 'policy_services',
  HIPAA_NOTICE: 'hipaa_notice'
});

export const PACKET_STEP_TYPES = Object.freeze({
  INFORMED_GROUP_CONSENT: 'packet_informed_group_consent',
  POLICY_SERVICES: 'packet_policy_services',
  HIPAA_NOTICE: 'packet_hipaa_notice'
});

const SECTION_HEADING_MAP = {
  [PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT]: {
    start: [
      'INFORMED CONSENT',
      'CONSENTIMIENTO INFORMADO'
    ],
    endExclusive: [
      'POLICY AND SERVICES AGREEMENT',
      'ACUERDO DE POLÍTICAS Y SERVICIOS',
      'ACUERDO DE POLITICAS Y SERVICIOS',
      'CLIENT RIGHTS',
      'DERECHOS DEL CLIENTE'
    ]
  },
  [PACKET_SECTION_KEYS.POLICY_SERVICES]: {
    start: [
      'POLICY AND SERVICES AGREEMENT',
      'ACUERDO DE POLÍTICAS Y SERVICIOS',
      'ACUERDO DE POLITICAS Y SERVICIOS'
    ],
    endExclusive: [
      'CLIENT RIGHTS',
      'DERECHOS DEL CLIENTE',
      'MENTAL HEALTH PROFESSIONAL INFORMATION',
      'INFORMACIÓN DEL PROFESIONAL DE SALUD MENTAL',
      'INFORMACION DEL PROFESIONAL DE SALUD MENTAL',
      'HIPAA'
    ]
  },
  [PACKET_SECTION_KEYS.HIPAA_NOTICE]: {
    start: [
      'HIPAA Privacy Policy & Notice of Privacy Practices',
      'HIPAA Privacy Policy and Notice of Privacy Practices',
      'Política de Privacidad de HIPAA y Aviso de Prácticas de Privacidad',
      'Politica de Privacidad de HIPAA y Aviso de Practicas de Privacidad',
      'HIPAA PRIVACY POLICY',
      'Notice of Privacy Practices',
      'Aviso de Prácticas de Privacidad'
    ],
    endExclusive: []
  }
};

function decodeHeadingEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeading(value) {
  return decodeHeadingEntities(value)
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9áéíóúüñ]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function findHeadingIndex(html, headings, fromIndex = 0) {
  const source = String(html || '').slice(Math.max(0, Number(fromIndex) || 0));
  const wanted = (headings || []).map(normalizeHeading).filter(Boolean);
  if (!wanted.length) return -1;
  const re = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi;
  let match;
  let best = -1;
  while ((match = re.exec(source))) {
    const text = normalizeHeading(match[1]);
    if (!text) continue;
    const hit = wanted.some((heading) => text === heading || text.includes(heading) || heading.includes(text));
    if (hit && (best < 0 || match.index < best)) best = match.index;
  }
  return best < 0 ? -1 : best + Math.max(0, Number(fromIndex) || 0);
}

/**
 * Extract a section slice from packet HTML using h2 heading markers.
 * informed_group_consent = INFORMED CONSENT through (not including) POLICY...
 * (includes GROUP CONSENT between those headings).
 */
export function extractPacketSectionHtml(htmlContent, sectionKey) {
  const key = String(sectionKey || '').trim();
  const cfg = SECTION_HEADING_MAP[key];
  if (!cfg) {
    const err = new Error(`Unknown packet section key: ${key}`);
    err.status = 400;
    throw err;
  }
  const html = String(htmlContent || '');
  let start = findHeadingIndex(html, cfg.start);
  if (start < 0 && key === PACKET_SECTION_KEYS.HIPAA_NOTICE) {
    start = findHeadingIndex(html, ['HIPAA', 'Notice of Privacy Practices']);
  }
  if (start < 0) {
    const err = new Error(`Packet section heading not found for ${key}`);
    err.status = 404;
    throw err;
  }

  let end = html.length;
  if (cfg.endExclusive?.length) {
    const next = findHeadingIndex(html, cfg.endExclusive, start + 1);
    if (next > start) end = next;
  }

  let slice = html.slice(start, end).trim();
  slice = slice.replace(/^(\s*<div[^>]*class=["'][^"']*page-break[^"']*["'][^>]*>\s*<\/div>\s*)+/i, '');
  return slice;
}

export function hashPacketSectionHtml(html) {
  return crypto.createHash('sha256').update(String(html || ''), 'utf8').digest('hex');
}

export function stepTypeToSectionKey(stepType) {
  const t = String(stepType || '').trim().toLowerCase();
  if (t === PACKET_STEP_TYPES.INFORMED_GROUP_CONSENT) return PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT;
  if (t === PACKET_STEP_TYPES.POLICY_SERVICES) return PACKET_SECTION_KEYS.POLICY_SERVICES;
  if (t === PACKET_STEP_TYPES.HIPAA_NOTICE) return PACKET_SECTION_KEYS.HIPAA_NOTICE;
  return null;
}

export function sectionKeyToStepType(sectionKey) {
  const k = String(sectionKey || '').trim().toLowerCase();
  if (k === PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT) return PACKET_STEP_TYPES.INFORMED_GROUP_CONSENT;
  if (k === PACKET_SECTION_KEYS.POLICY_SERVICES) return PACKET_STEP_TYPES.POLICY_SERVICES;
  if (k === PACKET_SECTION_KEYS.HIPAA_NOTICE) return PACKET_STEP_TYPES.HIPAA_NOTICE;
  return null;
}

export function sectionTitle(sectionKey, locale = 'en') {
  const loc = normalizeLocale(locale);
  if (sectionKey === PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT) {
    return loc === 'es'
      ? 'Consentimiento Informado y Consentimiento Grupal'
      : 'Informed Consent + Group Consent';
  }
  if (sectionKey === PACKET_SECTION_KEYS.POLICY_SERVICES) {
    return loc === 'es'
      ? 'Acuerdo de Políticas y Servicios'
      : 'Policy and Services Agreement';
  }
  if (sectionKey === PACKET_SECTION_KEYS.HIPAA_NOTICE) {
    return loc === 'es'
      ? 'Política de Privacidad de HIPAA y Aviso de Prácticas de Privacidad'
      : 'HIPAA Privacy Policy and Notice of Privacy Practices';
  }
  return 'Packet Section';
}

function substituteTokens(templateHtml, tokens = {}) {
  let html = String(templateHtml || '');
  for (const [key, value] of Object.entries(tokens)) {
    html = html.split(`{{${key}}}`).join(String(value ?? ''));
  }
  return html;
}

/**
 * Build live section HTML for a school + locale from the agency packet template.
 */
export async function buildPacketSectionContext({
  organizationId,
  agencyId = null,
  locale = 'en',
  sectionKey,
  office = false,
  variant = 'self'
} = {}) {
  const loc = normalizeLocale(locale);
  const key = String(sectionKey || '').trim();
  if (!SECTION_HEADING_MAP[key]) {
    const err = new Error(`Unknown packet section key: ${key}`);
    err.status = 400;
    throw err;
  }

  let templateHtml = '';
  let packetVersion = 1;
  let resolvedAgencyId = Number(agencyId || 0) || null;
  let orgId = Number(organizationId || 0) || null;

  if (office && resolvedAgencyId) {
    const pack = normalizeOfficePacketVariant(variant);
    const template = await OfficePacketTemplate.findByAgencyId(resolvedAgencyId, loc, pack);
    templateHtml = String(template?.html_content || defaultOfficePacketHtml(pack, loc) || '');
    packetVersion = Number(template?.version || 1);
  } else if (orgId) {
    const ctx = await buildSchoolPrintablePacketContext({
      organizationId: orgId,
      locale: loc
    });
    templateHtml = String(ctx?.templateHtml || '');
    packetVersion = Number(ctx?.version || 1);
    resolvedAgencyId = resolvedAgencyId || Number(ctx?.agencyId || 0) || null;

    // Apply the same merge tokens used by the printable packet (school name is
    // enough for these legal sections; staff/disclosure tokens rarely appear).
    const schoolName = String(ctx?.organization?.name || '').trim();
    const schoolAddress = String(ctx?.organization?.address || '').trim();
    templateHtml = substituteTokens(templateHtml, {
      SCHOOL_NAME: schoolName,
      SCHOOL_ADDRESS: schoolAddress,
      SCHOOL_STAFF_TABLE: '',
      DISCLOSURE_CARE_TEAM: ''
    });
  } else if (resolvedAgencyId) {
    const template = await SchoolPacketTemplate.getOrCreateForAgency(resolvedAgencyId, { locale: loc });
    templateHtml = String(template?.html_content || '');
    packetVersion = Number(template?.version || 1);
  }

  if (!templateHtml) {
    const err = new Error('Unable to load packet template content for section');
    err.status = 404;
    throw err;
  }

  let snapshotHtml;
  try {
    snapshotHtml = extractPacketSectionHtml(templateHtml, key);
  } catch (extractErr) {
    if (key !== PACKET_SECTION_KEYS.HIPAA_NOTICE) throw extractErr;
    const fallbackHtml = loc === 'es'
      ? DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML_ES
      : DEFAULT_SCHOOL_PACKET_TEMPLATE_HTML;
    snapshotHtml = extractPacketSectionHtml(fallbackHtml, key);
  }
  const contentHash = hashPacketSectionHtml(snapshotHtml);

  return {
    sectionKey: key,
    stepType: sectionKeyToStepType(key),
    title: sectionTitle(key, loc),
    locale: loc,
    agencyId: resolvedAgencyId,
    organizationId: orgId,
    packetVersion,
    html: snapshotHtml,
    contentHash
  };
}

export function hasProgrammedPacketSectionStep(link, sectionKey = null) {
  const steps = Array.isArray(link?.intake_steps)
    ? link.intake_steps
    : (typeof link?.intake_steps === 'string'
      ? (() => { try { return JSON.parse(link.intake_steps); } catch { return []; } })()
      : []);
  return steps.some((s) => {
    const t = String(s?.type || '').trim().toLowerCase();
    if (sectionKey) {
      return stepTypeToSectionKey(t) === sectionKey;
    }
    return !!stepTypeToSectionKey(t);
  });
}

export async function persistPacketSectionAcknowledgement({
  clientId,
  agencyId,
  schoolOrganizationId = null,
  intakeSubmissionId = null,
  clientPhiDocumentId = null,
  sectionKey,
  languageCode = 'en',
  signedAt = new Date(),
  signerName = null,
  signerEmail = null,
  contentHash = null,
  packetVersion = null,
  snapshotHtml = null,
  createdByUserId = null
} = {}) {
  const cid = Number(clientId || 0);
  const aid = Number(agencyId || 0);
  const key = String(sectionKey || '').trim();
  if (!cid || !aid || !key) return null;

  const [result] = await pool.execute(
    `INSERT INTO client_packet_section_acknowledgements
      (client_id, agency_id, school_organization_id, intake_submission_id, client_phi_document_id,
       section_key, language_code, signed_at, signer_name, signer_email, content_hash,
       packet_version, snapshot_html, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cid,
      aid,
      schoolOrganizationId || null,
      intakeSubmissionId || null,
      clientPhiDocumentId || null,
      key,
      normalizeLocale(languageCode),
      signedAt instanceof Date ? signedAt : new Date(signedAt || Date.now()),
      signerName || null,
      signerEmail || null,
      contentHash || null,
      packetVersion != null ? Number(packetVersion) : null,
      snapshotHtml != null ? String(snapshotHtml) : null,
      createdByUserId || null
    ]
  );
  return { id: result.insertId };
}
