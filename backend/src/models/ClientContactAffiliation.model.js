import pool from '../config/database.js';

const CHOICES = new Set(['unchanged', 'email_only', 'sms_only', 'both', 'off']);

class ClientContactAffiliation {
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT a.*,
              c.full_name AS contact_full_name,
              c.email AS contact_email,
              c.phone AS contact_phone,
              c.is_active AS contact_is_active,
              cl.first_name AS client_first_name,
              cl.last_name AS client_last_name,
              cl.preferred_name AS client_preferred_name
       FROM client_contact_affiliations a
       JOIN agency_contacts c ON c.id = a.agency_contact_id
       JOIN clients cl ON cl.id = a.client_id
       WHERE a.id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  static async listForClient(clientId, { includeInactive = false } = {}) {
    const activeClause = includeInactive ? '' : 'AND a.is_active = 1';
    const [rows] = await pool.execute(
      `SELECT a.*,
              c.full_name AS contact_full_name,
              c.email AS contact_email,
              c.phone AS contact_phone,
              c.is_active AS contact_is_active,
              c.source AS contact_source
       FROM client_contact_affiliations a
       JOIN agency_contacts c ON c.id = a.agency_contact_id
       WHERE a.client_id = ?
         ${activeClause}
       ORDER BY a.created_at DESC, a.id DESC`,
      [clientId]
    );
    return rows || [];
  }

  static async listReminderRecipientsForClient(clientId) {
    const [rows] = await pool.execute(
      `SELECT a.id AS affiliation_id,
              a.agency_id,
              a.client_id,
              a.agency_contact_id,
              a.email_reminders_enabled,
              a.sms_reminders_enabled,
              a.sms_opt_in,
              c.full_name AS contact_full_name,
              c.email AS contact_email,
              c.phone AS contact_phone
       FROM client_contact_affiliations a
       JOIN agency_contacts c ON c.id = a.agency_contact_id
       WHERE a.client_id = ?
         AND a.is_active = 1
         AND c.is_active = 1
         AND (a.email_reminders_enabled = 1 OR a.sms_reminders_enabled = 1)`,
      [clientId]
    );
    return rows || [];
  }

  static async findByClientAndContact(clientId, agencyContactId) {
    const [rows] = await pool.execute(
      `SELECT * FROM client_contact_affiliations
       WHERE client_id = ? AND agency_contact_id = ?
       LIMIT 1`,
      [clientId, agencyContactId]
    );
    return rows[0] || null;
  }

  static async create(data) {
    const {
      agencyId,
      clientId,
      agencyContactId,
      relationshipType = null,
      emailRemindersEnabled = false,
      smsRemindersEnabled = false,
      smsOptIn = false,
      notifyAckByUserId = null,
      notifyAckAt = null,
      createdByUserId = null
    } = data;

    const [result] = await pool.execute(
      `INSERT INTO client_contact_affiliations
        (agency_id, client_id, agency_contact_id, relationship_type,
         email_reminders_enabled, sms_reminders_enabled, sms_opt_in, is_active,
         notify_ack_by_user_id, notify_ack_at, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        agencyContactId,
        relationshipType ? String(relationshipType).trim().slice(0, 64) : null,
        emailRemindersEnabled ? 1 : 0,
        smsRemindersEnabled ? 1 : 0,
        smsOptIn || smsRemindersEnabled ? 1 : 0,
        notifyAckByUserId || null,
        notifyAckAt || null,
        createdByUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, patch = {}) {
    const updates = [];
    const params = [];
    const map = {
      relationshipType: 'relationship_type',
      emailRemindersEnabled: 'email_reminders_enabled',
      smsRemindersEnabled: 'sms_reminders_enabled',
      smsOptIn: 'sms_opt_in',
      isActive: 'is_active',
      notifyAckByUserId: 'notify_ack_by_user_id',
      notifyAckAt: 'notify_ack_at',
      notifyEmailSentAt: 'notify_email_sent_at',
      notifyEmailMessageId: 'notify_email_message_id',
      contactLastChoice: 'contact_last_choice',
      contactChoiceAt: 'contact_choice_at'
    };

    for (const [camel, col] of Object.entries(map)) {
      if (patch[camel] === undefined) continue;
      if (['emailRemindersEnabled', 'smsRemindersEnabled', 'smsOptIn', 'isActive'].includes(camel)) {
        updates.push(`${col} = ?`);
        params.push(patch[camel] ? 1 : 0);
      } else if (camel === 'contactLastChoice') {
        const v = String(patch[camel] || '').toLowerCase();
        updates.push(`${col} = ?`);
        params.push(CHOICES.has(v) ? v : null);
      } else if (camel === 'relationshipType') {
        updates.push(`${col} = ?`);
        params.push(patch[camel] ? String(patch[camel]).trim().slice(0, 64) : null);
      } else {
        updates.push(`${col} = ?`);
        params.push(patch[camel]);
      }
    }
    if (!updates.length) return this.findById(id);
    params.push(id);
    await pool.execute(
      `UPDATE client_contact_affiliations SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params
    );
    return this.findById(id);
  }

  static async softDeactivate(id) {
    return this.update(id, {
      isActive: false,
      emailRemindersEnabled: false,
      smsRemindersEnabled: false
    });
  }

  static toApi(row) {
    if (!row) return null;
    return {
      id: Number(row.id),
      agencyId: Number(row.agency_id),
      clientId: Number(row.client_id),
      agencyContactId: Number(row.agency_contact_id),
      relationshipType: row.relationship_type || null,
      emailRemindersEnabled: !!row.email_reminders_enabled,
      smsRemindersEnabled: !!row.sms_reminders_enabled,
      smsOptIn: !!row.sms_opt_in,
      isActive: row.is_active !== 0 && row.is_active !== false,
      notifyAckByUserId: row.notify_ack_by_user_id ? Number(row.notify_ack_by_user_id) : null,
      notifyAckAt: row.notify_ack_at || null,
      notifyEmailSentAt: row.notify_email_sent_at || null,
      contactLastChoice: row.contact_last_choice || null,
      contactChoiceAt: row.contact_choice_at || null,
      createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      contact: {
        id: Number(row.agency_contact_id),
        fullName: row.contact_full_name || null,
        email: row.contact_email || null,
        phone: row.contact_phone || null,
        isActive: row.contact_is_active !== 0 && row.contact_is_active !== false,
        source: row.contact_source || null
      },
      client: row.client_first_name
        ? {
            firstName: row.client_first_name,
            lastName: row.client_last_name,
            preferredName: row.client_preferred_name
          }
        : undefined
    };
  }
}

export default ClientContactAffiliation;
