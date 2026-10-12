// Agency-owned copies of this versioned starter never overwrite existing clauses.
import { ITSCO_CONTRACT_CLAUSES, mdToHtml } from '../seeds/itscoContractClauseLibrary.js';
export const EMPLOYMENT_STARTER_VERSION='2026-10-11';
const original=key=>ITSCO_CONTRACT_CLAUSES.find(c=>c.clause_key===key);
const clause=(key,title,body_md)=>{
 const tokens=[];
 const protectedMd=body_md.replace(/\{\{[^}]+\}\}/g,token=>{tokens.push(token);return `TOKENPLACEHOLDER${tokens.length-1}END`;});
 const body_html=mdToHtml(protectedMd).replace(/TOKENPLACEHOLDER(\d+)END/g,(_,n)=>tokens[Number(n)]);
 return {clause_key:`STARTER_V1_${key}`,title,body_md,body_html};
};
export function employmentStarterClauses(payMode='hourly') {
 const copy=key=>{const c=original(key);return clause(key,c.title,c.body_md);};
 return [
 clause('INTRO','Employment Agreement',`This Employment Agreement is made on **{{EXECUTION_DATE}}** between **{{COMPANY_NAME}}** (the “Practice”), located at **{{COMPANY_ADDRESS}}**, and **{{CANDIDATE_NAME}}**, employed as **{{JOB_TITLE}}**, with a service focus of **{{SERVICE_FOCUS}}** (the “{{ROLE_LABEL}}”). The parties agree to the following terms. Services and locations are limited to those assigned by the Practice and within the individual’s qualifications and authorized scope.`),
 copy('TERM_AT_WILL'),copy('SUPERVISION'),
 clause('DUTIES','Duties and Responsibilities',`The {{ROLE_LABEL}} performs the duties of **{{JOB_TITLE}}** within documented education, training, credentials, and approved scope. **{{JOB_DESCRIPTION}}**\n\nIndividual work expectations and any additional compensated duties set out in this agreement apply to this appointment. Clinical supervision and approvals must be in place before providing services; a job assignment or training completion does not expand professional scope.`),
 clause('COMPENSATION','Compensation',payMode==='ffs'?`Compensation follows the configured fee-for-service schedule below. The Practice maintains the exclusive right to bill and collect for its services. Service compensation, indirect work, and additional assigned work must be accurately recorded in the app. All compensable work remains payable as required by law, including applicable minimum wage and overtime. Documentation and billing corrections are handled separately from payment of earned wages. Changes to individual compensation require a written agreement. Payment follows the Practice’s regular lawful payroll schedule.`:`The {{ROLE_LABEL}} is paid for direct and indirect work at the hourly rates shown below. Record all work time in the app, including required training and assigned additional duties. Overtime and applicable minimum wage requirements apply. Documentation corrections and performance concerns are handled separately from payment of earned wages. Changes to individual compensation require a written agreement. Payment follows the Practice’s regular lawful payroll schedule.`),
 clause('PAY_TABLE','Compensation Table','{{INSERT_PAY_TABLE}}'),copy('BENEFITS'),
 clause('MULTI','Assignments and Organization Access',`The employer is **{{COMPANY_NAME}}**. An assignment to another organization requires written authorization identifying the organization, duties, supervision, compensation and time attribution. This agreement does not by itself establish shared workforce status, grant access to another organization’s client records, or guarantee cross-organization work.`),
 copy('POLICIES'),copy('DISC_CONF'),
 clause('DUTY','Duty of Loyalty',`While performing assigned work, the {{ROLE_LABEL}} shall act professionally, protect confidential information and disclose activities that materially interfere with assigned duties. This provision does not create a post-employment noncompetition restriction or restrict lawful employee rights.`),
 clause('CONFLICT','Conflict of Interest',`Disclose actual or potential conflicts that could interfere with professional judgment, client care or assigned responsibilities so the Practice can address them. Confidential information may not be used for an unauthorized personal or third-party purpose.`),
 clause('CONTINUITY','Client Continuity and Referral',`On departure, coordinate documentation, coverage and appropriate referrals to support continuity of care. Respect client choice, applicable professional ethics, and legal rights to communicate about available care. This provision does not restrict a disclosure or referral protected or required by law.`),
 clause('WORKFORCE','Workforce and Professional Relationships',`Respect the Practice’s confidential workforce information and existing professional obligations. No post-employment nonsolicitation restriction is imposed by this starter. Any separately proposed restriction requires an expressly reviewed, applicable written provision.`),
 clause('LEGAL','Legal Provisions and Remedies',`Applicable law governs this agreement. Disputes should first be raised with the Practice for good-faith resolution without limiting statutory remedies. No deduction, recoupment, delay or forfeiture of earned wages is authorized contrary to applicable law. This agreement and expressly incorporated written terms contain the parties’ agreement. Changes must be recorded in writing and accepted by both parties. If a provision is unenforceable, the remaining lawful provisions remain effective. Confidentiality and other obligations that by their nature continue after employment survive termination, subject to applicable law.`),
 clause('SIGNATURE_BLOCK','Acknowledgment and Signatures',`The {{ROLE_LABEL}} acknowledges reviewing this agreement, assigned duties, compensation and individual expectations, and having an opportunity to ask questions. The workplace handbook is available as an optional prehire reference; required review and acknowledgment take place during onboarding. The offer expires on **{{EXPIRATION_DATE}}** unless extended in writing. The parties sign electronically through the portal; signatures and signing dates are recorded with the completed agreement.`)
 ];
}
export const starterReviewNotes=[
 'Agency-specific editable starter; review before activating. Existing contracts and posting assignments are unchanged.',
 'Choose hourly or fee-for-service configuration, then the agency’s actual pay category and level. No rates are copied from ITSCO.',
 'Confirm supervision, benefits, scope, work expectations, applicable law and any separately proposed restrictions. The starter is not a legal opinion.'
];
export async function installEmploymentStarter(agencyId,userId) {
 const {default:pool}=await import('../config/database.js');
 const db=await pool.getConnection();
 try{
  await db.beginTransaction();
  const [[agency]]=await db.execute('SELECT id FROM agencies WHERE id = ? FOR UPDATE',[agencyId]);
  if(!agency)throw Object.assign(new Error('Organization not found'),{status:404});
  const [existing]=await db.execute("SELECT id FROM contract_configs WHERE agency_id = ? AND slug LIKE 'plotline_starter_v1_%'",[agencyId]);
  if(existing.length){await db.commit();return {existing:true,version:EMPLOYMENT_STARTER_VERSION};}
  const [template]=await db.execute("INSERT INTO contract_templates (agency_id,name,font_family,is_active,created_by_user_id) VALUES (?,?,'Montserrat, sans-serif',1,?)",[agencyId,'Plotline employment starter · agency copy',userId]);
  for(const mode of ['hourly','ffs']){
   const clauses=employmentStarterClauses(mode).map(c=>({...c,clause_key:`${c.clause_key}_${mode.toUpperCase()}`}));
   for(const [i,c] of clauses.entries())await db.execute('INSERT INTO contract_clauses (agency_id,clause_key,title,body_html,sort_hint,is_active) VALUES (?,?,?,?,?,1)',[agencyId,c.clause_key,c.title,c.body_html,i*10]);
   await db.execute('INSERT INTO contract_configs (agency_id,name,slug,contract_template_id,pay_mode,clause_keys_json,is_active) VALUES (?,?,?,?,?,?,0)',[agencyId,`Employment starter · ${mode==='ffs'?'Fee-for-service':'Hourly'} · Review required`,`plotline_starter_v1_${mode}`,template.insertId,mode,JSON.stringify(clauses.map(c=>c.clause_key))]);
  }
  await db.commit();return {existing:false,version:EMPLOYMENT_STARTER_VERSION};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
