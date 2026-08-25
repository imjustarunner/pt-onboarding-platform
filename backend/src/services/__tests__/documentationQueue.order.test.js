import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Pure-logic mirror of documentation-queue note-status ranking / DOS sort.
 * Keeps auth/DB out of unit tests while verifying dedupe + order contract.
 */
function noteStatusRank(st) {
  if (st === 'none') return 0;
  if (st === 'draft') return 1;
  return 2;
}

function sortDocumentationQueue(rows) {
  const bySession = new Map();
  for (const row of rows) {
    const sid = Number(row.clinicalSessionId);
    if (!sid) continue;
    if (!bySession.has(sid)) bySession.set(sid, row);
  }
  return [...bySession.values()].sort((a, b) => {
    const r = noteStatusRank(a.noteStatus) - noteStatusRank(b.noteStatus);
    if (r !== 0) return r;
    const da = a.dateOfService || '';
    const db = b.dateOfService || '';
    if (da !== db) return da < db ? -1 : 1;
    return Number(a.clinicalSessionId) - Number(b.clinicalSessionId);
  });
}

describe('documentationQueue ordering', () => {
  it('dedupes by session and orders missing notes by DOS ascending', () => {
    const sorted = sortDocumentationQueue([
      { clinicalSessionId: 3, noteStatus: 'signed', dateOfService: '2026-01-01' },
      { clinicalSessionId: 1, noteStatus: 'none', dateOfService: '2026-02-10' },
      { clinicalSessionId: 1, noteStatus: 'none', dateOfService: '2026-02-10' },
      { clinicalSessionId: 2, noteStatus: 'draft', dateOfService: '2026-01-05' },
      { clinicalSessionId: 4, noteStatus: 'none', dateOfService: '2026-01-20' }
    ]);
    assert.deepEqual(
      sorted.map((r) => r.clinicalSessionId),
      [4, 1, 2, 3]
    );
  });
});
