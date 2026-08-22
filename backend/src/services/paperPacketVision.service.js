/**
 * Vision evaluation of signed school paper packets.
 * Extracts footer version label, two required signatures (ROI + acknowledgement),
 * and DENY checkboxes next to staff names. Applies disclosure + ROI grants when confident.
 */
import pool from '../config/database.js';
import StorageService from './storage.service.js';
import ReferralOcrService from './referralOcr.service.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import ClientSchoolStaffRoiAccess from '../models/ClientSchoolStaffRoiAccess.model.js';
import { findSchoolPacketVersionByLabel } from './schoolPrintablePacketCache.service.js';
import { recordPaperPacketDisclosure } from './paperPacketDisclosure.service.js';
import {
  detectDenyStaffFromText,
  detectSignaturesFromText,
  extractVersionLabelFromText
} from '../utils/paperPacketVisionParse.util.js';

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

async function updateEvalRow(id, patch) {
  if (!id || !(await evalTableExists())) return;
  const fields = [];
  const vals = [];
  if (patch.status != null) {
    fields.push('status = ?');
    vals.push(patch.status);
  }
  if (patch.appliedAt) {
    fields.push('applied_at = CURRENT_TIMESTAMP');
  }
  if (patch.reviewReasons) {
    fields.push('review_reasons_json = ?');
    vals.push(JSON.stringify(patch.reviewReasons));
  }
  if (!fields.length) return;
  vals.push(id);
  await pool.execute(
    `UPDATE client_paper_packet_vision_evals SET ${fields.join(', ')} WHERE id = ?`,
    vals
  );
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

  try {
    await pool.execute(
      `UPDATE clients
       SET paper_packet_staff_roi_pending = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [cid]
    );
  } catch (e) {
    if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }

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
  locale = 'en'
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
      const [rows] = await pool.execute(
        `SELECT id, storage_path FROM client_phi_documents
         WHERE client_id = ?
         ORDER BY id DESC LIMIT 1`,
        [cid]
      );
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
      rawSummary: { error: 'no_packet_document' }
    });
    return { ok: false, status: 'needs_review', reviewReasons, evalId };
  }

  let buffer;
  try {
    const buf = await StorageService.readObject(path);
    buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  } catch (e) {
    const reviewReasons = ['storage_read_failed'];
    const evalId = await insertEvalRow({
      clientId: cid,
      schoolOrganizationId: sid,
      phiDocumentId: phiId,
      storagePath: path,
      status: 'failed',
      reviewReasons,
      confidence: 0,
      rawSummary: { error: e?.message || 'read_failed' }
    });
    return { ok: false, status: 'failed', reviewReasons, evalId };
  }

  let ocrText = '';
  try {
    // Prefer full-document Vision for signed packets (not handwritten-only filter).
    const pageCount = await ReferralOcrService.getPdfPageCount(buffer).catch(() => 0);
    const pagesToScan = pageCount > 0
      ? Array.from({ length: Math.min(pageCount, 20) }, (_, i) => i + 1)
      : undefined;
    ocrText = await ReferralOcrService.extractPdfWithVision({
      buffer,
      pagesToScan,
      languageHint: 'en'
    });
  } catch (e) {
    console.warn('[paperPacketVision] OCR failed', e?.message || e);
    const reviewReasons = ['vision_ocr_failed'];
    const evalId = await insertEvalRow({
      clientId: cid,
      schoolOrganizationId: sid,
      phiDocumentId: phiId,
      storagePath: path,
      status: 'failed',
      reviewReasons,
      confidence: 0,
      rawSummary: { error: e?.message || 'ocr_failed' }
    });
    return { ok: false, status: 'failed', reviewReasons, evalId };
  }

  const versionHit = extractVersionLabelFromText(ocrText);
  const sigs = detectSignaturesFromText(ocrText);
  const matched = versionHit.label
    ? await findSchoolPacketVersionByLabel(sid, locale, versionHit.label)
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
  const reviewReasons = [];
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

  const canApply = confidence >= CONFIDENT_THRESHOLD
    && matched
    && sigs.roiSignatureDetected
    && sigs.disclosureSignatureDetected
    && !deny.unmatchedDenyHints.length
    && staffList.length > 0;

  const status = canApply ? 'applied' : (reviewReasons.includes('vision_ocr_failed') ? 'failed' : 'needs_review');

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
    reviewReasons: canApply ? [] : reviewReasons,
    status: canApply ? 'pending' : status,
    rawSummary: {
      versionConfidence: versionHit.confidence,
      signatureMarkerCount: sigs.signatureMarkerCount,
      staffCount: staffList.length,
      denyCount: deny.denyStaffUserIds.length,
      unmatchedDenyHints: deny.unmatchedDenyHints,
      ocrChars: ocrText.length
    }
  });

  if (!canApply) {
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

  try {
    await recordPaperPacketDisclosure({
      clientId: cid,
      schoolOrganizationId: sid,
      packetVersionLabel: matched.version_label || versionHit.label,
      locale,
      confirmedByUserId: actorUserId
    });

    const grantResult = await applyVersionStaffRoiGrants({
      clientId: cid,
      schoolOrganizationId: sid,
      staffList,
      denyStaffUserIds: deny.denyStaffUserIds,
      actorUserId
    });

    await updateEvalRow(evalId, { status: 'applied', appliedAt: true, reviewReasons: [] });

    return {
      ok: true,
      status: 'applied',
      confidence,
      detectedVersionLabel: matched.version_label || versionHit.label,
      matchedVersionId: matched.id,
      denyStaffUserIds: deny.denyStaffUserIds,
      grantResult,
      evalId
    };
  } catch (e) {
    console.warn('[paperPacketVision] apply failed', e?.message || e);
    const reasons = ['apply_failed', e?.message || 'unknown'];
    await updateEvalRow(evalId, { status: 'needs_review', reviewReasons: reasons });
    return { ok: false, status: 'needs_review', reviewReasons: reasons, evalId };
  }
}

/**
 * Fire-and-forget after upload. Does not block the HTTP response.
 */
export function schedulePaperPacketVisionEval(opts = {}) {
  setImmediate(() => {
    evaluateAndApplyPaperPacketVision(opts).catch((e) => {
      console.warn('[paperPacketVision] scheduled eval failed', e?.message || e);
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
