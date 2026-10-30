import {employmentCategoryLevelTerms,applyEmploymentPayTerms} from '../content/employmentCategoryLevelTerms.js';
import { applyEmploymentHandbookCompensation } from '../content/employmentHandbookCompensationTerms.js';
import { handbookTenant } from './handbookTenant.js';
import { employmentStarterClauses } from './employmentStarter.service.js';
import { contractRoleLabel, jobContractExpectations, expectationsToTokens, renderAdditionalExpectations } from '../utils/contractExpectations.js';
// Sample merge values are used only by the administrator's read-only packet preview.
// Never persist these values to a candidate, contract configuration, or payroll record.
import { findContractPlaceholders } from '../utils/contractPlaceholders.js';

export function rehearsalContractTokens({job, defaults, sourceHtml = '', category, level, now = new Date()}) {
  const date = days => { const d = new Date(now); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0,10); };
  const office = defaults.offices?.find(o=>/windchime/i.test(`${o.name} ${o.address}`)) || defaults.offices?.[0];
  const credential = String(job.education_level || 'Bachelor’s degree');
  const tokens = {
    COMPANY_NAME:defaults.agency?.name || 'ITSCO', COMPANY_ADDRESS:defaults.agency?.address || '437 Windchime Place, Colorado Springs, CO 80919',
    EMPLOYEE_NAME:'Alex Demo',EMPLOYEE_FULL_NAME:'Alex Demo',CANDIDATE_NAME:'Alex Demo',EMPLOYEE_FIRST_NAME:'Alex',EMPLOYEE_LAST_NAME:'Demo',
    EMPLOYEE_EMAIL:'alex.demo@example.test',EMPLOYEE_PHONE:'719-555-0100',EMPLOYEE_ADDRESS:'100 Example Way, Colorado Springs, CO 80919',
    JOB_TITLE:job.title,ROLE_LABEL:contractRoleLabel({jobTitle:job.title,roleType:job.role_type,credential:job.education_level}),JOB_DESCRIPTION:job.description_text || job.title,JOB_DESCRIPTION_ID:String(job.id),ROLE_TYPE:job.role_type || 'provider',
    SERVICE_FOCUS:'School-based mental health services within assigned education, training and approved scope',
    CREDENTIAL:credential,DEGREE:credential,LICENSE_TYPE:credential,LICENSE_INFO:credential,LICENSE_NUMBER:'TEST-000001',
    EXECUTION_DATE:date(0),EFFECTIVE_DATE:date(0),START_DATE:date(14),EXPIRATION_DATE:date(14),END_DATE:date(365),INTERNSHIP_END_DATE:date(180),
    ORIGINAL_AGREEMENT_DATE:date(0),LICENSURE_DEADLINE:date(365),
    SUPERVISOR_NAME:'Taylor Morgan (sample supervisor)',SUPERVISOR:'Taylor Morgan (sample supervisor)',INCLUDE_SUPERVISION:'1',IS_SUPERVISOR:'0',
    MIN_DAYS_PER_WEEK:'3',MIN_HOURS:'20',MIN_HOURS_PER_WEEK:'20',HOURS_PER_WEEK:'20',SCHEDULE:'Monday, Wednesday and Friday; 20 hours per week',
    UNIVERSITY:'Example University',UNIVERSITY_NAME:'Example University',ADJUSTMENT_REASON:'Initial sample appointment',
    ASSIGNED_OFFICE_NAME:office?.name || 'Windchime office',ASSIGNED_OFFICE_ADDRESS:office?.address || '437 Windchime Place, Colorado Springs, CO 80919',
    ASSIGNED_OFFICE_ID:String(office?.id || 'sample-office'),ASSIGNED_OFFICE_SOURCE:'rehearsal',
    LICENSING_BOARD:'Colorado Department of Regulatory Agencies',COMPENSATION_CATEGORY:String(category),COMPENSATION_LEVEL:String(level),
    COMPANY_SIGNER_NAME:'Jordan Example',COMPANY_SIGNER_TITLE:'People Operations',EMPLOYEE_SIGNATURE:'Alex Demo — practice signature pending',
    COMPANY_SIGNATURE:'Jordan Example — sample authorized representative',
    ...expectationsToTokens(jobContractExpectations(job)),CONTRACT_EXPECTATIONS:jobContractExpectations(job)
  };
  // Imported templates can contain compact aliases, or agency-specific extra fields.
  for(const [key,value] of Object.entries(tokens))tokens[key.replaceAll('_','')]=value;
  for(const key of findContractPlaceholders(sourceHtml)) {
    if(tokens[key] != null || ['INSERT_PAY_TABLE','DIRECT_RATE','INDIRECT_RATE','RATE_CONFIG_KEY'].includes(key))continue;
    const compact=key.replaceAll('_','');
    tokens[key] = /DATE|DEADLINE/.test(compact) ? date(14)
      : /EMAIL/.test(compact) ? 'alex.demo@example.test'
      : /PHONE/.test(compact) ? '719-555-0100'
      : /ADDRESS/.test(compact) ? tokens.EMPLOYEE_ADDRESS
      : /NAME|SIGNER/.test(compact) ? 'Alex Demo'
      : /HOURS/.test(compact) ? '20'
      : /DAYS/.test(compact) ? '3'
      : 'Not applicable to this sample hire';
  }
  return tokens;
}

export function markRehearsalContract(html) {
  return html.replace(/<body\b[^>]*>/i, '$&<aside style="padding:12px;border:2px solid #12583f;background:#edf5ee;font:14px sans-serif"><strong>ITSCO · Sample employment agreement</strong><br>Alex Demo is a fictional applicant. Dates, schedule and supervisor are seeded examples. Practice only — not an employment offer.</aside>');
}

// A complete test agreement is still available when a posting's live contract
// configuration is incomplete. Pay still requires configured category/level rates.
export function sampleRehearsalContract({job,defaults,category,level,pay,now,payMode='hourly',reason='',expectations={}}) {
 let clauses=employmentStarterClauses(payMode);
 const t=rehearsalContractTokens({job,defaults,category,level,now,sourceHtml:clauses.map(c=>c.body_html).join('\n')});
 Object.assign(t,expectationsToTokens(expectations));
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let incomplete='';
 if(payMode!=='none') {
  try { clauses=applyEmploymentPayTerms(clauses,employmentCategoryLevelTerms({row:{...pay,category,level},tokens:t,agencyName:defaults.agency?.name,agencySlug:defaults.agency?.slug})); }
  catch(e){incomplete=e.message;}
 }
 if(handbookTenant(defaults.agency)) clauses=applyEmploymentHandbookCompensation(clauses);
 const table=payMode==='none'?'':`<p>Current category/level compensation requires configuration: ${esc(incomplete)}. No legacy or invented rates are substituted.</p>`;
 let extra='';
 try{extra=renderAdditionalExpectations(expectations,pay||{});}catch(e){extra=`<p>Additional-duty compensation needs configuration: ${esc(e.message)}</p>`;}
 const body=clauses.map(c=>`<section><h2>${esc(c.title)}</h2>${c.body_html.replace(/\{\{\s*(\w+)\s*\}\}/g,(_,key)=>key==='INSERT_PAY_TABLE'?table:esc(t[key]??''))}</section>`).join('');
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Comfortaa,Arial,sans-serif;max-width:900px;margin:auto;padding:32px;color:#203b32;font-size:15px;line-height:1.6}h1,h2{color:#12583f}h2{margin-top:2em;font-size:20px}table{border-collapse:collapse;width:100%}td,th{padding:12px;border:1px solid #c8d8ce;text-align:left}</style></head><body><h1>${esc(t.COMPANY_NAME)} · Employment agreement</h1><p>Complete starter example · Category ${esc(category)}, Level ${esc(level)} · ${esc(payMode)}</p><p>The selected live agreement could not be rendered: ${esc(reason || 'configuration incomplete')}. This example demonstrates the complete template structure; it is not the selected live agreement.</p>${body}${extra}</body></html>`;
 return {html:markRehearsalContract(html),unresolvedTokens:incomplete?['CURRENT_CATEGORY_LEVEL_RATES']:[],seeded:true,sampleContract:true,sampleReason:reason,clauseManifest:clauses.map(c=>({key:c.clause_key,title:c.title,included:true,reason:'Complete starter example; live configuration incomplete'}))};
}
