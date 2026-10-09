/** Owner-requested, unsigned draft changes only. No notices or payroll activation. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {SUPERVISOR_COMPENSATION_HANDBOOK} from '../content/roleCompensationTerms.js';
import {EXEMPT_DRAFT_KIND} from '../services/compensationAmendmentExemption.service.js';
const parse=v=>typeof v==='string'?JSON.parse(v):v,apply=process.argv.includes('--apply');
const db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id=2 AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind')) IN ('provider_update_compensation',?) FOR UPDATE",[EXEMPT_DRAFT_KIND]);
 const [supervisors]=await db.execute("SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=2 AND ua.is_active=1 LEFT JOIN supervisor_assignments s ON s.supervisor_id=u.id AND s.agency_id=2 AND s.supervisor_type='clinical' WHERE u.is_active=1 AND (s.id IS NOT NULL OR u.title LIKE '%Supervisor%')");
 const [rates]=await db.execute("SELECT * FROM payroll_rates WHERE agency_id=2 AND user_id IN (465,477) AND service_code IN ('Individual Meeting','Admin Time','Outreach') AND (effective_start IS NULL OR effective_start<='2026-10-10') AND (effective_end IS NULL OR effective_end>='2026-10-10') ORDER BY effective_start DESC,id DESC");
 const [sections]=await db.execute("SELECT s.* FROM workplace_handbook_sections s JOIN workplace_handbook_versions v ON v.id=s.version_id WHERE v.agency_id=2 AND v.is_draft=1 AND s.slug='timekeeping-support-and-overtime' FOR UPDATE");
 const [entries]=await db.execute("SELECT e.* FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.agency_id=2 AND d.status='draft' AND e.subject='Actual time, support activities and corrections' FOR UPDATE");
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw Error('Backup path required');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({drafts,sections,entries},null,2),{flag:'wx',mode:0o600});}
 const report=[];
 for(const row of drafts){const data=parse(row.token_values_json),uid=Number(row.candidate_user_id);let html;
  if(uid===496){data.draftKind=EXEMPT_DRAFT_KIND;data.exemptionReason='Salaried employee; owner confirmed no compensation amendment is required.';data.exemptedAt=new Date().toISOString();html=row.rendered_html;}
  else{const roles={...data.roleCompensation};if(supervisors.some(s=>s.id===uid)&&data.employee.employmentType!=='salaried')roles.supervisor={hourlyRate:65,groupMultiplier:1.5,noteReviewMultiplier:.5,noteReviewBasis:'actual_other_provider_note_review_hours',sickLeaveBasis:'clinical_service_rate',source:'Owner confirmation October 9, 2026'};
   if([465,477].includes(uid)){const get=code=>{const r=rates.find(r=>r.user_id===uid&&r.service_code===code);if(!(Number(r?.rate_amount)>0))throw Error(`Missing role rate for ${uid}/${code}`);return Number(r.rate_amount)};
    roles[uid===465?'cpa':'mentor']={meetingRate:get('Individual Meeting'),adminRate:get('Admin Time'),...(uid===477?{outreachRate:get('Outreach')}:{}),source:'Existing individual payroll rates, captured October 9, 2026'};}
   data.roleCompensation=roles;html=renderAmendment(data);
  }
  if(apply)await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(data),html,row.id]);
  if(Object.keys(data.roleCompensation||{}).length||uid===496)report.push({id:uid,name:data.employee.name,roles:data.roleCompensation,exempt:uid===496});
  if(process.env.AMENDMENT_REVIEW_DIR&&[465,477,525,528].includes(uid))fs.writeFileSync(`${process.env.AMENDMENT_REVIEW_DIR}/${data.employee.name.replace(/[^a-zA-Z0-9]+/g,'-')}-amendment.html`,`<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;max-width:1200px;margin:30px auto;padding:20px;color:#173346}table{border-collapse:collapse;width:100%}th,td{padding:10px;border:1px solid #ccd6df;text-align:left}</style>${html}`,{mode:0o600});
 }
 const marker='<!-- supervisor-compensation-october-2026 -->';
 for(const row of sections){const body=row.body_html.split(marker)[0]+marker+SUPERVISOR_COMPENSATION_HANDBOOK;if(apply)await db.execute('UPDATE workplace_handbook_sections SET body_html=? WHERE id=?',[body,row.id]);}
 for(const row of entries){const body=row.changed_content.split(marker)[0]+marker+SUPERVISOR_COMPENSATION_HANDBOOK;if(apply)await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=? WHERE id=?',[body,row.id]);}
 if(apply)await db.commit();else await db.rollback();console.log(JSON.stringify({mode:apply?'saved':'dry-run',changes:report,notificationsSent:0,payrollActivated:false}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
