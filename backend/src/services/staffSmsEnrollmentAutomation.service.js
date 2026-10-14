import pool from '../config/database.js';
import { reviewSmsConsentRequest } from './smsConsentRequest.service.js';
import Vonage from './vonage.service.js';
import SmsLog from '../models/NotificationSmsLog.model.js';

// An agency must explicitly authorize this workflow. Existing signatures are
// verified by the same review path; STOP and the live carrier gate still apply.
export async function processStaffSmsEnrollments({ database=pool, review=reviewSmsConsentRequest, sendConfirmation=null, agencyId=null }={}) {
  const [rows] = await database.execute(`SELECT r.id,r.agency_id,s.authorized_by_user_id,JSON_UNQUOTE(JSON_EXTRACT(r.disclosure_json,'$.userId')) AS user_id
    FROM sms_consent_requests r JOIN staff_sms_enrollment_automation s ON s.agency_id=r.agency_id AND s.enabled=1
    JOIN users actor ON actor.id=s.authorized_by_user_id
    WHERE r.signed_at IS NOT NULL AND r.review_token IS NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(r.disclosure_json,'$.enrollmentCategory'))='staff_communications'
      AND JSON_EXTRACT(r.activation_json,'$._automation') IS NULL
      AND (actor.role='super_admin' OR (actor.role IN ('admin','support','assistant_admin') AND EXISTS
        (SELECT 1 FROM user_agencies ua WHERE ua.user_id=actor.id AND ua.agency_id=r.agency_id)))
      AND (? IS NULL OR r.agency_id=?) ORDER BY r.id LIMIT 40`,[agencyId,agencyId]);
  const results=[];
  for(const row of rows) {
    const audit={status:'processing',mode:'agency_authorized_automation',authorizedBy:row.authorized_by_user_id,startedAt:new Date().toISOString()};
    const [claim]=await database.execute(`UPDATE sms_consent_requests SET activation_json=JSON_SET(COALESCE(activation_json,JSON_OBJECT()),'$._automation',CAST(? AS JSON))
      WHERE id=? AND review_token IS NULL AND JSON_EXTRACT(activation_json,'$._automation') IS NULL`,[JSON.stringify(audit),row.id]);
    if(!claim.affectedRows)continue;
    try {
      await review({agencyId:row.agency_id,requestId:row.id,actorUserId:row.authorized_by_user_id,signerVerified:true,sendConfirmation:sendConfirmation || (async message => {
        const log=await SmsLog.create({userId:Number(row.user_id),agencyId:row.agency_id,toNumber:message.to,fromNumber:message.from,body:message.body});
        try { const sent=await Vonage.sendSms(message); await SmsLog.updateStatus(log.id,{status:'sent',providerRef:sent.sid}); return sent; }
        catch(error) { await SmsLog.updateStatus(log.id,{status:'failed',errorMessage:String(error.code||error.message).slice(0,300)}); throw error; }
      })});
      audit.status='complete';
    } catch(error) {
      // Do not retry an ambiguous SMS confirmation. Keep the exact failure for admin review.
      audit.status='needs_review';audit.reason=String(error.code||error.message||'activation_failed').slice(0,300);
    }
    audit.finishedAt=new Date().toISOString();
    await database.execute("UPDATE sms_consent_requests SET activation_json=JSON_SET(COALESCE(activation_json,JSON_OBJECT()),'$._automation',CAST(? AS JSON)) WHERE id=?",[JSON.stringify(audit),row.id]);
    results.push({requestId:row.id,status:audit.status,...(audit.reason?{reason:audit.reason}:{})});
  }
  return results;
}
