import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeSubmissionDocument from '../models/IntakeSubmissionDocument.model.js';
import IntakeSubmissionClient from '../models/IntakeSubmissionClient.model.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import StorageService from './storage.service.js';

const collectPaths = (list, field) =>
  (Array.isArray(list) ? list : [])
    .map((row) => String(row?.[field] || '').trim())
    .filter(Boolean);

/**
 * Automatic deletion of intake packets, signed PDFs, and attached PHI is disabled.
 * Completed packets are a legal/clinical record and must not be purged on a timer.
 */
export const INTAKE_AUTO_DELETE_ENABLED = false;

export default class IntakeRetentionCleanupService {
  static async run({ limit = 200 } = {}) {
    if (!INTAKE_AUTO_DELETE_ENABLED) {
      return { deletedSubmissions: 0, deletedPhiDocs: 0, deletedObjects: 0, skipped: true };
    }

    const expired = await IntakeSubmission.listExpired({ limit });
    let deletedSubmissions = 0;
    let deletedPhiDocs = 0;
    let deletedObjects = 0;

    for (const submission of expired) {
      const submissionId = submission?.id;
      if (!submissionId) continue;

      const docs = await IntakeSubmissionDocument.listBySubmissionId(submissionId);
      const clients = await IntakeSubmissionClient.listBySubmissionId(submissionId);
      const phiDocs = await ClientPhiDocument.listByIntakeSubmissionId(submissionId);

      const paths = new Set([
        ...collectPaths(docs, 'signed_pdf_path'),
        ...collectPaths(clients, 'bundle_pdf_path'),
        String(submission?.combined_pdf_path || '').trim()
      ].filter(Boolean));

      for (const doc of phiDocs) {
        const p = String(doc?.storage_path || '').trim();
        if (p) paths.add(p);
      }

      for (const path of paths) {
        try {
          await StorageService.deleteObject(path);
          deletedObjects += 1;
        } catch {
          // best-effort; continue
        }
      }

      if (phiDocs.length) {
        try {
          const ids = phiDocs.map((d) => d.id).filter(Boolean);
          deletedPhiDocs += await ClientPhiDocument.deleteByIds(ids);
        } catch {
          // ignore
        }
      }

      try {
        deletedSubmissions += await IntakeSubmission.deleteById(submissionId);
      } catch {
        // ignore
      }
    }

    return { deletedSubmissions, deletedPhiDocs, deletedObjects };
  }
}
