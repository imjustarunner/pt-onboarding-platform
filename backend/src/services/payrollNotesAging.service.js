import pool from '../config/database.js';
import PayrollPeriod from '../models/PayrollPeriod.model.js';
import Notification from '../models/Notification.model.js';
import { incrementScore, decrementScore } from './payrollDelinquencyScore.service.js';
import NotificationTrigger from '../models/NotificationTrigger.model.js';
import AgencyNotificationTriggerSetting from '../models/AgencyNotificationTriggerSetting.model.js';
import NotificationEvent from '../models/NotificationEvent.model.js';

const TRIGGER_KEY = 'payroll_unpaid_notes_2_periods_old';
const MISSING_NOTES_TRIGGER_KEY = 'payroll_missing_notes_reminder';

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
  static async _latestImportIdForPeriod(payrollPeriodId) {
    const [rows] = await pool.execute(
      `SELECT id
       FROM payroll_imports
       WHERE payroll_period_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [payrollPeriodId]
    );
    return rows?.[0]?.id || null;
  }

  static async getUnpaidCountForUser({ agencyId, payrollPeriodId, providerUserId }) {
    const rows = await this._listUnpaidNoteCountsForPeriod({
      agencyId,
      payrollPeriodId,
      providerUserId: providerUserId || null
    });
    const r = rows?.[0] || null;
    if (!r) return 0;
    return (Number(r.no_note_notes || 0) + Number(r.draft_notes || 0)) || 0;
  }

  static async _listUnpaidNoteCountsForPeriod({ agencyId, payrollPeriodId, providerUserId = null }) {
    const payrollImportId = await this._latestImportIdForPeriod(payrollPeriodId);
    if (!payrollImportId) return [];

    const params = [payrollPeriodId, payrollImportId, agencyId];
    let userFilterSql = '';
    if (Number.isFinite(Number(providerUserId)) && Number(providerUserId) > 0) {
      userFilterSql = ' AND pir.user_id = ?';
      params.push(Number(providerUserId));
    }

    const [rows] = await pool.execute(
      `SELECT
         pir.user_id,
         u.first_name,
         u.last_name,
         u.email,
         SUM(CASE WHEN UPPER(TRIM(pir.note_status)) = 'NO_NOTE' THEN 1 ELSE 0 END) AS no_note_notes,
         SUM(CASE WHEN UPPER(TRIM(pir.note_status)) = 'DRAFT' AND COALESCE(pir.draft_payable, 1) = 0 THEN 1 ELSE 0 END) AS draft_notes
       FROM payroll_import_rows pir
       JOIN users u ON pir.user_id = u.id
       WHERE pir.payroll_period_id = ?
         AND pir.payroll_import_id = ?
         AND pir.agency_id = ?
         ${userFilterSql}
         AND (
           UPPER(TRIM(pir.note_status)) = 'NO_NOTE'
           OR (UPPER(TRIM(pir.note_status)) = 'DRAFT' AND COALESCE(pir.draft_payable, 1) = 0)
         )
       GROUP BY pir.user_id, u.first_name, u.last_name, u.email`,
      params
    );
    return rows || [];
  }

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

    const rows = await this._listUnpaidNoteCountsForPeriod({ agencyId, payrollPeriodId: stalePeriodId, providerUserId });

    const notifications = [];
    for (const r of rows || []) {
      const providerId = Number(r.user_id);
      const noNote = Number(r.no_note_notes || 0);
      const draft = Number(r.draft_notes || 0);
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
        message: `User ${providerName} still has unpaid notes from ${fmtYmd(stalePeriod.period_start)} to ${fmtYmd(stalePeriod.period_end)}: No Note ${noNote} notes, Draft ${draft} notes.`,
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
    const rows = await this._listUnpaidNoteCountsForPeriod({ agencyId, payrollPeriodId: stalePeriodId, providerUserId: null });

    let createdCount = 0;

    for (const r of rows || []) {
      const providerUserId = Number(r.user_id);
      const noNote = Number(r.no_note_notes || 0);
      const draft = Number(r.draft_notes || 0);
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
        message: `User ${providerName} still has unpaid notes from ${fmtYmd(stalePeriod.period_start)} to ${fmtYmd(stalePeriod.period_end)}: No Note ${noNote} notes, Draft ${draft} notes.`,
        audienceJson: {
          provider: !!resolved.recipients?.provider,
          supervisor: !!resolved.recipients?.supervisor,
          clinicalPracticeAssistant: !!resolved.recipients?.clinicalPracticeAssistant,
          admin: !!resolved.recipients?.admin
        },
        userId: providerUserId,
        agencyId,
        relatedEntityType: 'user',
        relatedEntityId: providerUserId,
        actorSource: 'Payroll'
      });

      await incrementScore(providerUserId, agencyId);
      createdCount += 1;
    }

    await this._reconcileDelinquencyScores(agencyId, stalePeriodId);
    return { ok: true, createdCount, stalePeriodId };
  }

  /**
   * When a payroll period is posted, remind providers if they still have NO_NOTE/DRAFT units
   * in that pay period. This is a lightweight “final reminder” to ensure documentation is completed
   * (especially missed appointment notes) before/at the end of the pay period.
   *
   * Creates ONE notification per impacted provider, de-duped via notification_events.
   */
  static async emitMissingNotesReminderOnPost({ agencyId, payrollPeriodId }) {
    if (!agencyId || !payrollPeriodId) return { ok: false, reason: 'missing_params' };

    const trigger = await NotificationTrigger.findByKey(MISSING_NOTES_TRIGGER_KEY);
    if (!trigger) return { ok: false, reason: 'trigger_missing' };

    const allSettings = await AgencyNotificationTriggerSetting.listForAgency(agencyId);
    const setting = (allSettings || []).find((s) => s.triggerKey === MISSING_NOTES_TRIGGER_KEY) || null;
    const resolved = resolveSetting(trigger, setting);
    if (!resolved.enabled) return { ok: true, skipped: true, reason: 'disabled' };

    const postedPeriod = await PayrollPeriod.findById(payrollPeriodId);
    if (!postedPeriod || Number(postedPeriod.agency_id) !== Number(agencyId)) {
      return { ok: false, reason: 'period_not_found' };
    }

    const rows = await this._listUnpaidNoteCountsForPeriod({ agencyId, payrollPeriodId, providerUserId: null });

    let createdCount = 0;
    for (const r of rows || []) {
      const providerUserId = Number(r.user_id);
      const noNote = Number(r.no_note_notes || 0);
      const draft = Number(r.draft_notes || 0);
      const total = noNote + draft;
      if (!providerUserId || total <= 0) continue;

      const inserted = await NotificationEvent.tryCreate({
        agencyId,
        triggerKey: MISSING_NOTES_TRIGGER_KEY,
        payrollPeriodId,
        providerUserId,
        stalePeriodId: null,
        recipientUserId: providerUserId
      });
      if (!inserted) continue;

      const providerName = `${String(r.first_name || '').trim()} ${String(r.last_name || '').trim()}`.trim() || r.email || `User ${providerUserId}`;
      const start = fmtYmd(postedPeriod.period_start);
      const end = fmtYmd(postedPeriod.period_end);

      await Notification.create({
        type: 'payroll_missing_notes_reminder',
        severity: 'warning',
        title: 'Notes need attention',
        message: `User ${providerName} has unpaid notes for ${start} to ${end}: No Note ${noNote} notes, Draft ${draft} notes. Please make sure all missed appointment notes are written prior to the end of the pay period.`,
        audienceJson: {
          provider: !!resolved.recipients?.provider,
          supervisor: !!resolved.recipients?.supervisor,
          clinicalPracticeAssistant: !!resolved.recipients?.clinicalPracticeAssistant,
          admin: !!resolved.recipients?.admin
        },
        userId: providerUserId,
        agencyId,
        relatedEntityType: 'user',
        relatedEntityId: providerUserId,
        actorSource: 'Payroll'
      });

      await incrementScore(providerUserId, agencyId);
      createdCount += 1;
    }

    await this._reconcileDelinquencyScores(agencyId, payrollPeriodId);
    return { ok: true, createdCount };
  }

  static async _reconcileDelinquencyScores(agencyId, payrollPeriodId) {
    const [rows] = await pool.execute(
      'SELECT user_id FROM user_payroll_delinquency_scores WHERE agency_id = ? AND score > 0',
      [agencyId]
    ).catch(() => []);
    for (const r of rows || []) {
      const userId = Number(r.user_id);
      const unpaid = await this.getUnpaidCountForUser({
        agencyId,
        payrollPeriodId,
        providerUserId: userId
      });
      if (unpaid === 0) await decrementScore(userId, agencyId);
    }
  }
}

export default PayrollNotesAgingService;

