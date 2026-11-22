import pool from '../config/database.js';

// Carrier-directory facts are shared; enrollment, credentials, billing identities,
// policies and patient data remain agency-specific.
export async function listSharedPayerDirectory(db=pool,env=process.env,receivingAgencyId=null) {
 const ids=[...new Set(String(env.CLAIM_MD_AGENCY_IDS||'').split(',').map(Number).filter(n=>Number.isSafeInteger(n)&&n>0))];
 if(!ids.length)return [];
 const [rows]=await db.execute(`SELECT r.payer_name,d.claimmd_payer_id,d.directory_name,d.directory_status,d.directory_snapshot_json,d.source_names_json,d.directory_checked_at
  FROM medical_payer_setup_requests r JOIN medical_payer_setup_details d ON d.request_id=r.id
  JOIN agencies a ON a.id=r.agency_id
  WHERE r.agency_id IN (${ids.map(()=>'?').join(',')}) AND r.archived_at IS NULL AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
  AND d.directory_status='id_match' AND d.claimmd_payer_id IS NOT NULL
  ${receivingAgencyId?'AND NOT EXISTS(SELECT 1 FROM medical_payer_setup_requests hidden JOIN medical_payer_setup_details hd ON hd.request_id=hidden.id WHERE hidden.agency_id=? AND hidden.archived_at IS NOT NULL AND hd.claimmd_payer_id=d.claimmd_payer_id)':''}
  ORDER BY d.directory_checked_at DESC,r.id`,[...ids,...(receivingAgencyId?[receivingAgencyId]:[])]);
 const unique=new Map();
 for(const row of rows)if(/^[A-Za-z0-9_-]{1,32}$/.test(row.claimmd_payer_id)&&!unique.has(row.claimmd_payer_id))unique.set(row.claimmd_payer_id,row);
 return [...unique.values()];
}
