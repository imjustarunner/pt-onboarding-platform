import pool from '../config/database.js';

/**
 * Client Notes Model
 * 
 * Manages client notes/messages with internal vs shared permission logic:
 * - Agency users: Can create internal or shared notes
 * - School staff: Can only create shared notes
 * - School staff: Can only see shared notes
 */
class ClientNotes {
  /**
   * Create a new note
   * @param {Object} noteData - Note data
   * @param {number} noteData.client_id - Client ID
   * @param {number} noteData.author_id - User creating the note
   * @param {string} noteData.message - Note message
   * @param {boolean} noteData.is_internal_only - Whether note is agency-only
   * @param {string} userRole - Role of user creating the note
   * @returns {Promise<Object>} Created note object
   */
  static async create(noteData, userRole) {
    const { client_id, author_id, message, is_internal_only = false } = noteData;

    // Validation: School staff cannot create internal notes
    if (is_internal_only && (userRole === 'school_staff' || !['super_admin', 'admin', 'staff', 'provider'].includes(userRole))) {
      throw new Error('Only agency staff can create internal notes');
    }

    const query = `
      INSERT INTO client_notes (client_id, author_id, message, is_internal_only)
      VALUES (?, ?, ?, ?)
    `;

    const values = [client_id, author_id, message, is_internal_only];

    const [result] = await pool.execute(query, values);
    return this.findById(result.insertId);
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

    const note = rows[0];
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
   * @param {string} userRole - User role
   * @param {number|null} userOrganizationId - User's organization ID (for school staff)
   * @returns {Promise<Array>} Array of note objects (filtered)
   */
  static async findByClientId(clientId, userRole, userOrganizationId = null) {
    // School staff can only see shared notes
    const isSchoolStaff = userRole === 'school_staff' || 
                          (!['super_admin', 'admin', 'staff', 'provider'].includes(userRole));

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

    // Filter: School staff only see shared notes
    if (isSchoolStaff) {
      query += ' AND n.is_internal_only = FALSE';
    }

    query += ' ORDER BY n.created_at DESC';

    const [rows] = await pool.execute(query, values);

    return rows.map(row => {
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
