import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { guardianCanReadIntakeDocuments } from '../utils/guardianDocumentAccess.js';
import { ageOn } from './guardianClinicalAccess.service.js';
import StorageService from './storage.service.js';

const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function guardianEnrollmentCopies({userId,clientId,agencyId},db=pool){
  const link=await ClientGuardian.getLink({clientId,guardianUserId:userId});
  if(!guardianCanReadIntakeDocuments(link))throw fail(403,'These enrollment records are not shared with this account.');
  const [[client]]=await db.execute('SELECT date_of_birth FROM clients WHERE id=?',[clientId]);
  if(!client||(link.relationship_type!=='self'&&ageOn(client.date_of_birth)>=18))throw fail(403,'These enrollment records require a care-team access review.');
  // A signer sees only a linked child's bundle. Never expose an entire sibling
  // submission as the fallback for a missing child-specific export.
  const [rows]=await db.execute(`SELECT DISTINCT s.id,isc.client_id,il.language_code,il.title,s.submitted_at,
    isc.bundle_pdf_path,s.combined_pdf_path,
    (SELECT COUNT(DISTINCT COALESCE(other.client_id,-other.id)) FROM intake_submission_clients other WHERE other.intake_submission_id=s.id) AS child_count
    FROM intake_submissions s JOIN intake_submission_clients isc ON isc.intake_submission_id=s.id
    JOIN intake_links il ON il.id=s.intake_link_id JOIN clients c ON c.id=isc.client_id
    WHERE isc.client_id=? AND s.guardian_user_id=? AND s.status='submitted'
      AND (? IS NULL OR c.agency_id=? OR EXISTS(SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))
      AND (il.organization_id=c.agency_id OR EXISTS(SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=il.organization_id AND oa.agency_id=c.agency_id AND oa.is_active=1)
        OR EXISTS(SELECT 1 FROM agency_schools a WHERE a.school_organization_id=il.organization_id AND a.agency_id=c.agency_id AND a.is_active=1))
    ORDER BY s.submitted_at DESC,s.id DESC`,[clientId,userId,agencyId||null,agencyId||null,agencyId||null]);
  return rows.filter(r=>r.bundle_pdf_path&&(Number(r.child_count)===1||r.bundle_pdf_path!==r.combined_pdf_path));
}
export async function listEnrollmentCopies(input){
  return (await guardianEnrollmentCopies(input)).map(r=>({id:`enrollment-${r.id}`,submissionId:r.id,kind:'enrollment_copy',client_id:r.client_id,
    document_template_name:r.language_code==='es'?'Copia completa de la inscripción firmada':'Complete signed enrollment copy',
    intake_link_title:r.title,signed_at:r.submitted_at,language:r.language_code||'en'}));
}
export async function downloadEnrollmentCopy(input){
  const copies=await guardianEnrollmentCopies(input);
  const copy=copies.find(r=>Number(r.id)===Number(input.submissionId));
  if(!copy)throw fail(404,'Enrollment copy not found.');
  return {body:await StorageService.readObject(copy.bundle_pdf_path),filename:`enrollment-${copy.id}-${copy.language_code||'en'}.pdf`};
}
