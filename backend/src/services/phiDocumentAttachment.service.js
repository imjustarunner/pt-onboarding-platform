import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import PhiDocumentAuditLog from '../models/PhiDocumentAuditLog.model.js';
import Client from '../models/Client.model.js';

/**
 * One canonical "attach a signed PDF (or any artifact) to a client's profile"
 * helper for the public-intake pipeline.
 *
 * Why this exists: the public-intake controller had ~9 nearly-identical PHI
 * doc create blocks (per-template signed PDF in school flow, per-template in
 * registration flow, embedded ROI step, packet pieces, combined packet, etc.).
 * Each block independently re-derived agencyId / schoolOrganizationId, each
 * had a different fallback chain, and several swallowed errors silently. As a
 * result clients periodically lost paperwork that we then couldn't diagnose
 * because no two call sites logged the same metadata.
 *
 * This helper makes "attach PDF to client" a single function that:
 *   - validates required inputs
 *   - resolves the agency/org with a consistent fallback chain (client row
 *     first, then explicit overrides, then the link)
 *   - writes the PHI row + audit log
 *   - never throws — returns a structured result so callers can surface
 *     banners or continue the per-child loop without one bad doc aborting
 *     everything else
 *   - logs failures with sqlCode/sqlState so production logs immediately
 *     identify NULL constraint violations vs FK violations vs duplicate
 *     storage_path collisions
 *
 * Returns:
 *   { ok: true, phiDoc }
 *   { ok: false, reason, error?, sqlCode?, sqlState? }
 *     reason ∈ 'missing_client_id' | 'missing_storage_path' | 'duplicate_storage_path' | 'create_failed' | 'audit_log_failed'
 */
export async function attachSignedPdfToClient({
  clientId,
  link = null,
  storagePath,
  originalName,
  documentTitle = null,
  documentType = null,
  mimeType = 'application/pdf',
  intakeSubmissionId = null,
  referralDraftId = null,
  expiresAt = null,
  ipAddress = null,
  scanStatus = 'clean',
  uploadedByUserId = null,
  isEncrypted = false,
  encryptionKeyId = null,
  encryptionWrappedKey = null,
  encryptionIv = null,
  encryptionAuthTag = null,
  encryptionAlg = null,
  // Optional pre-loaded client row to avoid an extra DB roundtrip when the
  // caller already has it in scope (per-client loop usually does).
  clientRow = null,
  // Override fallbacks if the caller knows better than the client row (e.g.
  // an embedded ROI step running against the link's school org).
  agencyIdOverride = null,
  schoolOrganizationIdOverride = null,
  // Free-form audit metadata appended to the PhiDocumentAuditLog row.
  auditMetadata = {},
  // Free-form context appended to the failure log so future diagnosis is
  // possible without spelunking through call sites.
  callerLabel = 'public_intake'
} = {}) {
  if (!clientId) {
    return { ok: false, reason: 'missing_client_id' };
  }
  if (!storagePath) {
    return { ok: false, reason: 'missing_storage_path' };
  }

  // Resolve client row if the caller didn't pre-load it AND we actually need
  // it (i.e. at least one of agency/org wasn't overridden). The piece-doc
  // path passes both overrides explicitly and would otherwise force an
  // unnecessary DB lookup per piece per child.
  let row = clientRow;
  const overridesCoverEverything = Boolean(agencyIdOverride && schoolOrganizationIdOverride);
  if (!row && !overridesCoverEverything) {
    try {
      row = await Client.findById(clientId, { includeSensitive: true });
    } catch (lookupErr) {
      console.warn('[phiDocumentAttachment] Client.findById failed; falling back to overrides', {
        clientId,
        callerLabel,
        message: lookupErr?.message || String(lookupErr || '')
      });
      row = null;
    }
  }

  // agency_id and school_organization_id are NOT NULL columns. Their FKs
  // both point at agencies(id), so the safest fallback is the link's own
  // organization_id (which IS an agency). If that's also missing we'd hit a
  // NULL constraint at insert time anyway, so let it surface in the error.
  const agencyId =
    agencyIdOverride
    || row?.agency_id
    || link?.organization_id
    || null;
  const schoolOrganizationId =
    schoolOrganizationIdOverride
    || row?.organization_id
    || row?.school_organization_id
    || link?.organization_id
    || agencyId
    || null;

  let phiDoc = null;
  try {
    phiDoc = await ClientPhiDocument.create({
      clientId,
      agencyId,
      schoolOrganizationId,
      intakeSubmissionId,
      referralDraftId,
      storagePath,
      originalName,
      documentTitle,
      documentType,
      mimeType,
      uploadedByUserId,
      scanStatus,
      isEncrypted,
      encryptionKeyId,
      encryptionWrappedKey,
      encryptionIv,
      encryptionAuthTag,
      encryptionAlg,
      expiresAt
    });
  } catch (err) {
    const isDuplicate =
      err?.code === 'ER_DUP_ENTRY' || /duplicate/i.test(err?.message || '');
    console.error('[phiDocumentAttachment] client_phi_documents insert failed', {
      callerLabel,
      clientId,
      intakeSubmissionId,
      storagePath,
      agencyId,
      schoolOrganizationId,
      sqlCode: err?.code || null,
      sqlState: err?.sqlState || null,
      message: err?.message || String(err || ''),
      stack: err?.stack || null
    });
    return {
      ok: false,
      reason: isDuplicate ? 'duplicate_storage_path' : 'create_failed',
      error: err?.message || String(err || ''),
      sqlCode: err?.code || null,
      sqlState: err?.sqlState || null
    };
  }

  // Audit log is best-effort — a failure here does NOT roll back the PHI row
  // (which is the source of truth) but we still log loudly so the audit gap
  // is visible.
  try {
    await PhiDocumentAuditLog.create({
      documentId: phiDoc.id,
      clientId,
      action: 'uploaded',
      actorUserId: null,
      actorLabel: callerLabel,
      ipAddress: ipAddress || null,
      metadata: {
        intakeSubmissionId,
        ...auditMetadata
      }
    });
  } catch (auditErr) {
    console.error('[phiDocumentAttachment] PhiDocumentAuditLog.create failed', {
      callerLabel,
      clientId,
      phiDocId: phiDoc.id,
      message: auditErr?.message || String(auditErr || '')
    });
    // Still return ok:true with phiDoc — losing the audit row is bad but
    // losing the document attachment because the audit insert failed is
    // worse. Callers who care about audit-strict mode can re-attempt.
    return { ok: true, phiDoc, reason: 'audit_log_failed', auditError: auditErr?.message || null };
  }

  return { ok: true, phiDoc };
}

export default attachSignedPdfToClient;
