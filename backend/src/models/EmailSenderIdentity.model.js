import pool from '../config/database.js';

function parseJsonMaybe(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

class EmailSenderIdentity {
  static async replaceInboundRoutes(senderIdentityId, inboundAddresses = []) {
    const id = Number(senderIdentityId);
    if (!id) return;
    const list = Array.from(new Set((inboundAddresses || []).map((v) => String(v || '').trim()).filter(Boolean)));

    await pool.execute('UPDATE email_inbound_routes SET is_active = FALSE WHERE sender_identity_id = ?', [id]);
    // Insert new routes (reactivate if already exists)
    for (const addr of list) {
      await pool.execute(
        `INSERT INTO email_inbound_routes (sender_identity_id, email_address, is_active)
         VALUES (?, ?, TRUE)
         ON DUPLICATE KEY UPDATE sender_identity_id = VALUES(sender_identity_id), is_active = TRUE, updated_at = CURRENT_TIMESTAMP`,
        [id, addr]
      );
    }
  }

  static async create({
    agencyId = null,
    identityKey,
    displayName = null,
    fromEmail,
    replyTo = null,
    inboundAddresses = null,
    isActive = true
  }) {
    const [result] = await pool.execute(
      `INSERT INTO email_sender_identities
       (agency_id, identity_key, display_name, from_email, reply_to, inbound_addresses_json, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        identityKey,
        displayName,
        fromEmail,
        replyTo,
        inboundAddresses ? JSON.stringify(inboundAddresses) : null,
        isActive ? 1 : 0
      ]
    );
    const created = await this.findById(result.insertId);
    await this.replaceInboundRoutes(created.id, inboundAddresses || created.inbound_addresses || []);
    return await this.findById(result.insertId);
  }

  static async update(id, updates = {}) {
    const fields = [];
    const values = [];
    const map = {
      identityKey: 'identity_key',
      displayName: 'display_name',
      fromEmail: 'from_email',
      replyTo: 'reply_to',
      isActive: 'is_active'
    };

    for (const [k, col] of Object.entries(map)) {
      if (updates[k] !== undefined) {
        fields.push(`${col} = ?`);
        values.push(k === 'isActive' ? (updates[k] ? 1 : 0) : updates[k]);
      }
    }

    if (updates.inboundAddresses !== undefined) {
      fields.push(`inbound_addresses_json = ?`);
      values.push(updates.inboundAddresses ? JSON.stringify(updates.inboundAddresses) : null);
    }

    if (!fields.length) return this.findById(id);

    values.push(id);
    await pool.execute(`UPDATE email_sender_identities SET ${fields.join(', ')} WHERE id = ?`, values);
    if (updates.inboundAddresses !== undefined) {
      await this.replaceInboundRoutes(id, updates.inboundAddresses || []);
    }
    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM email_sender_identities WHERE id = ?', [id]);
    const row = rows[0] || null;
    if (!row) return null;
    return { ...row, inbound_addresses: parseJsonMaybe(row.inbound_addresses_json) || [] };
  }

  static async list({ agencyId = null, includePlatformDefaults = true, onlyActive = true } = {}) {
    const clauses = [];
    const params = [];

    if (agencyId === null) {
      clauses.push('agency_id IS NULL');
    } else if (includePlatformDefaults) {
      clauses.push('(agency_id = ? OR agency_id IS NULL)');
      params.push(agencyId);
    } else {
      clauses.push('agency_id = ?');
      params.push(agencyId);
    }

    if (onlyActive) clauses.push('is_active = TRUE');

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT * FROM email_sender_identities ${where} ORDER BY agency_id IS NULL, identity_key`,
      params
    );

    return (rows || []).map((r) => ({ ...r, inbound_addresses: parseJsonMaybe(r.inbound_addresses_json) || [] }));
  }

  static async findByFromEmail(fromEmail) {
    const [rows] = await pool.execute(
      `SELECT * FROM email_sender_identities WHERE LOWER(from_email) = LOWER(?) AND is_active = TRUE`,
      [fromEmail]
    );
    const r = rows[0] || null;
    return r ? { ...r, inbound_addresses: parseJsonMaybe(r.inbound_addresses_json) || [] } : null;
  }

  static async findByInboundAddress(address) {
    const addr = String(address || '').trim();
    if (!addr) return null;
    const [rows] = await pool.execute(
      `SELECT e.*
       FROM email_inbound_routes r
       INNER JOIN email_sender_identities e ON e.id = r.sender_identity_id
       WHERE r.is_active = TRUE AND e.is_active = TRUE AND LOWER(r.email_address) = LOWER(?)
       LIMIT 1`,
      [addr]
    );
    const r = rows[0] || null;
    return r ? { ...r, inbound_addresses: parseJsonMaybe(r.inbound_addresses_json) || [] } : null;
  }
}

export default EmailSenderIdentity;

