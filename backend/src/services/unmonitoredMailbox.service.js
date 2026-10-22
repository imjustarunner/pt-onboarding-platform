import {createHash} from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import {sendEmailFromIdentity} from './unifiedEmail/unifiedEmailSender.service.js';
import {buildPublicAppUrl} from '../utils/publicPortalUrl.js';
import {isUnmonitoredAddress,shouldReplyToUnmonitored,unmonitoredReplyText} from '../utils/unmonitoredMailbox.js';

export async function handleUnmonitoredMailboxReply({headers,fromEmail,gmailMessageId}) {
  if(!['to','cc','delivered-to','x-original-to','envelope-to'].some(key=>isUnmonitoredAddress(headers.get(key))))return {handled:false};
  const addresses=['to','cc','delivered-to','x-original-to','envelope-to'].flatMap(key=>String(headers.get(key)||'').toLowerCase().split(/[\s,;<>]+/)).filter(isUnmonitoredAddress);
  let mailbox=null;
  for(const address of addresses){const candidate=await EmailSenderIdentity.findByFromEmail(address);if(candidate&&['noreply','exchange_noreply'].includes(candidate.identity_key)){mailbox=candidate;break;}}
  if(!mailbox)return {handled:false};
  if(!shouldReplyToUnmonitored({headers,fromEmail}))return {handled:true,reason:'automated_or_loop'};
  const connection=await pool.getConnection();
  const key=`unmonitored:${createHash('sha256').update(String(fromEmail).toLowerCase()).digest('hex').slice(0,40)}`;
  let locked=false;
  try {
    const [[lock]]=await connection.execute('SELECT GET_LOCK(?,0) acquired',[key]);locked=Number(lock?.acquired)===1;
    if(!locked)throw Object.assign(new Error('Mailbox reply is being processed'),{code:'REPLY_BUSY'});
    const [[previous]]=await pool.execute('SELECT status FROM unmonitored_mailbox_replies WHERE gmail_message_id=?',[gmailMessageId]);
    if(previous)return {handled:true,reason:'already_attempted'};
    const [[recent]]=await pool.execute("SELECT gmail_message_id FROM unmonitored_mailbox_replies WHERE recipient_email=? AND created_at>NOW()-INTERVAL 24 HOUR LIMIT 1",[String(fromEmail).toLowerCase()]);
    if(recent)return {handled:true,reason:'reply_rate_limited'};
    const references=(`${headers.get('in-reply-to')||''} ${headers.get('references')||''}`.match(/<[^<>\s]+@[^<>\s]+>/g)||[]).slice(-20);
    let agencyId=null;
    if(references.length){
      const [outbound]=await pool.execute(`SELECT agency_id,recipient_address FROM user_communications WHERE channel='email'
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.internetMessageId')) IN (${references.map(()=>'?').join(',')}) ORDER BY id DESC LIMIT 20`,references);
      // Use a stored outbound conversation only when this sender was its recipient.
      const match=outbound.find(row=>String(row.recipient_address||'').toLowerCase()===String(fromEmail).toLowerCase());
      agencyId=match?.agency_id||null;
    }
    // Agency-specific no-reply addresses identify their agency even without a thread.
    // Auricwell's shared address needs a verified outbound reference to name an agency.
    if(!agencyId && !/@auricwell\.com$/i.test(mailbox.from_email))agencyId=mailbox.agency_id||null;
    const agency=agencyId?await Agency.findById(agencyId):null;
    const identity=mailbox;
    if(!identity?.id)throw Object.assign(new Error('No-reply sender is not configured'),{code:'NO_REPLY_IDENTITY_MISSING'});
    const support=agencyId?await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId,'support'):null;
    const text=unmonitoredReplyText({agencyName:agency?.name,supportEmail:support?.from_email,appUrl:agency?buildPublicAppUrl(agency,'client-exchange'):buildPublicAppUrl(null,'login')});
    await pool.execute("INSERT INTO unmonitored_mailbox_replies (gmail_message_id,recipient_email,agency_id,status) VALUES (?,?,?,'sending')",[gmailMessageId,String(fromEmail).toLowerCase(),agencyId]);
    try {
      const result=await sendEmailFromIdentity({senderIdentityId:identity.id,to:fromEmail,source:'auto',templateType:'unmonitored_mailbox_auto_reply',
        subject:'This mailbox is not monitored',text,replyToOverride:identity.from_email,fromDisplayNameOverride:`${agency?.name||'Auricwell'} — Automated Reply`,
        inReplyTo:headers.get('message-id')||null,internetMessageIdOverride:`<unmonitored-${createHash('sha256').update(gmailMessageId).digest('hex').slice(0,32)}@auricwell.com>`});
      const status=result?.redirected?'redirected':result?.queued?'queued':result?.skipped?'skipped':result?.blocked||result?.failed?'failed':result?.id?'sent':'unknown';
      await pool.execute('UPDATE unmonitored_mailbox_replies SET status=?,communication_id=? WHERE gmail_message_id=?',[status,result?.communicationId||null,gmailMessageId]);
      return {handled:true,status};
    }catch(error){await pool.execute("UPDATE unmonitored_mailbox_replies SET status='unknown' WHERE gmail_message_id=?",[gmailMessageId]);throw error;}
  }finally{if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',[key]).catch(()=>{});connection.release();}
}
