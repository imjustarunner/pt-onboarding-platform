// Called with the reference's own transaction. A failed enqueue rolls back the
// completion/decline too, so a successful response cannot silently lose its alert.
export async function queueReferenceReceipt(db, { agencyId, candidateUserId, sourceKind, sourceId, referenceIndex }) {
  await db.execute(`INSERT IGNORE INTO hiring_reference_receipt_events
    (agency_id,candidate_user_id,source_kind,source_id,reference_index) VALUES (?,?,?,?,?)`,
  [agencyId, candidateUserId, sourceKind, sourceId, referenceIndex]);
}
