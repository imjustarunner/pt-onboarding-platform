import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';
import { isEmployeeVisibleAdminDocType } from '../utils/employeeVisibleAdminDocs.js';

/**
 * List the current user's application / hire document copies (receipts, waivers, uploads).
 */
export async function listMyApplicationCopies(req, res, next) {
  try {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const [rows] = await pool.execute(
      `SELECT id, title, doc_type, original_name, mime_type, created_at, storage_path
       FROM user_admin_docs
       WHERE user_id = ?
         AND storage_path IS NOT NULL
         AND TRIM(storage_path) <> ''
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    const docs = (rows || [])
      .filter((r) => isEmployeeVisibleAdminDocType(r.doc_type))
      .map((r) => ({
        id: r.id,
        title: r.title || r.original_name || 'Document',
        docType: r.doc_type,
        originalName: r.original_name,
        mimeType: r.mime_type || 'application/pdf',
        createdAt: r.created_at
      }));

    res.json({ documents: docs });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.json({ documents: [] });
    next(e);
  }
}

/**
 * Download one of the current user's application / hire document copies.
 */
export async function downloadMyApplicationCopy(req, res, next) {
  try {
    const userId = Number(req.user?.id || 0);
    const docId = Number(req.params.id || 0);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    if (!docId) return res.status(400).json({ error: { message: 'Invalid document id' } });

    const [rows] = await pool.execute(
      `SELECT id, title, doc_type, original_name, mime_type, storage_path
       FROM user_admin_docs
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [docId, userId]
    );
    const doc = rows?.[0];
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });
    if (!isEmployeeVisibleAdminDocType(doc.doc_type)) {
      return res.status(403).json({ error: { message: 'This document is not available for download here' } });
    }
    if (!doc.storage_path) {
      return res.status(404).json({ error: { message: 'File not found' } });
    }

    const buffer = await StorageService.readObject(doc.storage_path);
    const filename = String(doc.original_name || doc.title || 'document.pdf').replace(/[^\w.\- ()]/g, '_');
    res.setHeader('Content-Type', doc.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    next(e);
  }
}
