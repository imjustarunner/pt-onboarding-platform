import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';
import NotificationTrigger from '../models/NotificationTrigger.model.js';
import AgencyNotificationTriggerSetting from '../models/AgencyNotificationTriggerSetting.model.js';
import NotificationEvent from '../models/NotificationEvent.model.js';
import PayrollPeriod from '../models/PayrollPeriod.model.js';
import { getAgencyHolidayPayPolicy } from './payrollHolidayPolicy.service.js';

const TRIGGER_KEY = 'payroll_holiday_bonus_missing_approval';

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

function strictMessage() {
  return (
    'Holiday pay was assessed to this pay period but no approval was identified. ' +
    'Please ensure you are obtaining approval prior to working on any holidays as the workplace handbook indicates that holiday pay must be prior approved. ' +
    'A notification has been sent to your supervisor and the administrative staff and additional meetings or remediation may be initiated.'
  );
}

class PayrollHolidayBonusApprovalAlertService {
  static async emitMissingHolidayBonusApprovalAlerts({ agencyId, payrollPeriodId }) {
    if (!agencyId || !payrollPeriodId) return { ok: false, reason: 'missing_params' };

    const trigger = await NotificationTrigger.findByKey(TRIGGER_KEY);
    if (!trigger) return { ok: false, reason: 'trigger_missing' };

    const allSettings = await AgencyNotificationTriggerSetting.listForAgency(agencyId);
    const setting = (allSettings || []).find((s) => s.triggerKey === TRIGGER_KEY) || null;
    const resolved = resolveSetting(trigger, setting);
    if (!resolved.enabled) return { ok: true, skipped: true, reason: 'disabled' };

    const { policy } = await getAgencyHolidayPayPolicy({ agencyId });
    if (policy?.notifyMissingApproval !== true) return { ok: true, skipped: true, reason: 'policy_disabled' };

    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period || Number(period.agency_id) !== Number(agencyId)) return { ok: false, reason: 'period_not_found' };

    // Find providers with holiday bonus claims still pending approval.
    const [rows] = await pool.execute(
      `SELECT user_id, applied_amount
       FROM payroll_holiday_bonus_claims
       WHERE agency_id = ?
         AND payroll_period_id = ?
         AND status = 'submitted'
         AND COALESCE(applied_amount, 0) > 0`,
      [agencyId, payrollPeriodId]
    );

    let createdCount = 0;
    for (const r of rows || []) {
      const providerUserId = Number(r.user_id || 0);
      if (!providerUserId) continue;

      // De-dupe per provider per pay period.
      const inserted = await NotificationEvent.tryCreate({
        agencyId,
        triggerKey: TRIGGER_KEY,
        payrollPeriodId,
        providerUserId,
        stalePeriodId: null,
        recipientUserId: providerUserId
      });
      if (!inserted) continue;

      const ps = String(period.period_start || '').slice(0, 10);
      const pe = String(period.period_end || '').slice(0, 10);
      const label = period.label || (ps && pe ? `${ps} → ${pe}` : `Pay period #${payrollPeriodId}`);

      const msg = policy?.notifyStrictMessage === true
        ? strictMessage()
        : 'Holiday pay was assessed to this pay period but no approval was identified. Please ensure holiday pay is prior approved.';

      await Notification.create({
        type: 'payroll_holiday_bonus_missing_approval',
        severity: 'urgent',
        title: 'Holiday bonus approval missing',
        message: `${msg} (Pay period: ${label})`,
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

    return { ok: true, createdCount, resolved };
  }
}

export default PayrollHolidayBonusApprovalAlertService;

