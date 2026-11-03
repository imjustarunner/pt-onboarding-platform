// Display references never replace a clearinghouse patient-control number.
// Allocation is enforced by clinical migration 029 for every claim insertion.
export async function attachClaimReferences(rows, db) {
  const pairs = [...new Map(rows.filter(row => Number(row.claimId || row.id) > 0 && Number(row.agency_id) > 0)
    .map(row => [`${Number(row.agency_id)}:${Number(row.claimId || row.id)}`, [Number(row.agency_id),Number(row.claimId || row.id)]])).values()];
  const found = new Map();
  for (let start=0;start<pairs.length;start+=500) {
    const batch=pairs.slice(start,start+500);
    const [refs]=await db.execute(`SELECT agency_id,clinical_claim_id,public_reference FROM clinical_claim_references WHERE (agency_id,clinical_claim_id) IN (${batch.map(()=>'(?,?)').join(',')})`,batch.flat());
    for(const ref of refs)found.set(`${ref.agency_id}:${ref.clinical_claim_id}`,ref.public_reference);
  }
  for(const row of rows)row.claim_reference=found.get(`${row.agency_id}:${row.claimId || row.id}`)||null;
  return rows;
}
