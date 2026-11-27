import {pathToFileURL} from 'node:url';
import {HIRING_UPGRADE_USER,HIRING_UPGRADE_PROCEDURE,HIRING_UPGRADE_HASH,hiringSenderRegistration,plotlineHiringUpgradeSql} from '../utils/plotlineHiringSenderUpgrade.js';
import {plotlineHiringCampaignDigest} from '../utils/plotlineHiringCampaign.js';
import {readVonage10dlc,assertCarrierSmsPolicy} from '../services/vonage10dlc.service.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function upgradePlotlineHiringSender({apply=false,approvalDigest,env=process.env,connect,readCarrier=readVonage10dlc}={}){
 if(env.DB_USER!==HIRING_UPGRADE_USER)fail('PLOTLINE_HIRING_SCOPED_IDENTITY_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(approvalDigest||'')||!/^[A-Za-z0-9_]+$/.test(env.DB_NAME||'')||!env.DB_PASSWORD||!(env.DB_HOST||env.DB_SOCKET))fail('PLOTLINE_HIRING_CONFIGURATION_REQUIRED');
 const mysql=connect?null:(await import('mysql2/promise')).default;
 const db=await (connect||mysql.createConnection)({user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,
  ...(env.DB_SOCKET?{socketPath:env.DB_SOCKET}:{host:env.DB_HOST,port:Number(env.DB_PORT||3306)}),connectTimeout:10000});
 try{
  const [[identity]]=await db.query('SELECT USER() AS session_identity,CURRENT_USER() AS database_identity');
  if([identity.session_identity,identity.database_identity].some(value=>String(value).split('@')[0]!==HIRING_UPGRADE_USER))fail('PLOTLINE_HIRING_SCOPED_IDENTITY_REQUIRED');
  const [grants]=await db.query('SHOW GRANTS FOR CURRENT_USER()');
  const prefix=`GRANT EXECUTE ON PROCEDURE \`${env.DB_NAME}\`.\`${HIRING_UPGRADE_PROCEDURE}\` TO `;
  const values=grants.flatMap(Object.values);
  if(!values.some(value=>value.startsWith(prefix))||values.some(value=>!value.startsWith(prefix)&&!value.startsWith('GRANT USAGE ON *.* TO ')))fail('PLOTLINE_HIRING_SCOPE_TOO_BROAD');
  if(apply){
   const base='/brands/BCGLCIL/campaigns/VCZOP4JO';
   const [campaign,number]=await Promise.all([readCarrier(base),readCarrier(base+'/numbers/17197165766')]);
   if(plotlineHiringCampaignDigest(campaign)!==approvalDigest)fail('PLOTLINE_HIRING_APPROVAL_CHANGED');
   assertCarrierSmsPolicy({campaign,number,registration:{...hiringSenderRegistration,hiringJourneyApprovalDigest:approvalDigest},from:'+17197165766',purpose:'workforce',body:'Hiring update. https://plotlinepo.com/hiring-sms-consent'});
  }
  const [result]=await db.query(`CALL ${HIRING_UPGRADE_PROCEDURE}(?,?,?)`,[HIRING_UPGRADE_HASH,approvalDigest,apply]);
  return {mode:apply?'apply':'preview',automationIdentity:identity.session_identity,summary:result.filter(Array.isArray).at(-1)};
 }finally{await db.end();}
}
async function main(){
 const args=process.argv.slice(2),mode=args.find(a=>['--apply','--preview','--plan','--sql'].includes(a))||'--plan';
 const approval=args.find(a=>a.startsWith('--approval-digest='))?.split('=')[1];
 if(args.some(a=>!['--apply','--preview','--plan','--sql'].includes(a)&&!a.startsWith('--approval-digest='))||args.filter(a=>['--apply','--preview','--plan','--sql'].includes(a)).length>1)fail('PLOTLINE_HIRING_INVALID_ARGUMENTS');
 if(mode==='--plan')return console.log(JSON.stringify({registration:hiringSenderRegistration,manifestHash:HIRING_UPGRADE_HASH,databaseUser:HIRING_UPGRADE_USER,procedure:HIRING_UPGRADE_PROCEDURE,applicationRecordsChanged:false},null,2));
 if(mode==='--sql')return console.log('DELIMITER $$\n'+plotlineHiringUpgradeSql()+'$$\nDELIMITER ;');
 console.log(JSON.stringify(await upgradePlotlineHiringSender({apply:mode==='--apply',approvalDigest:approval}),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(JSON.stringify({errorCode:/^PLOTLINE_[A-Z_]+$/.test(error.sqlMessage||'')?error.sqlMessage:error.code||'PLOTLINE_HIRING_UPGRADE_FAILED'}));process.exitCode=1;});
