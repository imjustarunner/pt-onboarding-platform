import crypto from 'node:crypto';
import pool from '../config/database.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { decryptDemographicsPayload, encryptDemographicsPayload, isDemographicsEncryptionConfigured } from './demographicsImport.service.js';

// This module deliberately has no dependency on billing ingest, clinical records,
// client provisioning, assignment, lifecycle, receivables or notification services.
const text = value => String(value ?? '').trim();
const blank = value => value == null || text(value) === '';
const clone = value => value == null ? value : structuredClone(value);
const fieldText = value => ['string', 'number'].includes(typeof value) && text(value).length <= 255 ? text(value) : '';
const nameKey = value => {
  let name = text(value);
  if (name.includes(',')) { const [last, ...first] = name.split(','); name = `${first.join(' ')} ${last}`; }
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
};
const memberKey = value => text(value).toLowerCase().replace(/\s+/g, '');
const normalizedPhone = value => {const raw=text(value);if(/[a-z]/i.test(raw))return '';const digits=raw.replace(/\D/g,'');if(digits.length===10)return `+1${digits}`;if(digits.length===11&&digits.startsWith('1'))return `+${digits}`;return raw.startsWith('+')&&digits.length>=8&&digits.length<=15?`+${digits}`:'';};
const FIELD_LENGTHS={addressApt:64,addressCity:100,addressState:50,addressZip:20};
const fullName = value => nameKey(value).split(' ').filter(Boolean).length >= 2;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const REASONS = new Set(['invalid_date_of_birth', 'ambiguous_account_identifier', 'invalid_contact_email', 'invalid_service_date']);
const OBSERVATION_FIELDS = ['fullName','dateOfBirth','explicitMemberId','reportedAccountIdentifier','primaryPayer','secondaryPayer','groupNumber','subscriberName','sex','addressStreet','addressApt','addressCity','addressState','addressZip','contactPhone','email','reportedClaimStatus'];
const DEMOGRAPHICS = [
  ['fullName','full_name','fullName'], ['dateOfBirth','date_of_birth','dateOfBirth'],
  ['sex','gender','administrativeSex'], ['addressStreet','address_street','addressStreet'],
  ['addressApt','address_apt',null], ['addressCity','address_city','addressCity'],
  ['addressState','address_state','addressState'], ['addressZip','address_zip','addressZip'],
  ['contactPhone','contact_phone','contactPhone'], ['email','email','email']
];
const CLIENT_COLUMNS = 'id,agency_id,status,full_name,date_of_birth,gender,address_street,address_apt,address_city,address_state,address_zip,contact_phone,email,primary_insurer_name,insurance_member_id,insurance_group_number,insurance_subscriber_name,billing_insurance_payload,demographics_phi_enc';

/** Strict calendar dates, including the U.S. report format; never roll an invalid DOB forward. */
export function strictBillingProfileDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const raw = text(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/) || (() => {
    const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return us && [us[0], us[3], us[1].padStart(2,'0'), us[2].padStart(2,'0')];
  })();
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === date ? date : null;
}

/** Input is a report row whose headers were normalized by the existing payroll parser. */
export function extractBillingProfileFields(normalizedRawRow = {}) {
  const row = {};
  for (const [key, value] of Object.entries(normalizedRawRow || {})) row[text(key).toLowerCase().replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim()] = value;
  const pick = aliases => { for (const key of aliases) if (!blank(row[key])) return fieldText(row[key]); return ''; };
  const first = pick(['patient first name','client first name','first name']);
  const last = pick(['patient last name','client last name','last name']);
  const value = {
    fullName: pick(['patient name','client name','patient full name','client full name','patient','client']) || (first && last ? `${first} ${last}` : ''),
    explicitMemberId: pick(['insurance member id','insurance member number','member id','subscriber id','policy member id','medicaid id','medicaid member id']),
    // These report columns do not say whether the value is an insurer's member ID.
    reportedAccountIdentifier: pick(['patient account number or member id','patient account number','account number','patient account']),
    primaryPayer: pick(['primary payer name','primary payer','primary insurance','primary insurance name','insurance name','payer name','insurance','payer']),
    secondaryPayer: pick(['secondary payer name','secondary payer','secondary insurance','secondary insurance name']),
    groupNumber: pick(['insurance group number','policy group number','group number']),
    subscriberName: pick(['insurance subscriber name','subscriber name']),
    sex: pick(['patient sex','client sex','administrative sex','patient gender','client gender']),
    addressStreet: pick(['patient address line 1','client address line 1','patient street address','client street address','patient address','client address']),
    addressApt: pick(['patient address line 2','client address line 2','patient apartment','client apartment']),
    addressCity: pick(['patient city','client city']), addressState: pick(['patient state','client state']),
    addressZip: pick(['patient zip','patient zip code','patient postal code','client zip','client zip code','client postal code']),
    contactPhone: pick(['patient phone','client phone','patient phone number','client phone number','patient mobile phone','client mobile phone']),
    email: pick(['patient email','client email','patient email address','client email address']),
    // A payment or claim status is retained as an observation, never eligibility.
    reportedClaimStatus: pick(['claim status','insurance status','paid status','patient balance status']),
    reasonCodes: []
  };
  const dob = ['dob','date of birth','birth date','patient dob','patient date of birth','client dob','client date of birth'].map(key=>row[key]).find(value=>!blank(value));
  if (dob) { value.dateOfBirth = strictBillingProfileDate(dob); if (!value.dateOfBirth || value.dateOfBirth > new Date().toISOString().slice(0,10)) {value.dateOfBirth='';value.reasonCodes.push('invalid_date_of_birth');} }
  else value.dateOfBirth = '';
  if (value.reportedAccountIdentifier) value.reasonCodes.push('ambiguous_account_identifier');
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) { value.email = ''; value.reasonCodes.push('invalid_contact_email'); }
  const sex = ({m:'M',male:'M',f:'F',female:'F',u:'U',unknown:'U'})[text(value.sex).toLowerCase()];
  value.sex = sex || '';
  return value;
}

function sanitizeFields(input = {}) {
  const fields = Object.fromEntries(OBSERVATION_FIELDS.map(key => [key, fieldText(input[key])]));
  fields.reasonCodes = [...new Set((Array.isArray(input.reasonCodes) ? input.reasonCodes : []).filter(code => REASONS.has(code)))];
  if (fields.dateOfBirth) {
    const normalized = strictBillingProfileDate(fields.dateOfBirth);
    if (!normalized || normalized > new Date().toISOString().slice(0,10)) fields.reasonCodes.push('invalid_date_of_birth');
    fields.dateOfBirth = normalized && normalized <= new Date().toISOString().slice(0,10) ? normalized : '';
  }
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) { fields.email = ''; fields.reasonCodes.push('invalid_contact_email'); }
  fields.sex = ({m:'M',male:'M',f:'F',female:'F',u:'U',unknown:'U'})[fields.sex.toLowerCase()] || '';
  return fields;
}
function billingKey() {
  const encoded = process.env.BILLING_ENCRYPTION_KEY_BASE64 || process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  const key = Buffer.from(encoded || '', 'base64');
  return key.length === 32 ? key : null;
}
function memberHash(agencyId, memberId) {
  const key = billingKey();
  // Match the existing canonical identity hash exactly; do not invent another key ring.
  return key ? crypto.createHmac('sha256', key).update(`agency:${agencyId}|member:${text(memberId).toLowerCase()}`).digest('hex') : null;
}
function decodeClient(client, identities, assignments = new Map()) {
  let insurance = null, demographics = null, insuranceUnavailable = false, demographicsUnavailable = false;
  if (client.billing_insurance_payload) {
    try { insurance = decryptFamilyBilling(client.billing_insurance_payload, `client-insurance:${client.agency_id}:${client.id}`); }
    catch { insuranceUnavailable = true; }
  }
  if (client.demographics_phi_enc) {
    try { demographics = decryptDemographicsPayload(client.demographics_phi_enc); if (!demographics) demographicsUnavailable = true; }
    catch { demographicsUnavailable = true; }
  }
  const members = [client.insurance_member_id, insurance?.primary?.memberId, insurance?.secondary?.memberId].filter(v => !blank(v)).map(memberKey);
  return { client, insurance, demographics, insuranceUnavailable, demographicsUnavailable, providers:assignments.get(Number(client.id)) || new Set(), members: new Set(members), storedMemberHash: identities.get(Number(client.id))?.member_id_hash || null };
}
function hasMember(record, fields, agencyId) {
  if (!fields.explicitMemberId) return false;
  return record.members.has(memberKey(fields.explicitMemberId)) || !!(record.storedMemberHash && memberHash(agencyId, fields.explicitMemberId) === record.storedMemberHash);
}
function selectMatch(records, fields, agencyId, providerUserId = null) {
  if (fields.reasonCodes.includes('invalid_date_of_birth')) return {status:'conflict',reason:'invalid_date_of_birth'};
  const name = fullName(fields.fullName) ? nameKey(fields.fullName) : '';
  const dob = fields.dateOfBirth || null;
  const named = name ? records.filter(record => nameKey(record.client.full_name) === name) : [];
  const namedDob = dob ? named.filter(record => strictBillingProfileDate(record.client.date_of_birth) === dob) : [];
  let selected = null, method = null;
  if (namedDob.length === 1) { selected = namedDob[0]; method = 'exact_full_name_dob'; }
  else if (namedDob.length > 1) {
    const corroborated = namedDob.filter(record => hasMember(record,fields,agencyId));
    if (corroborated.length === 1) { selected = corroborated[0]; method = 'explicit_member_name_dob'; }
    else return {status:'ambiguous',reason:'multiple_identity_matches'};
  }
  const members = fields.explicitMemberId ? records.filter(record => hasMember(record,fields,agencyId)) : [];
  if (!selected && members.length) {
    const corroborated = members.filter(record => (name && nameKey(record.client.full_name) === name) || (dob && strictBillingProfileDate(record.client.date_of_birth) === dob));
    if (corroborated.length > 1) return {status:'ambiguous',reason:'multiple_identity_matches'};
    if (corroborated.length === 1) { selected = corroborated[0]; method = 'explicit_member_corroborated'; }
    else return {status:'conflict',reason:'member_identity_not_corroborated'};
  }
  if (!selected) {
    if (name && dob && named.some(record => strictBillingProfileDate(record.client.date_of_birth) && strictBillingProfileDate(record.client.date_of_birth) !== dob)) return {status:'conflict',reason:'date_of_birth_conflict'};
    // A unique full legal name plus a current, tenant-scoped provider assignment
    // is an explicit fallback for exports that omit DOB. First names never qualify.
    if (name && named.length === 1 && Number(providerUserId) > 0 && named[0].providers.has(Number(providerUserId))) {
      selected=named[0];method='exact_full_name_assigned_provider';
    } else {
      return {status:named.length>1?'ambiguous':'unmatched',reason:named.length>1?'multiple_identity_matches':!name && !dob?'insufficient_identity':'no_unique_existing_client'};
    }
  }
  const knownDobs = [selected.client.date_of_birth,selected.demographics?.dateOfBirth,selected.insurance?.patient?.dateOfBirth].map(strictBillingProfileDate).filter(Boolean);
  if (dob && knownDobs.some(existingDob => dob !== existingDob)) return {status:'conflict',reason:'date_of_birth_conflict'};
  if(fields.explicitMemberId && selected.insuranceUnavailable && !selected.members.size && !selected.storedMemberHash)return {status:'conflict',reason:'member_identifier_unverifiable'};
  if (fields.explicitMemberId && (selected.members.size || selected.storedMemberHash) && !hasMember(selected,fields,agencyId)) {
    return {status:'conflict',reason:selected.storedMemberHash && !selected.members.size && !billingKey() ? 'member_identifier_unverifiable' : 'member_id_conflict'};
  }
  return {status:'matched',record:selected,method};
}

function mergeProfile(record, fields, {dryRun=false}={}) {
  const {client,insurance,demographics} = record;
  const patch = {}, changedFields = [], reasonCodes = [];
  const mergedDemographics = clone(demographics) || Object.fromEntries(DEMOGRAPHICS.filter(([, , key])=>key).map(([, column,key])=>[key,client[column] instanceof Date ? strictBillingProfileDate(client[column]) : client[column] || '']));
  let demographicChange = false;
  for (const [field, column, envelopeKey] of DEMOGRAPHICS) {
    let value = fields[field]; if (blank(value)) continue;
    if(field==='contactPhone'){value=normalizedPhone(value);if(!value){reasonCodes.push('invalid_contact_phone');continue;}}
    if(FIELD_LENGTHS[field]&&value.length>FIELD_LENGTHS[field]){reasonCodes.push(`${field.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())}_length_exceeded`);continue;}
    if (record.demographicsUnavailable) { reasonCodes.push('existing_demographics_unavailable'); continue; }
    const existing = client[column], protectedValue = envelopeKey ? demographics?.[envelopeKey] : null;
    if (!blank(existing) || !blank(protectedValue)) {
      const comparison = field === 'dateOfBirth' ? strictBillingProfileDate(existing || protectedValue) : field === 'fullName' ? nameKey(existing || protectedValue) : text(existing || protectedValue).toLowerCase();
      const reported = field === 'fullName' ? nameKey(value) : field === 'dateOfBirth' ? value : text(value).toLowerCase();
      if (comparison !== reported) reasonCodes.push(`${field.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())}_conflict_retained`);
      continue;
    }
    patch[column] = value; changedFields.push(column); demographicChange = true;
    if (envelopeKey) mergedDemographics[envelopeKey] = value;
  }
  if (demographicChange && !dryRun && isDemographicsEncryptionConfigured()) patch.demographics_phi_enc = encryptDemographicsPayload(mergedDemographics);
  const coverageProtected = record.insuranceUnavailable || insurance?.verifiedForClaims === true || !!insurance?.confirmedBy || !!insurance?.profileId || !!Object.keys(insurance?.coverageSources || {}).length;
  if (coverageProtected) {
    if (fields.primaryPayer || fields.secondaryPayer || fields.explicitMemberId) reasonCodes.push('existing_insurance_preserved');
    // Fill the operational display only from its existing confirmed policy, not a report.
    if (blank(client.primary_insurer_name) && !blank(insurance?.primary?.insurerName)) { patch.primary_insurer_name = insurance.primary.insurerName; changedFields.push('primary_insurer_name'); }
  } else {
    const merged = clone(insurance) || {acceptAssignment:null,patient:{},verifiedForClaims:false,primary:{},secondary:null,profileId:null,coverageSources:null,confirmedBy:null};
    merged.primary ||= {};
    let insuranceChange = false;
    if (blank(merged.primary.insurerName) && !blank(client.primary_insurer_name) && (fields.primaryPayer || fields.explicitMemberId || fields.groupNumber || fields.subscriberName)) { merged.primary.insurerName=client.primary_insurer_name;insuranceChange=true;changedFields.push('insurance.primary.insurerName'); }
    if (fields.primaryPayer) {
      if (blank(merged.primary.insurerName)) { merged.primary.insurerName = fields.primaryPayer; insuranceChange = true; changedFields.push('insurance.primary.insurerName'); }
      else if (nameKey(merged.primary.insurerName) !== nameKey(fields.primaryPayer)) reasonCodes.push('primary_payer_conflict_retained');
    }
    const samePrimary = fields.primaryPayer && nameKey(fields.primaryPayer) === nameKey(merged.primary.insurerName);
    for (const [field,key] of [['explicitMemberId','memberId'],['groupNumber','groupNumber'],['subscriberName','subscriberName']]) {
      if (!fields[field]) continue;
      if (!samePrimary) { reasonCodes.push('policy_detail_requires_payer_confirmation'); continue; }
      if (blank(merged.primary[key])) { merged.primary[key] = fields[field]; insuranceChange = true; changedFields.push(`insurance.primary.${key}`); }
      else if (text(merged.primary[key]).toLowerCase() !== text(fields[field]).toLowerCase()) reasonCodes.push('policy_detail_conflict_retained');
    }
    if (fields.secondaryPayer) {
      if (merged.secondary && blank(merged.secondary.insurerName)) { merged.secondary.insurerName = fields.secondaryPayer; insuranceChange = true; changedFields.push('insurance.secondary.insurerName'); }
      else if (!insurance && !merged.secondary) { merged.secondary = {insurerName:fields.secondaryPayer}; insuranceChange = true; changedFields.push('insurance.secondary.insurerName'); }
      else if (nameKey(merged.secondary?.insurerName) !== nameKey(fields.secondaryPayer)) reasonCodes.push('secondary_payer_reported_for_review');
    }
    const authoritativePayer = merged.primary.insurerName || client.primary_insurer_name;
    if (blank(client.primary_insurer_name) && !blank(authoritativePayer)) { patch.primary_insurer_name = authoritativePayer; changedFields.push('primary_insurer_name'); }
    else if (fields.primaryPayer && !blank(client.primary_insurer_name) && nameKey(client.primary_insurer_name) !== nameKey(fields.primaryPayer)) reasonCodes.push('primary_payer_display_conflict_retained');
    if (insuranceChange) { merged.updatedAt = new Date().toISOString(); patch.billing_insurance_payload = dryRun ? null : encryptFamilyBilling(merged,`client-insurance:${client.agency_id}:${client.id}`); }
  }
  return {patch,changedFields:[...new Set(changedFields)],reasonCodes:[...new Set(reasonCodes)]};
}

/** Only allowlisted, PHI-free outcomes are returned. A provided db must belong
 * to an active transaction whose owner rolls back if this helper throws. */
export async function enrichExistingClientsFromBillingRows({agencyId,payrollImportId,rows,actorId=null,dryRun=true,db:providedDb=null}) {
  const aid=Number(agencyId),importId=Number(payrollImportId);
  if (!Number.isInteger(aid) || aid <= 0 || (!dryRun && (!Number.isInteger(importId) || importId <= 0)) || !Array.isArray(rows)) throw fail('A valid agency, payroll import and row list are required.');
  const db=providedDb || (dryRun ? pool : await pool.getConnection());
  const ownsTransaction=!dryRun && !providedDb;
  const outcomes=[], changedClients=new Set();let observationsSaved=0;
  try {
    if (ownsTransaction) await db.beginTransaction();
    if (!dryRun) {
      const [[source]]=await db.execute('SELECT id FROM payroll_imports WHERE id=? AND agency_id=? FOR UPDATE',[importId,aid]);
      if (!source) throw fail('Payroll import does not belong to this agency.',403);
    }
    const [clients]=await db.execute(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE agency_id=? AND status<>'ARCHIVED' ORDER BY id`,[aid]);
    const [identityRows]=await db.execute('SELECT client_id,member_id_hash FROM client_billing_identities WHERE agency_id=?',[aid]);
    const identities=new Map(identityRows.map(row=>[Number(row.client_id),row]));
    const assignments=new Map();
    if (rows.some(row=>Number(row?.providerUserId)>0)) {
      const [assignmentRows]=await db.execute('SELECT cpa.client_id,cpa.provider_user_id FROM client_provider_assignments cpa JOIN clients c ON c.id=cpa.client_id WHERE c.agency_id=? AND cpa.is_active=1',[aid]);
      for (const assignment of assignmentRows) {const id=Number(assignment.client_id);if(!assignments.has(id))assignments.set(id,new Set());assignments.get(id).add(Number(assignment.provider_user_id));}
    }
    const records=clients.map(client=>decodeClient(client,identities,assignments));
    // Prefer the latest dated observation, and never pick arbitrarily between
    // conflicting values on the same date. Keep all source evidence encrypted.
    const facts=new Map();
    for(const source of rows){const fields=sanitizeFields(source?.profileFields),match=selectMatch(records,fields,aid,source?.providerUserId);if(match.status!=='matched')continue;
      const id=Number(match.record.client.id);if(!facts.has(id))facts.set(id,new Map());const clientFacts=facts.get(id),date=strictBillingProfileDate(source.serviceDate)||'';
      for(const field of OBSERVATION_FIELDS.filter(key=>!['fullName','reportedAccountIdentifier','reportedClaimStatus'].includes(key))){if(!fields[field])continue;let fact=clientFacts.get(field);
        if(!fact||date>fact.date&&field!=='dateOfBirth'){fact={date,values:new Set()};clientFacts.set(field,fact);}if(field==='dateOfBirth'||date===fact.date)fact.values.add(field==='explicitMemberId'?memberKey(fields[field]):text(fields[field]).toLowerCase());
      }
    }
    const orderedRows=[...rows].sort((a,b)=>(strictBillingProfileDate(b?.serviceDate)||'').localeCompare(strictBillingProfileDate(a?.serviceDate)||'')||Number(a?.sourceRowNumber)-Number(b?.sourceRowNumber));
    for (const row of orderedRows) {
      const ordinal=Number(row?.sourceRowNumber),fingerprint=text(row?.rowFingerprint),fields=sanitizeFields(row?.profileFields);
      const outcome={sourceRowNumber:ordinal,clientId:null,matchStatus:'unmatched',matchMethod:null,changedFields:[],reasonCodes:[...fields.reasonCodes]};
      if (!Number.isInteger(ordinal) || ordinal <= 0 || !/^[a-f0-9]{64}$/i.test(fingerprint)) { outcome.matchStatus='invalid';outcome.reasonCodes.push('invalid_source_reference');outcomes.push(outcome);continue; }
      if (!dryRun) {
        // Replacing a payroll import may legitimately change a source ordinal.
        // Keep each corrected revision's evidence and deduplicate only an exact retry.
        const [[previous]]=await db.execute('SELECT client_id,row_fingerprint,match_status,match_method,reason_codes_json FROM billing_client_profile_observations WHERE agency_id=? AND payroll_import_id=? AND source_row_number=? AND row_fingerprint=? FOR UPDATE',[aid,importId,ordinal,fingerprint]);
        if (previous) {
          outcome.clientId=previous.client_id ? Number(previous.client_id) : null;
          outcome.matchStatus='already_processed';outcome.matchMethod=previous.match_method;
          const previousReasons=typeof previous.reason_codes_json==='string'?JSON.parse(previous.reason_codes_json):previous.reason_codes_json;
          outcome.reasonCodes=[...new Set([...outcome.reasonCodes,...(Array.isArray(previousReasons)?previousReasons.filter(code=>typeof code==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(code)):[])])];
          outcomes.push(outcome);continue;
        }
      }
      let selected=selectMatch(records,fields,aid,row.providerUserId),merge=null;
      if (selected.status==='matched') {
        if (!dryRun) {
          const [[current]]=await db.execute(`SELECT ${CLIENT_COLUMNS} FROM clients WHERE id=? AND agency_id=? FOR UPDATE`,[selected.record.client.id,aid]);
          if(current && selected.method==='exact_full_name_assigned_provider') {
            const [active]=await db.execute('SELECT client_id,provider_user_id FROM client_provider_assignments WHERE client_id=? AND provider_user_id=? AND is_active=1 FOR UPDATE',[current.id,Number(row.providerUserId)]);
            if(!active.length)assignments.set(Number(current.id),new Set());
          }
          selected=current ? selectMatch([decodeClient(current,identities,assignments)],fields,aid,row.providerUserId) : {status:'conflict',reason:'client_changed_during_import'};
        }
        if (selected.status==='matched') {
          outcome.clientId=Number(selected.record.client.id);outcome.matchMethod=selected.method;
          const safeFields={...fields};const clientFacts=facts.get(outcome.clientId),date=strictBillingProfileDate(row.serviceDate)||'';
          for(const [field,fact] of clientFacts||[]){if(fact.values.size>1){safeFields[field]='';outcome.reasonCodes.push(`conflicting_report_${field.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())}`);}else if(field!=='dateOfBirth'&&date<fact.date){safeFields[field]='';}}
          merge=mergeProfile(selected.record,safeFields,{dryRun});outcome.changedFields=merge.changedFields;outcome.reasonCodes.push(...merge.reasonCodes);
          if (merge.changedFields.length) {
            changedClients.add(outcome.clientId);
            if (!dryRun) {const columns=Object.keys(merge.patch);await db.execute(`UPDATE clients SET ${columns.map(column=>`${column}=?`).join(',')} WHERE id=? AND agency_id=?`,[...columns.map(column=>merge.patch[column]),outcome.clientId,aid]);Object.assign(selected.record.client,merge.patch);}
          }
        }
      }
      outcome.matchStatus=selected.status;if(selected.reason)outcome.reasonCodes.push(selected.reason);outcome.reasonCodes=[...new Set(outcome.reasonCodes)];
      if (!dryRun) {
        const serviceDate=strictBillingProfileDate(row.serviceDate);
        if (row.serviceDate && !serviceDate) outcome.reasonCodes.push('invalid_service_date');
        const payload=encryptFamilyBilling({fields,serviceDate,importedAt:new Date().toISOString()},`billing-client-profile-observation:${aid}:${importId}:${ordinal}:${fingerprint}`);
        await db.execute(`INSERT INTO billing_client_profile_observations (agency_id,payroll_import_id,source_row_number,row_fingerprint,client_id,source_service_date,match_status,match_method,observed_fields_payload,changed_fields_json,reason_codes_json,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[aid,importId,ordinal,fingerprint,outcome.clientId,serviceDate,outcome.matchStatus,outcome.matchMethod,payload,JSON.stringify(outcome.changedFields),JSON.stringify(outcome.reasonCodes),actorId ? Number(actorId) : null]);observationsSaved++;
      }
      outcomes.push(outcome);
    }
    if (ownsTransaction) await db.commit();
    outcomes.sort((a,b)=>a.sourceRowNumber-b.sourceRowNumber);
    return {rows:outcomes,counts:{totalRows:outcomes.length,matchedRows:outcomes.filter(row=>row.matchStatus==='matched').length,unmatchedRows:outcomes.filter(row=>row.matchStatus==='unmatched').length,ambiguousRows:outcomes.filter(row=>row.matchStatus==='ambiguous').length,conflictRows:outcomes.filter(row=>row.matchStatus==='conflict').length,invalidRows:outcomes.filter(row=>row.matchStatus==='invalid').length,alreadyProcessedRows:outcomes.filter(row=>row.matchStatus==='already_processed').length,clientsWithChanges:changedClients.size,observationsSaved},dryRun:!!dryRun};
  } catch (error) {
    if (ownsTransaction) await db.rollback();
    if (error?.status && [400,403].includes(error.status)) throw error;
    // Driver errors can include field values. Do not expose those through payroll logs/responses.
    throw Object.assign(new Error('Client profile enrichment could not be completed.'),{status:500,code:'BILLING_PROFILE_ENRICHMENT_FAILED'});
  } finally {if(ownsTransaction)db.release();}
}
