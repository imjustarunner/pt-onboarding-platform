// Called with the reference's own transaction. A failed enqueue rolls back the
// completion too, so a successful submission cannot silently lose its alert.
export async function queueReferenceReceipt(db, { agencyId, candidateUserId, sourceKind, sourceId, referenceIndex }) {
  await db.execute(`INSERT IGNORE INTO hiring_reference_receipt_events
    (agency_id,candidate_user_id,source_kind,source_id,reference_index) VALUES (?,?,?,?,?)`,
  [agencyId, candidateUserId, sourceKind, sourceId, referenceIndex]);
}
