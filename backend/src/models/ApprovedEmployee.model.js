import pool from '../config/database.js';

class ApprovedEmployee {
  static async findByEmail(email, agencyId = null) {
    // Check if company_default_password_hash column exists
    let hasCompanyDefaultPassword = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'company_default_password_hash'"
      );
      hasCompanyDefaultPassword = columns.length > 0;
    } catch (e) {
      hasCompanyDefaultPassword = false;
    }
    
    // Check if use_default_password column exists
    let hasUseDefaultPassword = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'use_default_password'"
      );
      hasUseDefaultPassword = columns.length > 0;
    } catch (e) {
      hasUseDefaultPassword = false;
    }
    
    let query;
    const selectFields = ['aee.*'];
    if (hasCompanyDefaultPassword) {
      selectFields.push('a.company_default_password_hash');
    }
    if (hasUseDefaultPassword) {
      selectFields.push('a.use_default_password');
    }
    
    query = `SELECT ${selectFields.join(', ')} FROM approved_employee_emails aee LEFT JOIN agencies a ON aee.agency_id = a.id WHERE aee.email = ? AND aee.is_active = TRUE`;
    const params = [email];
    
    if (agencyId) {
      query += ' AND aee.agency_id = ?';
      params.push(agencyId);
    }
    
    const [rows] = await pool.execute(query, params);
    const result = rows[0] || null;
    
    // Set fields to null if columns don't exist
    if (result) {
      if (!hasCompanyDefaultPassword) {
        result.company_default_password_hash = null;
      }
      if (!hasUseDefaultPassword) {
        result.use_default_password = null;
      }
    }
    
    return result;
  }

  static async findAllByEmail(email) {
    // Find ALL approved employee entries for an email (across all agencies)
    // Check if company_default_password_hash column exists
    let hasCompanyDefaultPassword = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'company_default_password_hash'"
      );
      hasCompanyDefaultPassword = columns.length > 0;
    } catch (e) {
      hasCompanyDefaultPassword = false;
    }
    
    // Check if use_default_password column exists
    let hasUseDefaultPassword = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'use_default_password'"
      );
      hasUseDefaultPassword = columns.length > 0;
    } catch (e) {
      hasUseDefaultPassword = false;
    }
    
    let query;
    const selectFields = ['aee.*'];
    if (hasCompanyDefaultPassword) {
      selectFields.push('a.company_default_password_hash');
    }
    if (hasUseDefaultPassword) {
      selectFields.push('a.use_default_password');
    }
    
    query = `SELECT ${selectFields.join(', ')} FROM approved_employee_emails aee LEFT JOIN agencies a ON aee.agency_id = a.id WHERE aee.email = ? AND aee.is_active = TRUE ORDER BY aee.agency_id`;
    
    const [rows] = await pool.execute(query, [email]);
    
    // Set fields to null if columns don't exist
    rows.forEach(result => {
      if (!hasCompanyDefaultPassword) {
        result.company_default_password_hash = null;
      }
      if (!hasUseDefaultPassword) {
        result.use_default_password = null;
      }
    });
    
    return rows;
  }

  static async findByAgency(agencyId, includeInactive = false) {
    let query = 'SELECT * FROM approved_employee_emails WHERE agency_id = ?';
    const params = [agencyId];
    
    if (!includeInactive) {
      query += ' AND is_active = TRUE';
    }
    
    query += ' ORDER BY created_at DESC';
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM approved_employee_emails WHERE id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async create(data) {
    const {
      email,
      agencyId,
      requiresVerification = false,
      createdByUserId = null,
      passwordHash = null
    } = data;

    // Validate password requirement based on agency settings
    const validationError = await this.validatePasswordRequirement(agencyId, passwordHash);
    if (validationError) {
      throw new Error(validationError);
    }

    const [result] = await pool.execute(
      `INSERT INTO approved_employee_emails 
       (email, agency_id, requires_verification, created_by_user_id, is_active, password_hash)
       VALUES (?, ?, ?, ?, TRUE, ?)`,
      [email, agencyId, requiresVerification, createdByUserId, passwordHash]
    );

    return this.findById(result.insertId);
  }

  static async validatePasswordRequirement(agencyId, passwordHash) {
    // Check if company_default_password_hash column exists
    let hasCompanyDefaultPassword = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'company_default_password_hash'"
      );
      hasCompanyDefaultPassword = columns.length > 0;
    } catch (e) {
      hasCompanyDefaultPassword = false;
    }
    
    // Check if use_default_password column exists
    let hasUseDefaultPassword = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'use_default_password'"
      );
      hasUseDefaultPassword = columns.length > 0;
    } catch (e) {
      hasUseDefaultPassword = false;
    }
    
    // Get agency settings
    const selectFields = [];
    if (hasUseDefaultPassword) {
      selectFields.push('use_default_password');
    }
    if (hasCompanyDefaultPassword) {
      selectFields.push('company_default_password_hash');
    }
    
    // If no relevant columns exist, default to allowing passwords
    if (selectFields.length === 0) {
      return null;
    }
    
    const query = `SELECT ${selectFields.join(', ')} FROM agencies WHERE id = ?`;
    const [agencyRows] = await pool.execute(query, [agencyId]);
    
    if (agencyRows.length === 0) {
      return 'Agency not found';
    }
    
    const agency = agencyRows[0];
    const useDefaultPassword = hasUseDefaultPassword && agency.use_default_password !== undefined ? agency.use_default_password : true;
    
    // If use_default_password is false, individual password is required
    if (!useDefaultPassword) {
      if (!passwordHash || passwordHash.trim() === '') {
        return 'Individual password is required when agency default password is disabled';
      }
    }
    
    return null;
  }

  static async bulkCreate(emails, agencyId, createdByUserId = null) {
    const agency = await pool.execute('SELECT requires_email_verification FROM agencies WHERE id = ?', [agencyId]);
    const requiresVerification = agency[0][0]?.requires_email_verification || false;

    const values = emails.map(email => [email, agencyId, requiresVerification, createdByUserId, true]);
    const placeholders = values.map(() => '(?, ?, ?, ?, TRUE)').join(', ');
    const flatValues = values.flat();

    const query = `INSERT INTO approved_employee_emails 
                   (email, agency_id, requires_verification, created_by_user_id, is_active)
                   VALUES ${placeholders}
                   ON DUPLICATE KEY UPDATE is_active = TRUE`;

    await pool.execute(query, flatValues);
    return this.findByAgency(agencyId);
  }

  static async update(id, data) {
    const updates = [];
    const values = [];

    if (data.email !== undefined) {
      updates.push('email = ?');
      values.push(data.email);
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(data.isActive);
    }
    if (data.requiresVerification !== undefined) {
      updates.push('requires_verification = ?');
      values.push(data.requiresVerification);
    }
    if (data.passwordHash !== undefined) {
      updates.push('password_hash = ?');
      values.push(data.passwordHash);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    await pool.execute(
      `UPDATE approved_employee_emails SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return this.findById(id);
  }

  static async updatePassword(id, passwordHash) {
    await pool.execute(
      'UPDATE approved_employee_emails SET password_hash = ? WHERE id = ?',
      [passwordHash, id]
    );
    return this.findById(id);
  }

  static async updateAllPasswordsFromDefault(agencyId, defaultPasswordHash) {
    // Check if password_hash column exists
    let hasPasswordHash = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'approved_employee_emails' AND COLUMN_NAME = 'password_hash'"
      );
      hasPasswordHash = columns.length > 0;
    } catch (e) {
      hasPasswordHash = false;
    }
    
    if (!hasPasswordHash) {
      // Column doesn't exist, return without updating
      console.warn('password_hash column does not exist in approved_employee_emails table. Please run migration 043_add_approved_employee_passwords.sql');
      return this.findByAgency(agencyId);
    }
    
    // Update all approved employees for this agency who don't have individual passwords
    await pool.execute(
      `UPDATE approved_employee_emails 
       SET password_hash = ? 
       WHERE agency_id = ? 
       AND (password_hash IS NULL OR password_hash = '')`,
      [defaultPasswordHash, agencyId]
    );
    return this.findByAgency(agencyId);
  }

  static async setVerificationToken(id, token, expiresAt) {
    await pool.execute(
      `UPDATE approved_employee_emails 
       SET verification_token = ?, verification_token_expires_at = ?
       WHERE id = ?`,
      [token, expiresAt, id]
    );
    return this.findById(id);
  }

  static async verifyEmail(token) {
    const [rows] = await pool.execute(
      `SELECT * FROM approved_employee_emails 
       WHERE verification_token = ? 
       AND verification_token_expires_at > NOW()
       AND is_active = TRUE`,
      [token]
    );

    if (rows.length === 0) {
      return null;
    }

    const employee = rows[0];
    await pool.execute(
      `UPDATE approved_employee_emails 
       SET verified_at = NOW(), 
           verification_token = NULL, 
           verification_token_expires_at = NULL
       WHERE id = ?`,
      [employee.id]
    );

    return this.findById(employee.id);
  }

  static async delete(id) {
    await pool.execute('DELETE FROM approved_employee_emails WHERE id = ?', [id]);
    return true;
  }

  static async isEmailApproved(email, agencyId = null) {
    const employee = await this.findByEmail(email, agencyId);
    if (!employee) return false;
    
    // If verification is required, check if verified
    if (employee.requires_verification && !employee.verified_at) {
      return false;
    }
    
    return true;
  }
}

export default ApprovedEmployee;

