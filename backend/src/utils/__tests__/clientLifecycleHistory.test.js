import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildClientLifecycleHistory } from '../clientLifecycleHistory.js';

describe('buildClientLifecycleHistory', () => {
  it('puts new client on the join year and fall on the following year after spring continue', () => {
    const history = buildClientLifecycleHistory({
      client: {
        id: 1,
        submission_date: '2025-12-10',
        school_year: '2025-2026',
        parents_contacted_at: '2025-12-12',
        first_service_at: '2025-12-18'
      },
      dispositions: [
        {
          school_year: '2025-2026',
          spring_outcome: 'returning',
          spring_completed_at: '2026-05-20T12:00:00.000Z',
          spring_completed_by_user_id: 9
        },
        {
          school_year: '2026-2027',
          spring_outcome: 'returning',
          spring_completed_at: '2026-05-20T12:00:00.000Z',
          spring_completed_by_user_id: 9,
          fall_outcome: 'confirmed_returning',
          fall_completed_at: '2026-08-04T12:00:00.000Z'
        }
      ]
    });
    assert.equal(history.years.length, 2);
    assert.equal(history.years[0].schoolYear, '2025-2026');
    assert.ok(history.years[0].events.some((e) => e.kind === 'new_client'));
    assert.ok(history.years[0].events.some((e) => e.kind === 'spring_update'));
    assert.equal(history.years[1].schoolYear, '2026-2027');
    assert.ok(history.years[1].events.some((e) => e.kind === 'spring_carryforward'));
    assert.ok(history.years[1].events.some((e) => e.kind === 'fall_confirmation'));
    assert.equal(
      history.years[1].events.find((e) => e.kind === 'fall_confirmation').statusLabel,
      'Confirmed Returning'
    );
  });

  it('places pending action-needed items on the join year for new-client work', () => {
    const history = buildClientLifecycleHistory({
      client: { id: 3, school_year: '2025-2026', submission_date: '2025-12-10' },
      pendingActions: [
        { role: 'provider', actionKey: 'provider_intake', label: 'New Client – Action Needed' }
      ]
    });
    const join = history.years.find((y) => y.schoolYear === '2025-2026');
    assert.ok(join.events.some((e) => e.kind === 'new_client'));
    assert.ok(!join.events.some((e) => e.kind === 'action_needed' && e.actionKey === 'provider_intake'));
  });

  it('adds a pending spring action when no spring submission exists yet', () => {
    const history = buildClientLifecycleHistory({
      client: {
        id: 4,
        school_year: '2025-2026',
        submission_date: '2025-12-10',
        parents_contacted_at: '2025-12-12'
      },
      pendingActions: [
        { role: 'provider', actionKey: 'spring_update', label: 'Spring Update – Action Needed', schoolYear: '2025-2026' }
      ]
    });
    const year = history.years.find((y) => y.schoolYear === '2025-2026');
    assert.ok(year.events.some((e) => e.kind === 'action_needed' && e.actionKey === 'spring_update'));
  });

  it('does not invent a spring event when none was submitted', () => {
    const history = buildClientLifecycleHistory({
      client: { id: 2, school_year: '2026-2027', submission_date: '2026-08-02' },
      dispositions: [{ school_year: '2026-2027', fall_outcome: null, fall_completed_at: null }]
    });
    const kinds = history.years.flatMap((y) => y.events.map((e) => e.kind));
    assert.ok(kinds.includes('new_client'));
    assert.ok(!kinds.includes('spring_update'));
    assert.ok(!kinds.includes('fall_confirmation'));
  });
});
