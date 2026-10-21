// Older learning records belong to the client's original agency. New evidence
// records its agency explicitly; a second enrollment cannot inherit old records.
export function learningRecordScope(alias, {agencyId=null,providerId=null}={}) {
 const clauses=[],params=[];
 if(agencyId){clauses.push(`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${alias}.metadata_json,'$.agencyId')),(SELECT c.agency_id FROM clients c WHERE c.id=${alias}.client_id))=?`);params.push(Number(agencyId));}
 if(providerId){clauses.push(`${alias}.created_by_user_id=?`);params.push(Number(providerId));}
 return {sql:clauses.length?` AND ${clauses.join(' AND ')}`:'',params};
}
