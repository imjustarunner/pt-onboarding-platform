import pool from '../config/database.js';
import { authorizedClient } from './guardianAppointments.service.js';
import { requireClinicalScope } from './guardianClinicalAccess.service.js';
import { readSubmissionAnswers } from './officeClientSubmissions.service.js';
import { scoreOfficeFeedback } from './officeFeedbackForms.js';
import { summarizeFeedback } from './officeFeedbackSummary.service.js';

export async function guardianCheckins({userId,clientId,agencyId,serviceId}) {
  const client=await authorizedClient(userId,clientId,'clinical_documents',{agencyId,serviceId});
  if(client.permissions_json?.canViewDocs===false)throw Object.assign(new Error('Documents are not shared with this account.'),{status:403});
  if(!['learning','tutoring'].includes(String(client.client_type).toLowerCase())) await requireClinicalScope({agencyId:client.agency_id,clientId,userId,scope:'clinical_documents'});
  // A kiosk visit must already be attached to the correct chart. Unmatched
  // visits never appear here. Only completed client-self feedback is exposed;
  // a caregiver's private responses cannot be attributed to another guardian.
  const [rows]=await pool.execute(`SELECT s.id,s.provider_id,s.scheduled_start_at,s.completed_at,s.forms_json,s.answers_json,l.timezone,
    CONCAT_WS(' ',u.first_name,u.last_name) AS provider_name
    FROM office_client_checkin_submissions s JOIN office_locations l ON l.id=s.office_location_id
    JOIN users u ON u.id=s.provider_id WHERE s.client_id=? AND s.agency_id=? AND s.completed_at IS NOT NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(s.forms_json,'$.respondentType')) IN ('adult_self','youth_self')
    ORDER BY s.scheduled_start_at DESC,s.id DESC LIMIT 200`,[clientId,client.agency_id]);
  const visits=rows.filter(r=>!client.service?.provider_user_id||Number(r.provider_id)===Number(client.service.provider_user_id)).map(r=>{
    const envelope=typeof r.forms_json==='string'?JSON.parse(r.forms_json):r.forms_json;
    const feedback=readSubmissionAnswers(r.answers_json);
    const forms=(envelope.forms||[]).filter(f=>f.scoring==='office_feedback_v1');
    return {id:r.id,clientId:Number(clientId),providerId:r.provider_id,providerName:r.provider_name,scheduledStartAt:r.scheduled_start_at,completedAt:r.completed_at,timezone:r.timezone,respondentType:envelope.respondentType,serviceType:envelope.serviceType||'counseling',score:scoreOfficeFeedback(forms,feedback.answers,feedback.skippedFormIds)};
  }).filter(v=>!client.service||v.serviceType===client.service.service_kind);
  return {visits,trends:summarizeFeedback(visits),limit:200};
}
