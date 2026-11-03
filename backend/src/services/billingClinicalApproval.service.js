const object = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };

export const CLINICAL_APPROVAL_REQUIRED = 'The clinical note does not have final approval for billing. Complete the required clinical signature or amendment review first.';

// Shared by the work queue, recovery and write guards. Current staff assignments
// cannot establish a historical signature or approve a legacy-observed snapshot.
export function clinicalBillingStage(row) {
  const requests = object(row.review_requests_json);
  if (Array.isArray(requests) && requests.some(request => request.action === 'changes_needed' && !request.resolvedAt)) return 'revisions_needed';
  if (row.pending_revision_id) return row.pending_revision_origin !== 'supervisor' && !Number(row.pending_author_signed) ? 'draft' : 'pending_review';
  if (row.approved_at || (row.provider_signed_at && row.supervisor_cosigned_at)) return 'ready_to_submit';
  if (row.provider_signed_at) {
    const billable = row.is_billable === true || row.is_billable === 'true' || Number(row.is_billable) === 1;
    if (Number(row.requires_supervisor_cosign) === 0 && billable && row.effective_revision_id && Number(row.has_original_signature) === 1) return 'ready_to_submit';
    return 'pending_review';
  }
  if (row.clinical_note_id || row.draft_id) return 'draft';
  return null;
}

export const clinicalApprovalFields = `n.id AS clinical_note_id,n.provider_signed_at,n.supervisor_cosigned_at,
  COALESCE(JSON_EXTRACT(r.snapshot_json,'$.isBillable'),n.is_billable) AS is_billable,
  JSON_EXTRACT(n.metadata_json,'$.reviewRequests') AS review_requests_json,
  h.effective_revision_id,h.pending_revision_id,r.requires_supervisor_cosign,pending.origin AS pending_revision_origin,
  EXISTS(SELECT 1 FROM clinical_note_revision_signatures ps WHERE ps.revision_id=pending.id AND ps.signature_action='author_sign') AS pending_author_signed,
  EXISTS(SELECT 1 FROM clinical_note_revision_signatures os WHERE os.revision_id=r.id AND os.signature_action='initial_author_sign') AS has_original_signature,
  approval.approved_at`;

export const clinicalApprovalJoins = `LEFT JOIN clinical_note_revision_heads h ON h.clinical_note_id=n.id AND h.agency_id=n.agency_id
  LEFT JOIN clinical_note_revisions r ON r.id=h.effective_revision_id AND r.agency_id=n.agency_id
  LEFT JOIN clinical_note_revisions pending ON pending.id=h.pending_revision_id AND pending.agency_id=n.agency_id
  LEFT JOIN clinical_note_revision_approvals approval ON approval.revision_id=r.id AND approval.agency_id=n.agency_id`;

export async function loadClinicalBillingApproval({ noteId, agencyId }, db) {
  const [[row]] = await db.execute(`SELECT ${clinicalApprovalFields} FROM clinical_notes n ${clinicalApprovalJoins}
    WHERE n.id=? AND n.agency_id=? AND n.is_deleted=0 LIMIT 1`, [noteId, agencyId]);
  const stage = row ? clinicalBillingStage(row) : null;
  return { approved: stage === 'ready_to_submit', stage, revisionId: Number(row?.effective_revision_id) || null };
}

export async function assertClinicalBillingApproval(input, db) {
  const result = await loadClinicalBillingApproval(input, db);
  if (!result.approved) throw Object.assign(new Error(CLINICAL_APPROVAL_REQUIRED), { status: 409, code: 'CLINICAL_APPROVAL_REQUIRED', clinicalStage: result.stage });
  return result;
}

// Readiness already has the revision summary; use its same persisted evidence.
export function clinicalBillingStageFromSummary(note, summary) {
  const revision = summary.effectiveRevision, pending = summary.pendingRevision;
  return clinicalBillingStage({
    clinical_note_id: note.id, provider_signed_at: note.provider_signed_at, supervisor_cosigned_at: note.supervisor_cosigned_at,
    is_billable: revision?.snapshot?.isBillable ?? note.is_billable,
    review_requests_json: object(note.metadata_json).reviewRequests,
    effective_revision_id: summary.effectiveRevisionId, pending_revision_id: summary.pendingRevisionId,
    requires_supervisor_cosign: revision?.requiresSupervisorCosign,
    pending_revision_origin: pending?.origin,
    pending_author_signed: pending?.signatures?.some(signature => signature.action === 'author_sign') ? 1 : 0,
    has_original_signature: revision?.signatures?.some(signature => signature.action === 'initial_author_sign') ? 1 : 0,
    approved_at: revision?.approval?.approvedAt
  });
}
