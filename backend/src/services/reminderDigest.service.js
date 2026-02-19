/**
 * Build concise reminder digest text for SMS ("Text me this").
 * Uses rule-based prioritization (no Gemini) for speed.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { gatherMomentumContext } from './momentumChat.service.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import { getScore as getDelinquencyScore } from './payrollDelinquencyScore.service.js';

async function getPayrollUnpaidCount(userId, agencyId) {
  if (!userId || !agencyId) return 0;
  try {
    const [summaryRows] = await pool.execute(
      `SELECT payroll_period_id FROM payroll_summaries
       WHERE user_id = ? AND agency_id = ?
         AND LOWER(COALESCE(status, '')) IN ('posted', 'finalized')
       ORDER BY period_end DESC LIMIT 1`,
      [userId, agencyId]
    );
    const periodId = summaryRows?.[0]?.payroll_period_id;
    if (!periodId) return 0;

    const [impRows] = await pool.execute(
      `SELECT id FROM payroll_imports
       WHERE payroll_period_id = ? ORDER BY created_at DESC LIMIT 1`,
      [periodId]
    );
    const importId = impRows?.[0]?.id;
    if (!importId) return 0;

    const [cntRows] = await pool.execute(
      `SELECT SUM(CASE WHEN UPPER(TRIM(note_status)) = 'NO_NOTE' THEN 1 ELSE 0 END) +
              SUM(CASE WHEN UPPER(TRIM(note_status)) = 'DRAFT' AND COALESCE(draft_payable, 1) = 0 THEN 1 ELSE 0 END) AS total
       FROM payroll_import_rows
       WHERE payroll_period_id = ? AND payroll_import_id = ? AND agency_id = ? AND user_id = ?
         AND (UPPER(TRIM(note_status)) = 'NO_NOTE'
           OR (UPPER(TRIM(note_status)) = 'DRAFT' AND COALESCE(draft_payable, 1) = 0))`,
      [periodId, importId, agencyId, userId]
    );
    let total = Number(cntRows?.[0]?.total ?? 0) || 0;

    const PayrollNotesAgingService = (await import('./payrollNotesAging.service.js')).default;
    const preview = await PayrollNotesAgingService.previewTwoPeriodsOldUnpaidNotesAlerts({
      agencyId,
      payrollPeriodId: periodId,
      providerUserId: userId
    });
    if (preview?.ok && preview?.notifications?.length) {
      const n = preview.notifications[0];
      total += (Number(n?.noNote || 0) + Number(n?.draft || 0)) || 0;
    }
    return total;
  } catch {
    return 0;
  }
}

async function getNotesToSignCount(userId) {
  const hasSupervisees = await SupervisorAssignment.hasSupervisees(userId);
  if (!hasSupervisees) return 0;
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS c FROM clinical_note_signoffs
     WHERE supervisor_user_id = ? AND status = 'awaiting_supervisor'`,
    [userId]
  ).catch(() => [[{ c: 0 }]]);
  return Number(row?.c ?? 0);
}

/**
 * Build rule-based digest items (Top 3 + Also on radar) for SMS.
 * When delinquencyScore >= 2, clinical notes go first and we add "Did you do your notes today?"
 */
function buildRuleBasedDigest(context, { payrollNotesCount, notesToSignCount, delinquencyScore = 0 }) {
  const top = [];
  const radar = [];
  const topLabels = new Set();
  const escalateNotes = delinquencyScore >= 2 && payrollNotesCount > 0;

  const addTop = (label) => {
    if (label && !topLabels.has(label) && top.length < 3) {
      top.push(label);
      topLabels.add(label);
    }
  };
  const addRadar = (label) => {
    if (label && !topLabels.has(label) && radar.length < 5) {
      radar.push(label);
      topLabels.add(label);
    }
  };

  if (escalateNotes) {
    addTop(`Complete clinical notes (${payrollNotesCount} unpaid) - Did you do your notes today?`);
  }
  if (notesToSignCount > 0) {
    addTop(`Sign supervisee notes (${notesToSignCount} pending)`);
  }
  if (payrollNotesCount > 0 && !escalateNotes) {
    addTop(`Complete clinical notes (${payrollNotesCount} unpaid)`);
  }
  for (const t of context.tasks || []) {
    if (top.length < 3) addTop(t.title || t.task);
    else addRadar(t.title || t.task);
  }
  for (const tk of context.tickets || []) {
    const lbl = tk.subject || (tk.question || '').slice(0, 50) || 'Support ticket';
    if (top.length < 3) addTop(lbl);
    else addRadar(lbl);
  }
  for (const s of context.checklistItems || []) {
    if (top.length < 3) addTop(s);
    else addRadar(s);
  }
  for (const u of context.undoneStickies || []) {
    const lbl = String(u).length > 50 ? String(u).slice(0, 47) + '...' : u;
    if (top.length < 3) addTop(lbl);
    else addRadar(lbl);
  }

  return { top, radar };
}

/**
 * Build concise digest text for SMS (max ~480 chars).
 */
export async function buildReminderDigestText(userId, agencyId = null) {
  const agencies = await User.getAgencies(userId);
  const resolvedAgencyId = agencyId || agencies?.[0]?.id;
  if (!resolvedAgencyId) {
    return 'You have notifications needing attention. Log in to review.';
  }

  const [payrollNotesCount, notesToSignCount, delinquencyScore, context] = await Promise.all([
    getPayrollUnpaidCount(userId, resolvedAgencyId),
    getNotesToSignCount(userId),
    getDelinquencyScore(userId, resolvedAgencyId),
    gatherMomentumContext(userId, { agencyId: resolvedAgencyId, programId: null })
  ]);

  const { top, radar } = buildRuleBasedDigest(context, {
    payrollNotesCount,
    notesToSignCount,
    delinquencyScore
  });

  const parts = [];
  if (top.length > 0) {
    parts.push('Focus: ' + top.map((l, i) => `${i + 1}. ${l}`).join(' '));
  }
  if (radar.length > 0) {
    parts.push('Also: ' + radar.join(', '));
  }
  const text = parts.length > 0 ? parts.join('. ') : 'You have notifications needing attention. Log in to review.';
  return text.length > 480 ? text.slice(0, 477) + '...' : text;
}
