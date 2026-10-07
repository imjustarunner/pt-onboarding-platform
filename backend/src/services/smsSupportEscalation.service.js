import pool from '../config/database.js';
import { enqueueCommunicationReview } from './communicationReview.service.js';
import SmsCareThread from '../models/SmsCareThread.model.js';

// Keep client content in the app. Support escalation never requires a personal phone
// or an additional outbound SMS, and never pretends that reading equals responding.
class SmsSupportEscalationService {
  static async runTick() {
    const [rows] = await pool.execute(`SELECT ml.id, ml.agency_id, ml.number_id, ml.client_id, ml.body,
      ml.from_number, ml.to_number, ml.is_read
      FROM message_logs ml JOIN agencies a ON a.id=ml.agency_id
      WHERE ml.direction='INBOUND' AND ml.client_id IS NOT NULL
        AND ml.created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL LEAST(168,GREATEST(1,
          COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(a.feature_flags,'$.smsSupportEscalationHours')) AS UNSIGNED),12))) HOUR)
        AND NOT EXISTS (SELECT 1 FROM message_logs reply WHERE reply.agency_id=ml.agency_id
          AND reply.number_id <=> ml.number_id AND reply.sms_thread_key=ml.sms_thread_key
          AND reply.direction='OUTBOUND' AND reply.delivery_status='sent' AND reply.created_at>ml.created_at
          AND COALESCE(JSON_EXTRACT(reply.metadata,'$.autoReply'),FALSE)=FALSE
          AND COALESCE(JSON_EXTRACT(reply.metadata,'$.vacationReply'),FALSE)=FALSE
          AND COALESCE(JSON_EXTRACT(reply.metadata,'$.forwardOffer'),FALSE)=FALSE)
        AND NOT EXISTS (SELECT 1 FROM message_logs newer WHERE newer.agency_id=ml.agency_id
          AND newer.number_id <=> ml.number_id AND newer.sms_thread_key=ml.sms_thread_key
          AND newer.direction='INBOUND' AND newer.id>ml.id)
        AND NOT EXISTS (SELECT 1 FROM communication_review_queue q WHERE q.agency_id=ml.agency_id
          AND q.channel='sms_followup' AND q.external_id=CAST(ml.id AS CHAR))
      ORDER BY ml.created_at LIMIT 100`);
    for (const row of rows) {
      // Both writes are idempotent. Queue last so a failed care-thread update retries.
      await SmsCareThread.setEscalated({agencyId:row.agency_id,clientId:row.client_id,numberId:row.number_id,
        metadata:{reason:'unanswered_text',messageLogId:row.id}});
      await enqueueCommunicationReview({agencyId:row.agency_id,numberId:row.number_id,channel:'sms_followup',
        externalId:row.id,reason:row.is_read ? 'unanswered_text' : 'unread_text',
        from:row.from_number,to:row.to_number,body:row.body,messageLogId:row.id});
    }
    // This prepares support review for stored voicemail. Voice capture itself is not live.
    const [voicemails] = await pool.execute(`SELECT cv.id,cv.agency_id,cv.from_number,cv.to_number
      FROM call_voicemails cv JOIN agencies a ON a.id=cv.agency_id
      WHERE cv.listened_at IS NULL AND cv.created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL LEAST(168,GREATEST(1,
        COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(a.feature_flags,'$.smsSupportEscalationHours')) AS UNSIGNED),12))) HOUR)
      AND NOT EXISTS (SELECT 1 FROM communication_review_queue q WHERE q.agency_id=cv.agency_id
        AND q.channel='voicemail' AND q.external_id=CAST(cv.id AS CHAR))
      ORDER BY cv.created_at LIMIT 100`);
    for (const row of voicemails) await enqueueCommunicationReview({agencyId:row.agency_id,channel:'voicemail',
      externalId:row.id,reason:'unheard_voicemail',from:row.from_number,to:row.to_number,
      body:'An unheard voicemail needs support review in the app.',voicemailId:row.id});
  }
}
export default SmsSupportEscalationService;
