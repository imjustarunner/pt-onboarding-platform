import { schoolRoiAuditTrail } from './schoolRoiDocument.js';

// This is a description of retained signed evidence, never an access decision.
// Only a known signer and school can establish which record replaces another.
export function describeSignedSchoolRoiDocuments(documents, schoolOrganizationId) {
  const records = (documents || []).map(doc => ({
    id: Number(doc.id),
    signed_at: doc.signed_at,
    submission_id: Number(doc.intake_submission_id),
    signer_name: schoolRoiAuditTrail(doc).signerName || null,
    guardian_user_id: Number(doc.guardian_user_id) || null,
    school_organization_id: Number(doc.submission_school_organization_id) || null
  }));
  const latest = new Map();
  for (const record of records) {
    if (!record.guardian_user_id || !record.school_organization_id || !Number.isFinite(new Date(record.signed_at).getTime())) continue;
    const key = `${record.guardian_user_id}:${record.school_organization_id}`;
    const previous = latest.get(key);
    if (!previous || new Date(record.signed_at) > new Date(previous.signed_at)
      || (+new Date(record.signed_at) === +new Date(previous.signed_at) && record.id > previous.id)) latest.set(key, record);
  }
  return records.map(record => {
    const newest = latest.get(`${record.guardian_user_id}:${record.school_organization_id}`);
    const otherSchool = record.school_organization_id && Number(schoolOrganizationId) > 0
      && record.school_organization_id !== Number(schoolOrganizationId);
    const superseded = !otherSchool && newest && newest.id !== record.id;
    return { ...record,
      evidence_state: otherSchool ? 'historical_other_school' : superseded ? 'superseded' : newest ? 'latest_signed' : 'historical',
      superseded_by_document_id: superseded ? newest.id : null
    };
  });
}
