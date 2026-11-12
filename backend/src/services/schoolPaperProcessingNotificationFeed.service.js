import pool from '../config/database.js';
/** One completion per saved source, derived from existing evidence; no Finish replay or email. */
export async function schoolPaperProcessingNotificationFeed({schoolOrganizationId,clientIds=null},db=pool){
 const sid=Number(schoolOrganizationId);if(!sid||(Array.isArray(clientIds)&&!clientIds.length))return [];
 const ids=Array.isArray(clientIds)?[...new Set(clientIds.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))]:null;
 if(ids&&!ids.length)return [];
 const [rows]=await db.execute(`SELECT c.id AS client_id,c.initials,p.id AS document_id,p.original_name,
 JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.processedAt')) AS processed_at
 FROM clients c JOIN client_phi_documents p
 ON p.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.signatureSourceDocumentId')) AS UNSIGNED)
 AND p.client_id=c.id AND p.agency_id=c.agency_id AND p.school_organization_id=c.organization_id AND p.removed_at IS NULL
 WHERE c.organization_id=? AND JSON_EXTRACT(c.onboarding_docs_json,'$.paperProcessing.processedAt') IS NOT NULL
 ${ids?`AND c.id IN (${ids.map(()=>'?').join(',')})`:''} ORDER BY processed_at DESC,c.id DESC LIMIT 500`,[sid,...(ids||[])]);
 return rows.filter(row=>row.processed_at&&row.processed_at!=='null').map(row=>({id:`paper-processed:${row.client_id}:${row.document_id}`,kind:'doc',client_id:Number(row.client_id),phi_document_id:Number(row.document_id),created_at:row.processed_at,title:'Paper packet processed',message:`${row.initials||`Record #${row.client_id}`} · ${row.original_name||'Paper packet'} was reviewed and processed.`,actor_name:null}));
}
