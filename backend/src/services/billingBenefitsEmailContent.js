import {escapePortalHtml as e} from './portalEmailBranding.service.js';
import {portalActionHtml,clientEmailLabel} from './clientPortalEmailContent.js';
import {hasMedicaidCoverage} from '../utils/insurancePaymentPolicy.js';
const list=v=>Array.isArray(v)?v:v?[v]:[];
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v/100);
const numeric=(value,multiplier)=>{if(value===null||value===undefined||typeof value==='boolean'||String(value).trim()==='')return null;const n=Number(value)*multiplier;return Number.isSafeInteger(Math.round(n))&&n>=0&&Math.abs(n-Math.round(n))<0.00001?Math.round(n):null;};
const normalized=v=>String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
/** Strict Claim.MD 271 adapter. Missing, mixed-network, family-level, conditional,
 * or conflicting benefits are held, never interpreted as zero-dollar benefits. */
export function automaticBenefitFacts({insurance,result,serviceDate,now=new Date()}) {
  const reasons=[];if(hasMedicaidCoverage(insurance))reasons.push('Medicaid-protected coverage');
  if(insurance?.secondary)reasons.push('Secondary coverage needs coordination');
  const records=list(result?.elig||result?.result?.elig),record=records.length===1?records[0]:null;
  if(!record||list(record.error).length)reasons.push('Payer response needs review');
  const policy=insurance?.primary;
  const requestedPayer=normalized(policy?.eligibilityPayerId||policy?.payerId);
  if(!requestedPayer||requestedPayer!==normalized(record?.payerid||record?.payer_id))reasons.push('Payer response does not match the requested payer');
  if(!policy?.memberId||!record?.ins_number||normalized(policy.memberId)!==normalized(record.ins_number)
    ||!policy.subscriberFirstName||normalized(policy.subscriberFirstName)!==normalized(record?.ins_name_f)
    ||!policy.subscriberLastName||normalized(policy.subscriberLastName)!==normalized(record?.ins_name_l)
    ||!policy.subscriberDob||normalized(policy.subscriberDob)!==normalized(record?.ins_dob))reasons.push('Payer identity could not be matched');
  if(policy?.relationshipToSubscriber!=='self'){
    const p=insurance?.patient;
    if(!p?.firstName||normalized(p.firstName)!==normalized(record?.pat_name_f)||!p.lastName||normalized(p.lastName)!==normalized(record?.pat_name_l)||!p.dateOfBirth||normalized(p.dateOfBirth)!==normalized(record?.pat_dob))reasons.push('Dependent identity could not be matched');
  }
  const day=String(serviceDate||'').slice(0,10),age=now-new Date(`${day}T00:00:00Z`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(age)||age< -86400000||age>7*86400000)reasons.push('Benefits date is not current');
  const benefits=list(record?.benefit);
  if(!benefits.some(b=>String(b.benefit_code)==='30'&&String(b.benefit_coverage_code)==='1')||benefits.some(b=>['6','7','8','R'].includes(String(b.benefit_coverage_code))||['PRP','SEP','TTP'].includes(String(b.entity_code))))reasons.push('Active coverage or other-insurance findings need review');
  const specific=benefits.filter(b=>String(b.benefit_code)==='MH'&&b.inplan_network==='Y'&&b.benefit_level_code==='IND');
  const value=(code,period,field,multiplier)=>{
    const rows=specific.filter(b=>String(b.benefit_coverage_code)===code&&String(b.benefit_period_code)===period);
    if(!rows.length||rows.some(b=>String(b.benefit_notes||'').trim()))return null;
    const values=rows.map(b=>numeric(b[field],multiplier));return values.every(v=>v!==null&&v===values[0])?values[0]:null;
  };
  const facts={copayCents:value('B','27','benefit_amount',100),coinsuranceBasisPoints:value('A','27','benefit_percent',10000),deductibleCents:value('C','23','benefit_amount',100),deductibleRemainingCents:value('C','29','benefit_amount',100),serviceDate:day,reference:String(record?.eligid||'')};
  for(const key of ['copayCents','coinsuranceBasisPoints','deductibleCents','deductibleRemainingCents'])if(facts[key]===null)reasons.push(`${key} is missing or ambiguous`);
  if(facts.coinsuranceBasisPoints>10000||facts.deductibleRemainingCents>facts.deductibleCents)reasons.push('Payer amounts are inconsistent');
  if(!facts.reference)reasons.push('Payer reference is missing');
  return {ready:reasons.length===0,reasons,facts};
}
export function buildBillingBenefitsEmail({firstName,agencyName,client,facts,url,billingEmail,paymentReady=false,authorizationReady=false,school=false,providerCopied=false}) {
  const subject=`${agencyName}: your insurance and billing update`;
  const rows=[['Copay reported per visit',money(facts.copayCents)],['Coinsurance reported',`${facts.coinsuranceBasisPoints/100}%`],['Annual individual deductible',money(facts.deductibleCents)],['Deductible remaining as of verification',money(facts.deductibleRemainingCents)]];
  const intro=`We have an insurance update for ${clientEmailLabel(client)} based on the payer’s response dated ${facts.serviceDate}. These are reported in-network mental-health benefits, not a guarantee of payment or the final amount you owe.`;
  const setup=[!authorizationReady?'Please review and sign your payment authorization in Billing.':'Your payment authorization is already on file.',!paymentReady?'Please add or update your payment card securely in the portal. Cards from the previous system are not transferred.':'Your payment method is on file.'].join(' ');
  const policy='Our billing team handles payments so your provider can focus on care. Please address verified balances promptly or contact billing to discuss options. Unresolved balances may require a billing and clinical review of continued scheduling, with notice and a continuity-of-care plan where required. Services are not automatically stopped by this email.';
  const autopay='If you explicitly authorize automatic copays, an eligible verified copay may be charged after your provider confirms the session occurred or signs the completed note. Saving a card alone does not authorize automatic charges. Coinsurance, deductible amounts and any permitted missed-appointment fees require their own verified basis and applicable authorization.';
  const disclaimer='Benefits can change and claims may be processed differently. Copay, coinsurance and deductible figures should not simply be added together; billing will confirm which apply. Your portal shows verified balances and any cost estimate assigned for review.';
  const schoolText='Your agency provides services at school. Insurance coverage and any verified patient responsibility follow your plan; the school location alone does not determine the cost.';
  return {subject,linkUrl:url,text:`Hi ${firstName||'there'},\n\n${intro}\n\n${rows.map(r=>r.join(': ')).join('\n')}\n\n${setup}\n\nReview billing: ${url}\n\n${disclaimer}\n\n${autopay}\n\n${policy}\n\n${school?schoolText+'\n\n':''}Questions or discrepancies? Reply to ${billingEmail}.${providerCopied?' Your assigned provider and billing team are copied for coordination.':''}`,html:`<p>Hi ${e(firstName||'there')},</p><h2>Your insurance and billing update</h2><p>${e(intro)}</p><table role="presentation" style="width:100%;border-collapse:collapse">${rows.map(([k,v])=>`<tr><td style="padding:12px;border-bottom:1px solid #dde5ee">${e(k)}</td><td style="padding:12px;border-bottom:1px solid #dde5ee;font-weight:bold;white-space:nowrap;text-align:right;width:95px">${e(v)}</td></tr>`).join('')}</table><p>${e(disclaimer)}</p><p>${e(setup)}</p>${portalActionHtml('Review billing and next steps',url)}<p>${e(autopay)}</p><p>${e(policy)}</p>${school?`<p>${e(schoolText)}</p>`:''}<p>Questions or discrepancies? Reply to <a href="mailto:${e(billingEmail)}">${e(billingEmail)}</a>.</p>${providerCopied?'<p style="font-size:13px">Your assigned provider and billing team are copied for coordination.</p>':''}`};
}
