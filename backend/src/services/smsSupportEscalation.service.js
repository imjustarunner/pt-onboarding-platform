import pool from '../config/database.js';
import { enqueueCommunicationReview } from './communicationReview.service.js';
import SmsCareThread from '../models/SmsCareThread.model.js';
import { STALE_TEXT_QUERY } from '../utils/staleTextPolicy.js';

// Keep client content in the app. Support escalation never requires a personal phone
// or an additional outbound SMS, and never pretends that reading equals responding.
class SmsSupportEscalationService {
  static async runTick() {
    const [rows] = await pool.execute(STALE_TEXT_QUERY);
    for (const row of rows) {
      // Both writes are idempotent. Queue last so a failed care-thread update retries.
      await SmsCareThread.setEscalated({agencyId:row.agency_id,clientId:row.client_id,numberId:row.number_id,
        metadata:{reason:'stale_text',messageLogId:row.id,firstUnansweredAt:row.created_at}});
      await enqueueCommunicationReview({agencyId:row.agency_id,numberId:row.number_id,channel:'sms_followup',
        externalId:row.id,reason:'stale_text',
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
