import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';

export default class ClinicalNoteDraftCleanupService {
  static async run({ days = 7 } = {}) {
    const deleted = await ClinicalNoteDraft.hardDeleteOlderThanDays({ days });
    return { deleted };
  }
}

