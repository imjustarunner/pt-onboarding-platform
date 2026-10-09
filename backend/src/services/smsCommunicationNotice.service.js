import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import MessageLog from '../models/MessageLog.model.js';
import VonageService from './vonage.service.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';

export function communicationRulesNotice(agency) {
  const url = new URL('/community-standards', buildPublicPortalBaseUrl(agency)).href;
  return `${agency.name || 'Your care team'}: Texts are saved in your client record and may be reviewed by authorized care/support staff. Please be respectful and use the secure app for sensitive details. Rules: ${url}`;
}
// Only called after reception, keywords, polls, appointment replies and OOO handling.
// A conversation starts after 24 hours without an incoming message. Serialize retries.
export async function sendConversationStartNotice({agencyId,numberId,clientId,userId,from,to,inboundLogId}) {
  if (!agencyId || !numberId || !clientId || !inboundLogId) return false;
  const db=await pool.getConnection();
  const lock=`sms-notice-${createHash('sha256').update(`${agencyId}:${numberId}:${to}`).digest('hex').slice(0,40)}`;
  let locked=false;
  try {
    const [locks]=await db.execute('SELECT GET_LOCK(?, 2) AS acquired',[lock]);
    locked=Number(locks[0]?.acquired)===1;if(!locked)return false;
    const [recent]=await db.execute(`SELECT id FROM message_logs WHERE agency_id=? AND number_id=?
      AND client_id=? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      AND ((direction='INBOUND' AND from_number=? AND id<>?)
        OR (direction='OUTBOUND' AND to_number=? AND JSON_EXTRACT(metadata, '$.communicationNotice')=true)) LIMIT 1`,
      [agencyId,numberId,clientId,to,inboundLogId,to]);
    if(recent.length)return false;
    const agency=await Agency.findById(agencyId);if(!agency)return false;
    const body=`${communicationRulesNotice(agency)} Your message is received, but this does not confirm anyone has read it. Replies depend on staff availability. Not for emergencies: call/text 988 for a crisis or 911 for immediate danger. Reply STOP to opt out.`;
    const metadata={communicationNotice:true,triggerInboundId:inboundLogId,provider:'vonage'};
    const log=await MessageLog.createOutbound({agencyId,numberId,clientId,userId,fromNumber:from,toNumber:to,body,metadata});
    try {
      // Normal care consent, sender approval, STOP and healthcare gates still apply.
      const sent=await VonageService.sendSms({purpose:'care',agencyId,from,to,body});
      await MessageLog.markSent(log.id,sent.sid,metadata);
    } catch(error) {await MessageLog.markFailed(log.id,error.code||'sms_send_failed');return false;}
    return true;
  } finally {try{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{db.release();}}
}
