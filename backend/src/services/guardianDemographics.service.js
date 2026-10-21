import crypto from 'node:crypto';
import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { isDobAdultLocked } from '../utils/guardianWaivers.utils.js';

export const demographicFields = Object.freeze({ full_name: 'Legal full name', preferred_name: 'Name they go by', date_of_birth: 'Date of birth', preferred_language: 'Preferred language', gender:'Sex / gender on record', grade:'Grade', contact_phone:'Client phone', email:'Client email', address_street:'Home address', address_apt:'Apartment / unit', address_city:'City', address_state:'State', address_zip:'ZIP / postal code', ethnicity:'Ethnicity' });
const keys = Object.keys(demographicFields);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const context = (agencyId, clientId) => `guardian-demographics:${agencyId}:${clientId}`;
function values(row) { return Object.fromEntries(keys.map(key => [key, key === 'date_of_birth' && row[key] instanceof Date ? row[key].toISOString().slice(0, 10) : String(row[key] || '')])); }
export function demographicRevision(value) { return crypto.createHash('sha256').update(JSON.stringify(values(value))).digest('hex'); }
export function validateDemographicValues(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !keys.includes(k))) fail(400, 'Choose only the available client details.');
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string' || value.length > 255) fail(400, 'Client details must be text of 255 characters or fewer.');
    out[key] = value.trim();
    const limits={grade:32,gender:64,contact_phone:20,email:255,address_apt:64,address_city:100,address_state:50,address_zip:20,ethnicity:100,preferred_language:100};
    if(out[key].length>(limits[key]||255)) fail(400,`${demographicFields[key]} is too long.`);
    if(key==='email'&&out[key]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out[key])) fail(400,'Enter a valid client email address.');
    if (key === 'full_name' && !out[key]) fail(400, 'Enter the legal full name.');
    if (key === 'date_of_birth') {
      const d = new Date(`${out[key]}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(out[key]) || !Number.isFinite(+d) || d.toISOString().slice(0, 10) !== out[key] || d > new Date()) fail(400, 'Enter a valid date of birth.');
    }
  }
  return out;
}

/** Extract only this child's explicitly supplied identifiers. Guardian/contact
 * fields and empty prefill defaults must not become client identity changes. */
export function enrollmentDemographicValues({ child = {}, responses = {}, demographics = {} } = {}) {
  const out = {};
  const own = responses.demographicsInfo && typeof responses.demographicsInfo === 'object'
    ? responses.demographicsInfo : {};
  const first = String(child.firstName || responses.child_legal_first || responses.client_first || '').trim();
  const middle = String(child.middleName || '').trim();
  const last = String(child.lastName || responses.child_legal_last || responses.client_last || '').trim();
  const fullName = String(child.fullName || child.full_name || (first && last ? [first, middle, last].filter(Boolean).join(' ') : '')).trim();
  if (fullName) out.full_name = fullName;
  const dob = String(responses.child_dob || responses.date_of_birth || responses.client_dob
    || own.dob || child.dateOfBirth || child.dob || demographics.dob || '').trim();
  if (dob) out.date_of_birth = dob;
  const preferredName = String(responses.child_preferred_name || own.preferredCalled
    || child.preferredName || demographics.preferredCalled || '').trim();
  if (preferredName) out.preferred_name = preferredName;
  const language = String(responses.child_preferred_language || responses.preferred_language
    || responses.client_preferred_language || own.preferredLanguage || demographics.preferredLanguage || '').trim();
  if (language) out.preferred_language = language;
  // Explicit client identifiers only: never copy a guardian's contact/address
  // into a child's chart merely because both appear in the same packet.
  const extra={gender:['gender','client_gender'],grade:['grade','child_grade'],contact_phone:['phone','client_phone'],email:['email','client_email'],address_street:['addressStreet','client_address_street'],address_apt:['addressApt','client_address_apt'],address_city:['addressCity','client_address_city'],address_state:['addressState','client_address_state'],address_zip:['addressZip','client_address_zip'],ethnicity:['ethnicity','client_ethnicity']};
  for(const [field,[childKey,responseKey]] of Object.entries(extra)){const value=child[childKey]||child[field]||responses[responseKey];if(typeof value==='string'&&value.trim())out[field]=value.trim();}
  return out;
}

async function guardianAccess(user, clientId, db) {
  if (!['client_guardian','client'].includes(user?.role)) fail(403, 'Guardian account required.');
  const [rows] = await db.execute(`SELECT c.*,cg.access_enabled,cg.permissions_json,cg.relationship_type FROM clients c JOIN client_guardians cg ON cg.client_id=c.id WHERE c.id=? AND cg.guardian_user_id=?`, [clientId,user.id]);
  const row = rows[0];
  const permissions = ClientGuardian.parsePermissions(row?.permissions_json);
  if (!row || Number(row.guardian_portal_enabled)!==1 || Number(row.access_enabled)!==1 || (row.permissions_json && (!permissions || typeof permissions!=='object' || Array.isArray(permissions))) || ClientGuardian.isNoView(permissions) || (row.relationship_type !== 'self' && isDobAdultLocked(row.date_of_birth))) fail(403, 'Client details are not available to this account.');
  return row;
}
async function staffAccess(user, clientId) {
  if (!['super_admin','admin','agency_admin','staff','support','clinical_practice_assistant'].includes(user?.role)) fail(403, 'Support-team access is required to review these details.');
  const access = await resolveClientRecordAccess({userId:user.id,role:user.role,clientId});
  if (!access.ok) fail(access.status || 403, 'Client access denied.');
  return access.client;
}
export function createGuardianDemographicsService(overrides = {}) {
  const d = { db:pool, guardianAccess, staffAccess, encrypt:encryptFamilyBilling, decrypt:decryptFamilyBilling, ...overrides };
  async function read({user,clientId,staff=false}) {
    const client = staff ? await d.staffAccess(user,clientId) : await d.guardianAccess(user,clientId,d.db);
    const [[current]] = await d.db.execute(`SELECT ${keys.join(',')} FROM clients WHERE id=? AND agency_id=?`,[clientId,client.agency_id]);
    if (!current) fail(404,'Client not found.');
    const [rows] = await d.db.execute(`SELECT r.*,CONCAT_WS(' ',u.first_name,u.last_name) submitted_by FROM guardian_demographic_requests r JOIN users u ON u.id=r.guardian_user_id WHERE r.client_id=? AND r.agency_id=? ${staff ? '' : 'AND r.guardian_user_id=?'} ORDER BY r.id DESC LIMIT 50`,[clientId,client.agency_id,...(staff?[]:[user.id])]);
    return {fields:demographicFields,values:values(current),revision:demographicRevision(current),requests:rows.map(r=>({id:r.id,status:r.status,submittedBy:r.submitted_by,intakeSubmissionId:r.intake_submission_id || null,createdAt:r.created_at,reviewedAt:r.reviewed_at,...d.decrypt(r.changes_encrypted,context(client.agency_id,clientId)),review:r.review_encrypted?d.decrypt(r.review_encrypted,context(client.agency_id,clientId)):null}))};
  }
  async function submit({user,clientId,values:input,revision}) {
    const clean=validateDemographicValues(input),db=await d.db.getConnection();
    try {
      await db.beginTransaction();
      const client=await d.guardianAccess(user,clientId,db);
      const [[current]]=await db.execute(`SELECT ${keys.join(',')} FROM clients WHERE id=? AND agency_id=? FOR UPDATE`,[clientId,client.agency_id]);
      if (revision!==demographicRevision(current)) fail(409,'The details have changed. Reload and review the current information.');
      const base=values(current),proposed=Object.fromEntries(Object.entries(clean).filter(([key,value])=>value!==base[key]));
      if (!Object.keys(proposed).length) fail(400,'No changes to save.');
      const [pending]=await db.execute("SELECT id FROM guardian_demographic_requests WHERE client_id=? AND guardian_user_id=? AND status='pending'",[clientId,user.id]);
      if(pending.length) fail(409,'Your previous update is still being reviewed. Contact support to change it.');
      const [r]=await db.execute('INSERT INTO guardian_demographic_requests (agency_id,client_id,guardian_user_id,changes_encrypted) VALUES (?,?,?,?)',[client.agency_id,clientId,user.id,d.encrypt({base,proposed},context(client.agency_id,clientId))]);
      // No identities or proposed values in the queue summary; details require chart access.
      await db.execute(`INSERT INTO support_tickets (school_organization_id,client_id,created_by_user_id,agency_id,subject,question,status) VALUES (?,?,?,?,?,?,'open')`,[client.organization_id || client.agency_id,clientId,user.id,client.agency_id,'Client details need review',`Review demographic update #${r.insertId} in the client chart’s Demographics panel. Compare current and submitted values before applying changes.`]);
      await db.commit(); return {id:r.insertId,status:'pending'};
    } catch(e) {await db.rollback();throw e;} finally {db.release();}
  }
  // Internal only: no public route accepts a guardian ID or revision for this
  // path. Ownership and dependent binding are loaded from the signed enrollment.
  async function enqueueFromEnrollment({clientId,submissionId,guardianUserId,values:input}) {
    const clean=validateDemographicValues(input);
    if (![clientId,submissionId,guardianUserId].every(id=>Number.isSafeInteger(Number(id))&&Number(id)>0)) fail(400,'Enrollment ownership and dependent are required.');
    const db=await d.db.getConnection();
    try {
      await db.beginTransaction();
      const [[binding]]=await db.execute(`SELECT s.id,s.guardian_user_id,c.agency_id,c.organization_id
        FROM intake_submissions s JOIN clients c ON c.id=? JOIN intake_links il ON il.id=s.intake_link_id
        WHERE s.id=? AND s.guardian_user_id=? AND s.status='submitted'
        AND (s.client_id=c.id OR EXISTS (SELECT 1 FROM intake_submission_clients sc WHERE sc.intake_submission_id=s.id AND sc.client_id=c.id))
        AND EXISTS (SELECT 1 FROM co_guardian_invites i JOIN co_guardian_invite_clients ic ON ic.invite_id=i.id
          WHERE i.accepted_user_id=s.guardian_user_id AND i.status='accepted' AND i.agency_id=c.agency_id
          AND i.public_key=il.public_key AND ic.client_id=c.id)`,[clientId,submissionId,guardianUserId]);
      if(!binding) fail(403,'The completed guardian enrollment is not linked to this dependent.');
      const [[current]]=await db.execute(`SELECT ${keys.join(',')} FROM clients WHERE id=? AND agency_id=? FOR UPDATE`,[clientId,binding.agency_id]);
      if(!current)fail(404,'Client not found.');
      const [[existing]]=await db.execute('SELECT id,status FROM guardian_demographic_requests WHERE client_id=? AND intake_submission_id=?',[clientId,submissionId]);
      if(existing){await db.commit();return {id:existing.id,status:existing.status};}
      const base=values(current),proposed=Object.fromEntries(Object.entries(clean).filter(([key,value])=>value!==base[key]));
      if(!Object.keys(proposed).length){await db.commit();return {status:'unchanged'};}
      // A portal proposal or another parent's proposal remains a separate record.
      const [r]=await db.execute('INSERT INTO guardian_demographic_requests (agency_id,client_id,guardian_user_id,intake_submission_id,changes_encrypted) VALUES (?,?,?,?,?)',
        [binding.agency_id,clientId,guardianUserId,submissionId,d.encrypt({base,proposed},context(binding.agency_id,clientId))]);
      await db.execute(`INSERT INTO support_tickets (school_organization_id,client_id,created_by_user_id,agency_id,subject,question,status) VALUES (?,?,?,?,?,?,'open')`,
        [binding.organization_id || binding.agency_id,clientId,guardianUserId,binding.agency_id,'Enrollment client details need review',`Review demographic update #${r.insertId} from enrollment ${submissionId} in the client chart’s Demographics panel. Compare current and submitted values before applying changes.`]);
      await db.commit();return {id:r.insertId,status:'pending'};
    } catch(e){await db.rollback();throw e;}finally{db.release();}
  }
  async function review({user,clientId,requestId,revision,acceptedFields=[],reason=''}) {
    if(!Array.isArray(acceptedFields)||acceptedFields.some(k=>!keys.includes(k))||!String(reason).trim()||String(reason).length>2000)fail(400,'Select the fields to apply and record a review reason.');
    const client=await d.staffAccess(user,clientId),db=await d.db.getConnection();
    try{
      await db.beginTransaction();
      const [[current]]=await db.execute(`SELECT ${keys.join(',')} FROM clients WHERE id=? AND agency_id=? FOR UPDATE`,[clientId,client.agency_id]);
      const [[request]]=await db.execute('SELECT * FROM guardian_demographic_requests WHERE id=? AND client_id=? AND agency_id=? FOR UPDATE',[requestId,clientId,client.agency_id]);
      if(!request||request.status!=='pending')fail(409,'This update has already been reviewed or is unavailable.');
      if(revision!==demographicRevision(current))fail(409,'The client record changed. Reload before making this decision.');
      const proposal=d.decrypt(request.changes_encrypted,context(client.agency_id,clientId));
      const chosen=[...new Set(acceptedFields)];
      if(chosen.some(k=>!Object.hasOwn(proposal.proposed,k)))fail(400,'Only submitted fields can be applied.');
      if(chosen.length)await db.execute(`UPDATE clients SET ${chosen.map(k=>`${k}=?`).join(',')},updated_by_user_id=?,last_activity_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?`,[...chosen.map(k=>proposal.proposed[k]||null),user.id,clientId,client.agency_id]);
      // A corrected DOB must never silently broaden age-dependent disclosure.
      if(chosen.includes('date_of_birth')) await db.execute('UPDATE guardian_clinical_grants SET review_due_date=CURRENT_DATE WHERE agency_id=? AND client_id=? AND revoked_at IS NULL',[client.agency_id,clientId]);
      const result={acceptedFields:chosen,reason:String(reason).trim(),previous:values(current)};
      await db.execute("UPDATE guardian_demographic_requests SET status='reviewed',reviewed_by_user_id=?,reviewed_at=NOW(),review_encrypted=? WHERE id=?",[user.id,d.encrypt(result,context(client.agency_id,clientId)),requestId]);
      await db.commit();return {status:'reviewed'};
    }catch(e){await db.rollback();throw e;}finally{db.release();}
  }
  return {read,submit,review,enqueueFromEnrollment};
}
export const guardianDemographics=createGuardianDemographicsService();
