import pool from '../config/database.js';

class MessageLog {
  static normalizePhone(phone) {
    if (!phone) return null;
    const str = String(phone).trim();
    if (str.startsWith('+')) return '+' + str.slice(1).replace(/[^\d]/g, '');
    const digits = str.replace(/[^\d]/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return digits ? `+${digits}` : null;
  }

  static async createInbound({
    agencyId = null,
    userId,
    assignedUserId = null,
    numberId = null,
    ownerType = null,
    clientId = null,
    agencyContactId = null,
    body,
    fromNumber,
    toNumber,
    providerMessageSid = null,
    metadata = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO message_logs
       (agency_id, number_id, user_id, assigned_user_id, owner_type, client_id, agency_contact_id, direction, body, from_number, to_number, twilio_message_sid, delivery_status, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'INBOUND', ?, ?, ?, ?, 'received', ?)`,
      [
        agencyId,
        numberId,
        userId,
        assignedUserId,
        ownerType,
        clientId,
        agencyContactId,
        body,
        this.normalizePhone(fromNumber) || fromNumber,
        this.normalizePhone(toNumber) || toNumber,
        providerMessageSid,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async createOutbound({
    agencyId = null,
    userId,
    assignedUserId = null,
    numberId = null,
    ownerType = null,
    clientId = null,
    agencyContactId = null,
    body,
    fromNumber,
    toNumber,
    providerMessageSid = null,
    deliveryStatus = 'pending',
    metadata = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO message_logs
       (agency_id, number_id, user_id, assigned_user_id, owner_type, client_id, agency_contact_id, direction, body, from_number, to_number, twilio_message_sid, delivery_status, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OUTBOUND', ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        numberId,
        userId,
        assignedUserId,
        ownerType,
        clientId,
        agencyContactId,
        body,
        this.normalizePhone(fromNumber) || fromNumber,
        this.normalizePhone(toNumber) || toNumber,
        providerMessageSid,
        deliveryStatus,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async markSent(id, sid = null, metadata = null) {
    await pool.execute(
      `UPDATE message_logs
       SET delivery_status = 'sent',
           provider_message_sid = COALESCE(provider_message_sid, ?),
           metadata = COALESCE(?, metadata)
       WHERE id = ?`,
      [sid, metadata ? JSON.stringify(metadata) : null, id]
    );
    return this.findById(id);
  }

  static async markFailed(id, errorMessage) {
    const metadata = { error: errorMessage };
    await pool.execute(
      `UPDATE message_logs
       SET delivery_status = 'failed',
           metadata = COALESCE(?, metadata)
       WHERE id = ?`,
      [JSON.stringify(metadata), id]
    );
    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM message_logs WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async listRecentForAgency(agencyId, { limit = 50 } = {}) {
    const [rows] = await pool.execute(
      `SELECT ml.*,
              c.initials AS client_initials,
              ac.full_name AS contact_name,
              u.first_name AS user_first_name,
              u.last_name AS user_last_name
       FROM message_logs ml
       LEFT JOIN clients c ON ml.client_id = c.id
       LEFT JOIN agency_contacts ac ON ml.agency_contact_id = ac.id
       LEFT JOIN users u ON ml.user_id = u.id
       WHERE ml.agency_id = ?
       ORDER BY ml.created_at DESC
       LIMIT ?`,
      [agencyId, limit]
    );
    return rows;
  }

  /**
   * @param {number} userId - Current user loading the thread
   * @param {number} [clientId] - Client for the thread
   * @param {number} [agencyContactId] - Contact for the thread
   * @param {number} limit - Max messages to return
   * @param {number[]} [assignedNumberIds] - For providers: include messages to/from these number_ids (multi-recipient pools)
   */
  static async listThread({ userId, clientId = null, agencyContactId = null, limit = 100, assignedNumberIds = [] }) {
    const ids = (assignedNumberIds || []).map(Number).filter(Boolean);
    const conditions = ['(user_id = ? OR number_id IN (' + (ids.length > 0 ? ids.map(() => '?').join(',') : 'NULL') + '))'];
    const params = [userId, ...ids];

    if (clientId) {
      conditions.push('client_id = ?');
      params.push(clientId);
    } else if (agencyContactId) {
      conditions.push('agency_contact_id = ?');
      params.push(agencyContactId);
    } else {
      throw new Error('Either clientId or agencyContactId is required');
    }

    params.push(limit);
    const [rows] = await pool.execute(
      `SELECT *
       FROM message_logs
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT ?`,
      params
    );
    return rows;
  }
}

export default MessageLog;

