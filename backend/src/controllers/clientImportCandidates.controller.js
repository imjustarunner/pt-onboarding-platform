import { hasMatchingClientBirthDate, hasMatchingClientIdentity } from '../utils/clientNameDuplicate.js';
import pool from '../config/database.js';
import { assertEnrollmentAgencyMembership } from '../services/enrollmentAgencyAccess.service.js';
import { hasTerminalClientStatus } from '../services/clientTerminationRoster.service.js';
import { beginClientChartImport } from '../services/clientChartImportProgress.service.js';
import { resolveClientImportSchool, syncClientImportSchoolSetup } from '../services/clientImportSchoolSetup.service.js';
import { requireClientChartImportAccess } from '../services/clientChartImportAccess.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

const fail = (status, message) => Object.assign(Error(message), { status });
const nameKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const day = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);
const wordsOf = value => String(value || '').trim().split(/\s+/).filter(Boolean);
const isMergeable = row => !['ARCHIVED','TERMINATED'].includes(row.status) && !row.compliance_archived_at && !hasTerminalClientStatus(row) && row.records_import_status !== 'complete';
function sameClientEvidence(row, name, dob) {
  const incomingIdentity = { full_name: name, date_of_birth: dob };
  if (!hasMatchingClientBirthDate(row, incomingIdentity)) return false;
  if (hasMatchingClientIdentity(row, incomingIdentity)) return true;
  const incoming = wordsOf(name), saved = wordsOf(row.full_name);
  // Older imports may have truncated both ends of the name. Never treat
  // different recorded middle names or a shared family name as that case.
  const isTruncated = (savedPart, incomingPart) => {
    const prefix = nameKey(savedPart), full = nameKey(incomingPart);
    return prefix.length >= 3 && prefix.length < full.length && full.startsWith(prefix);
  };
  return saved.length === 2 && incoming.length >= 2
    && isTruncated(saved[0], incoming[0]) && isTruncated(saved[1], incoming.at(-1));
}
async function agencyFor(req) {
  if (!['super_admin','admin','support'].includes(req.user?.role)) throw fail(403,'Account support access required');
  const id = Number(req.get?.('X-Agency-Id'));
  if (!Number.isSafeInteger(id) || id < 1) throw fail(400,'Choose an agency');
  await assertEnrollmentAgencyMembership(req.user,id);
  return id;
}
const importStateColumn = "JSON_UNQUOTE(JSON_EXTRACT(c.onboarding_docs_json,'$.recordsImport.status')) AS records_import_status";

/** Bounded agency-only suggestions; a shared household never merges charts or grants access. */
export async function getClientImportCandidates(req,res,next){try{
  const agencyId=await agencyFor(req);
  const text=key=>String(req.body?.[key]||'').trim().slice(0,255);
  const name=text('fullName'),dob=text('dateOfBirth'),email=text('email').toLowerCase(),phone=text('phone').replace(/\D/g,'').slice(-10),street=text('addressStreet'),zip=text('addressZip');
  const words=name.split(/\s+/).filter(Boolean),like=value=>value.replace(/[\\%_]/g,'\\$&');
  const clauses=[],values=[agencyId];
  if(name){clauses.push('LOWER(TRIM(c.full_name))=LOWER(?)');values.push(name);}
  if(words.length>1&&words[0].length>=3){clauses.push('c.full_name LIKE ?');values.push(`${like(words[0].slice(0,3))}% ${like(words.at(-1))}`);}
  if (words.length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(dob) && words.every(word => word.length >= 3)) {
    const first = like(words[0].slice(0, 3)), last = like(words.at(-1).slice(0, 3));
    clauses.push('(c.date_of_birth=? AND LOWER(TRIM(c.full_name)) LIKE LOWER(?))');
    values.push(dob, `${first}% ${last}%`);
  }
  if(street&&zip){clauses.push('(LOWER(TRIM(c.address_street))=LOWER(?) AND c.address_zip=?)');values.push(street,zip);}
  if(email){clauses.push("(LOWER(TRIM(c.email))=? OR EXISTS(SELECT 1 FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=c.id AND LOWER(TRIM(u.email))=? AND u.role IN ('client_guardian','client'))) ");values.push(email,email);}
  if(phone.length===10){clauses.push("EXISTS(SELECT 1 FROM client_contact_affiliations cca JOIN agency_contacts ac ON ac.id=cca.agency_contact_id WHERE cca.client_id=c.id AND ac.agency_id=c.agency_id AND ac.phone IN (?,?))");values.push('+1'+phone,phone);}
  if(!clauses.length)return res.set('Cache-Control','no-store').json({candidates:[]});
  const [rows]=await pool.execute(`SELECT c.id,c.full_name,c.date_of_birth,c.status,c.compliance_archived_at,s.status_key AS client_status_key,
    ${importStateColumn} FROM clients c LEFT JOIN client_statuses s ON s.id=c.client_status_id WHERE c.agency_id=? AND (${clauses.join(' OR ')}) ORDER BY LOWER(TRIM(c.full_name))=LOWER(?) DESC,c.status='ARCHIVED',c.id DESC LIMIT 25`,[...values,name]);
  const key=nameKey;
  const similarName=value=>{const parts=String(value||'').trim().split(/\s+/);return words.length>1&&parts.length>1&&key(parts[0]).slice(0,3)===key(words[0]).slice(0,3)&&key(parts.at(-1))===key(words.at(-1));};
  const candidates=rows.map(row => {
    const exactName = !!name && key(row.full_name) === key(name);
    const matchingIdentity = sameClientEvidence(row, name, dob);
    const similar = similarName(row.full_name);
    const savedDate = day(row.date_of_birth);
    let reason = 'Shared address or contact details · possible household connection';
    if (matchingIdentity) reason = exactName ? 'Same legal name and birth date' : 'Matching birth date and compatible name';
    else if (exactName || similar) reason = dob && savedDate && dob !== savedDate
      ? 'Birth dates differ · import into this chart is blocked'
      : exactName ? 'Same legal name · matching birth date required' : 'Similar first and last name';
    return { id: row.id, full_name: row.full_name, status: row.status, date_of_birth: savedDate,
      canMerge: isMergeable(row) && matchingIdentity,
      kind: exactName || similar || matchingIdentity ? 'possible_duplicate' : 'shared_household', reason };
  });
  await logAuditEvent(req,{actionType:'client_import_candidates_viewed',agencyId,targetType:'agency',targetId:agencyId,metadata:{candidateCount:candidates.length}});
  res.set('Cache-Control','no-store').json({candidates});
}catch(error){next(error);}}

/** Attach the reviewed incoming import to the existing chart. No patient or portal records are recreated. */
export async function mergeClientRecordsImport(req, res, next) {
  let db;
  try {
    const agencyId = await agencyFor(req), clientId = Number(req.params.id), actorId = Number(req.user.id);
    const { fullName, dateOfBirth, expectedName, expectedDateOfBirth, schoolOrganizationId } = req.body || {};
    if (!Number.isSafeInteger(clientId) || clientId < 1 || req.body?.confirmed !== true ||
        typeof fullName !== 'string' || !fullName.trim() || fullName.length > 255 ||
        (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth))) {
      throw fail(400,'Confirm which chart should receive the pasted records.');
    }
    db = await pool.getConnection();
    await db.beginTransaction();
    const [[client]] = await db.execute(`SELECT c.id,c.agency_id,c.full_name,c.date_of_birth,c.status,c.compliance_archived_at,c.organization_id,c.client_type,
      s.status_key AS client_status_key,${importStateColumn}
      FROM clients c JOIN agencies a ON a.id=c.agency_id LEFT JOIN client_statuses s ON s.id=c.client_status_id
      WHERE c.id=? AND c.agency_id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 FOR UPDATE`, [clientId,agencyId]);
    if (!client) throw fail(404,'This chart is unavailable in the selected agency.');
    if (!isMergeable(client)) throw fail(409,'This chart has completed records import or is inactive. Open the chart to review it.');
    if (String(client.full_name || '') !== String(expectedName || '') || day(client.date_of_birth) !== day(expectedDateOfBirth)
        || !sameClientEvidence(client, fullName, day(dateOfBirth))) {
      throw fail(409,'The chart identity no longer matches the reviewed candidate. Refresh the matches and review this client again.');
    }
    const school = await resolveClientImportSchool({clientId,agencyId,requestedSchoolId:schoolOrganizationId},db);
    if (schoolOrganizationId && !school) throw fail(400,'Choose a school linked to this agency.');
    if (school) {
      await db.execute(`INSERT INTO client_organization_assignments (client_id,organization_id,is_primary,is_active)
        VALUES (?,?,1,1) ON DUPLICATE KEY UPDATE is_primary=1,is_active=1`,[clientId,school.id]);
      await db.execute('UPDATE client_organization_assignments SET is_primary=0 WHERE client_id=? AND organization_id<>? AND is_primary=1',[clientId,school.id]);
      await db.execute("UPDATE clients SET organization_id=?, client_type='school', updated_by_user_id=? WHERE id=? AND agency_id=?",[school.id,actorId,clientId,agencyId]);
    }
    if (req.body?.manualIdentity===true) {
      await db.execute(`UPDATE clients SET full_name=?,date_of_birth=COALESCE(?,date_of_birth),updated_by_user_id=?
        WHERE id=? AND agency_id=?`,[fullName.trim(),dateOfBirth||null,actorId,clientId,agencyId]);
    }
    if (!client.records_import_status) await beginClientChartImport({clientId,agencyId},[],actorId,{db});
    await db.commit();
    await logAuditEvent(req,{actionType:'client_records_import_matched_existing',agencyId,targetType:'client',targetId:clientId,
      metadata:{schoolOrganizationId:school?.id || null}});
    res.set('Cache-Control','no-store').json({id:clientId,agency_id:agencyId,organization_id:school?.id||client.organization_id,
      client_type:school?'school':client.client_type});
  } catch(error) {
    if (db) await db.rollback();
    next(error);
  } finally { db?.release(); }
}

export async function setupClientImportSchool(req, res, next) {
  try {
    const agencyId = await agencyFor(req);
    const scope = await requireClientChartImportAccess(req.user, req.params.id, agencyId);
    const schoolSetup = await syncClientImportSchoolSetup(scope, Number(req.user.id), {preserveDefaults:req.body?.preserveDefaults===true});
    if (schoolSetup) await logAuditEvent(req, { actionType: 'client_records_import_school_setup',
      agencyId, targetType: 'client', targetId: scope.clientId, metadata: {
        schoolOrganizationId: schoolSetup.schoolOrganizationId, providerId: schoolSetup.providerId
      }
    });
    res.set('Cache-Control','no-store').json({ schoolSetup });
  } catch (error) { next(error); }
}
