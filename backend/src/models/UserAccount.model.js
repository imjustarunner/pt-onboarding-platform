import pool from '../config/database.js';

class UserAccount {
  static async findByUserId(userId, agencyId = null) {
    let query = 'SELECT ua.*, at.name as account_type_name, a.name as agency_name FROM user_accounts ua LEFT JOIN account_types at ON ua.account_type_id = at.id LEFT JOIN agencies a ON ua.agency_id = a.id WHERE ua.user_id = ?';
    const params = [userId];
    
    if (agencyId !== null) {
      query += ' AND (ua.agency_id = ? OR ua.agency_id IS NULL)';
      params.push(agencyId);
    }
    
    query += ' ORDER BY ua.agency_id IS NULL DESC, ua.created_at ASC';
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT ua.*, at.name as account_type_name, a.name as agency_name FROM user_accounts ua LEFT JOIN account_types at ON ua.account_type_id = at.id LEFT JOIN agencies a ON ua.agency_id = a.id WHERE ua.id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async create(accountData) {
    const { userId, accountName, accountTypeId, username, pin, temporaryPassword, temporaryLink, agencyId } = accountData;
    const [result] = await pool.execute(
      'INSERT INTO user_accounts (user_id, account_name, account_type_id, username, pin, temporary_password, temporary_link, agency_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, accountName, accountTypeId || null, username || null, pin || null, temporaryPassword || null, temporaryLink || null, agencyId || null]
    );
    return this.findById(result.insertId);
  }

  static async update(id, accountData) {
    const { accountName, accountTypeId, username, pin, temporaryPassword, temporaryLink, agencyId } = accountData;
    const updates = [];
    const values = [];

    if (accountName !== undefined) {
      updates.push('account_name = ?');
      values.push(accountName);
    }
    if (accountTypeId !== undefined) {
      updates.push('account_type_id = ?');
      values.push(accountTypeId);
    }
    if (username !== undefined) {
      updates.push('username = ?');
      values.push(username);
    }
    if (pin !== undefined) {
      updates.push('pin = ?');
      values.push(pin);
    }
    if (temporaryPassword !== undefined) {
      updates.push('temporary_password = ?');
      values.push(temporaryPassword);
    }
    if (temporaryLink !== undefined) {
      updates.push('temporary_link = ?');
      values.push(temporaryLink);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      values.push(agencyId);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.execute(
      `UPDATE user_accounts SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM user_accounts WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }
}

export default UserAccount;

