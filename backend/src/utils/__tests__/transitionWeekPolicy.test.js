import { describe, expect, it } from 'vitest';
import { emptyTransitionState } from '../../content/transitionWeek.js';
import { validateTransitionState, freezeTransitionRanking, updateTransitionCohort, assertTransitionBookingCohort } from '../transitionWeekPolicy.js';
const providers = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, name: `Provider ${i + 1}` }));
const counts = providers.map(p => ({ providerId: p.id, completedFourWeeks: p.id * 4, upcomingWeek: p.id }));
const freeze = rows => freezeTransitionRanking(rows, providers, 'Verified source report');
describe('weekly transition evidence', () => {
  it('starts with unknown denominators and no claims of completion', () => {
    const state = emptyTransitionState();
    expect(Object.values(state.tasks).every(t => t.status === 'unverified')).toBe(true);
    expect(state.metrics.source_charts.total).toBeNull();
    expect(validateTransitionState(state, state)).toEqual(state);
  });
  it('requires owner/evidence and completion prerequisites', () => {
    const state = emptyTransitionState(); state.tasks.packet_send = { ...state.tasks.packet_send, status: 'passed' };
    expect(() => validateTransitionState(state, state)).toThrow('owner and evidence');
    Object.assign(state.tasks.packet_send, { owner: 'People Ops', evidence: 'Reviewed push #123' });
    expect(() => validateTransitionState(state, state)).toThrow('prerequisites');
  });
  it('requires a next action and owner for deferred or failed work', () => {
    const state = emptyTransitionState(); state.tasks.drive.status = 'deferred';
    expect(() => validateTransitionState(state, state)).toThrow('next action');
  });
  it('rejects fabricated counts and closure with unknown totals', () => {
    const state = emptyTransitionState(); state.metrics.families.completed = 1;
    expect(() => validateTransitionState(state, state)).toThrow('Reconcile');
    for (const t of Object.values(state.tasks)) Object.assign(t, { status: 'passed', owner: 'Verified reviewer', backup: 'Assigned backup', evidence: 'Restricted evidence reference' });
    state.metrics.families.completed = 0;
    expect(() => validateTransitionState(state, state)).toThrow('denominator');
  });
  it('ignores client-supplied ranking and cohort edits in an ordinary save', () => {
    const previous = emptyTransitionState(), input = structuredClone(previous);
    input.ranking = { rows: [] }; input.cohorts = { 1: { observed: true } };
    expect(validateTransitionState(input, previous)).toMatchObject({ ranking: null, cohorts: {} });
  });
});
describe('ITSCO ranking and cohort gates', () => {
  it('ranks lowest first into five/five/one with a four-week average', () => {
    const result = freeze([...counts].reverse());
    expect(result.rows.map(r => r.providerId)).toEqual(providers.map(p => p.id));
    expect(result.rows.map(r => r.cohort)).toEqual([1,1,1,1,1,2,2,2,2,2,3]);
    expect(result.rows[0].weeklyAverage).toBe(1);
  });
  it('breaks ties by next week, then stable ID', () => {
    const result = freeze(counts.map(row => ({ ...row, completedFourWeeks: 8, upcomingWeek: row.providerId % 2 })));
    expect(result.rows.slice(0,5).map(r => r.providerId)).toEqual([2,4,6,8,10]);
  });
  it.each([null, '', -1, 1.5, NaN])('rejects missing or invalid session counts (%s)', invalid => {
    expect(() => freeze(counts.map((row, i) => i ? row : { ...row, completedFourWeeks: invalid }))).toThrow('session counts');
  });
  it('rejects partial, duplicate or foreign rosters', () => {
    expect(() => freeze(counts.slice(1))).toThrow('complete');
    expect(() => freeze([counts[1], ...counts.slice(1)])).toThrow('duplicates');
    expect(() => freeze([{ ...counts[0], providerId: 999 }, ...counts.slice(1)])).toThrow('active roster');
  });
  it('requires ordered stages, prior-cohort observation and immutable stage evidence', () => {
    let state = { ...emptyTransitionState(), ranking: freeze(counts) };
    expect(() => updateTransitionCohort(state, 1, { stage: 'clinical_ready', evidence: 'Checked' }, 9)).toThrow('in order');
    expect(() => updateTransitionCohort(state, 2, { stage: 'google_ready', evidence: 'Checked' }, 9)).toThrow('previous');
    state = updateTransitionCohort(state, 1, { stage: 'google_ready', evidence: 'Own app login/mail recovery confirmed' }, 9);
    expect(() => updateTransitionCohort(state, 1, { stage: 'google_ready', evidence: 'Overwrite' }, 9)).toThrow('already recorded');
  });
  it('requires elapsed observation and an affirmative workday check', () => {
    const start = new Date('2026-11-18T16:00:00Z');
    let state = { ...emptyTransitionState(), ranking: freeze(counts) };
    for (const stage of ['google_ready','google_retired','clinical_ready','ehr_retired']) state = updateTransitionCohort(state, 1, { stage, evidence: 'Checked by actual owner' }, 9, start);
    expect(() => updateTransitionCohort(state, 1, { stage: 'observed', evidence: 'No live session' }, 9, start)).toThrow('monitored workday');
    expect(() => updateTransitionCohort(state, 1, { stage: 'observed', evidence: 'Observed' }, 9, new Date(+start + 86400000))).toThrow('monitored workday');
    state = updateTransitionCohort(state, 1, { stage: 'observed', evidence: 'Full workday reviewed; first-session support assigned', monitoredWorkdayConfirmed: true }, 9, new Date(+start + 86400000));
    expect(state.cohorts[1].observed.actorUserId).toBe(9);
  });
  it('blocks mixed or premature booking and admits a reviewed single cohort', () => {
    const state = { ...emptyTransitionState(), ranking: freeze(counts) };
    expect(() => assertTransitionBookingCohort(state, [1,6])).toThrow('one frozen group');
    expect(() => assertTransitionBookingCohort(state, [1,2])).toThrow('readiness');
    state.cohorts[1] = { clinical_ready: { evidence: 'Reviewed' } };
    expect(() => assertTransitionBookingCohort(state, [1,2,3,4,5])).not.toThrow();
    expect(() => assertTransitionBookingCohort(state, [999])).toThrow('frozen');
  });
});
