import pool from '../config/database.js';
import { assertEnrollmentAgencyMembership } from '../services/enrollmentAgencyAccess.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

/** Bounded agency-only suggestions; a shared household never merges charts or grants access. */
export async function getClientImportCandidates(req,res,next){try{
  if(!['super_admin','admin','support'].includes(req.user?.role))throw Object.assign(Error('Account support access required'),{status:403});
  const agencyId=Number(req.get?.('X-Agency-Id'));
  if(!Number.isSafeInteger(agencyId)||agencyId<1)throw Object.assign(Error('Choose an agency'),{status:400});
  await assertEnrollmentAgencyMembership(req.user,agencyId);
  const text=key=>String(req.body?.[key]||'').trim().slice(0,255);
  const name=text('fullName'),dob=text('dateOfBirth'),email=text('email').toLowerCase(),phone=text('phone').replace(/\D/g,'').slice(-10),street=text('addressStreet'),zip=text('addressZip');
  const words=name.split(/\s+/).filter(Boolean),like=value=>value.replace(/[\\%_]/g,'\\$&');
  const clauses=[],values=[agencyId];
  if(name){clauses.push('LOWER(TRIM(c.full_name))=LOWER(?)');values.push(name);}
  if(words.length>1&&words[0].length>=3){clauses.push('c.full_name LIKE ?');values.push(`${like(words[0].slice(0,3))}% ${like(words.at(-1))}`);}
  if(/^\d{4}-\d{2}-\d{2}$/.test(dob)){clauses.push('c.date_of_birth=?');values.push(dob);}
  if(street&&zip){clauses.push('(LOWER(TRIM(c.address_street))=LOWER(?) AND c.address_zip=?)');values.push(street,zip);}
  if(email){clauses.push("(LOWER(TRIM(c.email))=? OR EXISTS(SELECT 1 FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=c.id AND LOWER(TRIM(u.email))=? AND u.role IN ('client_guardian','client'))) ");values.push(email,email);}
  if(phone.length===10){clauses.push("EXISTS(SELECT 1 FROM client_contact_affiliations cca JOIN agency_contacts ac ON ac.id=cca.agency_contact_id WHERE cca.client_id=c.id AND ac.agency_id=c.agency_id AND ac.phone IN (?,?))");values.push('+1'+phone,phone);}
  if(!clauses.length)return res.set('Cache-Control','no-store').json({candidates:[]});
  const [rows]=await pool.execute(`SELECT c.id,c.full_name,c.date_of_birth,c.status FROM clients c WHERE c.agency_id=? AND (${clauses.join(' OR ')}) ORDER BY c.status='ARCHIVED',c.id DESC LIMIT 25`,values);
  const key=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
  const similarName=value=>{const parts=String(value||'').trim().split(/\s+/);return words.length>1&&parts.length>1&&key(parts[0]).slice(0,3)===key(words[0]).slice(0,3)&&key(parts.at(-1))===key(words.at(-1));};
  const candidates=rows.map(row=>({...row,date_of_birth:day(row.date_of_birth),kind:similarName(row.full_name)||key(row.full_name)===key(name)||dob&&day(row.date_of_birth)===dob?'possible_duplicate':'shared_household',reason:key(row.full_name)===key(name)?'Same legal name':dob&&day(row.date_of_birth)===dob?'Same birth date':similarName(row.full_name)?'Similar first and last name':'Shared address or contact details — review possible sibling'}));
  await logAuditEvent(req,{actionType:'client_import_candidates_viewed',agencyId,targetType:'agency',targetId:agencyId,metadata:{candidateCount:candidates.length}});
  res.set('Cache-Control','no-store').json({candidates});
}catch(error){next(error);}}
