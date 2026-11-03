import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../chatEncryption.service.js', () => ({ decryptChatText: vi.fn(() => 'Decrypted message') }));
import { benchmarkMetric, loadSuperviseeWorkspace, noteCompletionMetrics } from '../superviseeWorkspace.service.js';

describe('supervision workflow benchmarks', () => {
  const row = (id, hours, samples = 5) => ({ provider_id: id, average_hours: hours, samples });
  it('keeps unavailable measurements distinct from zero and sparse measurements unranked', () => {
    expect(benchmarkMetric([], 1)).toMatchObject({ averageHours: null, samples: 0, band: null });
    expect(benchmarkMetric([row(1, 0, 2), row(2, 4)], 1)).toMatchObject({ averageHours: 0, samples: 2, band: null });
  });
  it('ranks smaller times higher without exposing cohort identities', () => {
    const cohort = Array.from({ length: 20 }, (_, i) => row(i + 1, i));
    expect(benchmarkMetric(cohort, 1)).toMatchObject({ band: 'Top 5%', percentile: 5, organizationAverageHours: 9.5 });
    expect(benchmarkMetric(cohort, 20)).toMatchObject({ band: 'Bottom 5%', percentile: 100 });
    expect(benchmarkMetric(cohort, 1)).not.toHaveProperty('providers');
  });
  it('uses tied ranks consistently and withholds ranks when everyone is tied', () => {
    const cohort = Array.from({ length: 5 }, (_, i) => row(i + 1, 2));
    expect(benchmarkMetric(cohort, 1)).toMatchObject({ band: 'All measured providers tied', percentile: null });
    expect(benchmarkMetric([row(1, 1), row(2, 1), row(3, 4), row(4, 5), row(5, 6)], 1).percentile).toBe(30);
  });
  it('uses linked actual session end when recorded and counts estimates separately', () => {
    const now = Date.parse('2026-11-02T23:00:00Z');
    const notes = [
      { provider_id: 81, appointment_id: 7, scheduled_end_at: '2026-11-02 19:00:00', provider_signed_at: '2026-11-02 22:00:00' },
      { provider_id: 81, appointment_id: 8, scheduled_end_at: '2026-11-02 18:00:00', provider_signed_at: '2026-11-02 22:00:00' },
      { provider_id: 82, appointment_id: 7, scheduled_end_at: '2026-11-02 19:00:00', provider_signed_at: '2026-11-02 22:00:00' }
    ];
    expect(noteCompletionMetrics(notes, [{ appointment_id: 7, provider_user_id: 81, ended_at: '2026-11-02 20:00:00' }], new Set([81]), now)).toEqual([
      { provider_id: 81, total_hours: 6, samples: 2, actualEndSamples: 1, scheduledEndSamples: 1, average_hours: 3 }
    ]);
  });
});

describe('supervisee workspace tenant scoping', () => {
  const scope = { agencyId: 450, providerUserId: 81 };
  it('counts only agency tasks and pending work, excluding private and personal items', async () => {
    const db = { execute: vi.fn().mockResolvedValue([[{ tasks: '3', work: '4' }]]) };
    expect(await loadSuperviseeWorkspace(scope, 'counts', { db })).toEqual({ tasks: 3, work: 4 });
    const [sql, params] = db.execute.mock.calls[0];
    expect(sql).toContain('COALESCE(t.is_private,0)=0');
    expect(sql).toContain('l.agency_id=?');
    expect(sql).toContain('(t.task_list_id IS NULL OR l.agency_id=?)');
    expect(params).toEqual([81, 450, 450, 450, 81, 450]);
  });
  it('requires both viewer and provider in message threads and never returns ciphertext', async () => {
    const db = { execute: vi.fn().mockResolvedValueOnce([[{ id: 1, threadId: 4, senderId: 81, body_ciphertext: 'cipher' }]]).mockResolvedValueOnce([[]]) };
    const result = await loadSuperviseeWorkspace(scope, 'communications', { db, viewerId: 21 });
    expect(db.execute.mock.calls[0][1]).toEqual([450, 21, 81, 21, 81]);
    expect(db.execute.mock.calls[0][0].match(/chat_thread_participants/g)).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ body: 'Decrypted message' });
    expect(JSON.stringify(result)).not.toContain('cipher');
    expect(db.execute.mock.calls[1][1]).toEqual([450, 81]);
  });
  it('keeps completed document assignment history scoped without exposing document contents', async () => {
    const db = { execute: vi.fn().mockResolvedValueOnce([[{ total: '1' }]]).mockResolvedValueOnce([[{ id: 700, task_id: 700, task_title: 'DEMO policy', document_title: 'DEMO policy', task_status: 'completed' }]]) };
    const result = await loadSuperviseeWorkspace(scope, 'documents', { db });
    expect(result).toMatchObject({ total: 1, items: [{ task_status: 'completed' }] });
    for (const [sql, params] of db.execute.mock.calls) {
      expect(sql).toContain("t.task_type='document'");
      expect(sql).toContain('COALESCE(t.is_private,0)=0');
      expect(sql).toContain('(t.task_list_id IS NULL OR l.agency_id=?)');
      expect(sql).not.toContain('status NOT IN');
      expect(sql).not.toContain('personalized_content');
      expect(params).toEqual([81, 450, 450, 450]);
    }
  });
  it('rejects invalid sections before accessing either database', async () => {
    const db = { execute: vi.fn() };
    await expect(loadSuperviseeWorkspace(scope, 'all-tenants', { db })).rejects.toThrow('valid supervision section');
    expect(db.execute).not.toHaveBeenCalled();
  });
  it('keeps personal notifications private even for an assigned supervisor or admin', async () => {
    const db = { execute: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 1, user_id: 81, type: 'chat_message', title: 'Private message' }, { id: 2, user_id: 81, type: 'onboarding_completed', title: 'Completed onboarding' }]]) };
    const result = await loadSuperviseeWorkspace({ ...scope, viewerIsAdmin: true }, 'communications', { db, viewerId: 21 });
    expect(result.notifications.map(n => n.id)).toEqual([2]);
    expect(JSON.stringify(result)).not.toContain('Private message');
  });
  it('bounds note and reply intervals to the selected agency and explains excluded data', async () => {
    const now = Date.now();
    const recentEnd = new Date(now - 4 * 3600000).toISOString(), recentSignature = new Date(now - 3600000).toISOString();
    const db = { execute: vi.fn().mockResolvedValueOnce([[{ provider_id: 81, average_hours: 1, samples: 8 }]]).mockResolvedValueOnce([[{ user_id: 81 }]]).mockResolvedValueOnce([[]]) };
    const clinicalDb = { execute: vi.fn().mockResolvedValue([[{ provider_id: 81, scheduled_end_at: recentEnd, provider_signed_at: recentSignature }, { provider_id: 900, scheduled_end_at: recentEnd, provider_signed_at: recentSignature }]]) };
    const result = await loadSuperviseeWorkspace(scope, 'performance', { db, clinicalDb });
    expect(result.notes).toMatchObject({ averageHours: 3, samples: 1, cohortSize: 0, band: null, scheduledEndSamples: 1 });
    expect(db.execute.mock.calls[0][1]).toEqual([450]);
    expect(clinicalDb.execute.mock.calls[0][1]).toEqual([450]);
    expect(result.noteCoverage).toContain('Unsigned notes');
    expect(result.replyCoverage).toContain('Unanswered inquiries');
    expect(db.execute.mock.calls[0][0]).toContain('COALESCE(r.topic_id,0)=COALESCE(inquiry.topic_id,0)');
  });
});
