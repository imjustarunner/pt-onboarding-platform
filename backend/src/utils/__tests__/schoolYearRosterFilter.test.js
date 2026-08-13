import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientMatchesSchoolYearTarget,
  rosterClientHasAssignedProvider
} from '../schoolYearRosterFilter.js';

describe('rosterClientHasAssignedProvider', () => {
  it('detects assignment from provider_ids and weekday pairs', () => {
    assert.equal(rosterClientHasAssignedProvider({ provider_ids: '554' }), true);
    assert.equal(rosterClientHasAssignedProvider({ provider_day_pairs: '554:Friday' }), true);
    assert.equal(rosterClientHasAssignedProvider({ provider_name: '—' }), false);
    assert.equal(rosterClientHasAssignedProvider({}), false);
  });
});

describe('clientMatchesSchoolYearTarget', () => {
  it('keeps unassigned confirmation_pending on last year off the current roster', () => {
    const client = {
      client_status_key: 'confirmation_pending',
      school_year: '2025-2026'
    };
    assert.equal(
      clientMatchesSchoolYearTarget(client, {
        targetYear: '2026-2027',
        isCurrentFilter: true,
        hasMembership: false
      }),
      false
    );
  });

  it('still shows assigned confirmation_pending on the current year', () => {
    const client = {
      client_status_key: 'confirmation_pending',
      school_year: '2025-2026',
      provider_ids: '500'
    };
    assert.equal(
      clientMatchesSchoolYearTarget(client, {
        targetYear: '2026-2027',
        isCurrentFilter: true,
        hasMembership: false
      }),
      true
    );
  });

  it('keeps genuine current-year packets on the current roster', () => {
    const client = {
      client_status_key: 'received',
      school_year: '2026-2027'
    };
    assert.equal(
      clientMatchesSchoolYearTarget(client, {
        targetYear: '2026-2027',
        isCurrentFilter: true
      }),
      true
    );
  });
});
