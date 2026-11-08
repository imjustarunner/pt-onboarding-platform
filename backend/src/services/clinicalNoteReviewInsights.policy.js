const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
export const reviewDateOnly = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);

/** Descriptive change only. There is no clinical significance cutoff or discharge decision. */
export function classifyObjectiveTrend(points, { direction, target } = {}) {
  const insufficient = reason => ({ status: 'insufficient', color: 'neutral', reason, comparableCount: 0 });
  if (!['increase', 'decrease'].includes(direction)) return insufficient('The objective does not have a confirmed score direction.');
  const targetNumber = finite(target);
  const valid = points.filter(point => finite(point.score) !== null);
  if (valid.length < 2) return insufficient('At least two comparable session ratings are needed.');
  // A changed target/scale begins a new comparison; do not join separate series.
  if (targetNumber === null || valid.some(point => finite(point.target) !== targetNumber)) return insufficient('The target changed or is missing; compare these ratings separately.');
  const raters = new Set(valid.map(point => `${point.raterKind || 'clinician'}:${point.ratedByUserId || ''}`));
  if (raters.size > 1) return insufficient('Ratings from different respondents are shown separately.');
  if (new Set(valid.map(point => point.sessionId)).size < 2) return insufficient('The ratings must come from distinct sessions.');
  const first = Number(valid[0].score), last = Number(valid.at(-1).score);
  const change = (last - first) * (direction === 'decrease' ? -1 : 1);
  if (last === targetNumber && first === targetNumber) return { status: 'progressing', color: 'green', reason: 'The recorded ratings maintained the objective’s target. This is not a stagnation finding.', comparableCount: valid.length, change: 0, from: first, to: last, descriptiveOnly: true };
  if (change === 0 && valid.length < 3) return { ...insufficient('Two unchanged ratings are not enough to establish a sustained pattern.'), comparableCount: valid.length };
  const status = change > 0 ? 'progressing' : change < 0 ? 'regressing' : 'stagnant';
  return { status, color: ({ progressing: 'green', stagnant: 'yellow', regressing: 'red' })[status], comparableCount: valid.length,
    reason: status === 'progressing' ? 'The recorded score moved in the objective’s intended direction.' : status === 'regressing' ? 'The recorded score moved away from the objective’s intended direction.' : 'The first and latest recorded scores are unchanged across at least three sessions.',
    change: last - first, from: first, to: last, descriptiveOnly: true };
}

export function treatmentProgressAdvisories(objectives) {
  return objectives.filter(item => ['stagnant', 'regressing'].includes(item.trend?.status)).map(item => ({
    id: `objective:${item.id}:${item.raterKind || 'clinician'}:${item.trend.status}`, objectiveId: item.objectiveId || item.id,
    status: item.trend.status, severity: 'review', color: item.trend.color,
    message: item.trend.status === 'stagnant'
      ? 'Recorded progress is unchanged in this comparison. Review barriers, the treatment approach and whether the plan should be updated.'
      : 'Recorded progress has moved away from this objective. Review the current needs, barriers and treatment approach.',
    recommendation: 'Use clinical judgment to consider a plan change, consultation, referral or whether the current service remains appropriate. These scores alone do not establish lack of benefit or justify termination.',
    automaticAction: false, affectsQuickSign: false
  }));
}

function plain(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(plain).filter(Boolean).join('; ');
  if (typeof value === 'object') return Object.entries(value).filter(([key]) => !/^(?:meta|metadata|clientId|userId|agencyId)$/i.test(key)).map(([key, item]) => `${key}: ${plain(item)}`).join('; ');
  return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
const label = value => String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase());

/** An excerpt of every saved section, never newly generated clinical facts. */
export function quickLookSections(payload, maxLength = 700) {
  let parsed = payload;
  if (typeof payload === 'string') { try { parsed = JSON.parse(payload); } catch { parsed = { narrative: payload }; } }
  const content = parsed?.sections ?? parsed;
  const values = typeof content === 'string' ? { narrative: content } : content && typeof content === 'object' ? content : {};
  return Object.entries(values).filter(([key]) => !/^(?:meta|metadata|clientId|userId|agencyId|identification|demographics)$/i.test(key)).map(([key, value]) => {
    const text = plain(value);
    return { key, label: label(key), text: text.slice(0, maxLength), truncated: text.length > maxLength, present: text.length > 0 };
  });
}
