import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { isGroupSupervision, groupTranscriptionConsent } from './groupSupervisionConsent.service.js';
import { SUPERVISION_AGREEMENT_TEXT, SUPERVISION_AGREEMENT_VERSION } from '../content/supervisionAgreement.en.js';
import { encryptGuardianIntake, decryptGuardianIntake } from './guardianIntakeEncryption.service.js';
import { hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import { documentHash, validateAgreementSignature, saveRecordingAgreementPdf, renderRecordingAgreement } from './recordingAgreementDocument.service.js';

const json = value => typeof value === 'string' ? JSON.parse(value) : value;
const fail = (message, status = 403) => { throw Object.assign(new Error(message), { status }); };
export async function isMentalHealthAgency(agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT 1 FROM agencies a WHERE a.id=? AND a.is_active=1 AND (
    EXISTS(SELECT 1 FROM agency_business_types b WHERE b.agency_id=a.id AND b.business_type IN ('mental_health','healthcare') AND b.is_enabled=1)
    OR (a.organization_type IN ('agency','clinical') AND NOT EXISTS(SELECT 1 FROM agency_business_types b WHERE b.agency_id=a.id)))`, [agencyId]);
  return !!rows.length;
}
export async function ensureSupervisionAgreement(assignmentId, db = pool) {
  const [rows] = await db.execute(`SELECT sa.*,s.first_name AS supervisor_first,s.last_name AS supervisor_last,s.email AS supervisor_email,
    e.first_name AS supervisee_first,e.last_name AS supervisee_last,e.email AS supervisee_email,e.status AS supervisee_status,e.role AS supervisee_role,
    a.name AS agency_name,a.color_palette FROM supervisor_assignments sa JOIN users s ON s.id=sa.supervisor_id
    JOIN users e ON e.id=sa.supervisee_id JOIN agencies a ON a.id=sa.agency_id WHERE sa.id=?`, [assignmentId]);
  const a = rows[0];
  if (!a || !['clinical','billing'].includes(a.supervisor_type || 'clinical') || !await isMentalHealthAgency(a.agency_id, db)) return null;
  if (['PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW','PROSPECT','APPLICANT'].includes(String(a.supervisee_status).toUpperCase())) return null;
  if (!['provider','provider_plus','supervisor','intern','intern_plus','clinician','clinical_practice_assistant'].includes(String(a.supervisee_role).toLowerCase())) return null;
  const [credentials] = await db.execute(`SELECT v.value FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id
    WHERE v.user_id=? AND d.field_key='provider_credential_license_type_number' AND (d.agency_id=? OR d.agency_id IS NULL)
    ORDER BY d.agency_id DESC LIMIT 1`, [a.supervisor_id,a.agency_id]);
  let colors = {}; try { colors = json(a.color_palette) || {}; } catch { /* use brand default */ }
  const document = { title: 'Supervision Agreement', version: SUPERVISION_AGREEMENT_VERSION, agencyName: a.agency_name,
    color: colors.primary || colors.primaryColor, text: SUPERVISION_AGREEMENT_TEXT,
    parties: [{ role: 'Supervisor', name: `${a.supervisor_first || ''} ${a.supervisor_last || ''}`.trim(), email: a.supervisor_email, credentials: credentials[0]?.value || '' },
      { role: 'Supervisee', name: `${a.supervisee_first || ''} ${a.supervisee_last || ''}`.trim(), email: a.supervisee_email }] };
  await db.execute(`INSERT INTO supervision_agreements (assignment_id,agency_id,supervisor_user_id,supervisee_user_id,version,document_json,document_hash)
    VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`, [a.id,a.agency_id,a.supervisor_id,a.supervisee_id,SUPERVISION_AGREEMENT_VERSION,JSON.stringify(document),documentHash(document)]);
  const [agreements] = await db.execute(`SELECT * FROM supervision_agreements WHERE assignment_id=? AND supervisor_user_id=? AND supervisee_user_id=? AND version=?`,
    [a.id,a.supervisor_id,a.supervisee_id,SUPERVISION_AGREEMENT_VERSION]);
  return agreements[0] || null;
}
export async function agreementsForUser(userId, agencyId = null) {
  const [assignments] = await pool.execute(`SELECT id FROM supervisor_assignments WHERE (supervisor_id=? OR supervisee_id=?) AND (? IS NULL OR agency_id=?)`, [userId,userId,agencyId,agencyId]);
  const agreements = [];
  for (const assignment of assignments) { const agreement = await ensureSupervisionAgreement(assignment.id); if (agreement) agreements.push(agreement); }
  return agreements;
}
export function agreementPublic(row, userId) {
  const document = json(row.document_json);
  const signatures = [['supervisor',row.supervisor_signature_json],['supervisee',row.supervisee_signature_json]]
    .filter(([,s]) => s).map(([role,s]) => ({ ...JSON.parse(decryptGuardianIntake(json(s))), role }));
  return { id: Number(row.id), agencyId: Number(row.agency_id), supervisorUserId: Number(row.supervisor_user_id), superviseeUserId: Number(row.supervisee_user_id),
    documentHash: row.document_hash, document, html: renderRecordingAgreement(document, signatures),
    supervisorSignedAt: row.supervisor_signed_at, superviseeSignedAt: row.supervisee_signed_at,
    complete: !!(row.supervisor_signed_at && row.supervisee_signed_at && !row.revoked_at),
    myRole: Number(userId) === Number(row.supervisor_user_id) ? 'supervisor' : Number(userId) === Number(row.supervisee_user_id) ? 'supervisee' : null };
}
export async function signSupervisionAgreement({ agreementId, userId, input, ip, userAgent, portal = false }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [rows] = await db.execute('SELECT * FROM supervision_agreements WHERE id=? FOR UPDATE', [agreementId]);
    const a = rows[0]; if (!a || a.revoked_at) fail('Agreement is unavailable.', 404);
    const role = Number(a.supervisor_user_id) === Number(userId) ? 'supervisor' : Number(a.supervisee_user_id) === Number(userId) ? 'supervisee' : null;
    if (!role || (portal && role !== 'supervisee')) fail('Only the named signer can sign this agreement.');
    if (!await hasActiveMeetingMembership(a.agency_id, userId)) fail('An active agency membership is required.');
    const [current] = await db.execute('SELECT id FROM supervisor_assignments WHERE id=? AND supervisor_id=? AND supervisee_id=? AND agency_id=?', [a.assignment_id,a.supervisor_user_id,a.supervisee_user_id,a.agency_id]);
    if (!current.length) fail('The supervisor assignment changed. Open the current agreement.', 409);
    if (input.documentHash !== a.document_hash) fail('The document changed. Review it again before signing.', 409);
    if (a[`${role}_signed_at`]) { await db.commit(); return agreementPublic(a,userId); }
    const document = json(a.document_json), person = document.parties[role === 'supervisor' ? 0 : 1];
    const evidence = validateAgreementSignature(input, { name: person.name,userId,ip,userAgent });
    a[`${role}_signature_json`] = JSON.stringify(encryptGuardianIntake(JSON.stringify(evidence)));
    a[`${role}_signed_at`] = evidence.signedAt;
    const signatures = ['supervisor','supervisee'].filter(r => a[`${r}_signature_json`]).map(r => ({ ...JSON.parse(decryptGuardianIntake(json(a[`${r}_signature_json`]))),role:r }));
    const pdf = await saveRecordingAgreementPdf(document,signatures,`supervision-agreement-${a.id}-${randomUUID()}.pdf`);
    await db.execute(`UPDATE supervision_agreements SET ${role}_signature_json=?,${role}_signed_at=UTC_TIMESTAMP(),signed_pdf_path=? WHERE id=?`, [a[`${role}_signature_json`],pdf.path,a.id]);
    if (a.supervisor_signed_at && a.supervisee_signed_at) {
      for (const uid of [a.supervisor_user_id,a.supervisee_user_id]) {
        const [doc] = await db.execute(`INSERT INTO user_specific_documents (user_id,name,description,template_type,file_path,document_action_type,created_by_user_id)
          VALUES (?,?,?,'pdf',?,'review',?)`, [uid,`Supervision Agreement · ${document.agencyName}`,`Agreement ${a.id}; both parties signed; SHA-256 ${a.document_hash}`,pdf.path,userId]);
        await db.execute(`INSERT INTO signed_documents (template_version,user_id,signed_pdf_path,pdf_hash,signed_at,audit_trail,user_specific_document_id)
          VALUES (?,?,?,?,UTC_TIMESTAMP(),?,?)`,[a.version,uid,pdf.path,pdf.hash,JSON.stringify({supervisionAgreementId:a.id,documentHash:a.document_hash,signers:signatures.map(({image,...s})=>s)}),doc.insertId]);
      }
    }
    await db.commit(); return agreementPublic(a,userId);
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
export async function supervisionRecordingConsent(session, db = pool) {
  if (!await isMentalHealthAgency(session.agency_id, db)) return { allowed: false, reason: 'Supervision recording is available for mental health agencies only.' };
  if (isGroupSupervision(session)) return groupTranscriptionConsent(session, db);
  const [participants] = await db.execute(`SELECT ? AS user_id UNION SELECT ? UNION
    SELECT user_id FROM supervision_session_attendees WHERE session_id=? AND status NOT IN ('DECLINED','REMOVED','CANCELLED','WITHDRAWN')`,
    [session.supervisee_user_id,session.co_facilitator_user_id,session.id]);
  const supervisees = [...new Set(participants.map(p=>Number(p.user_id)).filter(id=>id && id!==Number(session.supervisor_user_id) && id!==Number(session.co_facilitator_user_id)))];
  if (!supervisees.length) return { allowed:false,reason:'Add the supervisees before recording.' };
  for (const uid of supervisees) {
    const [signed] = await db.execute(`SELECT a.id FROM supervision_agreements a JOIN supervisor_assignments sa ON sa.id=a.assignment_id
      AND sa.supervisor_id=a.supervisor_user_id AND sa.supervisee_id=a.supervisee_user_id AND sa.agency_id=a.agency_id
      WHERE a.agency_id=? AND a.supervisee_user_id=? AND a.supervisor_signed_at IS NOT NULL AND a.supervisee_signed_at IS NOT NULL
        AND a.revoked_at IS NULL AND a.version=? LIMIT 1`,[session.agency_id,uid,SUPERVISION_AGREEMENT_VERSION]);
    if (!signed.length) return {allowed:false,reason:'Each supervisee and their assigned supervisor must sign the supervision agreement before transcription.'};
  }
  // The facilitator must also have signed an agreement as a supervisor in this agency.
  for (const uid of [session.supervisor_user_id,session.co_facilitator_user_id].filter(Boolean)) {
    const [signed] = await db.execute(`SELECT id FROM supervision_agreements WHERE agency_id=? AND supervisor_user_id=? AND supervisor_signed_at IS NOT NULL AND revoked_at IS NULL AND version=? LIMIT 1`,[session.agency_id,uid,SUPERVISION_AGREEMENT_VERSION]);
    if (!signed.length) return {allowed:false,reason:'The supervisor must sign a supervision agreement before transcription.'};
  }
  return {allowed:true};
}

export async function assertOnboardingSupervisionAgreements(userId, agencyId, db = pool) {
  if (!await isMentalHealthAgency(agencyId,db)) return;
  const [rows] = await db.execute(`SELECT sa.id FROM supervisor_assignments sa JOIN users u ON u.id=sa.supervisee_id
    LEFT JOIN supervision_agreements a ON a.assignment_id=sa.id AND a.supervisor_user_id=sa.supervisor_id
      AND a.supervisee_user_id=sa.supervisee_id AND a.version=? AND a.revoked_at IS NULL
    WHERE sa.supervisee_id=? AND sa.agency_id=? AND sa.supervisor_type IN ('clinical','billing')
      AND u.role IN ('provider','provider_plus','supervisor','intern','intern_plus','clinician','clinical_practice_assistant')
      AND (a.supervisor_signed_at IS NULL OR a.supervisee_signed_at IS NULL) LIMIT 1`,[SUPERVISION_AGREEMENT_VERSION,userId,agencyId]);
  if(rows.length) fail('The supervision agreement needs both your signature and your assigned supervisor’s signature before onboarding is complete.',409);
}
