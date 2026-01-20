import pool from '../config/database.js';
import { decryptChatText, encryptChatText, isChatEncryptionConfigured } from '../services/chatEncryption.service.js';
import { scrubClientNamesToCode } from '../services/phiScrubber.service.js';

/**
 * Client Notes Model
 * 
 * Manages client notes/messages with internal vs shared permission logic:
 * - Agency users: Can create internal or shared notes
 * - School staff: Can only create shared notes
 * - School staff: Can only see shared notes
 */
class ClientNotes {
  static ALLOWED_CATEGORIES = new Set([
    'general',
    'status',
    'administrative',
    'billing',
    'clinical'
  ]);

  static normalizeCategory(category) {
    const raw = String(category || '').trim().toLowerCase();
    if (!raw) return 'general';
    // Accept a couple common synonyms
    if (raw === 'admin') return 'administrative';
    if (raw === 'clinical_question') return 'clinical';
    if (raw === 'billing_question') return 'billing';
    if (raw === 'general_question') return 'general';
    if (this.ALLOWED_CATEGORIES.has(raw)) return raw;

    // Allow custom categories coming from school settings:
    // normalize to snake-ish keys, keep short and safe.
    const normalized = raw
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    return normalized || 'general';
  }

  static normalizeUrgency(urgency) {
    const u = String(urgency || '').trim().toLowerCase();
    if (u === 'high') return 'high';
    if (u === 'medium') return 'medium';
    return 'low';
  }

  static hydrateDecryptedMessage(row) {
    if (row && row.message_ciphertext && row.message_iv && row.message_auth_tag) {
      try {
        row.message = decryptChatText({
          ciphertextB64: row.message_ciphertext,
          ivB64: row.message_iv,
          authTagB64: row.message_auth_tag
        });
      } catch {
        row.message = '[Unable to decrypt message]';
      }
    }
    return row;
  }

  /**
   * Create a new note
   * @param {Object} noteData - Note data
   * @param {number} noteData.client_id - Client ID
   * @param {number} noteData.author_id - User creating the note
   * @param {string} noteData.message - Note message
   * @param {boolean} noteData.is_internal_only - Whether note is agency-only
   * @param {string} noteData.category - Message category
   * @param {Object} access - Permission context
   * @param {boolean} access.hasAgencyAccess - user belongs to client's agency
   * @returns {Promise<Object>} Created note object
   */
  static async create(noteData, access = { hasAgencyAccess: false }) {
    const { client_id, author_id, message, is_internal_only = false } = noteData;
    const category = this.normalizeCategory(noteData.category);
    const urgency = this.normalizeUrgency(noteData.urgency);
    const scrubbedMessage = scrubClientNamesToCode(message);

    // Validation: only agency members can create internal notes
    if (is_internal_only && !access?.hasAgencyAccess) {
      throw new Error('Only agency staff can create internal notes');
    }

    if (!isChatEncryptionConfigured()) {
      // In production we require encryption; in dev allow plaintext to avoid hard-blocking local setup.
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Chat encryption key not configured');
      }
      const [result] = await pool.execute(
        `INSERT INTO client_notes (client_id, author_id, category, urgency, message, is_internal_only)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [client_id, author_id, category, urgency, String(scrubbedMessage || ''), is_internal_only]
      );
      return this.findById(result.insertId);
    }

    const enc = encryptChatText(scrubbedMessage);
    try {
      const [result] = await pool.execute(
        `INSERT INTO client_notes
         (client_id, author_id, category, urgency, message, message_ciphertext, message_iv, message_auth_tag, encryption_key_id, is_internal_only)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          client_id,
          author_id,
          category,
          urgency,
          null,
          enc.ciphertextB64,
          enc.ivB64,
          enc.authTagB64,
          enc.keyId,
          is_internal_only
        ]
      );
      return this.findById(result.insertId);
    } catch (e) {
      // If the migration hasn't been applied yet, fail loudly in production; fallback to plaintext in dev.
      const msg = String(e?.message || '');
      const columnMissing = msg.includes('Unknown column') || msg.includes('ER_BAD_FIELD_ERROR');
      const nullViolation = msg.includes('cannot be null') || msg.includes('ER_BAD_NULL_ERROR');
      if (process.env.NODE_ENV === 'production' && (columnMissing || nullViolation)) {
        throw new Error('client_notes encryption columns missing; run migrations (120_add_encrypted_categories_to_client_notes.sql)');
      }
      const [result] = await pool.execute(
        `INSERT INTO client_notes (client_id, author_id, category, urgency, message, is_internal_only)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [client_id, author_id, category, urgency, String(message || ''), is_internal_only]
      );
      return this.findById(result.insertId);
    }
  }

  /**
   * Find note by ID
   * @param {number} id - Note ID
   * @returns {Promise<Object|null>} Note object or null
   */
  static async findById(id) {
    const query = `
      SELECT 
        n.*,
        u.first_name as author_first_name,
        u.last_name as author_last_name
      FROM client_notes n
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.id = ?
    `;

    const [rows] = await pool.execute(query, [id]);
    if (rows.length === 0) return null;

    const note = this.hydrateDecryptedMessage(rows[0]);
    if (note.author_first_name && note.author_last_name) {
      note.author_name = `${note.author_first_name} ${note.author_last_name}`;
    } else {
      note.author_name = null;
    }

    return note;
  }

  /**
   * Find all notes for a client (filtered by permission)
   * @param {number} clientId - Client ID
   * @param {Object} access - Permission context
   * @param {boolean} access.hasAgencyAccess - user belongs to client's agency
   * @returns {Promise<Array>} Array of note objects (filtered)
   */
  static async findByClientId(clientId, access = { hasAgencyAccess: false }) {
    // If user does not have agency access, treat as school-side access: only shared notes.
    const isSchoolSide = !access?.hasAgencyAccess;

    let query = `
      SELECT 
        n.*,
        u.first_name as author_first_name,
        u.last_name as author_last_name
      FROM client_notes n
      LEFT JOIN users u ON n.author_id = u.id
      WHERE n.client_id = ?
    `;

    const values = [clientId];

    // Filter: school-side only sees shared notes
    if (isSchoolSide) {
      query += ' AND n.is_internal_only = FALSE';
    }

    query += ' ORDER BY n.created_at DESC';

    const [rows] = await pool.execute(query, values);

    return rows.map(row => {
      this.hydrateDecryptedMessage(row);
      if (row.author_first_name && row.author_last_name) {
        row.author_name = `${row.author_first_name} ${row.author_last_name}`;
      } else {
        row.author_name = null;
      }
      return row;
    });
  }

  /**
   * Update a note (permission check required)
   * @param {number} id - Note ID
   * @param {Object} noteData - Updated note data
   * @param {number} userId - User making the update
   * @param {string} userRole - User role
   * @returns {Promise<Object|null>} Updated note or null
   */
  static async update(id, noteData, userId, userRole) {
    // Get current note
    const currentNote = await this.findById(id);
    if (!currentNote) {
      throw new Error('Note not found');
    }

    // Permission check: Only author or admin can update
    if (currentNote.author_id !== userId && !['super_admin', 'admin'].includes(userRole)) {
      throw new Error('You do not have permission to update this note');
    }

    const { message, is_internal_only } = noteData;
    const updates = [];
    const values = [];

    if (message !== undefined) {
      updates.push('message = ?');
      values.push(message);
    }

    // Validation: School staff cannot set internal_only
    if (is_internal_only !== undefined) {
      if (is_internal_only && (userRole === 'school_staff' || !['super_admin', 'admin', 'staff', 'provider'].includes(userRole))) {
        throw new Error('Only agency staff can create internal notes');
      }
      updates.push('is_internal_only = ?');
      values.push(is_internal_only);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const query = `UPDATE client_notes SET ${updates.join(', ')} WHERE id = ?`;
    await pool.execute(query, values);

    return this.findById(id);
  }

  /**
   * Delete a note (permission check required)
   * @param {number} id - Note ID
   * @param {number} userId - User making the deletion
   * @param {string} userRole - User role
   * @returns {Promise<boolean>} True if deleted
   */
  static async delete(id, userId, userRole) {
    // Get current note
    const currentNote = await this.findById(id);
    if (!currentNote) {
      throw new Error('Note not found');
    }

    // Permission check: Only author or admin can delete
    if (currentNote.author_id !== userId && !['super_admin', 'admin'].includes(userRole)) {
      throw new Error('You do not have permission to delete this note');
    }

    const query = 'DELETE FROM client_notes WHERE id = ?';
    const [result] = await pool.execute(query, [id]);

    return result.affectedRows > 0;
  }
}

export default ClientNotes;
