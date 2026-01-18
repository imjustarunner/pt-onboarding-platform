import pool from '../config/database.js';
import PayrollPeriod from '../models/PayrollPeriod.model.js';
import Notification from '../models/Notification.model.js';
import NotificationTrigger from '../models/NotificationTrigger.model.js';
import AgencyNotificationTriggerSetting from '../models/AgencyNotificationTriggerSetting.model.js';
import NotificationEvent from '../models/NotificationEvent.model.js';

const TRIGGER_KEY = 'payroll_unpaid_notes_2_periods_old';

function resolveSetting(trigger, setting) {
  const enabled =
    setting?.enabled === null || setting?.enabled === undefined
      ? !!trigger?.defaultEnabled
      : !!setting.enabled;

  const channels =
    setting?.channels && typeof setting.channels === 'object'
      ? setting.channels
      : (trigger?.defaultChannels && typeof trigger.defaultChannels === 'object' ? trigger.defaultChannels : { inApp: true, sms: false, email: false });

  const recipients =
    setting?.recipients && typeof setting.recipients === 'object'
      ? setting.recipients
      : (trigger?.defaultRecipients && typeof trigger.defaultRecipients === 'object' ? trigger.defaultRecipients : { provider: true, supervisor: true, clinicalPracticeAssistant: true, admin: true });

  return { enabled, channels, recipients };
}

function fmtYmd(d) {
  return String(d || '').slice(0, 10);
}

class PayrollNotesAgingService {
  static async previewTwoPeriodsOldUnpaidNotesAlerts({ agencyId, payrollPeriodId, providerUserId = null }) {
    if (!agencyId || !payrollPeriodId) return { ok: false, reason: 'missing_params' };

    const trigger = await NotificationTrigger.findByKey(TRIGGER_KEY);
    if (!trigger) return { ok: false, reason: 'trigger_missing' };

    const allSettings = await AgencyNotificationTriggerSetting.listForAgency(agencyId);
    const setting = (allSettings || []).find((s) => s.triggerKey === TRIGGER_KEY) || null;
    const resolved = resolveSetting(trigger, setting);
    if (!resolved.enabled) return { ok: true, skipped: true, reason: 'disabled', notifications: [], resolved };

    const postedPeriod = await PayrollPeriod.findById(payrollPeriodId);
    if (!postedPeriod || Number(postedPeriod.agency_id) !== Number(agencyId)) {
      return { ok: false, reason: 'period_not_found' };
    }

    const periodsDesc = await PayrollPeriod.listByAgency(agencyId, { limit: 100, offset: 0 });
    const chronological = [...(periodsDesc || [])].sort(
      (a, b) => new Date(a.period_start || a.period_end || 0).getTime() - new Date(b.period_start || b.period_end || 0).getTime()
    );
    const idx = chronological.findIndex((p) => Number(p.id) === Number(payrollPeriodId));
    const stalePeriod = idx >= 0 ? chronological[idx - 2] : null;
    if (!stalePeriod) return { ok: true, skipped: true, reason: 'no_two_periods_ago', notifications: [], resolved };

    const stalePeriodId = Number(stalePeriod.id);

    const params = [agencyId, stalePeriodId];
    let userFilterSql = '';
    if (Number.isFinite(Number(providerUserId)) && Number(providerUserId) > 0) {
      userFilterSql = ' AND ps.user_id = ?';
      params.push(Number(providerUserId));
    }

    const [rows] = await pool.execute(
      `SELECT ps.user_id,
              ps.no_note_units,
              ps.draft_units,
              u.first_name,
              u.last_name,
              u.email
       FROM payroll_summaries ps
       JOIN users u ON ps.user_id = u.id
       WHERE ps.agency_id = ?
         AND ps.payroll_period_id = ?
         ${userFilterSql}
         AND (COALESCE(ps.no_note_units, 0) + COALESCE(ps.draft_units, 0)) > 0`,
      params
    );

    const notifications = [];
    for (const r of rows || []) {
      const providerId = Number(r.user_id);
      const noNote = Number(r.no_note_units || 0);
      const draft = Number(r.draft_units || 0);
      const total = noNote + draft;
      if (!providerId || total <= 0) continue;

      const alreadySent = await NotificationEvent.exists({
        agencyId,
        triggerKey: TRIGGER_KEY,
        payrollPeriodId,
        providerUserId: providerId,
        stalePeriodId,
        recipientUserId: providerId
      });
      if (alreadySent) continue;

      const providerName = `${String(r.first_name || '').trim()} ${String(r.last_name || '').trim()}`.trim() || r.email || `User ${providerId}`;
      notifications.push({
        type: 'payroll_unpaid_notes_2_periods_old',
        severity: 'urgent',
        title: 'Unpaid notes are 2 pay periods old',
        message: `User ${providerName} still has unpaid notes from ${fmtYmd(stalePeriod.period_start)} to ${fmtYmd(stalePeriod.period_end)}: No Note ${noNote}, Draft ${draft}.`,
        userId: providerId,
        agencyId,
        stalePeriodId,
        stalePeriodStart: fmtYmd(stalePeriod.period_start),
        stalePeriodEnd: fmtYmd(stalePeriod.period_end),
        noNote,
        draft,
        audience: resolved.recipients
      });
    }

    return { ok: true, resolved, stalePeriodId, stalePeriod, notifications };
  }

  /**
   * When a payroll period is posted, alert if any providers still have unpaid notes from 2 pay periods prior.
   * Creates ONE notification per impacted provider, de-duped via notification_events.
   */
  static async emitTwoPeriodsOldUnpaidNotesAlerts({ agencyId, payrollPeriodId }) {
    if (!agencyId || !payrollPeriodId) return { ok: false, reason: 'missing_params' };

    const trigger = await NotificationTrigger.findByKey(TRIGGER_KEY);
    if (!trigger) return { ok: false, reason: 'trigger_missing' };

    const allSettings = await AgencyNotificationTriggerSetting.listForAgency(agencyId);
    const setting = (allSettings || []).find((s) => s.triggerKey === TRIGGER_KEY) || null;
    const resolved = resolveSetting(trigger, setting);
    if (!resolved.enabled) return { ok: true, skipped: true, reason: 'disabled' };

    const postedPeriod = await PayrollPeriod.findById(payrollPeriodId);
    if (!postedPeriod || Number(postedPeriod.agency_id) !== Number(agencyId)) {
      return { ok: false, reason: 'period_not_found' };
    }

    // Determine the pay period that is 2 periods prior to the posted period (chronological ordering).
    const periodsDesc = await PayrollPeriod.listByAgency(agencyId, { limit: 100, offset: 0 });
    const chronological = [...(periodsDesc || [])].sort(
      (a, b) => new Date(a.period_start || a.period_end || 0).getTime() - new Date(b.period_start || b.period_end || 0).getTime()
    );
    const idx = chronological.findIndex((p) => Number(p.id) === Number(payrollPeriodId));
    const stalePeriod = idx >= 0 ? chronological[idx - 2] : null;
    if (!stalePeriod) return { ok: true, skipped: true, reason: 'no_two_periods_ago' };

    const stalePeriodId = Number(stalePeriod.id);

    // Find providers with unpaid notes in the stale period.
    const [rows] = await pool.execute(
      `SELECT ps.user_id,
              ps.no_note_units,
              ps.draft_units,
              u.first_name,
              u.last_name,
              u.email
       FROM payroll_summaries ps
       JOIN users u ON ps.user_id = u.id
       WHERE ps.agency_id = ?
         AND ps.payroll_period_id = ?
         AND (COALESCE(ps.no_note_units, 0) + COALESCE(ps.draft_units, 0)) > 0`,
      [agencyId, stalePeriodId]
    );

    let createdCount = 0;

    for (const r of rows || []) {
      const providerUserId = Number(r.user_id);
      const noNote = Number(r.no_note_units || 0);
      const draft = Number(r.draft_units || 0);
      const total = noNote + draft;
      if (!providerUserId || total <= 0) continue;

      // De-dupe per provider per posted period (and stale period), regardless of recipient selections.
      const inserted = await NotificationEvent.tryCreate({
        agencyId,
        triggerKey: TRIGGER_KEY,
        payrollPeriodId,
        providerUserId,
        stalePeriodId,
        recipientUserId: providerUserId
      });
      if (!inserted) continue;

      const providerName = `${String(r.first_name || '').trim()} ${String(r.last_name || '').trim()}`.trim() || r.email || `User ${providerUserId}`;

      await Notification.create({
        type: 'payroll_unpaid_notes_2_periods_old',
        severity: 'urgent',
        title: 'Unpaid notes are 2 pay periods old',
        message: `User ${providerName} still has unpaid notes from ${fmtYmd(stalePeriod.period_start)} to ${fmtYmd(stalePeriod.period_end)}: No Note ${noNote}, Draft ${draft}.`,
        audienceJson: {
          provider: !!resolved.recipients?.provider,
          supervisor: !!resolved.recipients?.supervisor,
          clinicalPracticeAssistant: !!resolved.recipients?.clinicalPracticeAssistant,
          admin: !!resolved.recipients?.admin
        },
        userId: providerUserId,
        agencyId,
        relatedEntityType: 'user',
        relatedEntityId: providerUserId
      });

      createdCount += 1;
    }

    return { ok: true, createdCount, stalePeriodId };
  }
}

export default PayrollNotesAgingService;

