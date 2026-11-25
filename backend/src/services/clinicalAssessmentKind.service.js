import clinicalDb from '../config/clinicalDatabase.js';

export async function resolveClinicalAssessmentKind({agencyId,clientId,serviceCode,dateOfService,clinicalSessionId,noteId,metadata={}},db=clinicalDb) {
 const code=String(serviceCode || '').toUpperCase();
 if(!['H0031','90791'].includes(code))return null;
 const date="COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.metadata_json,'$.dateOfService')),DATE(s.scheduled_start_at),DATE(n.created_at))";
 const sql=[
  `SELECT n.id,${date} AS date_of_service,s.service_code FROM clinical_notes n`,
  'LEFT JOIN clinical_sessions s ON s.id=n.clinical_session_id AND s.agency_id=n.agency_id',
  'WHERE n.agency_id=? AND n.client_id=? AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL',
  'AND n.id<>?',
  `AND (n.clinical_session_id IS NULL OR n.clinical_session_id<>?) AND ${date}<=?`,
  "AND (s.service_code IN ('H0031','90791') OR JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(n.metadata_json),n.metadata_json,'{}'),'$.serviceCode')) IN ('H0031','90791'))",
  'ORDER BY date_of_service DESC,n.id DESC LIMIT 1'
 ].join(' ');
 const [history]=await db.execute(sql,[agencyId,clientId,Number(noteId)||0,Number(clinicalSessionId)||0,(dateOfService instanceof Date?dateOfService.toISOString():String(dateOfService || '')).slice(0,10)]);
 const automaticKind=history.length?'additional':'initial';
 const chosen=metadata.narrivaContext?.assessmentKind;
 const overridden=code==='H0031' && ['initial','additional'].includes(chosen) && metadata.narrivaContext?.assessmentKindConfirmed===true;
 const assessmentKind=overridden?chosen:automaticKind;
 return {assessmentKind,automaticKind,priorAssessmentId:history[0]?.id || null,requiresDiagnosisConfirmation:history.length>0,
   toolId:code==='H0031'?(assessmentKind==='additional'?'clinical_h0031_additional':'clinical_h0031_intake'):'clinical_90791_intake_plan'};
}
