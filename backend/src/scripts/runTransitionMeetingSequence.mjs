// Cloud Run job only: no human app account, copied browser session or app JWT.
import {randomUUID} from 'node:crypto';
import {TRANSITION_AUTOMATION,TRANSITION_INBOX} from '../content/transitionMeetingLiveConfig.js';
const mode=process.argv[2]||'status';
const metadata=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)});
if(!metadata.ok||(await metadata.text()).trim()!==TRANSITION_AUTOMATION)throw Error('Only the scoped transition-sequence service account may run this job.');
// Cloud Run supplies a single Secret Manager reference; secret values stay out
// of source files, command arguments and operational logs.
if(process.env.TRANSITION_RUNTIME_CONFIG){
 const config=JSON.parse(process.env.TRANSITION_RUNTIME_CONFIG);
 for(const name of ['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','CLIENT_CHAT_ENCRYPTION_KEY_BASE64','CLIENT_CHAT_ENCRYPTION_KEY_ID','GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64'])if(typeof config[name]==='string')process.env[name]=config[name];
}
const {default:pool}=await import('../config/database.js');
try{
 const live=await import('../services/transitionMeetingSequenceLive.service.js');
 if(mode==='setup'){
  const {google}=await import('../utils/googleApis.js');
  const {buildImpersonatedJwtClient}=await import('../services/googleWorkspaceAuth.service.js');
  // This subject is the existing NONHUMAN application transport, never a person.
  const auth=await buildImpersonatedJwtClient({subjectEmail:'ai@plottwistco.com',scopes:['https://www.googleapis.com/auth/apps.groups.settings','https://www.googleapis.com/auth/gmail.settings.sharing','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly']});
  const groups=google.groupssettings({version:'v1',auth});
  await groups.groups.patch({groupUniqueId:TRANSITION_INBOX,requestBody:{whoCanJoin:'INVITED_CAN_JOIN',whoCanPostMessage:'ANYONE_CAN_POST',whoCanViewMembership:'ALL_MANAGERS_CAN_VIEW',whoCanViewGroup:'ALL_MEMBERS_CAN_VIEW',allowExternalMembers:'false',includeInGlobalAddressList:'false',isArchived:'false',messageModerationLevel:'MODERATE_NONE',membersCanPostAsTheGroup:'true'}});
  const gmail=google.gmail({version:'v1',auth});
  const aliases=(await gmail.users.settings.sendAs.list({userId:'me'})).data.sendAs||[];
  let alias=aliases.find(a=>a.sendAsEmail===TRANSITION_INBOX);
  if(!alias)alias=(await gmail.users.settings.sendAs.create({userId:'me',requestBody:{sendAsEmail:TRANSITION_INBOX,displayName:'AuricWell Transition Team',replyToAddress:TRANSITION_INBOX,treatAsAlias:false}})).data;
  if(alias.verificationStatus!=='accepted')throw Error('The dedicated sender needs verification before activation.');
  // Original message and reply both remain within explicitly managed app identities.
  const marker=`transition-inbox-${randomUUID()}`,messageId=`<${marker}@auricwell.com>`;
  const raw=Buffer.from(`From: AuricWell Transition Team <${TRANSITION_INBOX}>\r\nTo: ${TRANSITION_INBOX}\r\nSubject: Transition inbox routing verification ${marker}\r\nMessage-ID: ${messageId}\r\nAuto-Submitted: auto-generated\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nAutomated routing verification for the requested ITSCO transition inbox. No provider action required.`).toString('base64url');
  await gmail.users.messages.send({userId:'me',requestBody:{raw}});
  let verified=false;
  for(let attempt=0;attempt<10&&!verified;attempt++){
   if(attempt)await new Promise(r=>setTimeout(r,5000));
   const messages=(await gmail.users.messages.list({userId:'me',q:`rfc822msgid:${messageId}`,maxResults:10})).data.messages||[];
   for(const item of messages){const m=(await gmail.users.messages.get({userId:'me',id:item.id,format:'metadata',metadataHeaders:['List-ID','X-BeenThere','Delivered-To']})).data;
    const routed=(m.payload?.headers||[]).some(h=>['list-id','x-beenthere'].includes(h.name.toLowerCase())&&h.value.toLowerCase().includes('transitions'));
    if(routed&&(m.labelIds||[]).includes('INBOX'))verified=true;
   }
  }
  if(!verified)throw Error('Sender is verified, but the Group-to-app inbox round trip is not yet confirmed. Do not activate.');
  const {default:Identity}=await import('../models/EmailSenderIdentity.model.js');
  let identity=await Identity.findByAgencyAndIdentityKey(2,'transition_sequence');
  if(!identity)identity=await Identity.create({agencyId:2,identityKey:'transition_sequence',displayName:'AuricWell Transition Team',fromEmail:TRANSITION_INBOX,replyTo:TRANSITION_INBOX,inboundAddresses:[TRANSITION_INBOX],isActive:true});
  else{if(identity.from_email!==TRANSITION_INBOX)throw Error('A different transition sender already exists; review it before changing.');await Identity.replaceInboundRoutes(identity.id,[TRANSITION_INBOX]);await Identity.update(identity.id,{replyTo:TRANSITION_INBOX,isActive:true});}
  await live.recordTransitionInboxSetup({address:TRANSITION_INBOX,roundTripVerified:true,senderIdentityId:identity.id,automationSubject:TRANSITION_AUTOMATION,verifiedAt:new Date().toISOString()});
  console.log(JSON.stringify({mode,ready:true,senderIdentityId:identity.id,roundTripVerified:true}));
 }else if(mode==='preview'){
  const plan=await live.transitionSequencePreview();console.log(JSON.stringify({mode,providerCount:plan.providers.length,hosts:plan.hosts.map(h=>({id:h.userId,name:h.name,email:h.email})),kimi:plan.providers.find(p=>p.explicitAddition),meetings:plan.sessions.map(s=>({number:s.number,startAt:s.startAt,endAt:s.endAt,initialProviders:plan.providers.filter(p=>p.initialMeeting===s.number).length})),fingerprint:plan.fingerprint}));
 }else if(mode==='activate'){console.log(JSON.stringify(await live.activateTransitionSequence()));console.log(JSON.stringify(await live.processTransitionSequence()));}
 else if(mode==='tick')console.log(JSON.stringify(await live.processTransitionSequence()));
 else if(mode==='status'){const [[r]]=await pool.execute('SELECT status,revision,updated_at FROM transition_meeting_sequences WHERE sequence_id=\'itsco-auricwell-2026-11-30\'');console.log(JSON.stringify({mode,sequence:r||null}));}
 else throw Error('Choose setup, preview, activate, tick or status.');
}catch(error){console.error(JSON.stringify({mode,error:error.status?'TRANSITION_REVIEW_REQUIRED':error.code||'TRANSITION_OPERATION_FAILED',message:/token|private|secret|credential/i.test(String(error.message))?'Operation failed; review access configuration.':String(error.message).slice(0,300)}));process.exitCode=1;}
finally{await pool.end();}
