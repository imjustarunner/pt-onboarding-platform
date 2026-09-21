import pool from '../config/database.js';
import { randomUUID } from 'node:crypto';
import StorageService from '../services/storage.service.js';
import DocumentEncryptionService from '../services/documentEncryption.service.js';

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
  // New imports already have a unique, decrypted copy. Never replace it with
  // encrypted intake bytes (which a browser renders as an empty PDF).
  if (/\/(?:application|resume|reference-release)-\d+-|\/candidate-copy-/.test(current)) return current;

  try {
    const [uploads] = await pool.execute(
      `SELECT u.*
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
    if (match?.storage_path) {
      if (Number(match.is_encrypted) !== 1) return String(match.storage_path).trim();
      const encryptedBuffer = await StorageService.readObject(match.storage_path);
      const bytes = await DocumentEncryptionService.decryptBuffer({ encryptedBuffer,
        encryptionKeyId: match.encryption_key_id, encryptionWrappedKeyB64: match.encryption_wrapped_key,
        encryptionIvB64: match.encryption_iv, encryptionAuthTagB64: match.encryption_auth_tag,
        aad: match.encryption_aad || undefined });
      const ext = String(match.original_filename || '').match(/\.[a-z0-9]+$/i)?.[0] || '';
      const saved = await StorageService.saveAdminDoc(bytes, `candidate-copy-${userId}-${randomUUID()}${ext}`, doc.mime_type || match.mime_type);
      await pool.execute('UPDATE user_admin_docs SET storage_path = ? WHERE id = ? AND user_id = ? AND storage_path = ?', [saved.relativePath, doc.id, userId, current]);
      return saved.relativePath;
    }
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
  }
  return current;
}
