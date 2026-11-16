import { paperPacketLocale } from '../utils/paperPacketLocale.js';
/**
 * Vision evaluation of signed school paper packets.
 * Extracts the packet version, signature-area cues, dates, language and DENY marks.
 * Human source review is required before recording consent or changing school ROI.
 */
import pool from '../config/database.js';
import ReferralOcrService from './referralOcr.service.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import { paperPacketBytes } from './paperPacketBytes.service.js';
import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';
import { findSchoolPacketVersionByLabel } from './schoolPrintablePacketCache.service.js';
import {
  detectDenyStaffFromText,
  detectSignaturesFromText,
  extractVersionLabelFromText,
  extractPaperPacketReviewHints
} from '../utils/paperPacketVisionParse.util.js';
import { applyPaperPacketDemographicsFromText } from './paperPacketDemographics.service.js';

const CONFIDENT_THRESHOLD = 0.72;

function parseJson(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

async function evalTableExists() {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_paper_packet_vision_evals'`
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

function parseStaffFromVersion(versionRow) {
  const raw = parseJson(versionRow?.staff_json, []);
  return Array.isArray(raw) ? raw : [];
}

async function insertEvalRow(row) {
  if (!(await evalTableExists())) return null;
  const [result] = await pool.execute(
    `INSERT INTO client_paper_packet_vision_evals
       (client_id, school_organization_id, phi_document_id, storage_path,
        detected_version_label, matched_version_id, confidence,
        roi_signature_detected, disclosure_signature_detected,
        deny_staff_user_ids_json, review_reasons_json, raw_vision_summary_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.clientId,
      row.schoolOrganizationId,
      row.phiDocumentId || null,
      row.storagePath || null,
      row.detectedVersionLabel || null,
      row.matchedVersionId || null,
      row.confidence ?? null,
      row.roiSignatureDetected ? 1 : 0,
      row.disclosureSignatureDetected ? 1 : 0,
      JSON.stringify(row.denyStaffUserIds || []),
      JSON.stringify(row.reviewReasons || []),
      JSON.stringify(row.rawSummary || {}),
      row.status || 'needs_review'
    ]
  );
  return Number(result.insertId || 0) || null;
}

/**
 * Grant limited ROI to all version staff except DENY (inactive / packet).
 */
export async function applyVersionStaffRoiGrants({
  clientId,
  schoolOrganizationId,
  staffList = [],
  denyStaffUserIds = [],
  actorUserId = null
}) {
  const cid = Number(clientId || 0);
  const sid = Number(schoolOrganizationId || 0);
  if (!cid || !sid) return { granted: 0, denied: 0 };
  const denySet = new Set((denyStaffUserIds || []).map((id) => Number(id)).filter(Boolean));
  let granted = 0;
  let denied = 0;
  const actorId = Number(actorUserId || 0) || null;

  for (const staff of staffList) {
    const staffId = Number(staff.schoolStaffUserId || staff.id || 0);
    if (!staffId) continue;
    if (denySet.has(staffId)) {
      await pool.execute(
        `INSERT INTO client_school_staff_roi_access
          (client_id, school_organization_id, school_staff_user_id, access_level, is_active,
           revoked_by_user_id, revoked_at)
         VALUES (?, ?, ?, 'packet', FALSE, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE
           access_level = 'packet',
           is_active = FALSE,
           revoked_by_user_id = VALUES(revoked_by_user_id),
           revoked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP`,
        [cid, sid, staffId, actorId]
      );
      denied += 1;
      continue;
    }
    await ClientSchoolStaffRoiAccess.setAccessState({
      clientId: cid,
      schoolOrganizationId: sid,
      schoolStaffUserId: staffId,
      nextState: 'limited',
      actorUserId: actorId
    }).catch(() => null);
    granted += 1;
  }

  // OCR recognition is evidence, not the Support worker's consent review.
  // The paper processor clears the review flag only after human confirmation.

  return { granted, denied };
}

/**
 * Run Vision OCR on the uploaded packet PDF and optionally auto-apply.
 */
export async function evaluateAndApplyPaperPacketVision({
  clientId,
  schoolOrganizationId,
  phiDocumentId = null,
  storagePath = null,
  actorUserId = null,
  locale = 'auto'
}) {
  const cid = Number(clientId || 0);
  const sid = Number(schoolOrganizationId || 0);
  if (!cid || !sid) {
    return { ok: false, status: 'failed', reviewReasons: ['missing_client_or_school'] };
  }

  let path = storagePath;
  let phiId = Number(phiDocumentId || 0) || null;
  if (!path && phiId) {
    const doc = await ClientPhiDocument.findById(phiId).catch(() => null);
    path = doc?.storage_path || null;
  }
  if (!path) {
    // Latest packet PHI for client
    try {
      const rows = await ClientPhiDocument.findSchoolPaperPacketsForClient(cid);
      path = rows?.[0]?.storage_path || null;
      phiId = Number(rows?.[0]?.id || 0) || phiId;
    } catch {
      /* ignore */
    }
  }

  if (!path) {
    const reviewReasons = ['no_packet_document'];
    const evalId = await insertEvalRow({
      clientId: cid,
      schoolOrganizationId: sid,
      phiDocumentId: phiId,
      storagePath: null,
      status: 'needs_review',
      reviewReasons,
      confidence: 0,
      rawSummary: { error: 'no_packet_document', demographicsAttempted: true }
    });
    return { ok: false, status: 'needs_review', reviewReasons, evalId };
  }

  let buffer;
  let packetDocument = null;
  try {
    ({ buffer, doc: packetDocument } = await paperPacketBytes({ documentId: phiId, clientId: cid, schoolOrganizationId: sid }));
  } catch (e) {
    const pending = e?.code === 'file_check_pending';
    const reviewReasons = [pending ? 'file_check_pending' : e?.code === 'packet_source_mismatch' ? 'packet_source_mismatch' : 'storage_read_failed'];
    const evalId = await insertEvalRow({
      clientId: cid,
      schoolOrganizationId: sid,
      phiDocumentId: phiId,
      storagePath: path,
      status: pending ? 'needs_review' : 'failed',
      reviewReasons,
      confidence: 0,
      rawSummary: { error: e?.message || 'read_failed', demographicsAttempted: true }
    });
    return { ok: false, status: pending ? 'needs_review' : 'failed', reviewReasons, evalId };
  }

  let ocrText = '';
  let insuranceText = '';
  let ocrPages = [];
  try {
    // Prefer full-document Vision for signed packets (not handwritten-only filter).
    const pageCount = await ReferralOcrService.getPdfPageCount(buffer).catch(() => 0);
    const pagesToScan = pageCount > 0
      ? Array.from({ length: Math.min(pageCount, 20) }, (_, i) => i + 1)
      : undefined;
    const extracted = await ReferralOcrService.extractPdfWithVision({
      buffer,
      pagesToScan,
      languageHint: ['en','es'],
      includePaperInsurance: true, includePageText: true
    });
    ocrText = typeof extracted === 'string' ? extracted : extracted.text || '';
    ocrPages = typeof extracted === 'object' ? extracted.pages || [] : [];
    insuranceText=typeof extracted==='string'?'':extracted.insuranceText;
  } catch (e) {
    console.warn('[paperPacketVision] OCR failed');
    const reviewReasons = ['vision_ocr_failed'];
    const evalId = await insertEvalRow({
      clientId: cid,
      schoolOrganizationId: sid,
      phiDocumentId: phiId,
      storagePath: path,
      status: 'failed',
      reviewReasons,
      confidence: 0,
      rawSummary: { error: e?.message || 'ocr_failed', demographicsAttempted: true }
    });
    return { ok: false, status: 'failed', reviewReasons, evalId };
  }

  const packetLocale=paperPacketLocale(ocrText,locale);
  let demographicApply = { attempted: true, filled: [] };
  try {
    demographicApply = await applyPaperPacketDemographicsFromText({
      clientId: cid,
      ocrText,
      insuranceText,
      documentId: phiId,
      locale:packetLocale,
      actorUserId
    });
  } catch (e) {
    console.warn('[paperPacketVision] demographics apply failed');
  }

  const reviewHints = extractPaperPacketReviewHints(ocrText, ocrPages);
  // The existing reader also contributes Spanish packet-language evidence.
  reviewHints.locale ||= packetLocale || null;
  const versionHit = extractVersionLabelFromText(ocrText);
  const sigs = detectSignaturesFromText(ocrText);
  const matched = versionHit.label
    ? await findSchoolPacketVersionByLabel(sid, packetLocale || locale, versionHit.label)
    : null;

  let staffList = parseStaffFromVersion(matched);
  if (!staffList.length && matched?.id) {
    // Version row may predate staff_json — fall back to live roster for grant list only
    staffList = (await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForOrganization({
      schoolOrganizationId: sid
    }).catch(() => [])).map((r) => ({
      id: r.school_staff_user_id,
      schoolStaffUserId: r.school_staff_user_id,
      firstName: r.first_name,
      lastName: r.last_name,
      fullName: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      role: r.role_title || r.title
    }));
  }

  const deny = detectDenyStaffFromText(ocrText, staffList);
  const [[sourceClient]] = await pool.execute('SELECT onboarding_docs_json FROM clients WHERE id=?', [cid]);
  let sourceDocs = sourceClient?.onboarding_docs_json || {};
  if (typeof sourceDocs === 'string') { try { sourceDocs=JSON.parse(sourceDocs); } catch { sourceDocs={}; } }
  const replacement = Number(sourceDocs.paperPacketSource?.documentId) === Number(phiId);
  const reviewReasons = replacement ? ['replacement_packet_requires_review'] : [];
  if (!versionHit.label) reviewReasons.push('version_label_not_detected');
  if (versionHit.label && !matched) reviewReasons.push('version_label_unmatched');
  if (!sigs.roiSignatureDetected) reviewReasons.push('roi_signature_missing');
  if (!sigs.disclosureSignatureDetected) reviewReasons.push('disclosure_signature_missing');
  if (deny.unmatchedDenyHints.length) reviewReasons.push('deny_checkbox_ambiguous');
  if (matched && !parseStaffFromVersion(matched).length && !staffList.length) {
    reviewReasons.push('version_staff_snapshot_empty');
  }

  let confidence = 0;
  if (matched) confidence += 0.4 * (versionHit.confidence || 0.8);
  if (sigs.roiSignatureDetected) confidence += 0.2;
  if (sigs.disclosureSignatureDetected) confidence += 0.2;
  if (!deny.unmatchedDenyHints.length) confidence += 0.1;
  if (staffList.length) confidence += 0.1;
  confidence = Math.min(1, Number(confidence.toFixed(4)));

  const matchedEvidence = confidence >= CONFIDENT_THRESHOLD
    && matched
    && sigs.roiSignatureDetected
    && sigs.disclosureSignatureDetected
    && !deny.unmatchedDenyHints.length
    && staffList.length > 0;
  if (!matchedEvidence && !reviewReasons.some(reason => reason !== 'replacement_packet_requires_review')) reviewReasons.push('signature_matching_needs_review');
  // A nearby date is an OCR suggestion, not proof that a person signed. This
  // boundary also covers older packets that predate paperPacketSource metadata.
  reviewReasons.push('human_source_review_required');
  const status = 'needs_review';

  const evalId = await insertEvalRow({
    clientId: cid,
    schoolOrganizationId: sid,
    phiDocumentId: phiId,
    storagePath: path,
    detectedVersionLabel: versionHit.label,
    matchedVersionId: matched?.id || null,
    confidence,
    roiSignatureDetected: sigs.roiSignatureDetected,
    disclosureSignatureDetected: sigs.disclosureSignatureDetected,
    denyStaffUserIds: deny.denyStaffUserIds,
    reviewReasons,
    status,
    rawSummary: {
      versionConfidence: versionHit.confidence,
      matchedEvidence: !!matchedEvidence,
      reviewHints,
      packetLocale,
      submittedAt: packetDocument?.source_submission_date || packetDocument?.source_submitted_at || packetDocument?.uploaded_at || packetDocument?.created_at || null,
      signatureMarkerCount: sigs.signatureMarkerCount,
      staffCount: staffList.length,
      denyCount: deny.denyStaffUserIds.length,
      unmatchedDenyHints: deny.unmatchedDenyHints,
      ocrChars: ocrText.length,
      demographicsAttempted: true,
      demographicFieldsFilled: demographicApply.filled || []
    }
  });

  return {
    ok: false,
    status,
    reviewReasons,
    confidence,
    detectedVersionLabel: versionHit.label,
    matchedVersionId: matched?.id || null,
    evalId
  };
}

/**
 * Fire-and-forget after upload. Does not block the HTTP response.
 */
const visionEvalInFlight = new Set();

export function schedulePaperPacketVisionEval(opts = {}) {
  const cid = Number(opts.clientId || 0);
  if (cid && visionEvalInFlight.has(cid)) return;
  if (cid) visionEvalInFlight.add(cid);
  setImmediate(() => {
    evaluateAndApplyPaperPacketVision(opts)
      .catch((e) => {
        console.warn('[paperPacketVision] scheduled eval failed');
      })
      .finally(() => {
        if (cid) visionEvalInFlight.delete(cid);
      });
  });
}

export async function getLatestPaperPacketVisionEval(clientId) {
  const cid = Number(clientId || 0);
  if (!cid || !(await evalTableExists())) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM client_paper_packet_vision_evals
       WHERE client_id = ?
       ORDER BY id DESC LIMIT 1`,
      [cid]
    );
    const row = rows?.[0];
    if (!row) return null;
    return {
      ...row,
      deny_staff_user_ids: parseJson(row.deny_staff_user_ids_json, []),
      review_reasons: parseJson(row.review_reasons_json, []),
      raw_summary: parseJson(row.raw_vision_summary_json, {})
    };
  } catch {
    return null;
  }
}

export {
  CONFIDENT_THRESHOLD,
  extractVersionLabelFromText,
  detectSignaturesFromText,
  detectDenyStaffFromText
};
