/** Dry-run by default. Does not cancel appointments or delete medical records.
 * Review private plan before a separately authorized apply:
 * node ... --agency-id=2 --plan=/private/tmp/termination-plan.json
 * ALLOW_TERMINATION_RECONCILIATION=true node ... --apply --reviewed-plan=... --actor-id=...
 */
import {writeFileSync,readFileSync} from 'node:fs';
import pool from '../config/database.js';
import {buildTerminationReconciliationPlan,applyTerminationReconciliationPlan} from '../services/clientTerminationReconciliation.service.js';
const value=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
try{
 if(process.argv.includes('--apply')){
  if(!value('reviewed-plan'))throw new Error('Choose the reviewed plan explicitly');
  const plan=JSON.parse(readFileSync(value('reviewed-plan'),'utf8'));
  console.log(JSON.stringify(await applyTerminationReconciliationPlan(pool,plan,{actorUserId:Number(value('actor-id')),enabled:process.env.ALLOW_TERMINATION_RECONCILIATION==='true'})));
 }else{
  const plan=await buildTerminationReconciliationPlan(pool,{agencyId:Number(value('agency-id'))});
  if(value('plan'))writeFileSync(value('plan'),JSON.stringify(plan,null,2),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({mode:'dry_run',...plan.summary,productionWrites:0,medicalRecordsDeleted:0,appointmentsCanceled:0}));
 }
}catch(error){console.error(error.message);process.exitCode=1;}finally{await pool.end();}
