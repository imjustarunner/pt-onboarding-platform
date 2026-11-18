const DAY = 86400000;
const APPROVED = new Set(['active', 'final', 'finalized', 'signed', 'approved', 'completed', 'superseded']);
export function treatmentPlanDate(value) {
  const raw = value instanceof Date ? value.toISOString() : String(value || '');
  const date = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date ? date : null;
}
const daysBetween = (first, last) => Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY);
function addDays(date, days) { return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10); }
function addMonths(date, months) {
  const source = new Date(`${date}T00:00:00Z`);
  const day = source.getUTCDate();
  source.setUTCDate(1);
  source.setUTCMonth(source.getUTCMonth() + months);
  const end = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0)).getUTCDate();
  source.setUTCDate(Math.min(day, end));
  return source.toISOString().slice(0, 10);
}
export function projectedGoalDeadline(goal, planDate) {
  if (!planDate || ['completed', 'met', 'achieved', 'superseded', 'discarded'].includes(String(goal?.status || '').toLowerCase())) return null;
  const raw = String(goal?.projected_completion || goal?.projectedCompletion || '').trim();
  const direct = treatmentPlanDate(raw);
  if (direct) return direct;
  const months = Number(goal?.durationMonths ?? goal?.duration_months);
  if (Number.isFinite(months) && months > 0 && months <= 120) return addMonths(planDate, Math.ceil(months));
  const duration = raw.match(/\b(\d+(?:\.\d+)?)\s*(months?|weeks?|days?)\b/i);
  if (!duration) return null;
  const amount = Number(duration[1]);
  if (!(amount > 0)) return null;
  return /^month/i.test(duration[2]) ? addMonths(planDate, Math.ceil(amount)) : addDays(planDate, Math.ceil(amount * (/^week/i.test(duration[2]) ? 7 : 1)));
}
export function evaluateTreatmentPlanForEncounter({ plans = [], dateOfService, policy = {}, latePlanWindowDays = 7 } = {}) {
  const date = treatmentPlanDate(dateOfService);
  if (!date) return { eligible: false, code: 'treatment_plan_service_date_required', message: 'Choose the session date before checking its treatment plan.', dateOfService: null };
  const maxAge = Number(policy.renewAfterDays || policy.treatmentPlanMaxAgeDays || 90);
  const window = Math.max(0, Math.min(7, Number(latePlanWindowDays) || 0));
  const approved = plans.filter(plan => APPROVED.has(String(plan?.status || '').toLowerCase()))
    .map(plan => ({ plan, date: treatmentPlanDate(plan.effective_date || plan.effectiveDate || plan.created_at) }))
    .filter(item => item.date && daysBetween(date, item.date) <= window)
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.plan.id || 0) - Number(a.plan.id || 0));
  const currentRecords = approved.filter(item => {
    const supersededAt = treatmentPlanDate(item.plan.superseded_at);
    return !supersededAt || date < supersededAt;
  });
  const prior = currentRecords.find(item => item.date <= date);
  // An expired newer plan cannot be replaced by a still-valid older version.
  // A genuinely new approved plan within seven days may use the stated exception.
  const candidates = currentRecords.filter(item => item.date > date || item === prior);
  const eligible = [];
  const expired = [];
  for (const item of candidates) {
    const lateByDays = Math.max(0, daysBetween(date, item.date));
    const reviewDate = maxAge > 0 ? addDays(item.date, maxAge) : null;
    const goalDates = (item.plan.goals || []).map(goal => projectedGoalDeadline(goal, item.date)).filter(Boolean).sort();
    const goalDate = goalDates[0] || null;
    const forcedDate = treatmentPlanDate(policy.renewByDate);
    const reviewExpired = !!reviewDate && date >= reviewDate;
    const goalExpired = !!goalDate && date > goalDate;
    const forcedExpired = !!forcedDate && item.date < forcedDate && date >= forcedDate;
    const dates = [reviewDate, goalDate, forcedDate && item.date < forcedDate ? forcedDate : null].filter(Boolean).sort();
    const result = { eligible: !reviewExpired && !goalExpired && !forcedExpired, planId: item.plan.id || null, planDate: item.date, dateOfService: date, latePlan: lateByDays > 0, lateByDays, expiresOn: dates[0] || null, ageDays: daysBetween(item.date, date) };
    if (result.eligible) eligible.push(result);
    else expired.push({ ...result, code: 'treatment_plan_expired', expiryReason: goalExpired ? 'goal_timeframe' : 'agency_review_interval', message: 'The treatment plan was expired for this session. Review and update the plan before documenting this progress note.' });
  }
  // Prefer evidence already in effect at the encounter. The seven-day exception
  // preserves the plan's actual date and remains visible for supervisor review.
  const selected = eligible.find(item => !item.latePlan) || eligible[0];
  if (selected) return { ...selected, code: null, message: selected.latePlan ? `This plan is dated ${selected.planDate}, ${selected.lateByDays} day(s) after the session. Both actual dates are preserved.` : '' };
  if (expired.length) return expired[0];
  return { eligible: false, dateOfService: date, planId: null, latePlan: false, code: 'treatment_plan_required', message: 'A completed treatment plan is not on file for this session. Complete a treatment plan first. A plan dated up to seven days after the session can be reviewed without changing either date; older sessions require a plan in effect at that session.' };
}
