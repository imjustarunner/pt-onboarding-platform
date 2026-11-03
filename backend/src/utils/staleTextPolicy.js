export const DEFAULT_STALE_TEXT_HOURS = 24;

// One review item per conversation, timed from its first unanswered message.
// Automated notices and personal-phone forwarding are not answers to a family.
export const STALE_TEXT_QUERY = `WITH unanswered_texts AS (
  SELECT ml.id, ml.agency_id, ml.number_id, ml.client_id, ml.body,
    ml.from_number, ml.to_number, ml.is_read, ml.created_at, ml.sms_thread_key,
    LEAST(168,GREATEST(1,COALESCE(CAST(JSON_UNQUOTE(
      JSON_EXTRACT(a.feature_flags,'$.smsSupportEscalationHours')) AS UNSIGNED),${DEFAULT_STALE_TEXT_HOURS}))) AS stale_hours,
    ROW_NUMBER() OVER (PARTITION BY ml.agency_id,ml.number_id,ml.client_id,ml.sms_thread_key
      ORDER BY ml.created_at,ml.id) AS unanswered_position
  FROM message_logs ml JOIN agencies a ON a.id=ml.agency_id
  WHERE ml.direction='INBOUND' AND ml.client_id IS NOT NULL AND ml.sms_thread_key IS NOT NULL
    AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ml.metadata,'$.supportChoiceAccepted')),'false') NOT IN ('true','1')
    AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ml.metadata,'$.outOfOfficeNoticesDisabled')),'false') NOT IN ('true','1')
    AND NOT EXISTS (
      SELECT 1 FROM message_logs reply WHERE reply.agency_id=ml.agency_id
        AND reply.client_id=ml.client_id AND reply.number_id <=> ml.number_id
        AND reply.sms_thread_key=ml.sms_thread_key AND reply.direction='OUTBOUND'
        AND reply.delivery_status IN ('sent','delivered')
        AND (reply.created_at>ml.created_at OR (reply.created_at=ml.created_at AND reply.id>ml.id))
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(reply.metadata,'$.autoReply')),'false') NOT IN ('true','1')
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(reply.metadata,'$.vacationReply')),'false') NOT IN ('true','1')
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(reply.metadata,'$.forwardOffer')),'false') NOT IN ('true','1')
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(reply.metadata,'$.communicationNotice')),'false') NOT IN ('true','1')
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(reply.metadata,'$.outOfOfficeNotice')),'false') NOT IN ('true','1')
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(reply.metadata,'$.supportChoiceOffer')),'false') NOT IN ('true','1')
        AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(reply.metadata,'$.supportChoiceConfirmation')),'false') NOT IN ('true','1')
    )
    AND NOT EXISTS (
      SELECT 1 FROM communication_review_queue handled
      JOIN message_logs source ON source.id=handled.message_log_id AND source.agency_id=handled.agency_id
      WHERE handled.agency_id=ml.agency_id AND handled.channel='sms_followup'
        AND handled.status='resolved' AND handled.reviewed_at>=ml.created_at
        AND source.client_id=ml.client_id AND source.number_id <=> ml.number_id
        AND source.sms_thread_key=ml.sms_thread_key
    )
)
SELECT ml.* FROM unanswered_texts ml
WHERE ml.unanswered_position=1
  AND ml.created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ml.stale_hours HOUR)
  AND NOT EXISTS (
    SELECT 1 FROM communication_review_queue q
    JOIN message_logs source ON source.id=q.message_log_id AND source.agency_id=q.agency_id
    WHERE q.agency_id=ml.agency_id AND q.channel='sms_followup' AND q.status IN ('review','spam')
      AND source.client_id=ml.client_id AND source.number_id <=> ml.number_id
      AND source.sms_thread_key=ml.sms_thread_key
  )
ORDER BY ml.created_at,ml.id LIMIT 100`;
