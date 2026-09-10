import pool from '../config/database.js';

const PERSONAL_DOC_TYPES = new Set([
  'resume',
  'cover_letter',
  'application_material',
  'reference_release'
]);

/**
 * Prefer this candidate's original job-application upload over a shared
 * `admin_docs/Cover Letter.pdf` object that other applicants may have overwritten.
 */
export async function resolveOwnedAdminDocStoragePath(doc, userId) {
  const current = String(doc?.storage_path || doc?.storagePath || '').trim();
  const type = String(doc?.doc_type || doc?.docType || '').trim().toLowerCase();
  if (!current || !userId || !PERSONAL_DOC_TYPES.has(type)) return current;

  try {
    const [uploads] = await pool.execute(
      `SELECT u.storage_path, u.original_filename, u.upload_label
       FROM intake_submission_uploads u
       INNER JOIN intake_submissions s ON s.id = u.intake_submission_id
       WHERE s.guardian_user_id = ?
         AND u.storage_path IS NOT NULL
       ORDER BY u.id DESC
       LIMIT 40`,
      [userId]
    );
    const wantName = String(doc.original_name || doc.originalName || '').trim().toLowerCase();
    const match = (uploads || []).find((u) => {
      const filename = String(u.original_filename || '').trim().toLowerCase();
      const blob = `${u.upload_label || ''} ${filename}`.toLowerCase();
      if (wantName && filename === wantName) return true;
      if (type === 'cover_letter') return blob.includes('cover');
      if (type === 'resume') return blob.includes('resume') || /\bcv\b/.test(blob);
      if (type === 'reference_release') return blob.includes('reference');
      return false;
    });
    if (match?.storage_path) return String(match.storage_path).trim();
  } catch {
    /* table may be missing */
  }
  return current;
}
