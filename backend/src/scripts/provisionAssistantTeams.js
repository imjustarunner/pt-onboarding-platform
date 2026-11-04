/** Owner-requested, resumable assistant provisioning. Default is inspection only. */
import pool from '../config/database.js';
import {ASSISTANT_OWNER_EMAIL} from '../services/assistantTeamPolicy.js';
import {provisionAssistantAccounts,provisionAssistantGroup} from '../services/assistantProvisioning.service.js';
try{
 const [[owner]]=await pool.execute("SELECT id FROM users WHERE LOWER(email)=? AND role='super_admin' AND is_active=1",[ASSISTANT_OWNER_EMAIL]);if(!owner)throw new Error('ASSISTANT_OWNER_UNAVAILABLE');
 const apply=process.argv.includes('--apply'),qa=process.argv.includes('--qa');const arg=process.argv.find(s=>s.startsWith('--agencies='));const agencyIds=arg?arg.slice(11).split(',').map(Number):qa?[450,453]:[2,6,377];
 const result=await provisionAssistantAccounts({actor:owner,agencyIds,dryRun:!apply,qa});
 const groups=[];if(apply&&process.argv.includes('--groups'))for(const a of result.accounts.filter(a=>a.id)){try{const r=await provisionAssistantGroup({actor:owner,accountId:a.id});groups.push({accountId:a.id,...r});}catch(e){groups.push({accountId:a.id,status:'BLOCKED',reason:e.code||'GROUP_SETUP_UNAVAILABLE'});}}
 console.log(JSON.stringify({...result,groups},null,2));
 if(groups.some(g=>g.status==='BLOCKED'))process.exitCode=2;
}catch(e){console.error(JSON.stringify({status:'BLOCKED',reason:e.code||'ASSISTANT_PROVISIONING_UNAVAILABLE'}));process.exitCode=2;}finally{await pool.end();}
