// Original errors belong only in encrypted, client-scoped evidence, never on an
// exception that could be serialized or logged by middleware.
const protectedEvidence=new WeakMap();
const meaningful=value=>Array.isArray(value)?value.some(meaningful):value&&typeof value==='object'?Object.values(value).some(meaningful):typeof value==='string'?!!value.trim():!!value;
export function claimMdSystemErrors(body) {
 return [body?.error,body?.errors,body?.result?.error,body?.result?.errors].flatMap(v=>Array.isArray(v)?v:v?[v]:[]).filter(meaningful);
}
const decodeXml=value=>String(value).replace(/&(?:lt|gt|quot|apos|amp|#\d+|#x[\da-f]+);/gi,entity=>{
 const names={'&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&amp;':'&'};
 if(names[entity])return names[entity];
 const code=Number.parseInt(entity.slice(entity[2]?.toLowerCase()==='x'?3:2,-1),entity[2]?.toLowerCase()==='x'?16:10);
 return Number.isInteger(code)&&code>0&&code<=0x10ffff?String.fromCodePoint(code):entity;
});
// Read error attributes only; never parse DTDs, expand external entities, or
// reinterpret an XML benefit response as confirmed JSON eligibility.
function xmlErrors(text) {
 const errors=[];
 for(const match of String(text||'').slice(0,65536).matchAll(/<error\b([^>]{0,16384})\/?>(?:([^<]{0,16384})<\/error>)?/gi)) {
  const row={};
  for(const attr of match[1].matchAll(/\b(error_code|error_mesg|message|fields?)\s*=\s*(["'])(.*?)\2/gi))row[attr[1].toLowerCase()]=decodeXml(attr[3]);
  if(!row.error_mesg&&!row.message&&match[2]?.trim())row.message=decodeXml(match[2].trim());
  if(meaningful(row))errors.push(row);
 }
 return errors;
}
function redact(value,secrets) {
 let result=String(value??'');
 for(const secret of secrets.filter(v=>typeof v==='string'&&v.length)) {
  for(const variant of new Set([secret,encodeURIComponent(secret),JSON.stringify(secret).slice(1,-1)]))result=result.replaceAll(variant,'[redacted]');
 }
 return result.replace(/\b(?:AccountKey|api[_ -]?key|authorization|password|secret|access[_ -]?token)\b\s*[:=]\s*["']?[^\s<>"'&,;]+/gi,'[credential redacted]').slice(0,4000);
}
export function takeClaimMdFailureEvidence(error) {
 const evidence=protectedEvidence.get(error);protectedEvidence.delete(error);return evidence;
}
export function claimMdFailure({httpStatus,body,rawText,secretValues=[],invalidResponse=false,timeout=false,network=false}={}) {
 const rows=claimMdSystemErrors(body);
 if(!rows.length&&typeof rawText==='string')rows.push(...xmlErrors(rawText));
 const codes=[...new Set(rows.map(v=>String(v?.error_code ?? v?.code ?? '')).filter(v=>/^\d{1,6}$/.test(v)))];
 const text=rows.map(v=>typeof v==='string'?v:String(v?.error_mesg ?? v?.message ?? v?.error ?? '')).join(' ').toLowerCase();
 let code='CLAIM_MD_REQUEST_REJECTED',message='Claim.MD did not complete this eligibility request. Review its saved error details in verification history; coverage remains unverified.',status=502;
 if(timeout){code='CLAIM_MD_TIMEOUT';status=504;message='Claim.MD or the payer did not respond in time. Coverage is unverified. Review this request before sending another paid check.';}
 else if(network){code='CLAIM_MD_UNAVAILABLE';status=503;message='The app could not reach Claim.MD. Coverage is unverified. Review this request before trying again.';}
 else if([401,403].includes(httpStatus)||/account.?key|api.?key|authentication|unauthori[sz]ed|not authori[sz]ed|access denied|invalid account|account.*(?:disabled|inactive)/.test(text)){code='CLAIM_MD_ACCOUNT_SETUP';status=503;message='Claim.MD did not authorize the account connection. Billing setup needs attention; this does not mean the client is uninsured.';}
 else if(httpStatus===429){code='CLAIM_MD_RATE_LIMITED';status=503;message='Claim.MD is limiting requests. Wait before checking again; coverage remains unverified.';}
 else if(/enroll|register.*provider|provider.*register/.test(text)){code='CLAIM_MD_PAYER_ENROLLMENT';status=409;message='Claim.MD reports that this payer needs eligibility setup for the selected billing provider. Review that payer and billing NPI in Billing setup.';}
 else if(/eligibility.*(?:disabled|not enabled|not available|not supported)|payer.*(?:not supported|invalid|not found)/.test(text)){code='CLAIM_MD_PAYER_UNAVAILABLE';status=409;message='Claim.MD reports that this payer route is unavailable for eligibility. Confirm the eligibility payer route in Billing setup.';}
 else if(httpStatus===400||httpStatus===422||/required|missing|invalid.*(?:npi|tax|date|dob|field)|(?:npi|tax).*invalid/.test(text)){code='CLAIM_MD_REQUEST_DETAILS';status=422;message='Claim.MD rejected the request details. Review the saved member identity, eligibility payer, and selected billing office’s NPI and tax ID.';}
 else if(invalidResponse&&!rows.length){code='CLAIM_MD_INVALID_RESPONSE';message='Claim.MD returned a response the app could not read as eligibility data. Coverage remains unverified. Review the saved response format before sending another paid check.';}
 const failure=Object.assign(new Error(message),{status,code,upstreamStatus:Number.isInteger(httpStatus)?httpStatus:undefined,upstreamCodes:codes});
 if(body!==undefined||rawText!==undefined) {
  const responseFormat=body&&typeof body==='object'?'json':!String(rawText||'').trim()?'empty':/^\s*(?:<!doctype\s+html|<html\b)/i.test(rawText)?'html':/^\s*</.test(rawText)?'xml':'text';
  const errors=rows.slice(0,20).map(row=>typeof row==='object'?{
   ...(row.error_code??row.code?{code:redact(row.error_code??row.code,secretValues)}:{}),
   message:redact(row.error_mesg??row.message??row.error??'No error explanation was returned.',secretValues),
   ...(row.field??row.fields?{fields:redact(row.field??row.fields,secretValues)}:{})
  }:{message:redact(row,secretValues)});
  protectedEvidence.set(failure,{responseFormat,errors});
 }
 return failure;
}

export function eligibilityFailure(error,stage='sending') {
 if(stage==='sending'&&/^CLAIM_MD_[A-Z_]+$/.test(error?.code||''))return error;
 if(stage==='sending'&&['TimeoutError','AbortError'].includes(error?.name))return claimMdFailure({timeout:true});
 if(stage==='sending'&&(error instanceof TypeError||/^E(?:CONN|AI_|NET|HOST)/.test(error?.code||'')))return claimMdFailure({network:true});
 return Object.assign(new Error(stage==='sending'?'The eligibility check failed before a usable response was recorded. Coverage remains unverified; billing can investigate this check.':'The payer request finished, but the app could not save its response. Billing must investigate this check before sending another paid request.'),{status:503,code:stage==='sending'?'ELIGIBILITY_CHECK_FAILED':'ELIGIBILITY_RESPONSE_STORAGE'});
}
