import { expect, it } from 'vitest';
import { normalizeCosignQueueItems } from '../noteAidCosignQueue.js';
it('preserves recorded versions for originals and amendments without inventing one for unknown history', () => {
  const rows = normalizeCosignQueueItems([{ id: 1, clinical_note_id: 101, revision_number: 1 }, { id: 'revision_9', clinical_note_id: 102, clinical_revision_id: 9, revision_number: 3 }, { id: 2, clinical_note_id: 103 }]);
  expect(rows.map(row => row.revisionNumber)).toEqual([1, 3, null]);
  expect(rows[0].clinicalRevisionId).toBeNull();
  expect(rows[1].clinicalRevisionId).toBe(9);
  expect(rows[1].quickSignEligible).toBe(false);
});
