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
    JOB_TITLE:job.title,ROLE_LABEL:job.title,JOB_DESCRIPTION:job.description_text || job.title,JOB_DESCRIPTION_ID:String(job.id),ROLE_TYPE:job.role_type || 'provider',
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
    COMPANY_SIGNATURE:'Jordan Example — sample authorized representative'
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
// configuration is incomplete. Its terms and fallback rates are explicitly examples.
export function sampleRehearsalContract({job,defaults,category,level,pay,now}) {
 const t=rehearsalContractTokens({job,defaults,category,level,now});
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const rate=(value,fallback)=>`$${Number(Number.isFinite(Number(value))&&Number(value)>0?value:fallback).toFixed(2)}`;
 const direct=rate(pay?.direct_rate,30),indirect=rate(pay?.indirect_rate,18);
 const fields=[['Employee','Alex Demo'],['Email',t.EMPLOYEE_EMAIL],['Address',t.EMPLOYEE_ADDRESS],['Position',job.title],['Start date',t.START_DATE],['Office',t.ASSIGNED_OFFICE_ADDRESS],['Supervisor',t.SUPERVISOR_NAME],['Schedule',t.SCHEDULE],['Pay category / level',`${category} / ${level}`]];
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Comfortaa,Arial,sans-serif;max-width:760px;margin:auto;padding:24px;color:#163f32;line-height:1.7}h1,h2{color:#12583f}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #c8d8ce;text-align:left}p{white-space:pre-wrap}</style></head><body><h1>${esc(t.COMPANY_NAME)} — Employment agreement</h1><p>Prepared ${esc(t.EXECUTION_DATE)} for Alex Demo. This fully populated sample supports testing when the live posting’s agreement is not yet configured.</p><table>${fields.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table><h2>1. Appointment and responsibilities</h2><p>Alex Demo accepts the sample position of ${esc(job.title)}. The job description presented in this packet identifies the duties for the position.</p><p>${esc(job.description_text||job.title)}</p><h2>2. Sample compensation</h2><p>Category ${esc(category)}, Level ${esc(level)}. Direct hourly rate: ${direct}. Indirect hourly rate: ${indirect}. These are rehearsal terms; any missing configured rate is replaced with an example rate for testing. This sample does not set compensation for a real hire.</p><h2>3. Work schedule and reporting</h2><p>The sample schedule is Monday, Wednesday and Friday, totaling 20 hours per week, beginning ${esc(t.START_DATE)}. Alex reports to Taylor Morgan, the fictional supervisor for this exercise.</p><h2>4. Scope and supervision</h2><p>Assigned services must remain within documented education, training and authorized scope. Required supervision and approvals must be in place before services begin. Completion of onboarding does not itself authorize independent clinical practice.</p><h2>5. Workplace policies</h2><p>Alex will review the ITSCO workplace handbook, complete assigned onboarding learning, and record work and required training time in the app. Policy acknowledgments are completed in their corresponding portal steps.</p><h2>6. Confidentiality and records</h2><p>Client and workplace information must be handled through the agency’s authorized systems and access controls. Only fictional information is used in this rehearsal.</p><h2>7. Acceptance</h2><p>Employee: Alex Demo\nCompany representative: Jordan Example, People Operations\nPrepared date: ${esc(t.EXECUTION_DATE)}\nEmployee signature: captured in the portal below.\nCompany signature: Jordan Example (fictional example).</p></body></html>`;
 return {html:markRehearsalContract(html),unresolvedTokens:[],seeded:true,sampleContract:true};
}
