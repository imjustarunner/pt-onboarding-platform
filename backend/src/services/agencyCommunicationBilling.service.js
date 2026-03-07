import pool from '../config/database.js';
import AgencyCommunicationUsageLedger from '../models/AgencyCommunicationUsageLedger.model.js';

function toDateString(value) {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function minutesFromSeconds(seconds) {
  const totalSeconds = Number(seconds || 0);
  if (!(Number.isFinite(totalSeconds) && totalSeconds > 0)) return 0;
  return Math.ceil(totalSeconds / 60);
}

function normalizeRateCard(rate = null) {
  const actualCostCents = Math.max(0, Math.round(Number(rate?.actualCostCents || 0)));
  const markupCents = Math.max(0, Math.round(Number(rate?.markupCents || 0)));
  return {
    actualCostCents,
    markupCents,
    billableUnitCents: actualCostCents + markupCents
  };
}

export function getCommunicationRateCards(pricingConfig = null) {
  const pricing = pricingConfig || {};
  const communicationRateCents = pricing?.communicationRateCents || {};
  return {
    sms_outbound_client: normalizeRateCard(
      communicationRateCents.smsOutboundClient || {
        actualCostCents: 0,
        markupCents: Number(pricing?.smsUnitCents?.outboundClient || 0)
      }
    ),
    sms_inbound_client: normalizeRateCard(
      communicationRateCents.smsInboundClient || {
        actualCostCents: 0,
        markupCents: Number(pricing?.smsUnitCents?.inboundClient || 0)
      }
    ),
    sms_notification: normalizeRateCard(
      communicationRateCents.smsNotification || {
        actualCostCents: 0,
        markupCents: Number(pricing?.smsUnitCents?.notification || 0)
      }
    ),
    phone_number_monthly: normalizeRateCard(
      communicationRateCents.phoneNumberMonthly || {
        actualCostCents: 0,
        markupCents: Number(pricing?.unitCents?.phoneNumber || 0)
      }
    ),
    voice_outbound_minute: normalizeRateCard(communicationRateCents.voiceOutboundMinute),
    voice_inbound_minute: normalizeRateCard(communicationRateCents.voiceInboundMinute),
    video_participant_minute: normalizeRateCard(communicationRateCents.videoParticipantMinute)
  };
}

function buildLedgerAmounts(rateCard, quantity) {
  const units = Math.max(0, Number(quantity || 0));
  return {
    actualCostCents: Math.round(units * Number(rateCard?.actualCostCents || 0)),
    markupCents: Math.round(units * Number(rateCard?.markupCents || 0)),
    billableAmountCents: Math.round(units * Number(rateCard?.billableUnitCents || 0))
  };
}

async function upsertCountEvent({ agencyId, periodStart, periodEnd, sourceKey, sourceType, sourceId, eventType, occurredAt, quantity = 1, usageUnit = 'count', metadataJson = null, rateCard }) {
  const amounts = buildLedgerAmounts(rateCard, quantity);
  return AgencyCommunicationUsageLedger.upsertEvent({
    agencyId,
    sourceKey,
    sourceType,
    sourceId,
    eventType,
    usageQuantity: quantity,
    usageUnit,
    occurredAt,
    billingPeriodStart: periodStart,
    billingPeriodEnd: periodEnd,
    metadataJson,
    ...amounts
  });
}

class AgencyCommunicationBillingService {
  static async reconcileAgencyPeriod({ agencyId, periodStart, periodEnd, pricingConfig = null }) {
    const aid = Number(agencyId || 0);
    const start = toDateString(periodStart);
    const end = toDateString(periodEnd);
    if (!aid || !start || !end) {
      throw new Error('Valid agencyId, periodStart, and periodEnd are required');
    }

    const rates = getCommunicationRateCards(pricingConfig);

    const [outboundSmsRows] = await pool.execute(
      `SELECT id, created_at
       FROM message_logs
       WHERE agency_id = ?
         AND direction = 'OUTBOUND'
         AND delivery_status = 'sent'
         AND created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [aid, start, end]
    );

    for (const row of outboundSmsRows || []) {
      await upsertCountEvent({
        agencyId: aid,
        periodStart: start,
        periodEnd: end,
        sourceKey: `message_log:${row.id}:sms_outbound_client`,
        sourceType: 'message_log',
        sourceId: row.id,
        eventType: 'sms_outbound_client',
        occurredAt: row.created_at,
        rateCard: rates.sms_outbound_client
      });
    }

    const [inboundSmsRows] = await pool.execute(
      `SELECT id, created_at
       FROM message_logs
       WHERE agency_id = ?
         AND direction = 'INBOUND'
         AND delivery_status = 'received'
         AND created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [aid, start, end]
    );

    for (const row of inboundSmsRows || []) {
      await upsertCountEvent({
        agencyId: aid,
        periodStart: start,
        periodEnd: end,
        sourceKey: `message_log:${row.id}:sms_inbound_client`,
        sourceType: 'message_log',
        sourceId: row.id,
        eventType: 'sms_inbound_client',
        occurredAt: row.created_at,
        rateCard: rates.sms_inbound_client
      });
    }

    const [notificationSmsRows] = await pool.execute(
      `SELECT id, created_at
       FROM notification_sms_logs
       WHERE agency_id = ?
         AND status = 'sent'
         AND created_at >= ?
         AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [aid, start, end]
    );

    for (const row of notificationSmsRows || []) {
      await upsertCountEvent({
        agencyId: aid,
        periodStart: start,
        periodEnd: end,
        sourceKey: `notification_sms_log:${row.id}:sms_notification`,
        sourceType: 'notification_sms_log',
        sourceId: row.id,
        eventType: 'sms_notification',
        occurredAt: row.created_at,
        rateCard: rates.sms_notification
      });
    }

    const [callRows] = await pool.execute(
      `SELECT id, direction, duration_seconds, started_at
       FROM call_logs
       WHERE agency_id = ?
         AND duration_seconds IS NOT NULL
         AND duration_seconds > 0
         AND started_at >= ?
         AND started_at < DATE_ADD(?, INTERVAL 1 DAY)`,
      [aid, start, end]
    );

    for (const row of callRows || []) {
      const quantity = minutesFromSeconds(row.duration_seconds);
      if (!quantity) continue;
      const direction = String(row.direction || '').trim().toUpperCase();
      const eventType = direction === 'OUTBOUND' ? 'voice_outbound_minute' : 'voice_inbound_minute';
      await upsertCountEvent({
        agencyId: aid,
        periodStart: start,
        periodEnd: end,
        sourceKey: `call_log:${row.id}:${eventType}`,
        sourceType: 'call_log',
        sourceId: row.id,
        eventType,
        occurredAt: row.started_at,
        quantity,
        usageUnit: 'minute',
        metadataJson: { durationSeconds: Number(row.duration_seconds || 0) },
        rateCard: rates[eventType]
      });
    }

    const [phoneRows] = await pool.execute(
      `SELECT id, phone_number
       FROM twilio_numbers
       WHERE agency_id = ?
         AND is_active = TRUE
         AND status <> 'released'`,
      [aid]
    );

    for (const row of phoneRows || []) {
      await upsertCountEvent({
        agencyId: aid,
        periodStart: start,
        periodEnd: end,
        sourceKey: `twilio_number:${row.id}:phone_number_monthly:${start}`,
        sourceType: 'twilio_number',
        sourceId: row.id,
        eventType: 'phone_number_monthly',
        occurredAt: `${end} 23:59:59`,
        quantity: 1,
        usageUnit: 'month',
        metadataJson: { phoneNumber: row.phone_number || null },
        rateCard: rates.phone_number_monthly
      });
    }

    const [supervisionVideoRows] = await pool.execute(
      `SELECT ssar.session_id, ssar.user_id, ssar.total_seconds, ss.start_at
       FROM supervision_session_attendance_rollups ssar
       INNER JOIN supervision_sessions ss ON ss.id = ssar.session_id
       WHERE ss.agency_id = ?
         AND ss.start_at >= ?
         AND ss.start_at < DATE_ADD(?, INTERVAL 1 DAY)
         AND COALESCE(ssar.total_seconds, 0) > 0
         AND UPPER(COALESCE(ss.status, 'SCHEDULED')) <> 'CANCELLED'`,
      [aid, start, end]
    );

    for (const row of supervisionVideoRows || []) {
      const quantity = minutesFromSeconds(row.total_seconds);
      if (!quantity) continue;
      await upsertCountEvent({
        agencyId: aid,
        periodStart: start,
        periodEnd: end,
        sourceKey: `supervision_session:${row.session_id}:user:${row.user_id}:video_participant_minute`,
        sourceType: 'supervision_session_attendance_rollup',
        sourceId: row.session_id,
        eventType: 'video_participant_minute',
        occurredAt: row.start_at,
        quantity,
        usageUnit: 'minute',
        metadataJson: { userId: Number(row.user_id || 0), totalSeconds: Number(row.total_seconds || 0) },
        rateCard: rates.video_participant_minute
      });
    }

    const [meetingVideoRows] = await pool.execute(
      `SELECT r.event_id, r.user_id, r.total_seconds, pse.start_at
       FROM agency_meeting_attendance_rollups r
       INNER JOIN provider_schedule_events pse ON pse.id = r.event_id
       WHERE pse.agency_id = ?
         AND UPPER(COALESCE(pse.kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
         AND UPPER(COALESCE(pse.status, 'ACTIVE')) <> 'CANCELLED'
         AND pse.start_at >= ?
         AND pse.start_at < DATE_ADD(?, INTERVAL 1 DAY)
         AND COALESCE(r.total_seconds, 0) > 0`,
      [aid, start, end]
    );

    for (const row of meetingVideoRows || []) {
      const quantity = minutesFromSeconds(row.total_seconds);
      if (!quantity) continue;
      await upsertCountEvent({
        agencyId: aid,
        periodStart: start,
        periodEnd: end,
        sourceKey: `meeting_event:${row.event_id}:user:${row.user_id}:video_participant_minute`,
        sourceType: 'agency_meeting_attendance_rollup',
        sourceId: row.event_id,
        eventType: 'video_participant_minute',
        occurredAt: row.start_at,
        quantity,
        usageUnit: 'minute',
        metadataJson: { userId: Number(row.user_id || 0), totalSeconds: Number(row.total_seconds || 0) },
        rateCard: rates.video_participant_minute
      });
    }

    return AgencyCommunicationUsageLedger.summarizeForAgencyPeriod(aid, {
      periodStart: start,
      periodEnd: end
    });
  }

  static async getAgencyPeriodSummary({ agencyId, periodStart, periodEnd }) {
    const aid = Number(agencyId || 0);
    const start = toDateString(periodStart);
    const end = toDateString(periodEnd);
    if (!aid || !start || !end) return [];
    return AgencyCommunicationUsageLedger.summarizeForAgencyPeriod(aid, {
      periodStart: start,
      periodEnd: end
    });
  }
}

export default AgencyCommunicationBillingService;
