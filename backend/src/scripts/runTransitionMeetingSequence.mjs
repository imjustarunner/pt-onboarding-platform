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
 for(const name of ['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','CLIENT_CHAT_ENCRYPTION_KEY_BASE64','CLIENT_CHAT_ENCRYPTION_KEY_ID','GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64','WORKSPACE_EMAIL_RELAY_URL'])if(typeof config[name]==='string')process.env[name]=config[name];
}
const {default:pool}=await import('../config/database.js');
try{
 const live=await import('../services/transitionMeetingSequenceLive.service.js');
 if(mode==='setup'){
  if(process.env.TRANSITION_GROUP_SETTINGS_OWNER_VERIFIED!=='true')throw Error('The owner must confirm the dedicated group privacy and reply settings before mail setup.');
  if(process.env.TRANSITION_GROUP_MEMBERSHIP_OPERATOR_VERIFIED!=='true')throw Error('Verify the exact group owner and automation manager membership before mail setup.');
  const {relaySelected}=await import('../services/workspaceRelayConfig.js');
  if(!relaySelected(TRANSITION_INBOX))throw Error('This dedicated sender requires the approved private SMTP relay.');
  const {google}=await import('../utils/googleApis.js');
  const {buildImpersonatedJwtClient}=await import('../services/googleWorkspaceAuth.service.js');
  // This subject is the existing NONHUMAN application transport, never a person.
  const auth=await buildImpersonatedJwtClient({subjectEmail:'ai@plottwistco.com',scopes:['https://www.googleapis.com/auth/gmail.readonly']});
  const gmail=google.gmail({version:'v1',auth});
  // Original message and reply both remain within explicitly managed app identities.
  const marker=`transition-inbox-${randomUUID()}`;
  const {default:Communications}=await import('../services/communicationLogging.service.js');
  const record=await Communications.logGeneratedCommunication({agencyId:2,templateType:'transition_inbox_verification',subject:`Transition inbox routing verification ${marker}`,body:'Internal automated test of the requested Group-to-app inbox route. No provider action required.',recipientAddress:TRANSITION_INBOX,generatedByUserId:null,metadata:{actorType:'automation',automationSubject:TRANSITION_AUTOMATION,fromEmail:TRANSITION_INBOX}});
  const messageId=`<comm-${record.id}@auricwell.com>`;
  const raw=Buffer.from(`From: AuricWell Transition Team <${TRANSITION_INBOX}>\r\nTo: ${TRANSITION_INBOX}\r\nSubject: Transition inbox routing verification ${marker}\r\nMessage-ID: ${messageId}\r\nDate: ${new Date().toUTCString()}\r\nAuto-Submitted: auto-generated\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nAutomated routing verification for the requested ITSCO transition inbox. No provider action required.`).toString('base64url');
  // SMTP delivery deliberately precedes any Sent archival copy. Gmail suppresses
  // a message sent to one's own Group through gmail.messages.send, so that would
  // not be an independent test of Group delivery into the application inbox.
  const {GoogleAuth}=await import('google-auth-library');
  const relayUrl=process.env.WORKSPACE_EMAIL_RELAY_URL;
  if(!/^https:\/\/workspace-mail-relay-[a-z0-9-]+\.a\.run\.app$/.test(relayUrl||''))throw Error('Configure the approved private Workspace relay before testing inbox delivery.');
  const relay=await new GoogleAuth().getIdTokenClient(relayUrl);
  const delivery=(await relay.request({url:relayUrl+'/send',method:'POST',data:{key:`communication:${record.id}`,from:TRANSITION_INBOX,raw},timeout:25000,retry:false})).data;
  if(delivery?.status!=='accepted'||delivery.messageId!==messageId)throw Error('The relay did not confirm the internal inbox test.');
  await Communications.markAsSent(record.id,delivery.id,{actorType:'automation',automationSubject:TRANSITION_AUTOMATION,internetMessageId:messageId});
  let verified=false;
  for(let attempt=0;attempt<10&&!verified;attempt++){
   if(attempt)await new Promise(r=>setTimeout(r,5000));
   const messages=(await gmail.users.messages.list({userId:'me',q:`subject:${marker}`,maxResults:10})).data.messages||[];
   for(const item of messages){const m=(await gmail.users.messages.get({userId:'me',id:item.id,format:'metadata',metadataHeaders:['From','List-ID','X-BeenThere','Delivered-To']})).data;
    const headers=m.payload?.headers||[],from=headers.find(h=>h.name.toLowerCase()==='from')?.value||'';
    const visibleFrom=(from.match(/<([^<>]+)>/)?.[1]||from).trim().toLowerCase();
    const routed=headers.some(h=>['list-id','x-beenthere'].includes(h.name.toLowerCase())&&h.value.toLowerCase().includes('transitions'));
    if(routed&&visibleFrom===TRANSITION_INBOX&&(m.labelIds||[]).includes('INBOX'))verified=true;
   }
  }
  if(!verified)throw Error('The visible SMTP sender and Group-to-app inbox round trip are not yet confirmed. Do not activate.');
  const {default:Identity}=await import('../models/EmailSenderIdentity.model.js');
  let identity=await Identity.findByAgencyAndIdentityKey(2,'transition_sequence');
  if(!identity)identity=await Identity.create({agencyId:2,identityKey:'transition_sequence',displayName:'AuricWell Transition Team',fromEmail:TRANSITION_INBOX,replyTo:TRANSITION_INBOX,inboundAddresses:[TRANSITION_INBOX],isActive:true});
  else{if(identity.from_email!==TRANSITION_INBOX)throw Error('A different transition sender already exists; review it before changing.');await Identity.replaceInboundRoutes(identity.id,[TRANSITION_INBOX]);await Identity.update(identity.id,{replyTo:TRANSITION_INBOX,isActive:true});}
  await live.recordTransitionInboxSetup({address:TRANSITION_INBOX,verifiedFrom:TRANSITION_INBOX,transport:'workspace_smtp_relay',visibleFromVerified:true,roundTripVerified:true,groupSettingsVerifiedByOwner:true,groupMembershipVerifiedByOperator:true,senderIdentityId:identity.id,automationSubject:TRANSITION_AUTOMATION,verificationCommunicationId:record.id,relayReceipt:delivery.id,verifiedAt:new Date().toISOString()});
  console.log(JSON.stringify({mode,ready:true,senderIdentityId:identity.id,roundTripVerified:true,visibleFromVerified:true,transport:'workspace_smtp_relay'}));
 }else if(mode==='preview'){
  const plan=await live.transitionSequencePreview();const kimi=plan.providers.find(p=>p.explicitAddition);console.log(JSON.stringify({mode,providerCount:plan.providers.length,hosts:plan.hosts.map(h=>({id:h.userId,name:h.name,email:h.email})),kimi:kimi?{userId:kimi.userId,name:kimi.name,group:kimi.group,payrollAgencyId:kimi.payrollAgencyId}:null,meetings:plan.sessions.map(s=>({number:s.number,startAt:s.startAt,endAt:s.endAt,initialProviders:plan.providers.filter(p=>p.initialMeeting===s.number).length})),fingerprint:plan.fingerprint}));
 }else if(mode==='activate'){console.log(JSON.stringify(await live.activateTransitionSequence()));console.log(JSON.stringify(await live.processTransitionSequence()));}
 else if(mode==='tick')console.log(JSON.stringify(await live.processTransitionSequence()));
 else if(mode==='status')console.log(JSON.stringify({mode,...await live.transitionSequenceStatus()}));
 else throw Error('Choose setup, preview, activate, tick or status.');
}catch(error){console.error(JSON.stringify({mode,error:error.status?'TRANSITION_REVIEW_REQUIRED':error.code||'TRANSITION_OPERATION_FAILED',message:/token|private|secret|credential/i.test(String(error.message))?'Operation failed; review access configuration.':String(error.message).slice(0,300)}));process.exitCode=1;}
finally{await pool.end();}
// Imported application transports can retain background timers. All requested
// work and database cleanup are awaited above; this one-shot job must terminate.
process.exit(process.exitCode||0);
