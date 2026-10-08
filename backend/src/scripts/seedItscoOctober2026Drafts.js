/** Explicit, idempotent draft-only seed. Run with --apply; never publishes/sends/changes payroll. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import pool from '../config/database.js';
import {SEED_KEY, EFFECTIVE_DATE, SERVICE_POLICY_VERSION, commonAmendmentClauses, renderAmendment, amendmentIssues, handbookSections} from '../content/itscoOctober2026Drafts.js';
import {octoberAdminTopics} from '../content/itscoOctober2026AdminUpdate.js';

const aid=2, author=501, pushId=2;
const plain=value=>JSON.parse(JSON.stringify(value));
const read=async(sql,params=[])=>plain((await pool.execute(sql,params))[0]);

async function main() {
 const agency=(await read('SELECT id,name,new_pay_system_enabled,pto_policy_json FROM agencies WHERE id=?',[aid]))[0];
 if(agency?.name!=='ITSCO')throw new Error('Expected ITSCO agency 2.');
 const staff=await read(`SELECT u.id,u.first_name,u.last_name,u.title,u.credential,u.status,u.is_active,u.employment_type,
  u.hired_at,u.provider_start_date,u.termination_date,u.terminated_at,ua.is_active AS agency_active
  FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
  WHERE u.role NOT IN ('school_staff','client_guardian','kiosk','super_admin') AND COALESCE(u.is_demo,0)=0
  AND COALESCE(u.created_via_dev_fill,0)=0 ORDER BY u.first_name,u.id`,[aid]);
 const rates=await read('SELECT * FROM payroll_pay_system_rates WHERE agency_id=? ORDER BY category,level',[aid]);
 const assignments=await read('SELECT * FROM payroll_user_compensation_levels WHERE agency_id=?',[aid]);
 const pto=await read('SELECT user_id,employment_type,pto_pay_rate FROM payroll_pto_accounts WHERE agency_id=?',[aid]);
 const levels=await read('SELECT category,level,label FROM payroll_compensation_levels WHERE agency_id=?',[aid]);
 const rules=await read('SELECT * FROM payroll_service_code_rules WHERE agency_id=? ORDER BY service_code',[aid]);
 const schools=await read(`SELECT a.id,a.name,p.district_name,acs.created_at AS linked_at FROM agencies a
  JOIN agency_schools acs ON acs.school_organization_id=a.id LEFT JOIN school_profiles p ON p.school_organization_id=a.id
  WHERE acs.agency_id=? AND acs.is_active=1 AND a.is_active=1`,[aid]);
 const eligible=staff.filter(u=>u.status==='ACTIVE_EMPLOYEE'&&Number(u.agency_active)===1&&Number(u.is_active)===1);
 const drafts=eligible.map(u=>{
  const a=assignments.find(a=>a.user_id===u.id),r=rates.find(r=>r.category===a?.category&&r.level===a?.level),account=pto.find(p=>p.user_id===u.id);
  const data={compensationPolicyVersion:SERVICE_POLICY_VERSION,draftKind:'provider_update_compensation',seedKey:SEED_KEY,pushId,effectiveDate:EFFECTIVE_DATE,leaveChoice:'sick',example:[82,480].includes(u.id),
   employee:{userId:u.id,name:`${u.first_name} ${u.last_name}`,title:u.title||'',credential:u.credential||'',employmentType:u.employment_type||account?.employment_type||null,originalAgreementDate:''},
   schedule:{category:a?.category??null,level:a?.level??null,levelDescription:levels.find(l=>l.category===a?.category&&l.level===a?.level)?.label||'',
    creditRate:r?.credit_rate??null,hcodeRate:r?.hcode_rate??null,indirectRate:r?.indirect_rate??null,supportRate:r?.support_activity_rate??null,
    ptoRate:account?.pto_pay_rate??null,autoIndirectMinutes:12,leaveAdminRatio:0.2,creditRateProbation:r?.credit_rate_probation??r?.credit_rate??null,hcodeRateProbation:r?.hcode_rate_probation??r?.hcode_rate??null,indirectRateProbation:r?.indirect_rate??null,supportRateProbation:r?.support_activity_rate??null},
   commonClausesHtml:commonAmendmentClauses('sick'),additionalTerms:'',
   source:{capturedAt:new Date().toISOString(),assignment:a||null,rateProfile:r||null,ptoRate:account?.pto_pay_rate??null,
    notice:'Saved matrix values are draft inputs, not a finding that these rates are already effective. Missing values are not inferred.'}};
  return data;
 });
 const sections=handbookSections({leaveChoice:'sick',rates,rules});
 const topics=octoberAdminTopics({staff,schools});
 const summary={agencyId:aid,effectiveDate:EFFECTIVE_DATE,employeeDrafts:drafts.length,examples:drafts.filter(d=>d.example).map(d=>d.employee.name),handbookSections:sections.length,adminTopics:topics.length,newPaySystemCurrentlyEnabled:!!agency.new_pay_system_enabled};
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({...summary,mode:'dry-run'}));return;}
 const db=await pool.getConnection();
 try {
  await db.beginTransaction();
  const [lock]=await db.execute('SELECT id,status FROM provider_update_pushes WHERE id=? AND agency_id=? FOR UPDATE',[pushId,aid]);
  if(lock[0]?.status!=='draft')throw new Error('The October provider update must still be a draft.');
  let [updates]=await db.execute('SELECT id,status FROM admin_updates WHERE agency_id=? AND title=?',[aid,'ITSCO · October 2026']);
  let updateId=updates[0]?.id;
  if(updates[0]&&updates[0].status!=='draft')throw new Error('Seeded admin update was released; refusing to modify it.');
  if(!updateId){
   const [ins]=await db.execute(`INSERT INTO admin_updates
    (agency_id,created_by_user_id,title,subtitle,greeting,intro_html,featured_enabled,featured_title,featured_body,
     support_enabled,support_title,support_body,footer_tagline,staffing_since,departures_since,public_token,delivery_mode,push_splash,status)
    VALUES (?,?,?,?,?,?,1,?,?,1,?,?,?,?,?,?,'html',0,'draft')`,
    [aid,author,'ITSCO · October 2026','People, schools, your work tools and the next chapter.','Hello team,',
     'Here is our October roundup, bringing together changes since March and the next steps ahead. Please use the Now and Coming soon guidance in each section, and complete the remaining steps in this same Provider Update invitation.',
     'Your provider review, in one place','Review your profile, availability, supervision, communication choices and individual documents. Our planned TherapyNotes transition is Thanksgiving weekend.',
     'Questions or something missing?','Use the app’s support channel or your supervisor. We will help with access, corrections and transition questions.',
     'ITSCO · Clear information. Connected care.','2026-04-01','2026-04-01',crypto.randomBytes(24).toString('hex')]);
   updateId=ins.insertId;
  }
  for(const [i,t] of topics.entries()){
   const [[found]]=await db.execute('SELECT id FROM admin_update_topics WHERE update_id=? AND topic_key=? LIMIT 1',[updateId,t.key]);
   if(!found)await db.execute(`INSERT INTO admin_update_topics (update_id,topic_key,enabled,title,description,icon_key,color,sort_order,body_html,is_builtin)
    VALUES (?,?,1,?,'',?,?,?, ?,0)`,[updateId,t.key,t.title,t.icon,i%2?'#39745a':'#35647b',i,t.body]);
  }
  let [[doc]]=await db.execute('SELECT * FROM workplace_handbook_documents WHERE agency_id=? FOR UPDATE',[aid]);
  if(!doc){const [ins]=await db.execute("INSERT INTO workplace_handbook_documents (agency_id,title) VALUES (?,'ITSCO Workplace Handbook')",[aid]);doc={id:ins.insertId};}
  let [[version]]=await db.execute('SELECT * FROM workplace_handbook_versions WHERE document_id=? AND is_draft=1 ORDER BY version_number DESC LIMIT 1',[doc.id]);
  if(!version){
   const [[max]]=await db.execute('SELECT COALESCE(MAX(version_number),0)+1 AS next FROM workplace_handbook_versions WHERE document_id=?',[doc.id]);
   const [ins]=await db.execute('INSERT INTO workplace_handbook_versions(document_id,agency_id,version_number,is_draft,changelog) VALUES (?,?,?,1,?)',[doc.id,aid,max.next,'October 2026 proposed compensation and digital-workplace changes']);version={id:ins.insertId};
   if(doc.published_version_id)await db.execute(`INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html)
    SELECT ?,agency_id,sort_order,slug,title,body_html FROM workplace_handbook_sections WHERE version_id=?`,[version.id,doc.published_version_id]);
  }
  for(const [i,s] of sections.entries()){
   const [[exists]]=await db.execute('SELECT id FROM workplace_handbook_sections WHERE version_id=? AND slug=?',[version.id,s.slug]);
   if(!exists)await db.execute('INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html) VALUES (?,?,?,?,?,?)',[version.id,aid,100+i,s.slug,s.title,s.bodyHtml]);
  }
  let [[digest]]=await db.execute('SELECT id FROM workplace_handbook_digests WHERE agency_id=? AND title=?',[aid,'October 2026 · Compensation and digital workplace changes']);
  if(!digest){const [ins]=await db.execute(`INSERT INTO workplace_handbook_digests(agency_id,title,period_label,admin_update_id,provider_update_push_id,status,notes)
   VALUES (?,?,'October 2026',?,?,'draft',?)`,[aid,'October 2026 · Compensation and digital workplace changes',updateId,pushId,
   'Draft seeded from saved app records and owner instructions. No full prior handbook or March newsletter was stored in this app. Verify departures whose dates may reflect account cleanup, regional details for three new schools, and exact deployment readiness. Published content and payroll remain unchanged.']);digest={id:ins.insertId};}
  for(const [i,s] of sections.entries()){
   const [[exists]]=await db.execute('SELECT id FROM workplace_handbook_digest_entries WHERE digest_id=? AND subject=?',[digest.id,s.title]);
   if(!exists)await db.execute('INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content) VALUES (?,?,?,?,?,?)',
    [digest.id,aid,i,s.title,'Align handbook language with the new individual amendment and verified app workflows. Proposed effective date October 10, 2026; review before publication.',s.bodyHtml]);
  }
  const clauseKey='OCT26_COMPENSATION_AMENDMENT';
  const [[clause]]=await db.execute('SELECT id FROM contract_clauses WHERE agency_id=? AND clause_key=?',[aid,clauseKey]);
  if(!clause)await db.execute('INSERT INTO contract_clauses(agency_id,clause_key,title,body_html,sort_hint,is_active,created_by_user_id) VALUES (?,?,?,?,900,0,?)',[aid,clauseKey,'October 2026 compensation amendment — common clauses (draft)',commonAmendmentClauses('sick'),author]);
  let created=0;
  for(const data of drafts){
   const [[exists]]=await db.execute(`SELECT id FROM contract_generations WHERE agency_id=? AND candidate_user_id=? AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.seedKey'))=? LIMIT 1`,[aid,data.employee.userId,SEED_KEY]);
   if(exists)continue;
   await db.execute(`INSERT INTO contract_generations(agency_id,candidate_user_id,token_values_json,rendered_html,created_by_user_id) VALUES (?,?,?,?,?)`,[aid,data.employee.userId,JSON.stringify(data),renderAmendment(data),author]);created++;
  }
  // Attach only to the existing unsent October update and its read-only review copy.
  await db.execute('UPDATE provider_update_pushes SET attached_admin_update_id=? WHERE agency_id=? AND id IN (1,2) AND status=\'draft\' AND attached_admin_update_id IS NULL',[updateId,aid]);
  await db.commit();
  const result={...summary,mode:'applied-drafts-only',createdEmployeeDrafts:created,adminUpdateId:updateId,handbookVersionId:version.id,handbookDigestId:digest.id,signatureTasksCreated:0,messagesSent:0,payrollChanged:false};
  const outputArg=process.argv.find(a=>a.startsWith('--report='));
  if(outputArg)fs.writeFileSync(outputArg.slice(9),JSON.stringify({result,review:drafts.map(d=>({userId:d.employee.userId,name:d.employee.name,issues:amendmentIssues(d)}))},null,2),{mode:0o600});
  console.log(JSON.stringify(result));
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
