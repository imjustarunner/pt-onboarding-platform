// Vendor messages can contain submitted identifiers. Classify them in memory;
// only fixed explanations and numeric vendor codes cross this boundary.
export function claimMdFailure({httpStatus,body,timeout=false,network=false}={}) {
 const rows=[body?.error,body?.errors].flatMap(v=>Array.isArray(v)?v:v?[v]:[]);
 const codes=[...new Set(rows.map(v=>String(v?.error_code ?? v?.code ?? '')).filter(v=>/^\d{1,6}$/.test(v)))];
 const text=rows.map(v=>typeof v==='string'?v:String(v?.error_mesg ?? v?.message ?? v?.error ?? '')).join(' ').toLowerCase();
 let code='CLAIM_MD_REQUEST_REJECTED',message='Claim.MD did not accept this eligibility request. Billing should review the clearinghouse response and account setup.',status=502;
 if(timeout){code='CLAIM_MD_TIMEOUT';status=504;message='Claim.MD or the payer did not respond in time. Coverage is unverified. Review this request before sending another paid check.';}
 else if(network){code='CLAIM_MD_UNAVAILABLE';status=503;message='The app could not reach Claim.MD. Coverage is unverified. Review this request before trying again.';}
 else if([401,403].includes(httpStatus)||/account.?key|api.?key|authentication|unauthori[sz]ed|invalid account|account.*(?:disabled|inactive)/.test(text)){code='CLAIM_MD_ACCOUNT_SETUP';status=503;message='Claim.MD did not authorize the account connection. Billing setup needs attention; this does not mean the client is uninsured.';}
 else if(httpStatus===429){code='CLAIM_MD_RATE_LIMITED';status=503;message='Claim.MD is limiting requests. Wait before checking again; coverage remains unverified.';}
 else if(/enroll|register.*provider|provider.*register/.test(text)){code='CLAIM_MD_PAYER_ENROLLMENT';status=409;message='Claim.MD reports that this payer needs eligibility setup for the selected billing provider. Review that payer and billing NPI in Billing setup.';}
 else if(/eligibility.*(?:disabled|not enabled|not available|not supported)|payer.*(?:not supported|invalid|not found)/.test(text)){code='CLAIM_MD_PAYER_UNAVAILABLE';status=409;message='Claim.MD reports that this payer route is unavailable for eligibility. Confirm the eligibility payer route in Billing setup.';}
 else if(httpStatus===400||httpStatus===422||/required|missing|invalid.*(?:npi|tax|date|dob|field)|(?:npi|tax).*invalid/.test(text)){code='CLAIM_MD_REQUEST_DETAILS';status=422;message='Claim.MD rejected the request details. Review the saved member identity, eligibility payer, and selected billing office’s NPI and tax ID.';}
 return Object.assign(new Error(message),{status,code,upstreamStatus:Number.isInteger(httpStatus)?httpStatus:undefined,upstreamCodes:codes});
}

export function eligibilityFailure(error,stage='sending') {
 if(stage==='sending'&&/^CLAIM_MD_[A-Z_]+$/.test(error?.code||''))return error;
 if(stage==='sending'&&['TimeoutError','AbortError'].includes(error?.name))return claimMdFailure({timeout:true});
 if(stage==='sending'&&(error instanceof TypeError||/^E(?:CONN|AI_|NET|HOST)/.test(error?.code||'')))return claimMdFailure({network:true});
 return Object.assign(new Error(stage==='sending'?'The eligibility check failed before a usable response was recorded. Coverage remains unverified; billing can investigate this check.':'The payer request finished, but the app could not save its response. Billing must investigate this check before sending another paid request.'),{status:503,code:stage==='sending'?'ELIGIBILITY_CHECK_FAILED':'ELIGIBILITY_RESPONSE_STORAGE'});
}
