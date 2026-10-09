/** Explicit setup only; never sends a message or grants access to clinical records. */
import pool from '../config/database.js';
import {ensureSendAsAlias} from '../services/gmailSendAs.service.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';
const agencyId=Number(process.argv.find(a=>a.startsWith('--agency='))?.split('=')[1]||2);
try {
 const [[group]]=await pool.execute("SELECT * FROM managed_workspace_groups WHERE agency_id=? AND group_key='spanish'",[agencyId]);
 if(!group?.chat_thread_id)throw new Error('Complete the Spanish intake group first.');
 const alias=group.email.replace(/^spanish@/,'espanol@');
 const sendAs=await ensureSendAsAlias({sendAsEmail:group.email,displayName:'Spanish intake team',replyToAddress:group.email});
 if(!sendAs.ok||sendAs.sendAs?.verificationStatus!=='accepted')throw new Error(sendAs.error||'Google sender verification is still pending.');
 let identity=await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId,'spanish');
 if(!identity)identity=await EmailSenderIdentity.create({agencyId,identityKey:'spanish',displayName:'Spanish intake team',fromEmail:group.email,replyTo:group.email,inboundAddresses:[group.email,alias],isActive:true});
 if(identity.from_email!==group.email)throw new Error('Existing Spanish sender uses a different address.');
 await EmailSenderIdentity.replaceInboundRoutes(identity.id,[group.email,alias]);
 await pool.execute(`INSERT INTO communication_inboxes(agency_id,sender_identity_id,kind,identity_key,display_name,from_email,is_active)
  VALUES (?,?,'shared','spanish','Spanish intake team',?,1) ON DUPLICATE KEY UPDATE sender_identity_id=VALUES(sender_identity_id),is_active=1`,[agencyId,identity.id,group.email]);
 const inbox=await CommunicationInbox.findBySenderIdentityId(identity.id);
 console.log(JSON.stringify({agencyId,email:group.email,alias,senderIdentityId:identity.id,inboxId:inbox.id,verified:true,messagesSent:0}));
}finally{await pool.end();}
