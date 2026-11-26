import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {transferProcedure,digest} from './ptoTransferProcedure.mjs';

const planPath=process.argv[2],outputPath=process.argv[3];
if(!planPath||!outputPath)throw Error('Supply reviewed plan and evidence paths');
const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
const apply=process.argv.includes('--apply');
const env=dotenv.parse(fs.readFileSync(process.env.PTO_TRANSFER_ENV||'/Users/mendez/PTOnboardingApp/backend/.env','utf8').split('\n').filter(l=>/^DB_(USER|PASSWORD|NAME)=/.test(l)).join('\n'));
const cloudOperator=execFileSync('gcloud',['auth','list','--filter=status:ACTIVE','--format=value(account)'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(!cloudOperator||cloudOperator.includes('\n'))throw Error('One established cloud operator is required');
if(!/^[a-zA-Z0-9_]+$/.test(env.DB_NAME))throw Error('Invalid schema name');
if(!plan.authorization?.request||!plan.authorization?.scopeConfirmed)throw Error('Explicit scoped authorization is required');
const suffix=digest(plan).slice(0,10),databaseUser=`codex_pto_${suffix}`,procedure=`codex_pto_transfer_${suffix}`;
const admin=await mysql.createConnection({host:'127.0.0.1',port:3308,user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME});
let scoped,createdUser=false,createdRoutine=false,actorId=null,phase='preflight';
const evidence={operation:'one_time_approved_pto_transfer',databaseUser,procedure,applied:false};
const save=()=>fs.writeFileSync(outputPath,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
try{
  // Freeze the approved evidence before provisioning access. No financial writes.
  const [[request]]=await admin.execute('SELECT id,user_id,status,total_hours,approved_payroll_period_id,SHA2(CAST(approved_rates_json AS CHAR),256) rates_hash FROM payroll_pto_requests WHERE id=? AND agency_id=?',[plan.requestId,plan.agencyId]);
  const [[prior]]=await admin.execute("SELECT id FROM user_activity_log WHERE action_type='automation_pto_payroll_transfer' AND agency_id=? AND JSON_EXTRACT(metadata,'$.request_id')=? AND JSON_EXTRACT(metadata,'$.source_period_id')=? AND JSON_EXTRACT(metadata,'$.target_period_id')=? LIMIT 1",[plan.agencyId,plan.requestId,plan.sourcePeriodId,plan.targetPeriodId]);
  if(prior){evidence.alreadyApplied=true;evidence.auditEventId=prior.id;save();console.log(JSON.stringify(evidence));process.exitCode=0;}
  else{
    if(!request||Number(request.user_id)!==plan.employeeId||request.status!=='approved'||Number(request.total_hours)!==plan.hours||Number(request.approved_payroll_period_id)!==plan.sourcePeriodId||request.rates_hash!==plan.ratesHash)throw Error('Approved request changed; no transfer attempted');
    phase='provision_non_login_audit_actor';
    const actorName=`PTO Transfer Automation ${suffix}`;
    const [[existingActor]]=await admin.execute("SELECT id FROM users WHERE first_name='Codex' AND last_name=? AND role='assistant' AND is_assistant_account=1 AND is_active=0 AND is_archived=1 AND status='ARCHIVED' AND password_hash IS NULL AND email IS NULL",[actorName]);
    if(existingActor)actorId=existingActor.id;
    else{
      const [inserted]=await admin.execute("INSERT INTO users(first_name,last_name,email,password_hash,role,status,is_active,is_archived,is_assistant_account) VALUES('Codex',?,NULL,NULL,'assistant','ARCHIVED',0,1,1)",[actorName]);
      actorId=inserted.insertId;
      await admin.execute("INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES('automation_pto_transfer_identity_provisioned',?,?,?)",[actorId,plan.agencyId,JSON.stringify({actor_type:'automation',automation_identity:databaseUser,automation_actor_user_id:actorId,cloud_operator:cloudOperator,authorization:plan.authorization,non_login_actor:true,tenant_memberships:0,scope:{requestId:plan.requestId,employeeId:plan.employeeId,sourcePeriodId:plan.sourcePeriodId,targetPeriodId:plan.targetPeriodId,hours:plan.hours,rate:plan.rate}})]);
    }
    const built=transferProcedure({procedure,databaseUser,actorId,plan,cloudOperator});
    Object.assign(evidence,{actorId,manifestHash:built.hash,authorization:plan.authorization});
    const [[exists]]=await admin.execute("SELECT COUNT(*) n FROM mysql.user WHERE User=? AND Host='%'",[databaseUser]);
    if(Number(exists.n))throw Error('Scoped database identity already exists; review its grants first');
    const [[routine]]=await admin.execute('SELECT COUNT(*) n FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME=?',[procedure]);
    if(Number(routine.n))throw Error('Transfer routine already exists; review before retrying');
    phase='provision_execute_only_database_identity';
    const password=`Cc9!${crypto.randomBytes(32).toString('hex')}`;
    await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?",[databaseUser,password]);createdUser=true;
    await admin.query(built.sql);createdRoutine=true;
    await admin.query(`GRANT EXECUTE ON PROCEDURE \`${env.DB_NAME}\`.\`${procedure}\` TO ?@'%'`,[databaseUser]);
    const [grants]=await admin.query("SHOW GRANTS FOR ?@'%'",[databaseUser]);
    if(grants.some(r=>Object.values(r).some(s=>!s.startsWith('GRANT USAGE ')&&!s.startsWith(`GRANT EXECUTE ON PROCEDURE \`${env.DB_NAME}\`.\`${procedure}\``))))throw Error('Unexpected scoped privileges');
    scoped=await mysql.createConnection({host:'127.0.0.1',port:3308,user:databaseUser,password,database:env.DB_NAME});
    // This principal cannot read or write application tables directly.
    let denied=false;try{await scoped.query('SELECT sick_pto_hours FROM payroll_adjustments LIMIT 0');}catch(error){if(error.code==='ER_TABLEACCESS_DENIED_ERROR')denied=true;else throw error;}
    if(!denied)throw Error('Direct application table access was not denied');
    evidence.directTableAccessDenied=true;
    phase='scoped_dry_run';
    const [preview]=await scoped.execute(`CALL \`${procedure}\`(?,?)`,[built.hash,false]);
    evidence.preview=preview.filter(Array.isArray).at(-1)?.[0];
    if(evidence.preview?.execution_status!=='ready')throw Error('Dry run was not ready');
    if(apply){
      phase='scoped_transfer';
      const [result]=await scoped.execute(`CALL \`${procedure}\`(?,?)`,[built.hash,true]);
      evidence.result=result.filter(Array.isArray).at(-1)?.[0];
      evidence.applied=evidence.result?.execution_status==='applied';
      if(!evidence.applied)throw Error('Transfer did not report applied');
      phase='verify';
      const [adjustments]=await admin.execute('SELECT payroll_period_id,sick_pto_hours,training_pto_hours,pto_hours,pto_rate,updated_by_user_id FROM payroll_adjustments WHERE agency_id=? AND user_id=? AND payroll_period_id IN(?,?) ORDER BY payroll_period_id',[plan.agencyId,plan.employeeId,plan.sourcePeriodId,plan.targetPeriodId]);
      const [[balance]]=await admin.execute('SELECT sick_balance_hours FROM payroll_pto_accounts WHERE agency_id=? AND user_id=?',[plan.agencyId,plan.employeeId]);
      const [[audit]]=await admin.execute('SELECT id,user_id,metadata FROM user_activity_log WHERE action_type=? AND agency_id=? AND JSON_UNQUOTE(JSON_EXTRACT(metadata,\'$.manifest_hash\'))=? ORDER BY id DESC LIMIT 1',[built.action,plan.agencyId,built.hash]);
      const [[after]]=await admin.execute('SELECT id,status,total_hours,approved_payroll_period_id,approved_by_user_id,approved_at,approved_rates_json FROM payroll_pto_requests WHERE id=? AND agency_id=?',[plan.requestId,plan.agencyId]);
      evidence.verification={adjustments,unchangedBalance:Number(balance.sick_balance_hours),auditEventId:audit.id,auditActorId:audit.user_id,request:after};
      if(audit.user_id!==actorId||Number(balance.sick_balance_hours)!==Number(evidence.result.unchanged_leave_balance)||Number(after.approved_payroll_period_id)!==plan.targetPeriodId)throw Error('Post-transfer verification needs review');
      const [repeat]=await scoped.execute(`CALL \`${procedure}\`(?,?)`,[built.hash,true]);
      evidence.repeatCall=repeat.filter(Array.isArray).at(-1)?.[0]?.execution_status;
      if(evidence.repeatCall!=='already_applied')throw Error('Idempotency verification needs review');
    }
  }
}catch(error){evidence.failure={phase,code:error.code||error.name,message:(!error.sql?error.message:error.sqlState==='45000'?error.sqlMessage:'Database operation failed; credentials excluded')};process.exitCode=1;}
finally{
  if(scoped)try{await scoped.end();}catch{}
  let userRetired=!createdUser,routineRetired=!createdRoutine;
  if(createdUser)try{await admin.query("DROP USER ?@'%'",[databaseUser]);userRetired=true;}catch{}
  if(createdRoutine)try{await admin.query(`DROP PROCEDURE \`${procedure}\``);routineRetired=true;}catch{}
  evidence.scopedAccessRetired=userRetired&&routineRetired;
  if(!evidence.scopedAccessRetired){evidence.cleanupNeedsReview=true;process.exitCode=1;}
  try{
    if(actorId)await admin.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES(?,?,?,?)',[evidence.scopedAccessRetired?'automation_pto_transfer_access_retired':'automation_pto_transfer_access_cleanup_failed',actorId,plan.agencyId,JSON.stringify({actor_type:'automation',automation_identity:databaseUser,cloud_operator:cloudOperator,application_actor_retained_for_audit:true,no_login_credentials:true,temporary_database_identity_removed:createdUser&&userRetired,temporary_routine_removed:createdRoutine&&routineRetired,applied:evidence.applied,manifest_hash:evidence.manifestHash})]);
  }catch{evidence.cleanupNeedsReview=true;process.exitCode=1;}
  try{await admin.end();}finally{save();}
}
console.log(JSON.stringify({applied:evidence.applied,result:evidence.result,verification:evidence.verification,directTableAccessDenied:evidence.directTableAccessDenied,scopedAccessRetired:evidence.scopedAccessRetired,failure:evidence.failure,cleanupNeedsReview:evidence.cleanupNeedsReview}));
