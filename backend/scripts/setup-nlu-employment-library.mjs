import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {employmentStarterClauses,EMPLOYMENT_STARTER_VERSION,starterReviewNotes} from '../src/services/employmentStarter.service.js';

process.env.SKIP_DB_CONNECT='1';
dotenv.config({path:new URL('../.env',import.meta.url),quiet:true});
const args=process.argv.slice(2);
const mode=args[0] || 'plan';
if(!['plan','install','preview'].includes(mode))throw new Error('Choose plan, install or preview.');
const selector=args.find(arg=>arg.startsWith('--agency='));
const agencyKey=selector?.slice('--agency='.length) || 'nlu';
const targets={nlu:{id:6,name:'Next Level Up, LLC'},tisi:{id:377,name:'The Inner Strength Institute'}};
const target=targets[agencyKey];
if(!target || (mode==='install'&&!selector))throw new Error('Explicitly choose --agency=nlu or --agency=tisi before installing.');
const output=path.resolve('artifacts/nlu-policy-2026-11-12');
fs.mkdirSync(output,{recursive:true,mode:0o700});
const write=(name,value)=>fs.writeFileSync(path.join(output,name),typeof value==='string'?value:JSON.stringify(value,null,2),{mode:0o600});
const bundle={agencyId:target.id,template:{name:'Plotline employment starter · agency copy',isActive:true},version:EMPLOYMENT_STARTER_VERSION,reviewNotes:starterReviewNotes,configs:['hourly','ffs'].map(payMode=>({name:`Employment starter · ${payMode==='ffs'?'Fee-for-service':'Hourly'} · Review required`,slug:`plotline_starter_v1_${payMode}`,payMode,isActive:false,clauses:employmentStarterClauses(payMode).map((clause,index)=>({...clause,clause_key:`${clause.clause_key}_${payMode.toUpperCase()}`,sortHint:index*10}))}))};
const reviewSha=createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,connectTimeout:8000});
let pool;
try{
 await db.query('START TRANSACTION READ ONLY');
 const [[agency]]=await db.query('SELECT id,name,slug FROM agencies WHERE id=?',[target.id]);
 if(agency?.slug!==agencyKey)throw new Error('The requested agency does not match its whitelisted agency ID.');
 const snapshot={agency};
 for(const table of ['contract_templates','contract_configs','contract_clauses']){const [rows]=await db.query('SELECT * FROM '+table+' WHERE agency_id=? ORDER BY id',[target.id]);snapshot[table]=rows;}
 await db.rollback();
 if(mode==='plan'){
  write(`${agencyKey}-employment-library-before.json`,snapshot);
  write(`${agencyKey}-employment-library-plan.json`,{reviewSha,bundle});
  const paragraphs=bundle.configs.map(config=>`<section><h2>${config.name}</h2><p>Slug: ${config.slug}; initially inactive; ${config.clauses.length} agency-owned clauses.</p>${config.clauses.map(clause=>`<article><h3>${clause.clause_key} · ${clause.title}</h3>${clause.body_html}</article>`).join('')}</section>`).join('');
  write(`${agencyKey}-employment-library-plan.html`,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${target.name} employment library installation review</title><style>body{font:15px/1.6 system-ui;max-width:1000px;margin:30px auto;padding:20px;color:#263345}section{margin:40px 0}article{padding:15px;border:1px solid #dce5e5;margin:15px 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:10px;text-align:left}</style><body><h1>${target.name} employment library · installation plan</h1><p>Read-only plan. No configuration, clause, contract, job posting or payroll record has been changed.</p><p>Existing agency templates: ${snapshot.contract_templates.length}; configs: ${snapshot.contract_configs.length}; clauses: ${snapshot.contract_clauses.length}. Existing clause rows, including all five service-role clauses, are preserved.</p><p>Review SHA: ${reviewSha}</p><p>Planned creation: one agency-owned template, 32 starter clause rows and two inactive configurations. The generator uses this agency’s own approved compensation policy and selected service roles. No NLU categories or rates are copied into Inner Strength.</p>${paragraphs}</body></html>`);
  console.log(JSON.stringify({mode,agency:agencyKey,reviewSha,existingTemplates:snapshot.contract_templates.length,existingConfigs:snapshot.contract_configs.length,existingClauses:snapshot.contract_clauses.length,creates:{templates:1,clauses:32,inactiveConfigs:2},reviewFile:path.join(output,`${agencyKey}-employment-library-plan.html`)}));
 }else if(mode==='install'){
  const provided=args[args.indexOf('--reviewed-sha')+1];
  const saved=JSON.parse(fs.readFileSync(path.join(output,`${agencyKey}-employment-library-plan.json`)));
  if(provided!==reviewSha || saved.reviewSha!==reviewSha)throw new Error('Review the current plan and pass its exact --reviewed-sha before installing.');
  const {installEmploymentStarter}=await import('../src/services/employmentStarter.service.js');
  ({default:pool}=await import('../src/config/database.js'));
  const result=await installEmploymentStarter(target.id,501);
  const [configs]=await db.query("SELECT id,name,slug,is_active,pay_mode,contract_template_id FROM contract_configs WHERE agency_id=? AND slug LIKE 'plotline_starter_v1_%' ORDER BY id",[target.id]);
  const [clauses]=await db.query('SELECT id,clause_key,title,body_html,is_active FROM contract_clauses WHERE agency_id=?',[target.id]);
  const preserved=snapshot.contract_clauses.every(before=>{const after=clauses.find(row=>row.id===before.id);return after&&after.clause_key===before.clause_key&&after.title===before.title&&after.body_html===before.body_html&&after.is_active===before.is_active;});
  write(`${agencyKey}-employment-library-install-receipt.json`,{result,configs,existingClausesPreserved:preserved,reviewSha});
  if(!preserved)throw new Error('An existing clause changed during installation; review the private backup and receipt.');
  console.log(JSON.stringify({result,configs,existingClausesPreserved:preserved}));
 }else{
  const [configs]=await db.query("SELECT id,name,slug,pay_mode FROM contract_configs WHERE agency_id=? AND slug IN ('plotline_starter_v1_hourly','plotline_starter_v1_ffs') ORDER BY id",[target.id]);
  if(configs.length!==2)throw new Error('Install the reviewed inactive starter before rendering its previews.');
  const [[counts]]=await db.query('SELECT (SELECT COUNT(*) FROM payroll_pay_system_rates WHERE agency_id=?) system_rates,(SELECT COUNT(*) FROM payroll_compensation_levels WHERE agency_id=?) legacy_levels',[target.id,target.id]);
  if(!counts.system_rates&&!counts.legacy_levels&&agencyKey!=='tisi'){const blocked={agency:agencyKey,examples:[],blocked:'This agency has no configured compensation rows. Complete its own approved category/level and individual service rates before issuing contracts. NLU rates were not copied.',configs};write(`${agencyKey}-employment-library-preview-receipt.json`,blocked);console.log(JSON.stringify(blocked));process.exitCode=1;}
  else {
  const {renderContractHtml}=await import('../src/services/contractMerge.service.js');
  ({default:pool}=await import('../src/config/database.js'));
  const examples=[{key:'category1-tutor',category:1,level:1,role:'tutoring',credential:'GED',title:'Foundational Tutor',details:{}},{key:'category2-childcare',category:2,level:3,role:'childcare',credential:'BA',title:'Childcare Provider',details:{childcare:{payLevel:3,compensationTerms:'Review example: Category 2 childcare Level 3; one child $24/hour, two $28, three $30, four $32, per active caregiver under the approved shared-group ratio. Required preparation, cleanup and on-duty availability use the one-child base; no automatic indirect allowance. Apply the required higher wage floor.'}}},{key:'category4-testing',category:4,level:3,role:'psychological_testing',credential:'MA, LPC',title:'Testing Provider',details:{psychological_testing:{compensationTerms:'Review example: administration/scoring $32/hour plus 10 indirect minutes per direct-hour equivalent at $24/hour; separately authorized evaluation/report/feedback $50/hour based on actual time, with no automatic indirect supplement.',authorizationTerms:'DEMONSTRATION ONLY: Actual instrument-specific qualifications, approved instruments/components, responsible qualified licensee and direct-supervision record must be verified before assigning a real employee.'}}}];
  if(agencyKey==='tisi'){
   for(const example of examples){
    example.category=example.role==='psychological_testing'?3:1;
    example.key=`individual-${example.role}`;
    if(example.role==='tutoring'){example.credential='BA';example.details.tutoring={compensationTerms:'ILLUSTRATIVE ONLY: tutoring $31.25 per actual hour; ten approved indirect minutes per direct hour at $21.75/hour, prorated, plus additional actual compensable work without duplication. A real person’s exact approved individual agreement must replace these demonstration amounts.'};}
    if(example.role==='childcare')example.details.childcare={payLevel:3,hourlyRate:29.50,compensationTerms:'ILLUSTRATIVE ONLY: individual childcare rate $29.50/hour under an example written offer, including required preparation, cleanup and on-duty availability. Child attendance and staffing terms must be expressly completed in the real individual agreement. NLU’s rate amounts and category caps are not adopted.'};
    if(example.role==='psychological_testing')example.details.psychological_testing.compensationTerms='ILLUSTRATIVE ONLY: individually agreed testing administration/scoring $47.75/hour, evaluation/report/feedback $83.25/hour, indirect work $21.75/hour and a prorated ten-minute allowance only for administration/scoring. These are demonstration values, not an adopted agency rate schedule.';
   }
   examples.push({key:'individual-combined',category:1,level:3,role:'combined',roles:['tutoring','childcare','psychological_testing'],credential:'MA, LPC',title:'Combined Individual Service Assignments',details:Object.assign({},...examples.map(example=>structuredClone(example.details)))});
  }
  const results=[];
  const makeTokens=example=>({AGENCY_SLUG:agencyKey,COMPANY_NAME:target.name,COMPANY_ADDRESS:'Review example — verify legal employer address',CANDIDATE_NAME:'Example Candidate — Private Review',EMPLOYEE_FULL_NAME:'Example Candidate — Private Review',JOB_TITLE:example.title,JOB_DESCRIPTION:'Only the selected service role duties and completed individual terms apply to this review example.',ROLE_LABEL:example.role==='tutoring'?'Tutor':'Employee',SERVICE_FOCUS:example.title,CREDENTIAL:example.credential,EXECUTION_DATE:'November 12, 2026',START_DATE:'November 21, 2026',EXPIRATION_DATE:'November 26, 2026',CONTRACT_SERVICE_ROLES:example.roles||[example.role],CONTRACT_SERVICE_ROLE_DETAILS:example.details,...(agencyKey==='tisi'?{INDIVIDUAL_COMPENSATION_BASIS:'approved_individual_agreement',PRIOR_COMPENSATION_AGREEMENT_REFERENCE:'DEMONSTRATION ONLY — illustrative individual written offer for this preview; replace with the actual person’s approved source.'}:{})});
  for(const config of configs)for(const example of examples){
   const result=await renderContractHtml({agencyId:target.id,configId:config.id,reviewInactiveConfig:true,compensationCategory:example.category,compensationLevel:example.level,tokens:makeTokens(example)});
   const filename=`${agencyKey}-starter-${config.pay_mode}-${example.key}-preview.html`;
   write(filename,result.html.replace('<body>','<body><p style="padding:16px;background:#fff7df"><strong>Private read-only example.</strong> No employee, contract, signature or payroll record has been created. Every reference, amount and testing authorization in this example is illustrative and must be replaced with the actual person’s approved terms before issuance. No shared Inner Strength rate matrix is adopted.</p>'));
   results.push({file:filename,mode:config.pay_mode,category:result.tokens.COMPENSATION_CATEGORY,level:result.tokens.COMPENSATION_LEVEL,role:example.role,compensationBasis:result.tokens.COMPENSATION_SCHEDULE?.compensationBasis,unresolvedTokens:result.unresolvedTokens,selectedClauses:result.clauseManifest.filter(clause=>clause.included).map(clause=>clause.key),readOnlyReview:result.readOnlyReview});
  }
  const missingCases=[];
  if(agencyKey==='tisi')for(const [key,example,change] of [['missing-agreement-reference',examples[0],{PRIOR_COMPENSATION_AGREEMENT_REFERENCE:''}],['missing-individual-role-terms',examples[0],{CONTRACT_SERVICE_ROLE_DETAILS:{}}],['missing-testing-authorization',examples[2],{CONTRACT_SERVICE_ROLE_DETAILS:{psychological_testing:{compensationTerms:examples[2].details.psychological_testing.compensationTerms}}}]]){
   try{const preview=await renderContractHtml({agencyId:target.id,configId:configs[0].id,reviewInactiveConfig:true,tokens:{...makeTokens(example),...change}});missingCases.push({case:key,blocked:preview.unresolvedTokens.length>0,unresolvedTokens:preview.unresolvedTokens});}
   catch(error){missingCases.push({case:key,blocked:error.status===400,error:error.message});}
  }
  write(`${agencyKey}-employment-library-preview-receipt.json`,{results,missingCases});
  console.log(JSON.stringify({mode,agency:agencyKey,examples:results.length,unresolved:results.filter(result=>result.unresolvedTokens.length),allReadOnly:results.every(result=>result.readOnlyReview),missingCases}));
  if(results.some(result=>result.unresolvedTokens.length))process.exitCode=1;
  if(missingCases.some(result=>!result.blocked))process.exitCode=1;
  }
 }
}finally{await db.end();if(pool)await pool.end();}
