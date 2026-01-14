import pool from '../config/database.js';

/**
 * Client Status History Model
 * 
 * Manages audit trail for client changes (status, provider assignment, etc.)
 */
class ClientStatusHistory {
  /**
   * Create a new history entry
   * @param {Object} historyData - History data
   * @param {number} historyData.client_id - Client ID
   * @param {number} historyData.changed_by_user_id - User who made the change
   * @param {string} historyData.field_changed - Field that was changed
   * @param {string|null} historyData.from_value - Previous value
   * @param {string} historyData.to_value - New value
   * @param {string|null} historyData.note - Optional note
   * @returns {Promise<Object>} Created history entry
   */
  static async create(historyData) {
    const {
      client_id,
      changed_by_user_id,
      field_changed,
      from_value,
      to_value,
      note
    } = historyData;

    const query = `
      INSERT INTO client_status_history (
        client_id, changed_by_user_id, field_changed, from_value, to_value, note
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const values = [
      client_id,
      changed_by_user_id,
      field_changed,
      from_value || null,
      to_value,
      note || null
    ];

    const [result] = await pool.execute(query, values);
    return this.findById(result.insertId);
  }

  /**
   * Find history entry by ID
   * @param {number} id - History entry ID
   * @returns {Promise<Object|null>} History entry or null
   */
  static async findById(id) {
    const query = `
      SELECT 
        h.*,
        u.first_name as changed_by_first_name,
        u.last_name as changed_by_last_name
      FROM client_status_history h
      LEFT JOIN users u ON h.changed_by_user_id = u.id
      WHERE h.id = ?
    `;

    const [rows] = await pool.execute(query, [id]);
    if (rows.length === 0) return null;

    const entry = rows[0];
    if (entry.changed_by_first_name && entry.changed_by_last_name) {
      entry.changed_by_name = `${entry.changed_by_first_name} ${entry.changed_by_last_name}`;
    } else {
      entry.changed_by_name = null;
    }

    return entry;
  }

  /**
   * Find all history entries for a client
   * @param {number} clientId - Client ID
   * @returns {Promise<Array>} Array of history entries (ordered by most recent first)
   */
  static async findByClientId(clientId) {
    const query = `
      SELECT 
        h.*,
        u.first_name as changed_by_first_name,
        u.last_name as changed_by_last_name
      FROM client_status_history h
      LEFT JOIN users u ON h.changed_by_user_id = u.id
      WHERE h.client_id = ?
      ORDER BY h.changed_at DESC
    `;

    const [rows] = await pool.execute(query, [clientId]);

    return rows.map(row => {
      if (row.changed_by_first_name && row.changed_by_last_name) {
        row.changed_by_name = `${row.changed_by_first_name} ${row.changed_by_last_name}`;
      } else {
        row.changed_by_name = null;
      }
      return row;
    });
  }

  /**
   * Find recent changes across clients (admin view)
   * @param {Object} options - Query options
   * @param {number} options.agency_id - Filter by agency ID
   * @param {number} options.limit - Limit number of results (default: 50)
   * @returns {Promise<Array>} Array of recent history entries
   */
  static async findRecentChanges(options = {}) {
    const { agency_id, limit = 50 } = options;

    let query = `
      SELECT 
        h.*,
        c.initials as client_initials,
        c.agency_id,
        u.first_name as changed_by_first_name,
        u.last_name as changed_by_last_name
      FROM client_status_history h
      INNER JOIN clients c ON h.client_id = c.id
      LEFT JOIN users u ON h.changed_by_user_id = u.id
      WHERE 1=1
    `;

    const values = [];

    if (agency_id) {
      query += ' AND c.agency_id = ?';
      values.push(agency_id);
    }

    query += ' ORDER BY h.changed_at DESC LIMIT ?';
    values.push(limit);

    const [rows] = await pool.execute(query, values);

    return rows.map(row => {
      if (row.changed_by_first_name && row.changed_by_last_name) {
        row.changed_by_name = `${row.changed_by_first_name} ${row.changed_by_last_name}`;
      } else {
        row.changed_by_name = null;
      }
      return row;
    });
  }
}

export default ClientStatusHistory;
