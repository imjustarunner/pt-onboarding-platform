/**
 * Claim.MD clearinghouse adapter (https://api.claim.md/).
 * AccountKey is required on every call. Responses are passthrough JSON/text.
 */

const CLAIM_MD_BASE = String(process.env.CLAIM_MD_API_BASE || 'https://svc.claim.md/services').replace(/\/$/, '');

async function postForm(path, fields = {}) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    body.append(k, String(v));
  }
  const resp = await fetch(`${CLAIM_MD_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
    body
  });
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response
  }
  if (!resp.ok) {
    const err = new Error(`Claim.MD request failed (HTTP ${resp.status})`);
    err.status = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
    throw err;
  }
  return json != null ? json : { raw: text };
}

/**
 * Upload a claim file (JSON/CSV/837P content as string).
 */
export async function uploadClaims({ accountKey, fileContents, filename = 'claims.json' }) {
  const body = new FormData();
  body.append('AccountKey', accountKey);
  body.append('Filename', filename);
  body.append('File', new Blob([fileContents], { type: 'application/json' }), filename);
  const response = await fetch(`${CLAIM_MD_BASE}/upload/`, { method:'POST', headers:{Accept:'application/json'}, body, signal:AbortSignal.timeout(30000) });
  if (!response.ok) throw Object.assign(new Error('Claim.MD upload failed; review submission status before retrying'), { status:502 });
  const result = await response.json();
  if (result.error || result.errors) throw Object.assign(new Error('Claim.MD rejected the upload; review the clearinghouse response'), { status:422 });
  return result;
}

/** Incremental response download — ResponseID=0 for first pull. */
export async function fetchResponses({ accountKey, responseId = '0' }) {
  return postForm('/response/', {
    AccountKey: accountKey,
    ResponseID: String(responseId)
  });
}

export async function fetchEraList({ accountKey, page = '1' }) {
  return postForm('/eralist/', {
    AccountKey: accountKey,
    Page: String(page)
  });
}

export async function requestEligibilityJson({ accountKey, payload }) {
  return postForm('/eligdata/', {
    AccountKey: accountKey,
    ...(payload && typeof payload === 'object' ? payload : {})
  });
}

/** Professional-claim fields per Claim.MD's published JSON example.
 * https://www.claim.md/ClaimMD_Professional_Claims_Example.json
 * Names are explicit legal-name fields, never guessed from card OCR.
 */
export function buildClaimMdJsonClaim(claim, lines = [], { insurance, practice = {} } = {}) {
  const primary = insurance?.primary || {}, patient = insurance?.patient || {};
  const required = { payerid:primary.payerId, ins_number:primary.memberId,
    ins_name_f:primary.subscriberFirstName, ins_name_l:primary.subscriberLastName,
    ins_dob:primary.subscriberDob, ins_sex:primary.subscriberSex,
    ins_addr_1:primary.subscriberAddressLine1, ins_city:primary.subscriberCity,
    ins_state:primary.subscriberState, ins_zip:primary.subscriberPostalCode,
    pat_name_f:patient.firstName, pat_name_l:patient.lastName, pat_dob:patient.dateOfBirth,
    pat_sex:patient.sex, pat_addr_1:patient.addressLine1, pat_city:patient.city,
    pat_state:patient.state, pat_zip:patient.postalCode,
    pat_rel:({self:'18',spouse:'01',child:'19',other:'G8'})[primary.relationshipToSubscriber],
    bill_npi:claim.billing_npi, prov_npi:claim.rendering_npi,
    bill_phone:practice.phone_number, bill_name:practice.name, bill_taxid:String(practice.tax_id || '').replace(/\D/g,''),
    bill_addr_1:practice.street_address, bill_city:practice.city, bill_state:practice.state, bill_zip:practice.postal_code };
  const missing = Object.entries(required).filter(([,v])=>!String(v || '').trim()).map(([k])=>k);
  if (insurance?.verifiedForClaims !== true) missing.push('staff-reviewed insurance and client identity');
  if (insurance?.secondary && (!insurance.secondary.payerId || !insurance.secondary.memberId || !insurance.secondary.subscriberFirstName || !insurance.secondary.subscriberLastName || !insurance.secondary.relationshipToSubscriber)) missing.push('secondary payer, member, and subscriber details');
  if (insurance?.acceptAssignment !== true && insurance?.acceptAssignment !== false) missing.push('provider accepts assignment selection');
  if (!lines.length) missing.push('service lines');
  let diagnoses = claim.diagnosis_codes_json || [];
  if (typeof diagnoses === 'string') { try { diagnoses=JSON.parse(diagnoses); } catch { diagnoses=[]; } }
  if (!Array.isArray(diagnoses) || !diagnoses.length || diagnoses.length > 12) missing.push('one to twelve diagnosis codes');
  diagnoses = Array.isArray(diagnoses) ? diagnoses.map(d=>String(typeof d==='string'?d:d?.code || d?.diagnosisCode || '').replace(/\./g,'').toUpperCase()) : [];
  if(diagnoses.some(code=>! /^[A-Z][0-9][A-Z0-9]{1,5}$/.test(code))) missing.push('valid ICD-10 diagnosis codes');
  if (!['M','F','U'].includes(patient.sex) || !['M','F','U'].includes(primary.subscriberSex)) missing.push('valid policy sex codes');
  if (missing.length) throw Object.assign(new Error(`Claim is incomplete: ${missing.join(', ')}`), {status:409});
  const date = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value || '').slice(0,10);
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  if(!validDate(patient.dateOfBirth) || !validDate(primary.subscriberDob)) throw Object.assign(new Error('Patient or subscriber birth date is invalid'),{status:409});
  const charge = lines.map(line => {
    let mods = line.modifiers_json || []; if(typeof mods==='string') {try{mods=JSON.parse(mods);}catch{mods=null;}}
    if(!Array.isArray(mods) || mods.length>4 || mods.some(mod=>! /^[A-Z0-9]{2}$/.test(mod))) throw Object.assign(new Error('Service modifiers are invalid'),{status:409});
    const fdos=date(line.service_date || claim.date_of_service);
    if (!validDate(fdos) || !/^[A-Z0-9]{5}$/.test(line.procedure_code) || !Number.isSafeInteger(Number(line.charge_cents)) || Number(line.charge_cents)<=0 || !Number.isFinite(Number(line.units)) || Number(line.units)<=0) throw Object.assign(new Error('A claim service line is incomplete'),{status:409});
    const references=String(line.diagnosis_pointers || '1').split(/[,\s]+/).map(Number);
    if(references.length>8 || references.some(p=>!Number.isInteger(p) || p<1 || p>diagnoses.length)) throw Object.assign(new Error('Service diagnosis references are invalid'),{status:409});
    const pointers=references.map(p=>String.fromCharCode(64+p)).join('');
    return {proc_code:line.procedure_code,charge:(Number(line.charge_cents)/100).toFixed(2),units:String(line.units),from_date:fdos,thru_date:fdos,place_of_service:claim.place_of_service,diag_ref:pointers,charge_record_type:'UN',...Object.fromEntries(mods.slice(0,4).map((mod,i)=>[`mod${i+1}`,mod]))};
  });
  if (!/^\d{10}$/.test(required.bill_npi) || !/^\d{10}$/.test(required.prov_npi) || !/^\d{9}$/.test(required.bill_taxid)) throw Object.assign(new Error('Billing NPI, rendering NPI, or tax ID is invalid'), {status:409});
  const secondary = insurance.secondary;
  const payload = {...required, ...(secondary ? {other_ins_number:secondary.memberId, other_ins_name_f:secondary.subscriberFirstName, other_ins_name_l:secondary.subscriberLastName, other_ins_dob:secondary.subscriberDob, other_ins_sex:secondary.subscriberSex, other_payerid:secondary.payerId, other_payer_name:secondary.insurerName, other_pat_rel:({self:'18',spouse:'01',child:'19',other:'G8'})[secondary.relationshipToSubscriber]} : {}), accept_assign:insurance.acceptAssignment ? 'Y' : 'N', bill_addr_2:practice.street_address_2 || '', remote_claimid:String(claim.id), pcn:claim.claim_number || String(claim.id),claim_form:'1500',
    payer_name:primary.insurerName,payer_order:'Primary',ins_group:primary.groupNumber || '',
    ins_addr_2:primary.subscriberAddressLine2 || '',pat_addr_2:patient.addressLine2 || '',
    bill_taxid_type:practice.tax_id_type==='ssn'?'S':'E',prov_taxonomy:claim.taxonomy_code || '',
    total_charge:(charge.reduce((sum,c)=>sum+Math.round(Number(c.charge)*100),0)/100).toFixed(2),
    ...Object.fromEntries(diagnoses.map((d,i)=>[`diag_${i+1}`,d])),charge};
  const limits={payerid:32,payer_name:64,pcn:32,pat_name_l:35,pat_name_f:25,pat_addr_1:55,pat_addr_2:55,pat_city:30,pat_state:2,pat_zip:15,ins_number:32,bill_name:32,bill_addr_1:128,bill_addr_2:128,bill_city:32,bill_state:2,bill_zip:12,bill_phone:16};
  const oversized=Object.entries(limits).filter(([field,limit])=>String(payload[field] || "").length>limit).map(([field])=>field);
  if(oversized.length)throw Object.assign(new Error(`Claim fields exceed clearinghouse limits: ${oversized.join(", ")}`),{status:409});
  return payload;
}
