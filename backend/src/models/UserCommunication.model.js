import pool from '../config/database.js';

class UserCommunication {
  static async create(communicationData) {
    const {
      userId,
      agencyId,
      templateType,
      templateId,
      subject,
      body,
      generatedByUserId,
      channel = 'email',
      recipientAddress = null,
      deliveryStatus = 'pending',
      externalMessageId = null,
      sentAt = null,
      deliveredAt = null,
      errorMessage = null,
      metadata = null
    } = communicationData;

    const [result] = await pool.execute(
      `INSERT INTO user_communications 
       (user_id, agency_id, template_type, template_id, channel, subject, body, recipient_address, 
        delivery_status, external_message_id, sent_at, delivered_at, error_message, metadata, generated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        agencyId, 
        templateType, 
        templateId || null, 
        channel,
        subject || null, 
        body, 
        recipientAddress || null,
        deliveryStatus,
        externalMessageId || null,
        sentAt || null,
        deliveredAt || null,
        errorMessage || null,
        metadata ? JSON.stringify(metadata) : null,
        generatedByUserId
      ]
    );

    return this.findById(result.insertId);
  }

  static async updateDeliveryStatus(id, status, externalMessageId = null, deliveredAt = null, errorMessage = null, metadata = null) {
    const updates = [];
    const values = [];

    updates.push('delivery_status = ?');
    values.push(status);

    if (externalMessageId !== null) {
      updates.push('external_message_id = ?');
      values.push(externalMessageId);
    }

    if (deliveredAt !== null) {
      updates.push('delivered_at = ?');
      values.push(deliveredAt);
    }

    if (errorMessage !== null) {
      updates.push('error_message = ?');
      values.push(errorMessage);
    }

    if (metadata !== null) {
      updates.push('metadata = ?');
      values.push(JSON.stringify(metadata));
    }

    // Set sent_at when status changes to 'sent' (if not already set)
    if (status === 'sent') {
      updates.push('sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP)');
    }

    values.push(id);

    await pool.execute(
      `UPDATE user_communications SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT uc.*, 
              u.email as user_email, u.first_name as user_first_name, u.last_name as user_last_name,
              a.name as agency_name,
              gb.first_name as generated_by_first_name, gb.last_name as generated_by_last_name
       FROM user_communications uc
       LEFT JOIN users u ON uc.user_id = u.id
       LEFT JOIN agencies a ON uc.agency_id = a.id
       LEFT JOIN users gb ON uc.generated_by_user_id = gb.id
       WHERE uc.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  static async findByUser(userId, filters = {}) {
    const { agencyId, templateType, limit, offset } = filters;
    
    let query = `SELECT uc.*, 
                        a.name as agency_name,
                        gb.first_name as generated_by_first_name, gb.last_name as generated_by_last_name
                 FROM user_communications uc
                 LEFT JOIN agencies a ON uc.agency_id = a.id
                 LEFT JOIN users gb ON uc.generated_by_user_id = gb.id
                 WHERE uc.user_id = ?`;
    const params = [userId];

    if (agencyId) {
      query += ' AND uc.agency_id = ?';
      params.push(agencyId);
    }

    if (templateType) {
      query += ' AND uc.template_type = ?';
      params.push(templateType);
    }

    query += ' ORDER BY uc.generated_at DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
      if (offset) {
        query += ' OFFSET ?';
        params.push(offset);
      }
    }

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async countByUser(userId, filters = {}) {
    const { agencyId, templateType } = filters;
    
    let query = 'SELECT COUNT(*) as count FROM user_communications WHERE user_id = ?';
    const params = [userId];

    if (agencyId) {
      query += ' AND agency_id = ?';
      params.push(agencyId);
    }

    if (templateType) {
      query += ' AND template_type = ?';
      params.push(templateType);
    }

    const [rows] = await pool.execute(query, params);
    return rows[0]?.count || 0;
  }
}

export default UserCommunication;
