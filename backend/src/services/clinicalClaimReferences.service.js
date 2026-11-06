// A retry retains the root claim's number. Historical per-attempt references
// remain immutable aliases; allocation is enforced by clinical migration 029.
export async function attachClaimReferences(rows, db) {
  const pairs = [...new Map(rows.filter(row => Number(row.claimId || row.id) > 0 && Number(row.agency_id) > 0)
    .map(row => [`${Number(row.agency_id)}:${Number(row.claimId || row.id)}`, [Number(row.agency_id),Number(row.claimId || row.id)]])).values()];
  const found = new Map();
  for (let start=0;start<pairs.length;start+=500) {
    const batch=pairs.slice(start,start+500);
    const [refs]=await db.execute(`WITH RECURSIVE lineage AS (
      SELECT c.id AS requested_id,c.id,c.agency_id,c.client_id,c.clinical_session_id,c.payer_sequence,c.parent_claim_id,c.metadata_json,0 AS depth
      FROM clinical_claims c WHERE (c.agency_id,c.id) IN (${batch.map(()=>'(?,?)').join(',')}) AND c.is_deleted=0
      UNION ALL
      SELECT l.requested_id,p.id,p.agency_id,p.client_id,p.clinical_session_id,p.payer_sequence,p.parent_claim_id,p.metadata_json,l.depth+1
      FROM lineage l JOIN clinical_claims p ON p.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(l.metadata_json,'$.resubmission.sourceClaimId')) AS UNSIGNED)
      AND p.agency_id=l.agency_id AND p.client_id=l.client_id AND p.clinical_session_id=l.clinical_session_id
      AND COALESCE(p.payer_sequence,1)=COALESCE(l.payer_sequence,1) AND COALESCE(p.parent_claim_id,0)=COALESCE(l.parent_claim_id,0)
      WHERE p.is_deleted=0 AND l.depth<100
    ) SELECT l.agency_id,l.requested_id AS clinical_claim_id,l.id AS root_claim_id,r.public_reference,a.public_reference AS attempt_reference
      FROM clinical_claim_references r JOIN lineage l ON r.clinical_claim_id=l.id AND r.agency_id=l.agency_id
      LEFT JOIN clinical_claim_references a ON a.clinical_claim_id=l.requested_id AND a.agency_id=l.agency_id
      WHERE JSON_EXTRACT(l.metadata_json,'$.resubmission.sourceClaimId') IS NULL`,batch.flat());
    for(const ref of refs)found.set(`${ref.agency_id}:${ref.clinical_claim_id}`,ref);
  }
  for(const row of rows){const ref=found.get(`${row.agency_id}:${row.claimId || row.id}`);row.claim_reference=ref?.public_reference||null;row.claim_root_id=ref?.root_claim_id||Number(row.claimId||row.id);row.attempt_reference=ref?.attempt_reference||ref?.public_reference||null;}
  return rows;
}
