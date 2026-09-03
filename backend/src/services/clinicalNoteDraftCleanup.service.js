import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';
import NoteAidWorkQueueItem from '../models/NoteAidWorkQueueItem.model.js';

/**
 * Phase 1 retention:
 * - Auto-archive drafts older than `archiveAfterDays` (default 7) that are still active.
 * - Hard-delete drafts older than `hardDeleteAfterDays` (default 7 years = 2555 days).
 * - Hard-delete signed/completed Note Aid work-queue rows older than 24 hours.
 */
export default class ClinicalNoteDraftCleanupService {
  static async run({
    archiveAfterDays = 7,
    hardDeleteAfterDays = 2555,
    workQueueTerminalHours = 24
  } = {}) {
    const archived = await ClinicalNoteDraft.autoArchiveOlderThanDays({ days: archiveAfterDays });
    const deleted = await ClinicalNoteDraft.hardDeleteOlderThanDays({ days: hardDeleteAfterDays });
    let workQueueDeleted = 0;
    try {
      workQueueDeleted = await NoteAidWorkQueueItem.purgeExpiredTerminal({
        hours: workQueueTerminalHours
      });
    } catch (error) {
      if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    }
    return { archived, deleted, workQueueDeleted };
  }
}
