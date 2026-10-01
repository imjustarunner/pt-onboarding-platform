import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ getConnection: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: m.getConnection } }));
import Artifact from '../SupervisionSessionArtifact.model.js';
let stored, tail, connections;
const columns = ['session_id', 'tagged_at', 'transcript_url', 'transcript_text', 'summary_text', 'summary_model', 'summary_generated_at', 'focus_title', 'goals_json', 'action_items_json', 'private_notes_text', 'sensitive_ciphertext', 'sensitive_iv', 'sensitive_auth_tag', 'encryption_key_id', 'updated_by_user_id'];
beforeEach(() => {
  vi.clearAllMocks(); stored = { session_id: 9, transcript_text: 'Earlier words', summary_text: 'Existing summary', goals_json: '[{"text":"Goal"}]' }; tail = Promise.resolve(); connections = [];
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64'));
  m.getConnection.mockImplementation(async () => {
    let unlock, locked = false, snapshot;
    const db = {
      beginTransaction: vi.fn(async () => {}),
      execute: vi.fn(async (sql, values) => {
        // Model MySQL row locking on INSERT ... ON DUPLICATE KEY, retained until commit.
        if (sql.includes('INSERT INTO') && !locked) {
          const previous = tail; tail = new Promise(resolve => { unlock = resolve; });
          await previous; locked = true; snapshot = structuredClone(stored);
        }
        if (sql.includes('SELECT *')) return [[structuredClone(stored)]];
        if (values.length === 16) Object.assign(stored, Object.fromEntries(columns.map((key, i) => [key, values[i]])));
        return [{ affectedRows: 1 }];
      }),
      commit: vi.fn(async () => { unlock?.(); }),
      rollback: vi.fn(async () => { if (snapshot) stored = snapshot; unlock?.(); }),
      release: vi.fn()
    };
    connections.push(db); return db;
  });
});
afterEach(() => vi.unstubAllEnvs());
describe('concurrent identified supervision transcript saves', () => {
  it('retains both speakers and other artifact fields with encrypted writes', async () => {
    await Promise.all([
      Artifact.appendTranscriptChunk({ sessionId: 9, text: '[Supervisor] First speaker', updatedByUserId: 7 }),
      Artifact.appendTranscriptChunk({ sessionId: 9, text: '[Supervisee] Second speaker', updatedByUserId: 8 }),
      Artifact.upsertBySessionId({ sessionId: 9, focusTitle: 'New focus', updatedByUserId: 7 })
    ]);
    const result = await Artifact.findBySessionId(9, connections[0]);
    expect(result.transcriptText).toBe('Earlier words\n[Supervisor] First speaker\n[Supervisee] Second speaker');
    expect(result.summaryText).toBe('Existing summary'); expect(result.focusTitle).toBe('New focus'); expect(result.goals).toEqual([{ text: 'Goal' }]);
    expect(stored.transcript_text).toBeNull(); expect(stored.sensitive_ciphertext).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain('First speaker'); expect(result.isEncrypted).toBe(true);
    for (const db of connections) { expect(db.commit).toHaveBeenCalledOnce(); expect(db.rollback).not.toHaveBeenCalled(); expect(db.release).toHaveBeenCalledOnce(); }
  });
  it.each([{ transcript_paused: 1 }, { transcript_stopped_at: '2026-10-01 15:00:00' }])('rejects a save after transcription is paused or stopped: %j', async flags => {
    Object.assign(stored, flags);
    await expect(Artifact.appendTranscriptChunk({ sessionId: 9, text: 'Must not save' })).rejects.toMatchObject({ status: 409 });
    expect(stored.transcript_text).toBe('Earlier words'); expect(connections[0].rollback).toHaveBeenCalledOnce(); expect(connections[0].release).toHaveBeenCalledOnce();
  });
  it('deduplicates a retried transcript chunk', async () => {
    await Artifact.appendTranscriptChunk({ sessionId: 9, text: '[Rachel] Hello' });
    const result = await Artifact.appendTranscriptChunk({ sessionId: 9, text: '[Rachel] Hello' });
    expect(result.transcriptText.match(/Hello/g)).toHaveLength(1);
  });
});
