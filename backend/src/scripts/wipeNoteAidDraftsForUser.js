/**
 * Hard-delete all Note Aid drafts for one clinician.
 * Does NOT touch signed chart notes, treatment plans, intake, or client records.
 *
 * Run: node src/scripts/wipeNoteAidDraftsForUser.js [userId]
 * Default userId: 501 (Michael Mendez)
 */
import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';

const userId = Number(process.argv[2] || 501);
if (!Number.isInteger(userId) || userId <= 0) {
  console.error('Usage: node src/scripts/wipeNoteAidDraftsForUser.js [userId]');
  process.exit(1);
}

const deleted = await ClinicalNoteDraft.deleteAllForUser({ userId });
console.log(`Deleted ${deleted} clinical_note_drafts row(s) for user_id=${userId}.`);
console.log('Chart notes, treatment plans, and client files were not modified.');
console.log('Open Note Aid once with ?noteAidReset=1 to clear the browser work queue (Done / In progress).');
process.exit(0);
