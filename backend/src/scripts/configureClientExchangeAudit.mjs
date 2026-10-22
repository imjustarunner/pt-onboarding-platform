/** Explicit operational setup; defaults to preview. --apply changes the named agency only.
 * --auricwell provisions the optional groups after the owner chooses that sender.
 */
import pool from '../config/database.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import {APP_GROUP_OWNER,APP_GROUP_MANAGER} from '../services/appGroupOwnership.service.js';
import {ensureSendAsAlias} from '../services/gmailSendAs.service.js';
import Directory from '../services/googleWorkspaceDirectory.service.js';
const value=key=>process.argv.find(a=>a.startsWith(`--${key}=`))?.split('=').slice(1).join('=');
const agencyId=Number(value('agency'));
const apply=process.argv.includes('--apply'),auricwell=process.argv.includes('--auricwell');
try {
  if(!agencyId)throw Error('--agency is required');
  const [[agency]]=await pool.execute('SELECT id,name FROM agencies WHERE id=?',[agencyId]);if(!agency)throw Error('Agency not found');
  const identities=await EmailSenderIdentity.list({agencyId,includePlatformDefaults:false,onlyActive:true});
  const support=identities.find(row=>row.identity_key==='support');if(!support?.from_email)throw Error('Agency support mailbox is missing');
  const copyEmail=value('copy')||null;
  if(copyEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(copyEmail))throw Error('Invalid copy address');
  console.log(JSON.stringify({apply,agency:agency.name,support:support.from_email,copyEmail,firstClients:50,auricwell,owner:APP_GROUP_OWNER,manager:APP_GROUP_MANAGER}));
  if(apply){
    if(auricwell){
      for(const [identityKey,email,displayName,replyTo] of [['exchange_noreply','no-reply@auricwell.com','Auricwell Automated Reply','no-reply@auricwell.com'],['client_exchange','clientexchange@auricwell.com','Client Exchange','no-reply@auricwell.com']]){
        const result=await ensureSendAsAlias({sendAsEmail:email,displayName,replyToAddress:replyTo});
        if(!result.ok||result.sendAs?.verificationStatus!=='accepted')throw Error(`Sender ${email} is not verified: ${result.error||result.sendAs?.verificationStatus||'unknown'}`);
        const members=await Directory.listGroupMembers(email);
        for(const [who,role] of [[APP_GROUP_OWNER,'OWNER'],[APP_GROUP_MANAGER,'MANAGER']])if(!members.some(m=>m.email?.toLowerCase()===who&&m.role===role))throw Error(`Group ${email} ownership did not verify`);
        const existing=identities.find(row=>row.identity_key===identityKey);
        if(existing)await EmailSenderIdentity.update(existing.id,{fromEmail:email,replyTo,displayName,isActive:true,inboundAddresses:[email]});
        else await EmailSenderIdentity.create({agencyId,identityKey,fromEmail:email,replyTo,displayName,inboundAddresses:[email]});
        console.log(JSON.stringify({email,sendAs:'accepted',owner:APP_GROUP_OWNER,manager:APP_GROUP_MANAGER}));
      }
    }
    await pool.execute("UPDATE agencies SET feature_flags=JSON_SET(COALESCE(feature_flags,JSON_OBJECT()),'$.clientExchangeAudit',CAST(? AS JSON)) WHERE id=?",[JSON.stringify({enabled:true,limit:50,copyEmail,startedAt:new Date().toISOString()}),agencyId]);
    console.log('Pilot audit enabled. Current open clients enroll when evaluated; subsequent distinct clients fill the remaining slots.');
  }
}catch(error){console.error(JSON.stringify({code:error.code||'setup_failed',message:error.message}));process.exitCode=1;}finally{await pool.end();process.exit(process.exitCode||0);}
