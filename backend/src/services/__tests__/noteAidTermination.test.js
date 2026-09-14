import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import ClinicalNoteDraft from '../../models/ClinicalNoteDraft.model.js';
import { achievementAnnouncement, recordSignedTermination, treatmentHistoryText, validateTermination, validateTerminationContent } from '../noteAidTermination.service.js';

describe('termination history and provider decisions', () => {
  it('creates a separate termination draft even when an open progress draft exists', async (t) => {
    const reuse = t.mock.method(ClinicalNoteDraft, 'findReusableOpen', async () => ({ id: 10, service_code: '90834' }));
    t.mock.method(pool, 'execute', async () => [{ insertId: 11 }]);
    t.mock.method(ClinicalNoteDraft, 'findByIdForUser', async ({ draftId }) => ({ id: draftId }));
    const draft = await ClinicalNoteDraft.create({ userId: 3, clientId: 22, dateOfService: '2026-09-14', allowReuse: false });
    assert.equal(reuse.mock.callCount(), 0);
    assert.equal(draft.id, 11);
  });

  it('keeps old and recent notes, changed goals, and every objective rating without excerpt truncation', () => {
    const longHistory = 'Earlier intervention and response. '.repeat(500);
    const text = treatmentHistoryText({
      notes: [
        { id: 1, created_at: '2020-01-01', note_payload: JSON.stringify({ sections: { Objective: longHistory } }) },
        { id: 2, created_at: '2026-01-01', note_payload: JSON.stringify({ sections: { Objective: 'Latest response.' } }) }
      ],
      plans: [{ goals: [{ goal_text: 'Earlier achieved goal' }] }, { goals: [{ goal_text: 'Changed goal' }] }],
      ratings: [{ scale_value: 9, date_of_service: '2020-01-01' }, { scale_value: 2, date_of_service: '2026-01-01' }]
    });
    assert.ok(text.includes(longHistory));
    for (const expected of ['Latest response.', 'Earlier achieved goal', 'Changed goal', '2020-01-01', '2026-01-01']) assert.ok(text.includes(expected));
  });

  it('requires a provider-selected reason and recommendation, with details for other', () => {
    assert.throws(() => validateTermination({ reason: 'goals_achieved' }));
    assert.throws(() => validateTermination({ reason: 'other', recommendation: 'Referral discussed.' }));
    assert.doesNotThrow(() => validateTermination({ reason: 'goals_achieved', recommendation: 'Return if symptoms recur.' }));
  });

  it('recognition uses only the provider name', () => {
    assert.equal(achievementAnnouncement('Taylor Morgan'), 'Congratulations, Taylor Morgan, on helping a client achieve their treatment goals and objectives. Thank you for your thoughtful care and commitment to meaningful clinical progress.');
  });

  it('rejects signing when a required treatment section is blank or still a placeholder', () => {
    assert.throws(() => validateTerminationContent(JSON.stringify({ sections: {
      'Reason for Termination': 'Client choice', 'Treatment Modality and Interventions': 'Write this section…',
      'Treatment Goals and Outcome': 'Goal 1 remained in progress.', Recommendations: 'Continue care with the selected provider.'
    } })), /Treatment Modality and Interventions/);
  });
});

function fixture({ reason = 'goals_achieved', affectedRows = 1, failure = null, signed = true, amendment = false } = {}) {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (failure && sql.includes(failure)) throw new Error('database failure');
      if (sql.includes('INSERT IGNORE')) return [{ affectedRows }];
      if (sql.includes('SELECT first_name')) return [[{ first_name: 'Taylor', last_name: 'Morgan' }]];
      return [{ affectedRows: 1 }];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release')
  };
  const note = {
    id: 7, agency_id: 2, client_id: 999, created_by_user_id: 3, note_type: 'TERMINATION',
    provider_signed_at: signed ? '2026-09-14T10:00:00Z' : null,
    metadata_json: { termination: { reason, recommendation: 'Provider recommendation.' }, ...(amendment ? { amendmentOfNoteId: 4 } : {}) }
  };
  return {
    calls, note,
    deps: {
      database: { getConnection: async () => connection },
      clinicalDatabase: { execute: async () => [[{ id: 4, metadata_json: {} }]] },
      updateLifecycle: async (value) => { calls.push({ lifecycle: value }); return { statusId: 5 }; }
    }
  };
}

describe('signed termination outcomes', () => {
  it('awards exactly one approved system kudo and one name-free announcement after signature', async () => {
    const f = fixture();
    await recordSignedTermination(f.note, f.deps);
    const sql = f.calls.filter((c) => c?.sql);
    assert.equal(sql.filter((c) => c.sql.includes('INSERT INTO kudos')).length, 1);
    assert.equal(sql.filter((c) => c.sql.includes('INSERT INTO agency_scheduled_announcements')).length, 1);
    assert.ok(sql.some((c) => c.sql.includes('points = points + 1')));
    assert.ok(!JSON.stringify(sql).includes('999'));
    assert.ok(f.calls.some((c) => c?.lifecycle?.statusKey === 'terminated'));
    assert.ok(f.calls.includes('commit'));
  });

  it('does not award for an unsigned draft', async () => {
    const f = fixture({ signed: false });
    await recordSignedTermination(f.note, f.deps);
    assert.deepEqual(f.calls, []);
  });

  it('does not duplicate awards, announcements, or lifecycle changes on retry', async () => {
    const f = fixture({ affectedRows: 0 });
    await recordSignedTermination(f.note, f.deps);
    assert.equal(f.calls.filter((c) => c?.sql).length, 1);
    assert.ok(!f.calls.some((c) => c?.lifecycle));
  });

  it('records other reasons without granting kudos', async () => {
    const f = fixture({ reason: 'lost_contact' });
    await recordSignedTermination(f.note, f.deps);
    assert.equal(f.calls.filter((c) => c?.sql).length, 1);
  });

  it('uses the original termination as the idempotency key for amendments', async () => {
    const f = fixture({ amendment: true, affectedRows: 0 });
    await recordSignedTermination(f.note, f.deps);
    assert.equal(f.calls.find((c) => c?.sql?.includes('INSERT IGNORE')).params[3], 4);
  });

  it('rolls the award and count back together if announcement creation fails', async () => {
    const f = fixture({ failure: 'INSERT INTO agency_scheduled_announcements' });
    await assert.rejects(recordSignedTermination(f.note, f.deps));
    assert.ok(f.calls.includes('rollback'));
    assert.ok(!f.calls.includes('commit'));
  });
});
