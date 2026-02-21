import pool from '../config/database.js';
import PayrollSummary from '../models/PayrollSummary.model.js';
import Notification from '../models/Notification.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';

const ratioOf = ({ direct, indirect }) => {
  const d = Number(direct || 0);
  const i = Number(indirect || 0);
  if (d > 1e-9) return i / d;
  if (i > 1e-9) return Infinity;
  return 0;
};

const ratioKind = (ratio) => {
  if (!Number.isFinite(ratio)) return 'red';
  if (ratio <= 0.15 + 1e-9) return 'green';
  if (ratio <= 0.25 + 1e-9) return 'yellow';
  return 'red';
};

const fmtPct = (r) => {
  if (r === null || r === undefined || !Number.isFinite(r)) return '—';
  return `${Math.round(r * 1000) / 10}%`;
};

/**
 * When a pay period is posted, notify hourly workers (and their supervisors + agency admins)
 * if their Direct/Indirect ratio is yellow or red.
 */
export async function emitDirectIndirectRatioNotifications({ agencyId, payrollPeriodId }) {
  if (!agencyId || !payrollPeriodId) return;

  const agencyIdNum = Number(agencyId);
  const periodIdNum = Number(payrollPeriodId);

  // Hourly workers who have a summary in this period (period was just posted, so summaries exist).
  const [summaryRows] = await pool.execute(
    `SELECT ps.user_id, u.first_name, u.last_name
     FROM payroll_summaries ps
     JOIN users u ON ps.user_id = u.id
     WHERE ps.agency_id = ? AND ps.payroll_period_id = ?
       AND (u.is_hourly_worker = 1 OR u.is_hourly_worker = true OR u.is_hourly_worker = '1')`,
    [agencyIdNum, periodIdNum]
  );

  const userIds = [...new Set((summaryRows || []).map((r) => Number(r.user_id)).filter(Boolean))];
  if (userIds.length === 0) return;

  const created = [];
  for (const userId of userIds) {
    try {
      const all = await PayrollSummary.listForUser({ userId, agencyId: agencyIdNum, limit: 7, offset: 0 });
      const posted = (all || []).filter((r) => {
        const st = String(r.status || '').toLowerCase();
        return st === 'posted' || st === 'finalized';
      });
      const lastPaycheck = posted[0] || null;
      const last6 = posted.slice(0, 6);

      const lastRatio = lastPaycheck
        ? ratioOf({ direct: lastPaycheck.direct_hours || 0, indirect: lastPaycheck.indirect_hours || 0 })
        : null;
      const sumDirect = last6.reduce((a, p) => a + Number(p.direct_hours || 0), 0);
      const sumIndirect = last6.reduce((a, p) => a + Number(p.indirect_hours || 0), 0);
      const avgRatio = ratioOf({ direct: sumDirect, indirect: sumIndirect });

      const lastKind = lastRatio !== null ? ratioKind(lastRatio) : 'green';
      const avgKind = ratioKind(avgRatio);

      if (lastKind !== 'yellow' && lastKind !== 'red' && avgKind !== 'yellow' && avgKind !== 'red') continue;

      const providerName = (summaryRows || []).find((r) => Number(r.user_id) === userId);
      const name = providerName
        ? [providerName.first_name, providerName.last_name].filter(Boolean).join(' ').trim() || 'Provider'
        : 'Provider';

      const lastPct = lastRatio !== null ? fmtPct(lastRatio) : '—';
      const avgPct = fmtPct(avgRatio);
      const severityLabel = lastKind === 'red' || avgKind === 'red' ? 'red' : 'yellow';
      const title = 'Direct/Indirect ratio alert';
      const message = `Direct/Indirect ratio is ${severityLabel}: Last ${lastPct}, 90-day ${avgPct}. Goal: green ≤15%, yellow 15–25%, red >25%.`;

      const recipientIds = new Set([userId]);

      const supervisors = await SupervisorAssignment.findBySupervisee(userId, agencyIdNum);
      for (const s of supervisors || []) {
        if (s?.supervisor_id) recipientIds.add(Number(s.supervisor_id));
      }

      const [adminRows] = await pool.execute(
        `SELECT ua.user_id FROM user_agencies ua
         JOIN users u ON u.id = ua.user_id
         WHERE ua.agency_id = ? AND u.role IN ('admin','super_admin')`,
        [agencyIdNum]
      );
      for (const r of adminRows || []) {
        if (r?.user_id) recipientIds.add(Number(r.user_id));
      }

      for (const recipientId of recipientIds) {
        try {
          const notif = await Notification.create({
            type: 'payroll_direct_indirect_ratio_alert',
            severity: severityLabel === 'red' ? 'error' : 'warning',
            title: recipientId === userId ? title : `${name}: ${title}`,
            message: recipientId === userId ? message : `${name} – ${message}`,
            userId: recipientId,
            agencyId: agencyIdNum,
            relatedEntityType: 'payroll_period',
            relatedEntityId: periodIdNum,
            actorSource: 'Payroll'
          });
          created.push(notif);
        } catch (err) {
          console.error('payrollDirectIndirectRatio: failed to create notification for user', recipientId, err.message);
        }
      }
    } catch (err) {
      console.error('payrollDirectIndirectRatio: failed for user', userId, err.message);
    }
  }

  return { created: created.length };
}
