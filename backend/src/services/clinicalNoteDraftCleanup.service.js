import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';

/**
 * Phase 1 retention:
 * - Auto-archive drafts older than `archiveAfterDays` (default 7) that are still active.
 * - Hard-delete drafts older than `hardDeleteAfterDays` (default 7 years = 2555 days).
 * Work-queue session ToDos are retained (no 24h purge of signed/completed rows).
 */
export default class ClinicalNoteDraftCleanupService {
  static async run({
    archiveAfterDays = 7,
    hardDeleteAfterDays = 2555
  } = {}) {
    const archived = await ClinicalNoteDraft.autoArchiveOlderThanDays({ days: archiveAfterDays });
    const deleted = await ClinicalNoteDraft.hardDeleteOlderThanDays({ days: hardDeleteAfterDays });
    return { archived, deleted, workQueueDeleted: 0 };
  }
}
