/**
 * Chart Records → Documents aggregator.
 *
 * PHI file rows are only one source. Smart Disclosure, master HIPAA / consent
 * sections, signed templates, and the branded intake packet usually live on
 * the intake submission, acknowledgement tables, or signed school-packet
 * bundles. The Documents gallery must show those even when a PHI attach failed.
 */
import pool from '../config/database.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import ClientSignedSchoolPacket from '../models/ClientSignedSchoolPacket.model.js';
import IntakeSubmissionDocument from '../models/IntakeSubmissionDocument.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import Agency from '../models/Agency.model.js';
import AgencySchoolIntakeMaster from '../models/AgencySchoolIntakeMaster.model.js';
import StorageService from './storage.service.js';
import { decryptIntakeSubmissionRows } from './intakeResponsesEncryption.service.js';
import {
  PACKET_SECTION_KEYS,
  buildPacketSectionContext,
  listPacketSectionAcknowledgementsForClient,
  findPacketSectionAcknowledgementById
} from './schoolPacketSections.service.js';
import {
  getLatestDisclosureAcknowledgement,
  buildSmartDisclosureContext,
  normalizeSmartDisclosureResponse,
  buildSmartDisclosureHtml
} from './smartDisclosure.service.js';
import {
  extractSmartSchoolRoi,
  roiAcknowledgedHipaa,
  roiHasSignature
} from './schoolRoiChartText.service.js';

export const ARTIFACT_KIND_LABELS = Object.freeze({
  packet: 'Packet',
  smart_roi: 'Smart ROI',
  disclosure: 'Smart Disclosure',
  hipaa_notice: 'HIPAA',
  informed_group_consent: 'Informed consent',
  policy_services: 'Policy & services',
  clinical_summary: 'Clinical summary',
  intake_responses: 'Intake responses',
  signed_form: 'Signed form'
});

const SECTION_TITLES = Object.freeze({
  [PACKET_SECTION_KEYS.HIPAA_NOTICE]: 'HIPAA Privacy Policy and Notice of Privacy Practices',
  [PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT]: 'Informed Consent + Group Consent',
  [PACKET_SECTION_KEYS.POLICY_SERVICES]: 'Policy and Services Agreement'
});

const ALWAYS_FEATURED = ['packet', 'smart_roi', 'disclosure', 'hipaa_notice', 'clinical_summary', 'intake_responses'];

function parseJsonMaybe(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function looksLikeRoiBlob(blob) {
  const text = String(blob || '').toLowerCase();
  return text.includes('release of information')
    || text.includes('school_roi')
    || text.includes('smart roi')
    || text.includes('smart school roi')
    || /\broi\b/.test(text);
}

export function classifyChartArtifact({ documentType, title, originalName, templateName } = {}) {
  const blob = `${documentType || ''} ${title || ''} ${originalName || ''} ${templateName || ''}`.toLowerCase();
  if ((blob.includes('clinical') && blob.includes('summary')) || blob.includes('clinician summary')) {
    return 'clinical_summary';
  }
  // ROI before "disclosure": Smart School ROI PDFs are often stamped onto a
  // school template named "Disclosure Agreement". That file is the ROI.
  if (looksLikeRoiBlob(blob)) return 'smart_roi';
  if (blob.includes('disclosure')) return 'disclosure';
  if (
    blob.includes('hipaa')
    || blob.includes('hipaa_notice')
    || blob.includes('notice of privacy')
    || blob.includes('privacy practice')
  ) {
    return 'hipaa_notice';
  }
  if (blob.includes('informed') && blob.includes('consent')) return 'informed_group_consent';
  if (blob.includes('policy') && (blob.includes('service') || blob.includes('agreement'))) {
    return 'policy_services';
  }
  if (
    blob.includes('intake packet')
    || blob.includes('full packet')
    || /\bpacket\b/.test(blob)
    || blob.includes('referral packet')
  ) {
    return 'packet';
  }
  if (blob.includes('intake') && blob.includes('response')) return 'intake_responses';
  return 'signed_form';
}

function formatIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString();
}

function makeArtifact({
  kind,
  title,
  viewKey = null,
  signedAt = null,
  uploadedAt = null,
  hasSignature = false,
  source = '',
  missing = false
}) {
  return {
    id: viewKey || `missing-${kind}`,
    kind,
    kindLabel: ARTIFACT_KIND_LABELS[kind] || kind,
    title: title || ARTIFACT_KIND_LABELS[kind] || kind,
    viewKey: missing ? null : viewKey,
    signedAt: formatIso(signedAt),
    uploadedAt: formatIso(uploadedAt),
    hasSignature: Boolean(hasSignature),
    source,
    missing: Boolean(missing)
  };
}

function packetSignalsFromIntakeData(intakeData) {
  const data = intakeData && typeof intakeData === 'object' ? intakeData : {};
  const sections = {
    ...((data.responses?.submission?.packetSections && typeof data.responses.submission.packetSections === 'object')
      ? data.responses.submission.packetSections
      : {}),
    ...((data.packetSections && typeof data.packetSections === 'object') ? data.packetSections : {})
  };
  const hipaa = sections.hipaa_notice || data.packetHipaaNotice || data.responses?.submission?.packetHipaaNotice || null;
  const informed = sections.informed_group_consent || data.packetInformedGroupConsent || null;
  const policy = sections.policy_services || data.packetPolicyServices || null;
  const disclosure = data.smartDisclosure || data.disclosure || data.responses?.submission?.smartDisclosure || null;
  const roi = extractSmartSchoolRoi(data);
  const acknowledged = (value) => Boolean(value?.acknowledged || value?.signatureData);
  return {
    hipaa,
    informed,
    policy,
    disclosure,
    roi,
    hasHipaa: acknowledged(hipaa) || roiAcknowledgedHipaa(roi),
    hasInformed: acknowledged(informed),
    hasPolicy: acknowledged(policy),
    hasDisclosure: acknowledged(disclosure),
    hasRoi: acknowledged(roi) || roiHasSignature(roi) || Boolean(roi),
    hasPacketBody: Boolean(
      acknowledged(hipaa) || acknowledged(informed) || acknowledged(policy) || Object.keys(sections).length
    )
  };
}

async function loadIntakeSubmissionsForClient(clientId) {
  const cid = Number(clientId || 0);
  if (!cid) return [];
  const [rows] = await pool.execute(
    `SELECT
       s.id,
       s.intake_link_id,
       s.status,
       s.signer_name,
       s.signer_email,
       s.submitted_at,
       s.created_at,
       s.updated_at,
       s.intake_data,
       s.payload_encrypted,
       s.payload_iv_b64,
       s.payload_auth_tag_b64,
       s.payload_key_id,
       l.title AS intake_link_title,
       l.form_type,
       l.scope_type,
       l.language_code,
       l.organization_id AS link_organization_id,
       l.public_key
     FROM intake_submissions s
     LEFT JOIN intake_links l ON l.id = s.intake_link_id
     LEFT JOIN intake_submission_clients isc ON isc.intake_submission_id = s.id
     WHERE (s.client_id = ? OR isc.client_id = ?)
     GROUP BY
       s.id, s.intake_link_id, s.status, s.signer_name, s.signer_email,
       s.submitted_at, s.created_at, s.updated_at, s.intake_data,
       s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id,
       l.title, l.form_type, l.scope_type, l.language_code,
       l.organization_id, l.public_key
     ORDER BY COALESCE(s.submitted_at, s.updated_at, s.created_at) DESC
     LIMIT 40`,
    [cid, cid]
  );
  decryptIntakeSubmissionRows(rows || []);
  return (rows || []).map((row) => ({
    ...row,
    intake_data: parseJsonMaybe(row.intake_data, {})
  }));
}

async function resolveTherapyAgencyId(client) {
  const fromClient = Number(client?.agency_id || 0) || null;
  if (fromClient) return fromClient;
  const schoolOrgId = Number(client?.organization_id || client?.school_organization_id || 0);
  if (!schoolOrgId) return null;
  try {
    return await AgencySchoolIntakeMaster.resolveParentAgencyIdForSchool(schoolOrgId);
  } catch {
    return null;
  }
}

export function isdLooksLikeSmartSchoolRoi(row) {
  const trail = parseJsonMaybe(row?.audit_trail, {}) || {};
  if (trail.smartSchoolRoi || trail.roiResponse) return true;
  const name = `${row?.document_template_name || ''} ${trail.documentName || ''} ${trail.document_name || ''}`.toLowerCase();
  return looksLikeRoiBlob(name);
}

export function isdLooksLikeDisclosure(row) {
  if (isdLooksLikeSmartSchoolRoi(row)) return false;
  const trail = parseJsonMaybe(row?.audit_trail, {}) || {};
  if (trail.smartDisclosure === true || trail.disclosure) return true;
  const name = `${row?.document_template_name || ''} ${trail.documentName || ''} ${trail.document_name || ''}`.toLowerCase();
  if (!name.includes('disclosure')) return false;
  // Template 181 is named "Disclosure Agreement" but stores Smart School ROI.
  if (name.includes('disclosure agreement') && !name.includes('disclosure statement')) return false;
  return true;
}

function hasAnswerValue(value) {
  if (value === false || value === 0) return true;
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return String(value).trim() !== '';
}

const INTERVIEW_KEY = /^(psc_|phq9|gad7|auditc|dast|pcptsd|physical_|neglect|emotional_|mental_|gain|helpful|allergies|trauma|presenting|goal_|clinical|si_|hi_|substance|diagnos|medication|therapy|counsel)/i;

function eachAnswerBag(intakeData, visit) {
  const data = intakeData && typeof intakeData === 'object' ? intakeData : {};
  const bags = [
    data.clinicalResponses,
    data.responses?.submission?.clinicalResponses,
    data.submission?.clinicalResponses,
    data.responses?.submission,
    data.submission,
    data.responses?.guardian,
    data.guardian,
    ...(Array.isArray(data.responses?.clients) ? data.responses.clients : []),
    ...(Array.isArray(data.clients) ? data.clients : [])
  ];
  for (const bag of bags) {
    if (bag && typeof bag === 'object' && !Array.isArray(bag)) visit(bag);
  }
}

export function clinicalSignalScore(intakeData) {
  let score = 0;
  eachAnswerBag(intakeData, (bag) => {
    for (const [key, value] of Object.entries(bag)) {
      if (!INTERVIEW_KEY.test(String(key || ''))) continue;
      if (!hasAnswerValue(value)) continue;
      score += 3;
    }
  });
  return score;
}

export function pickBestClinicalSubmission(submissions = []) {
  let best = null;
  let bestScore = 0;
  for (const row of submissions || []) {
    const score = clinicalSignalScore(row?.intake_data);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

export function pickBestInterviewSubmission(submissions = []) {
  const clinical = pickBestClinicalSubmission(submissions);
  if (clinical) return clinical;
  return (submissions || []).find((row) => String(row?.form_type || '').toLowerCase() === 'intake') || null;
}

function mergeIntakeDataPreferringInterview(primary, interview) {
  if (!interview || !primary || Number(interview.id) === Number(primary.id)) {
    return primary?.intake_data || primary || {};
  }
  const a = (primary.intake_data && typeof primary.intake_data === 'object') ? primary.intake_data : {};
  const b = (interview.intake_data && typeof interview.intake_data === 'object') ? interview.intake_data : {};
  const mergeList = (left = [], right = []) => {
    const n = Math.max(left.length, right.length);
    return Array.from({ length: n }, (_, i) => ({
      ...(left[i] && typeof left[i] === 'object' ? left[i] : {}),
      ...(right[i] && typeof right[i] === 'object' ? right[i] : {})
    }));
  };
  return {
    ...b,
    ...a,
    smartSchoolRoi: extractSmartSchoolRoi(a) || extractSmartSchoolRoi(b),
    clients: mergeList(Array.isArray(a.clients) ? a.clients : [], Array.isArray(b.clients) ? b.clients : []),
    responses: {
      ...(b.responses || {}),
      ...(a.responses || {}),
      guardian: { ...(b.responses?.guardian || {}), ...(a.responses?.guardian || {}) },
      submission: {
        ...(b.responses?.submission || {}),
        ...(a.responses?.submission || {}),
        clinicalResponses: {
          ...(b.responses?.submission?.clinicalResponses || {}),
          ...(a.responses?.submission?.clinicalResponses || {})
        },
        smartSchoolRoi: extractSmartSchoolRoi(a) || extractSmartSchoolRoi(b)
      },
      clients: mergeList(
        Array.isArray(a.responses?.clients) ? a.responses.clients : [],
        Array.isArray(b.responses?.clients) ? b.responses.clients : []
      )
    }
  };
}

async function linkForCompletedPacket(link, { agencyId, locale, intakeData, formType } = {}) {
  const type = String(formType || link?.form_type || '').toLowerCase();
  const hasInterview = clinicalSignalScore(intakeData) > 0;
  if (type === 'smart_school_roi' && !hasInterview) return link;
  try {
    return await AgencySchoolIntakeMaster.applyMasterToLink(link, {
      agencyId,
      languageCode: locale || link?.language_code || 'en'
    });
  } catch {
    return link;
  }
}

function extractHtmlBody(html) {
  const raw = String(html || '').trim();
  if (!raw) return '';
  const match = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? String(match[1] || '').trim() : raw;
}

async function loadSchoolOrganization(client) {
  const schoolId = Number(client?.organization_id || client?.school_organization_id || 0);
  if (!schoolId) return null;
  const fromTable = await Agency.findById(schoolId).catch(() => null);
  if (fromTable) return fromTable;
  return {
    id: schoolId,
    organization_type: 'school',
    name: client?.organization_name || client?.school_name || null
  };
}

function signatureFromPayload(value) {
  const trail = value && typeof value === 'object' ? value : {};
  const raw = String(trail.signatureData || trail.signature_data || trail.signatureImage || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:image/')) return raw;
  if (raw.length > 80) return `data:image/png;base64,${raw}`;
  return '';
}

function sessionSignature(submissions = [], signedDocuments = []) {
  for (const doc of signedDocuments || []) {
    const trail = parseJsonMaybe(doc?.audit_trail, {}) || {};
    const sig = signatureFromPayload(trail) || signatureFromPayload(trail.roiResponse) || signatureFromPayload(trail.smartSchoolRoi);
    if (sig) {
      return {
        signatureData: sig,
        signerName: trail.signerName || trail.roiResponse?.signer?.fullName || '',
        signedAt: doc.signed_at || trail.submittedAt || trail.signedAt || null
      };
    }
  }
  for (const row of submissions || []) {
    const roi = extractSmartSchoolRoi(row?.intake_data);
    const disc = row?.intake_data?.smartDisclosure || {};
    const sig = signatureFromPayload(disc) || signatureFromPayload(roi);
    if (sig) {
      return {
        signatureData: sig,
        signerName: disc.signerName || roi?.signer?.fullName || row.signer_name || '',
        signedAt: disc.signedAt || row.submitted_at || null
      };
    }
  }
  return null;
}

export async function assembleClientChartArtifacts({ clientId, client }) {
  const cid = Number(clientId || client?.id || 0);
  const [phiDocs, packets, sectionAcks, signedTemplates, disclosureAck, submissions] = await Promise.all([
    ClientPhiDocument.findByClientId(cid).catch(() => []),
    ClientSignedSchoolPacket.listByClientId(cid).catch(() => []),
    listPacketSectionAcknowledgementsForClient(cid),
    IntakeSubmissionDocument.listSignedForClient(cid).catch(() => []),
    getLatestDisclosureAcknowledgement(cid),
    loadIntakeSubmissionsForClient(cid)
  ]);

  const activePhi = (phiDocs || []).filter((d) => !d?.removed_at);
  const usedPhiIds = new Set();
  const usedIsdIds = new Set();
  const usedSectionKeys = new Set();
  const featured = {};
  const extra = [];

  const take = (kind, artifact) => {
    if (!artifact) return;
    if (!featured[kind]) featured[kind] = artifact;
    else extra.push(artifact);
  };

  for (const d of activePhi) {
    const kind = classifyChartArtifact({
      documentType: d.document_type,
      title: d.document_title,
      originalName: d.original_name
    });
    const artifact = makeArtifact({
      kind,
      title: d.document_title || d.original_name || `Document #${d.id}`,
      viewKey: `phi-${d.id}`,
      signedAt: d.signed_at || d.signature_at || null,
      uploadedAt: d.uploaded_at,
      hasSignature: Boolean(d.signed_at || d.signature_at || d.has_signature),
      source: 'phi'
    });
    usedPhiIds.add(Number(d.id));
    if (kind === 'disclosure') {
      extra.push({
        ...artifact,
        kind: 'signed_form',
        kindLabel: ARTIFACT_KIND_LABELS.signed_form
      });
      continue;
    }
    if (kind === 'signed_form') extra.push(artifact);
    else take(kind, artifact);
  }

  for (const row of signedTemplates || []) {
    const isdId = Number(row.id);
    const matchingPhi = activePhi.find((d) =>
      d.storage_path && row.signed_pdf_path && d.storage_path === row.signed_pdf_path
    );
    const trail = parseJsonMaybe(row?.audit_trail, {}) || {};
    const kind = isdLooksLikeDisclosure(row)
      ? 'disclosure'
      : (isdLooksLikeSmartSchoolRoi(row)
        ? 'smart_roi'
        : classifyChartArtifact({
          title: row.document_template_name || trail.documentName,
          originalName: row.document_template_name || trail.documentName,
          templateName: row.document_template_name || trail.documentName
        }));
    if (matchingPhi && usedPhiIds.has(Number(matchingPhi.id))) {
      const phiKind = classifyChartArtifact({
        documentType: matchingPhi.document_type,
        title: matchingPhi.document_title,
        originalName: matchingPhi.original_name
      });
      if (phiKind === kind || kind === 'disclosure') {
        usedIsdIds.add(isdId);
        continue;
      }
    }
    const artifact = makeArtifact({
      kind,
      title: row.document_template_name || `Signed document #${isdId}`,
      viewKey: `isd-${isdId}`,
      signedAt: row.signed_at,
      hasSignature: true,
      source: 'intake_submission_document'
    });
    usedIsdIds.add(isdId);
    if (kind === 'disclosure') {
      extra.push({
        ...artifact,
        kind: 'signed_form',
        kindLabel: ARTIFACT_KIND_LABELS.signed_form
      });
      continue;
    }
    if (kind === 'signed_form') extra.push(artifact);
    else take(kind, artifact);
  }

  for (const ack of sectionAcks || []) {
    const key = String(ack.section_key || '').trim();
    if (!key || usedSectionKeys.has(key)) continue;
    usedSectionKeys.add(key);
    const phiId = Number(ack.client_phi_document_id || 0);
    const viewKey = phiId && usedPhiIds.has(phiId)
      ? `phi-${phiId}`
      : `section-${ack.id}`;
    take(key, makeArtifact({
      kind: key,
      title: SECTION_TITLES[key] || key.replace(/_/g, ' '),
      viewKey,
      signedAt: ack.signed_at,
      hasSignature: true,
      source: 'packet_section'
    }));
  }

  const latestSubmission = submissions[0] || null;
  const interviewSubmission = pickBestInterviewSubmission(submissions) || latestSubmission;
  const clinicalSubmission = pickBestClinicalSubmission(submissions) || interviewSubmission;
  const signals = packetSignalsFromIntakeData(latestSubmission?.intake_data);
  const interviewSignals = packetSignalsFromIntakeData(interviewSubmission?.intake_data);
  const latestSubmittedAt = latestSubmission?.submitted_at || latestSubmission?.created_at || null;
  const interviewSubmittedAt = interviewSubmission?.submitted_at || interviewSubmission?.created_at || latestSubmittedAt;
  const session = sessionSignature(submissions, signedTemplates);

  if (signals.hasHipaa && !featured.hipaa_notice) {
    usedSectionKeys.add(PACKET_SECTION_KEYS.HIPAA_NOTICE);
    take('hipaa_notice', makeArtifact({
      kind: 'hipaa_notice',
      title: SECTION_TITLES[PACKET_SECTION_KEYS.HIPAA_NOTICE],
      viewKey: `section-key-${PACKET_SECTION_KEYS.HIPAA_NOTICE}`,
      signedAt: signals.hipaa?.signedAt || signals.hipaa?.acknowledgedAt || latestSubmittedAt,
      hasSignature: true,
      source: 'intake_data'
    }));
  }
  if (signals.hasInformed && !featured.informed_group_consent) {
    usedSectionKeys.add(PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT);
    take('informed_group_consent', makeArtifact({
      kind: 'informed_group_consent',
      title: SECTION_TITLES[PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT],
      viewKey: `section-key-${PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT}`,
      signedAt: signals.informed?.signedAt || latestSubmittedAt,
      hasSignature: true,
      source: 'intake_data'
    }));
  }
  if (signals.hasPolicy && !featured.policy_services) {
    usedSectionKeys.add(PACKET_SECTION_KEYS.POLICY_SERVICES);
    take('policy_services', makeArtifact({
      kind: 'policy_services',
      title: SECTION_TITLES[PACKET_SECTION_KEYS.POLICY_SERVICES],
      viewKey: `section-key-${PACKET_SECTION_KEYS.POLICY_SERVICES}`,
      signedAt: signals.policy?.signedAt || latestSubmittedAt,
      hasSignature: true,
      source: 'intake_data'
    }));
  }

  const realDisclosureSigned = Boolean(
    disclosureAck
    || signals.hasDisclosure
    || session?.signatureData
  );
  featured.disclosure = makeArtifact({
    kind: 'disclosure',
    title: 'Smart Disclosure',
    viewKey: 'disclosure-html',
    signedAt: disclosureAck?.signed_at
      || session?.signedAt
      || signals.disclosure?.signedAt
      || (realDisclosureSigned ? latestSubmittedAt : null),
    hasSignature: realDisclosureSigned,
    source: 'smart_disclosure_live'
  });

  const packetRows = (packets || []).map((p) => ({
    ...p,
    contents: (Array.isArray(p.contents) ? p.contents : []).map((c) => {
      const sectionKey = c.sectionKey || (c.type === 'packet_section' ? c.sectionKey : null);
      let viewKey = null;
      if (c.phiDocumentId) viewKey = `phi-${c.phiDocumentId}`;
      else if (c.intakeSubmissionDocumentId) viewKey = `isd-${c.intakeSubmissionDocumentId}`;
      else if (c.type === 'smart_disclosure') viewKey = featured.disclosure?.viewKey || 'disclosure-html';
      else if (sectionKey) viewKey = `section-key-${sectionKey}`;
      else if (c.type === 'questionnaire' && interviewSubmission?.id) {
        viewKey = featured.intake_responses?.viewKey || `intake-answers-${interviewSubmission.id}`;
      }
      return { ...c, viewKey };
    })
  }));

  if (!featured.packet) {
    if (packetRows[0]) {
      take('packet', makeArtifact({
        kind: 'packet',
        title: 'Full intake packet',
        viewKey: `packet-${packetRows[0].id}`,
        signedAt: packetRows[0].signed_at,
        hasSignature: true,
        source: 'signed_school_packet'
      }));
    } else if (interviewSubmission?.id && (interviewSignals.hasPacketBody || interviewSignals.hasDisclosure || interviewSignals.hasRoi || signals.hasPacketBody || signals.hasDisclosure || signals.hasRoi || activePhi.length)) {
      take('packet', makeArtifact({
        kind: 'packet',
        title: 'Full intake packet',
        viewKey: `intake-html-${interviewSubmission.id}`,
        signedAt: interviewSubmittedAt,
        hasSignature: Boolean(interviewSignals.hasPacketBody || interviewSignals.hasDisclosure || interviewSignals.hasRoi || signals.hasPacketBody || signals.hasDisclosure || signals.hasRoi),
        source: 'branded_intake_record'
      }));
    }
  }

  if (interviewSubmission && !featured.intake_responses) {
    take('intake_responses', makeArtifact({
      kind: 'intake_responses',
      title: 'Intake responses',
      viewKey: `intake-answers-${interviewSubmission.id}`,
      uploadedAt: interviewSubmittedAt,
      hasSignature: Boolean(interviewSubmission.status === 'submitted' || interviewSignals.hasRoi || signals.hasRoi),
      source: 'intake_submission'
    }));
  }

  if (interviewSubmission && !featured.clinical_summary) {
    const clinicalRow = clinicalSubmission || interviewSubmission;
    take('clinical_summary', makeArtifact({
      kind: 'clinical_summary',
      title: 'Clinical Intake Summary',
      viewKey: `clinical-html-${clinicalRow.id}`,
      uploadedAt: clinicalRow.submitted_at || clinicalRow.created_at || interviewSubmittedAt,
      source: 'intake_submission'
    }));
  }

  const artifacts = [];
  for (const kind of ALWAYS_FEATURED) {
    if (featured[kind]) artifacts.push(featured[kind]);
    else {
      artifacts.push(makeArtifact({
        kind,
        title: ARTIFACT_KIND_LABELS[kind],
        missing: true
      }));
    }
  }
  for (const kind of ['informed_group_consent', 'policy_services']) {
    if (featured[kind]) artifacts.push(featured[kind]);
  }
  artifacts.push(...extra);

  return {
    artifacts,
    packets: packetRows,
    agencyId: await resolveTherapyAgencyId(client)
  };
}

function wrapHtmlDocument(title, innerHtml) {
  const safeTitle = String(title || 'Document');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(safeTitle)}</title>
  <style>
    body { font-family: Georgia, serif; color: #111; max-width: 860px; margin: 24px auto; padding: 0 16px 48px; line-height: 1.5; }
    h1 { font-size: 22px; }
    pre { white-space: pre-wrap; font-family: inherit; }
  </style>
</head>
<body>
${innerHtml}
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendStorageUrl(storagePath) {
  if (!storagePath) return { notFound: true };
  const url = await StorageService.getSignedUrl(storagePath, 15);
  return { url };
}

async function htmlForPacketSection({ client, sectionKey, ack = null, submissions = [], wrap = true }) {
  let inner = '';
  if (ack?.snapshot_html) {
    inner = ack.snapshot_html;
  } else {
    const latest = submissions[0];
    const signals = packetSignalsFromIntakeData(latest?.intake_data);
    const response =
      sectionKey === PACKET_SECTION_KEYS.HIPAA_NOTICE ? signals.hipaa
        : sectionKey === PACKET_SECTION_KEYS.INFORMED_GROUP_CONSENT ? signals.informed
          : signals.policy;
    if (response?.snapshotHtml) {
      inner = response.snapshotHtml;
    } else {
      try {
        const agencyId = await resolveTherapyAgencyId(client);
        const schoolOrgId = Number(client?.organization_id || client?.school_organization_id || 0) || null;
        const ctx = await buildPacketSectionContext({
          organizationId: schoolOrgId,
          agencyId,
          locale: response?.locale || latest?.language_code || 'en',
          sectionKey,
          office: !schoolOrgId && Boolean(agencyId),
          variant: response?.variant || 'self'
        });
        inner = ctx.html || '';
      } catch {
        inner = `<p>${escapeHtml(SECTION_TITLES[sectionKey] || sectionKey)} was acknowledged on the signed school packet.</p>`;
      }
    }
  }
  if (!wrap) return inner;
  return wrapHtmlDocument(SECTION_TITLES[sectionKey] || sectionKey, inner);
}

async function htmlForDisclosure({ client, submissions = [] }) {
  const latest = submissions[0];
  const agencyId = await resolveTherapyAgencyId(client);
  const agency = agencyId ? await Agency.findById(agencyId) : null;
  const organization = await loadSchoolOrganization(client);
  let link = latest?.intake_link_id ? await IntakeLink.findById(latest.intake_link_id).catch(() => null) : null;
  link = await linkForCompletedPacket(link, {
    agencyId,
    locale: latest?.language_code || 'en',
    intakeData: latest?.intake_data,
    formType: latest?.form_type || link?.form_type
  });
  const disclosureContext = await buildSmartDisclosureContext({
    link,
    boundClient: client,
    organization,
    agency,
    locale: latest?.language_code || 'en'
  });
  const ack = await getLatestDisclosureAcknowledgement(Number(client?.id || 0)).catch(() => null);
  const signedDocs = latest?.id
    ? await IntakeSubmissionDocument.listSignedForRecord(latest.id).catch(() => [])
    : [];
  const session = sessionSignature(submissions, signedDocs);
  const signedPayload = packetSignalsFromIntakeData(latest?.intake_data).disclosure || {};
  const signed = Boolean(
    ack
    || signedPayload.acknowledged
    || signedPayload.signatureData
    || session?.signatureData
  );
  const response = normalizeSmartDisclosureResponse({
    disclosureContext: disclosureContext || {},
    intakeData: signed ? (latest?.intake_data || {}) : {},
    signedAt: ack?.signed_at || session?.signedAt || signedPayload.signedAt || (signed ? latest?.submitted_at : null) || new Date()
  });
  if (disclosureContext) {
    return buildSmartDisclosureHtml({
      disclosureContext,
      response: {
        ...response,
        signerName: signed
          ? (ack?.signer_name || session?.signerName || response.signerName || latest?.signer_name)
          : null,
        signatureData: signedPayload.signatureData || session?.signatureData || response.signatureData || null,
        acknowledged: signed
      },
      signedAt: signed ? (ack?.signed_at || session?.signedAt || response.signedAt || latest?.submitted_at) : null
    });
  }
  return wrapHtmlDocument(
    'Smart Disclosure',
    `<p>Smart Disclosure lists the agency and school care-team providers for this client. The care-team document could not be built for this chart yet.</p>`
  );
}

async function htmlForBrandedIntake({ client, submissionId, submissions = [] }) {
  const requested = (submissions || []).find((s) => Number(s.id) === Number(submissionId));
  const interviewRow = pickBestInterviewSubmission(submissions);
  const row = (requested && clinicalSignalScore(requested.intake_data) > 0)
    ? requested
    : (interviewRow || requested || submissions[0]);
  if (!row) return null;
  const agencyId = await resolveTherapyAgencyId(client) || Number(row.link_organization_id || 0);
  const agency = agencyId ? await Agency.findById(agencyId) : null;
  const organization = await loadSchoolOrganization(client);
  const mergedIntakeData = mergeIntakeDataPreferringInterview(
    { ...row, intake_data: row.intake_data },
    interviewRow && Number(interviewRow.id) !== Number(row.id) ? interviewRow : row
  );
  let link = row.intake_link_id ? await IntakeLink.findById(row.intake_link_id) : null;
  if (interviewRow?.intake_link_id && Number(interviewRow.intake_link_id) !== Number(row.intake_link_id)
    && clinicalSignalScore(row.intake_data) === 0) {
    const interviewLink = await IntakeLink.findById(interviewRow.intake_link_id).catch(() => null);
    if (interviewLink) link = interviewLink;
  }
  link = await linkForCompletedPacket(link, {
    agencyId,
    locale: row.language_code || link?.language_code || 'en',
    intakeData: mergedIntakeData,
    formType: row.form_type || link?.form_type
  });
  const signedDocuments = await IntakeSubmissionDocument.listSignedForRecord(row.id).catch(() => []);
  const { brandedIntakeSummarySpec } = await import('./packetBrandChrome.service.js');
  const { enrichIntakeDataWithSignedRoi } = await import('./schoolRoiChartText.service.js');
  const { buildCompletedIntakeRecord } = await import('./completedIntakeRecord.service.js');
  const { buildIntakeSummaryDocumentHtml } = await import('./intakeSummaryPdf.service.js');
  const packetKind = String(row.scope_type || link?.scope_type || '').toLowerCase() === 'school'
    ? 'school'
    : 'office';
  let roiData = enrichIntakeDataWithSignedRoi(mergedIntakeData, signedDocuments);
  try {
    const { buildSmartSchoolRoiContext, normalizeSmartSchoolRoiResponse } = await import('./smartSchoolRoi.service.js');
    const roiContext = await buildSmartSchoolRoiContext({
      link,
      boundClient: client,
      organization,
      agency
    });
    const roiResponse = normalizeSmartSchoolRoiResponse({
      roiContext,
      intakeData: roiData,
      signedAt: row.submitted_at || new Date()
    });
    if (Array.isArray(roiResponse?.staffDecisions) && roiResponse.staffDecisions.length) {
      roiData = {
        ...roiData,
        smartSchoolRoi: {
          ...(extractSmartSchoolRoi(roiData) || {}),
          staffDecisions: roiResponse.staffDecisions
        }
      };
    }
  } catch {
    // keep compact staff decisions when live roster cannot load
  }
  const enrichedRow = {
    ...row,
    intake_data: roiData
  };
  const spec = await brandedIntakeSummarySpec(
    buildCompletedIntakeRecord({
      agency: agency || {},
      link: link || {},
      submission: enrichedRow,
      signedDocuments,
      guardian: enrichedRow.intake_data?.guardian || enrichedRow.intake_data?.responses?.guardian || {},
      clients: Array.isArray(enrichedRow.intake_data?.clients) ? enrichedRow.intake_data.clients : [],
      publicKey: row.public_key || link?.public_key || '',
      brandLogoUrl: String(agency?.logo_url || '').trim()
    }),
    agency || {},
    { packetKind }
  );
  const signals = packetSignalsFromIntakeData(enrichedRow.intake_data);
  spec.sections = [...(spec.sections || [])];

  if (signals.hasRoi || extractSmartSchoolRoi(enrichedRow.intake_data)) {
    try {
      const { buildSmartSchoolRoiContext, normalizeSmartSchoolRoiResponse, buildSmartSchoolRoiHtml } = await import('./smartSchoolRoi.service.js');
      const roiContext = await buildSmartSchoolRoiContext({
        link,
        boundClient: client,
        organization,
        agency
      });
      const roiResponse = normalizeSmartSchoolRoiResponse({
        roiContext,
        intakeData: enrichedRow.intake_data,
        signedAt: row.submitted_at || new Date()
      });
      const roiHtml = buildSmartSchoolRoiHtml({
        roiContext,
        response: roiResponse,
        signedAt: row.submitted_at || new Date()
      });
      const inner = extractHtmlBody(roiHtml);
      if (inner) {
        spec.sections.push({
          title: 'School Release of Information',
          html: inner
        });
      }
    } catch {
      // keep branded record even if live ROI HTML cannot load
    }
  }

  try {
    const disclosureHtml = await htmlForDisclosure({ client, submissions });
    const inner = extractHtmlBody(disclosureHtml);
    if (inner) {
      spec.sections.push({
        title: 'Smart Disclosure',
        html: inner
      });
    }
  } catch {
    // keep branded record even if live disclosure cannot load
  }

  if (signals.hasHipaa) {
    try {
      const hipaaInner = await htmlForPacketSection({
        client,
        sectionKey: PACKET_SECTION_KEYS.HIPAA_NOTICE,
        submissions: [enrichedRow],
        wrap: false
      });
      if (hipaaInner) {
        spec.sections.push({
          title: SECTION_TITLES[PACKET_SECTION_KEYS.HIPAA_NOTICE],
          html: hipaaInner
        });
      }
    } catch {
      // keep branded record even if live HIPAA template cannot load
    }
  }
  return buildIntakeSummaryDocumentHtml({ ...spec, printable: true });
}

function recordSectionsToText(spec, { clinicalOnly = false } = {}) {
  const skipTitle = /who this packet is for|communication preferences|school release of information|required notices|authorizations|school staff decisions|additional answers/i;
  const clinicalTitle = /life|safety|clinical|questionnaire|psc|counseling|trauma|medical/i;
  const clinicalLabel = /hope to gain|helpful in the past|allerg|fidgety|driven by a motor|daydream|distract|sad|hopeless|concentrat|fights|down on|worries|less fun|listen to rules|other people.s feelings|teases|blames|refuses to share|physical harm|emotional harm|neglect/i;
  const blocks = [];
  for (const section of spec?.sections || []) {
    const title = String(section?.title || '').trim();
    const rows = Array.isArray(section?.rows) ? section.rows : [];
    if (!rows.length) continue;
    if (clinicalOnly && skipTitle.test(title) && !clinicalTitle.test(title)) continue;
    const kept = clinicalOnly
      ? rows.filter((row) => clinicalLabel.test(String(row?.label || '')) || INTERVIEW_KEY.test(String(row?.key || '')))
      : rows;
    const useRows = clinicalOnly && !clinicalTitle.test(title) ? kept : rows;
    if (clinicalOnly && !clinicalTitle.test(title) && !kept.length) continue;
    const body = (clinicalOnly && !clinicalTitle.test(title) ? kept : useRows)
      .filter((row) => !/not answered/i.test(String(row?.value || '')))
      .map((row) => `${row.label}: ${row.value}`);
    if (!body.length) continue;
    if (blocks.length) blocks.push('');
    blocks.push(title);
    blocks.push('-'.repeat(title.length));
    blocks.push(...body);
  }
  return blocks.join('\n').trim();
}

async function htmlForClinicalOrAnswers({ submissionId, submissions = [], kind, client = null }) {
  const requested = (submissions || []).find((s) => Number(s.id) === Number(submissionId));
  const interviewRow = pickBestInterviewSubmission(submissions);
  const row = kind === 'clinical'
    ? (pickBestClinicalSubmission(submissions) || interviewRow || requested || submissions[0])
    : (requested && clinicalSignalScore(requested.intake_data) > 0
      ? requested
      : (interviewRow || requested || submissions[0]));
  if (!row) return null;
  const signedDocuments = await IntakeSubmissionDocument.listSignedForRecord(row.id).catch(() => []);
  const { enrichIntakeDataWithSignedRoi, buildSchoolRoiAnswersText } = await import('./schoolRoiChartText.service.js');
  const { buildClinicalSummaryText, buildIntakeAnswersText } = await import('../controllers/publicIntake.controller.js');
  const { buildCompletedIntakeRecord } = await import('./completedIntakeRecord.service.js');
  let link = row.intake_link_id ? await IntakeLink.findById(row.intake_link_id).catch(() => null) : null;
  const agencyId = client ? await resolveTherapyAgencyId(client) : Number(link?.organization_id || 0);
  const mergedIntakeData = mergeIntakeDataPreferringInterview(
    row,
    interviewRow && Number(interviewRow.id) !== Number(row.id) ? interviewRow : row
  );
  link = await linkForCompletedPacket(link, {
    agencyId,
    locale: row.language_code || link?.language_code || 'en',
    intakeData: mergedIntakeData,
    formType: row.form_type || link?.form_type
  });
  const latestRoiRow = (submissions || []).find((s) => extractSmartSchoolRoi(s.intake_data)) || row;
  const latestRoiDocs = Number(latestRoiRow.id) === Number(row.id)
    ? signedDocuments
    : await IntakeSubmissionDocument.listSignedForRecord(latestRoiRow.id).catch(() => []);
  const intakeData = enrichIntakeDataWithSignedRoi(
    {
      ...mergedIntakeData,
      smartSchoolRoi: extractSmartSchoolRoi(latestRoiRow.intake_data) || extractSmartSchoolRoi(mergedIntakeData)
    },
    latestRoiDocs
  );
  const spec = buildCompletedIntakeRecord({
    agency: {},
    link: link || {},
    submission: { ...row, intake_data: intakeData },
    signedDocuments: latestRoiDocs,
    guardian: intakeData?.guardian || intakeData?.responses?.guardian || {},
    clients: Array.isArray(intakeData?.clients) ? intakeData.clients : [],
    publicKey: row.public_key || link?.public_key || ''
  });
  let text = '';
  const fromRecord = recordSectionsToText(spec, { clinicalOnly: kind === 'clinical' });
  if (fromRecord) {
    text = fromRecord;
  } else if (kind === 'clinical') {
    const clinicalText = await buildClinicalSummaryText({
      intakeData,
      link,
      clientIndex: 0
    });
    const emptyClinical = /no clinical responses captured/i.test(String(clinicalText || ''));
    const roiOnlyFallback = /school ROI — privacy/i.test(String(clinicalText || ''))
      || /not a clinical interview packet/i.test(String(clinicalText || ''));
    text = (!emptyClinical && !roiOnlyFallback) ? String(clinicalText || '').trim() : [
      'Clinical Intake Summary',
      '=======================',
      'The school packet interview (counseling goals, medical notes, and PSC-17 items) was not stored on this signing. Open the Full intake packet when a completed master packet exists.'
    ].join('\n');
  } else {
    text = await buildIntakeAnswersText({
      intakeData,
      link,
      clientIndex: 0
    });
    const roiExtra = buildSchoolRoiAnswersText(intakeData);
    if (roiExtra && !String(text || '').includes('School Release of Information')) {
      text = [String(text || '').trim(), roiExtra].filter(Boolean).join('\n\n');
    }
    if (!String(text || '').trim()) {
      text = 'No intake answers were stored on this signing.';
    }
  }
  const title = kind === 'clinical' ? 'Clinical Intake Summary' : 'Intake responses';
  return wrapHtmlDocument(title, `<h1>${escapeHtml(title)}</h1><pre>${escapeHtml(text || 'No content captured.')}</pre>`);
}

export async function renderChartArtifactView({ client, viewKey }) {
  const key = String(viewKey || '').trim();
  if (!key) return { notFound: true };
  const cid = Number(client?.id || 0);

  if (key.startsWith('phi-')) {
    return { delegatePhiId: Number(key.slice(4)) };
  }

  if (key.startsWith('isd-')) {
    const isdId = Number(key.slice(4));
    const rows = await IntakeSubmissionDocument.listSignedForClient(cid);
    const row = (rows || []).find((r) => Number(r.id) === isdId);
    if (!row?.signed_pdf_path) return { notFound: true };
    return sendStorageUrl(row.signed_pdf_path);
  }

  if (key.startsWith('packet-')) {
    const packetId = Number(key.slice(7));
    const packet = await ClientSignedSchoolPacket.findById(packetId);
    if (!packet || Number(packet.client_id) !== cid) return { notFound: true };
    return { packet };
  }

  const submissions = await loadIntakeSubmissionsForClient(cid);

  if (key.startsWith('section-key-')) {
    const sectionKey = key.slice('section-key-'.length);
    const html = await htmlForPacketSection({ client, sectionKey, submissions });
    return { html };
  }

  if (key.startsWith('section-')) {
    const ackId = Number(key.slice('section-'.length));
    const ack = await findPacketSectionAcknowledgementById(ackId, cid);
    if (!ack) return { notFound: true };
    const html = await htmlForPacketSection({
      client,
      sectionKey: ack.section_key,
      ack,
      submissions
    });
    return { html };
  }

  if (key === 'disclosure-html') {
    return { html: await htmlForDisclosure({ client, submissions }) };
  }

  if (key.startsWith('intake-html-')) {
    const html = await htmlForBrandedIntake({
      client,
      submissionId: Number(key.slice('intake-html-'.length)),
      submissions
    });
    if (!html) return { notFound: true };
    return { html };
  }

  if (key.startsWith('intake-answers-')) {
    const html = await htmlForClinicalOrAnswers({
      submissionId: Number(key.slice('intake-answers-'.length)),
      submissions,
      kind: 'answers',
      client
    });
    if (!html) return { notFound: true };
    return { html };
  }

  if (key.startsWith('clinical-html-')) {
    const html = await htmlForClinicalOrAnswers({
      submissionId: Number(key.slice('clinical-html-'.length)),
      submissions,
      kind: 'clinical',
      client
    });
    if (!html) return { notFound: true };
    return { html };
  }

  return { notFound: true };
}

export async function resolveClientChartAgencyId(client) {
  return resolveTherapyAgencyId(client);
}
