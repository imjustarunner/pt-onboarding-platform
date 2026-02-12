import LearningSubscription from '../models/LearningSubscription.model.js';
import LearningTokenLedger from '../models/LearningTokenLedger.model.js';
import pool from '../config/database.js';

class LearningSubscriptionRenewalService {
  static lockKey({ subscriptionId, periodEndAt }) {
    return `learning_sub_renewal:${subscriptionId}:${String(periodEndAt || '').slice(0, 19)}`;
  }

  static async tryAcquireRenewalLock({ subscriptionId, periodEndAt, runnerId = null }) {
    const sid = Number(subscriptionId || 0);
    const endAt = String(periodEndAt || '').slice(0, 19).replace('T', ' ');
    if (!sid || !endAt) return { acquired: false, lockId: null };
    const lockKey = this.lockKey({ subscriptionId: sid, periodEndAt: endAt });
    let result;
    try {
      [result] = await pool.execute(
        `INSERT IGNORE INTO learning_subscription_renewal_locks
           (subscription_id, period_end_at, lock_key, status, runner_id)
         VALUES (?, ?, ?, 'RUNNING', ?)`,
        [sid, endAt, lockKey, runnerId]
      );
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        // Backward-compatible fallback before migration 388 is applied.
        return { acquired: true, lockId: null, lockKey };
      }
      throw e;
    }
    if (Number(result?.affectedRows || 0) > 0) {
      const [rows] = await pool.execute(
        `SELECT id
         FROM learning_subscription_renewal_locks
         WHERE lock_key = ?
         LIMIT 1`,
        [lockKey]
      );
      return { acquired: true, lockId: Number(rows?.[0]?.id || 0) || null, lockKey };
    }
    return { acquired: false, lockId: null, lockKey };
  }

  static async completeRenewalLock({ lockId, status, resultJson = null, errorMessage = null }) {
    const lid = Number(lockId || 0);
    if (!lid) return;
    try {
      await pool.execute(
        `UPDATE learning_subscription_renewal_locks
         SET status = ?,
             finished_at = CURRENT_TIMESTAMP,
             result_json = ?,
             error_message = ?
         WHERE id = ?`,
        [
          String(status || 'COMPLETED').toUpperCase(),
          resultJson ? JSON.stringify(resultJson) : null,
          errorMessage ? String(errorMessage).slice(0, 65535) : null,
          lid
        ]
      );
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
  }

  static async replenishForSubscription({ subscription, actorUserId = null }) {
    const sub = subscription || null;
    if (!sub) return { credited: [] };
    const credits = [];
    const indivQty = Number(sub.included_individual_tokens || 0);
    const groupQty = Number(sub.included_group_tokens || 0);
    if (indivQty > 0) {
      await LearningTokenLedger.addEntry({
        agencyId: Number(sub.agency_id),
        clientId: Number(sub.client_id),
        guardianUserId: Number(sub.guardian_user_id || 0) || null,
        subscriptionId: Number(sub.id),
        tokenType: 'INDIVIDUAL',
        direction: 'CREDIT',
        quantity: indivQty,
        reasonCode: 'SUBSCRIPTION_PERIOD_CREDIT',
        metadataJson: { subscriptionId: Number(sub.id), planId: Number(sub.plan_id) },
        createdByUserId: actorUserId
      });
      credits.push({ tokenType: 'INDIVIDUAL', quantity: indivQty });
    }
    if (groupQty > 0) {
      await LearningTokenLedger.addEntry({
        agencyId: Number(sub.agency_id),
        clientId: Number(sub.client_id),
        guardianUserId: Number(sub.guardian_user_id || 0) || null,
        subscriptionId: Number(sub.id),
        tokenType: 'GROUP',
        direction: 'CREDIT',
        quantity: groupQty,
        reasonCode: 'SUBSCRIPTION_PERIOD_CREDIT',
        metadataJson: { subscriptionId: Number(sub.id), planId: Number(sub.plan_id) },
        createdByUserId: actorUserId
      });
      credits.push({ tokenType: 'GROUP', quantity: groupQty });
    }
    return { credited: credits };
  }

  static async runDueRenewals({ agencyId = null, actorUserId = null, limit = 200 } = {}) {
    const due = await LearningSubscription.listDueForRenewal({ agencyId, limit });
    const results = [];
    const runnerId = `runner:${actorUserId || 'system'}:${Date.now()}`;
    for (const sub of due) {
      const lock = await this.tryAcquireRenewalLock({
        subscriptionId: Number(sub.id),
        periodEndAt: sub.current_period_end,
        runnerId
      });
      if (!lock.acquired) {
        results.push({
          subscriptionId: Number(sub.id),
          clientId: Number(sub.client_id),
          agencyId: Number(sub.agency_id),
          skipped: true,
          reason: 'already_locked_or_processed'
        });
        continue;
      }
      try {
        const replenished = await this.replenishForSubscription({ subscription: sub, actorUserId });
        const updated = await LearningSubscription.advancePeriodByDays({ subscriptionId: sub.id, days: 30 });
        const entry = {
          subscriptionId: Number(sub.id),
          clientId: Number(sub.client_id),
          agencyId: Number(sub.agency_id),
          credited: replenished.credited,
          nextPeriodStart: updated?.current_period_start || null,
          nextPeriodEnd: updated?.current_period_end || null
        };
        await this.completeRenewalLock({ lockId: lock.lockId, status: 'COMPLETED', resultJson: entry });
        results.push(entry);
      } catch (e) {
        await this.completeRenewalLock({
          lockId: lock.lockId,
          status: 'FAILED',
          resultJson: { subscriptionId: Number(sub.id) },
          errorMessage: e?.message || String(e || 'Unknown renewal error')
        });
        results.push({
          subscriptionId: Number(sub.id),
          clientId: Number(sub.client_id),
          agencyId: Number(sub.agency_id),
          failed: true,
          error: e?.message || 'Renewal failed'
        });
      }
    }
    return {
      scanned: due.length,
      renewed: results.filter((r) => !r.skipped && !r.failed).length,
      results
    };
  }
}

export default LearningSubscriptionRenewalService;
