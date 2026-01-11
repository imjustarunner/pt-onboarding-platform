import pool from '../config/database.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

class User {
  static async findByEmail(email) {
    // Check which columns exist to avoid errors if migrations haven't been run
    let query = 'SELECT id, email, phone_number, role, status, completed_at, terminated_at, status_expires_at, password_hash, first_name, last_name, invitation_token, invitation_token_expires_at, temporary_password_hash, temporary_password_expires_at, created_at';
    
    try {
      // Use explicit database name from environment variable instead of DATABASE() function
      // This is more reliable, especially with connection pooling and Unix sockets
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('work_email', 'personal_email', 'username', 'has_supervisor_privileges', 'personal_phone', 'work_phone', 'work_phone_extension')",
        [dbName]
      );
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      if (existingColumns.includes('work_email')) query += ', work_email';
      if (existingColumns.includes('personal_email')) query += ', personal_email';
      // Only add username to SELECT if column exists (migration has been run)
      if (existingColumns.includes('username')) query += ', username';
      if (existingColumns.includes('has_supervisor_privileges')) query += ', has_supervisor_privileges';
      if (existingColumns.includes('personal_phone')) query += ', personal_phone';
      if (existingColumns.includes('work_phone')) query += ', work_phone';
      if (existingColumns.includes('work_phone_extension')) query += ', work_phone_extension';
    } catch (err) {
      // If we can't check columns, just use the base query
      console.warn('Could not check for email columns:', err.message);
    }
    
    // Check if username column exists before querying it
    let hasUsernameColumn = false;
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [usernameColumns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'",
        [dbName]
      );
      hasUsernameColumn = usernameColumns.length > 0;
    } catch (err) {
      // If we can't check, assume it doesn't exist
      console.warn('Could not check for username column:', err.message);
    }
    
    if (hasUsernameColumn) {
      query += ' FROM users WHERE email = ? OR work_email = ? OR username = ?';
      const [rows] = await pool.execute(query, [email, email, email]);
      return rows[0] || null;
    } else {
      // Username column doesn't exist yet (migration not run)
      query += ' FROM users WHERE email = ? OR work_email = ?';
      const [rows] = await pool.execute(query, [email, email]);
      return rows[0] || null;
    }
  }

  static async findByUsername(username) {
    // Check which columns exist
    let query = 'SELECT id, email, phone_number, role, status, completed_at, terminated_at, status_expires_at, password_hash, first_name, last_name, invitation_token, invitation_token_expires_at, temporary_password_hash, temporary_password_expires_at, created_at';
    
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('work_email', 'personal_email', 'username', 'has_supervisor_privileges', 'personal_phone', 'work_phone', 'work_phone_extension')",
        [dbName]
      );
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      if (existingColumns.includes('work_email')) query += ', work_email';
      if (existingColumns.includes('personal_email')) query += ', personal_email';
      if (existingColumns.includes('username')) query += ', username';
      if (existingColumns.includes('has_supervisor_privileges')) query += ', has_supervisor_privileges';
      if (existingColumns.includes('personal_phone')) query += ', personal_phone';
      if (existingColumns.includes('work_phone')) query += ', work_phone';
      if (existingColumns.includes('work_phone_extension')) query += ', work_phone_extension';
    } catch (err) {
      console.warn('Could not check for columns:', err.message);
    }
    
    query += ' FROM users WHERE username = ?';
    const [rows] = await pool.execute(query, [username]);
    return rows[0] || null;
  }

  static async findByWorkEmail(workEmail) {
    // Check if work_email column exists
    let query = 'SELECT id, email, phone_number, role, status, completed_at, terminated_at, status_expires_at, password_hash, first_name, last_name, invitation_token, invitation_token_expires_at, temporary_password_hash, temporary_password_expires_at, created_at';
    
    try {
      // Use explicit database name from environment variable instead of DATABASE() function
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('work_email', 'personal_email', 'has_supervisor_privileges', 'personal_phone', 'work_phone', 'work_phone_extension')",
        [dbName]
      );
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      if (existingColumns.includes('work_email')) query += ', work_email';
      if (existingColumns.includes('personal_email')) query += ', personal_email';
      if (existingColumns.includes('has_supervisor_privileges')) query += ', has_supervisor_privileges';
      if (existingColumns.includes('personal_phone')) query += ', personal_phone';
      if (existingColumns.includes('work_phone')) query += ', work_phone';
      if (existingColumns.includes('work_phone_extension')) query += ', work_phone_extension';
    } catch (err) {
      // If we can't check columns, just use the base query
      console.warn('Could not check for email columns:', err.message);
    }
    
    query += ' FROM users WHERE work_email = ?';
    const [rows] = await pool.execute(query, [workEmail]);
    return rows[0] || null;
  }

  static async findByName(firstName, lastName) {
    // Check which columns exist
    let existingColumns = [];
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('work_email', 'personal_email')"
      );
      existingColumns = columns.map(c => c.COLUMN_NAME);
    } catch (err) {
      console.warn('Could not check for email columns:', err.message);
    }
    
    let selectFields = ['u.id', 'u.email', 'u.phone_number', 'u.role', 'u.status', 'u.first_name', 'u.last_name', 'u.created_at'];
    let groupByFields = ['u.id', 'u.email', 'u.phone_number', 'u.role', 'u.status', 'u.first_name', 'u.last_name', 'u.created_at'];
    
    if (existingColumns.includes('work_email')) {
      selectFields.push('u.work_email');
      groupByFields.push('u.work_email');
    }
    if (existingColumns.includes('personal_email')) {
      selectFields.push('u.personal_email');
      groupByFields.push('u.personal_email');
    }
    
    let query = `SELECT ${selectFields.join(', ')},
              GROUP_CONCAT(DISTINCT a.id ORDER BY a.id SEPARATOR ',') as agency_ids,
              GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') as agency_names
              FROM users u
              LEFT JOIN user_agencies ua ON u.id = ua.user_id
              LEFT JOIN agencies a ON ua.agency_id = a.id
              WHERE LOWER(TRIM(u.first_name)) = LOWER(TRIM(?)) 
              AND LOWER(TRIM(u.last_name)) = LOWER(TRIM(?))
              AND (u.is_archived = FALSE OR u.is_archived IS NULL)
              GROUP BY ${groupByFields.join(', ')}`;
    
    const [rows] = await pool.execute(query, [firstName, lastName]);
    return rows;
  }

  static async findById(id) {
    // Check which columns exist to avoid errors if migrations haven't been run
    let query = 'SELECT id, email, phone_number, role, status, completed_at, terminated_at, status_expires_at, is_active, first_name, last_name, invitation_token, invitation_token_expires_at, temporary_password_hash, temporary_password_expires_at, passwordless_token, passwordless_token_expires_at, created_at';
    
    // Try to include pending fields if they exist (will be added by migrations)
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('pending_completed_at', 'pending_auto_complete_at', 'pending_identity_verified', 'pending_access_locked', 'pending_completion_notified', 'work_email', 'personal_email', 'username', 'has_supervisor_privileges', 'personal_phone', 'work_phone', 'work_phone_extension')",
        [dbName]
      );
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      if (existingColumns.includes('pending_completed_at')) query += ', pending_completed_at';
      if (existingColumns.includes('pending_auto_complete_at')) query += ', pending_auto_complete_at';
      if (existingColumns.includes('pending_identity_verified')) query += ', pending_identity_verified';
      if (existingColumns.includes('pending_access_locked')) query += ', pending_access_locked';
      if (existingColumns.includes('pending_completion_notified')) query += ', pending_completion_notified';
      if (existingColumns.includes('work_email')) query += ', work_email';
      if (existingColumns.includes('personal_email')) query += ', personal_email';
      if (existingColumns.includes('username')) query += ', username';
      if (existingColumns.includes('has_supervisor_privileges')) query += ', has_supervisor_privileges';
      if (existingColumns.includes('personal_phone')) query += ', personal_phone';
      if (existingColumns.includes('work_phone')) query += ', work_phone';
      if (existingColumns.includes('work_phone_extension')) query += ', work_phone_extension';
    } catch (err) {
      // If we can't check columns, just use the base query
      console.warn('Could not check for pending columns:', err.message);
    }
    
    // passwordless_token is already in the base query above
    
    query += ' FROM users WHERE id = ?';
    const [rows] = await pool.execute(query, [id]);
    return rows[0] || null;
  }

  static async create(userData) {
    const { email, passwordHash, role, firstName, lastName, phoneNumber, status, personalEmail } = userData;
    // All new users should be pending by default (unless explicitly set otherwise)
    const userStatus = status || 'pending';
    
    // CRITICAL: Protect superadmin email - always force super_admin role
    let finalRole = role || 'clinician';
    if (email === 'superadmin@plottwistco.com') {
      finalRole = 'super_admin';
      console.warn('⚠️  Attempted to create user with superadmin email - forcing super_admin role');
    }
    
    // Auto-set has_supervisor_privileges when role is 'supervisor'
    let hasSupervisorPrivileges = null;
    if (finalRole === 'supervisor') {
      hasSupervisorPrivileges = true;
    }
    
    // Username starts as personal_email (or email if personal_email not provided)
    const initialUsername = personalEmail || email;
    
    // Build query dynamically to handle optional email fields
    let query = 'INSERT INTO users (role, status, first_name, last_name';
    let values = [finalRole, userStatus, firstName, lastName];
    let placeholders = ['?', '?', '?', '?'];
    
    if (email !== undefined && email !== null) {
      query += ', email';
      placeholders.push('?');
      values.push(email);
    }
    
    if (passwordHash !== undefined && passwordHash !== null) {
      query += ', password_hash';
      placeholders.push('?');
      values.push(passwordHash);
    }
    
    if (phoneNumber !== undefined && phoneNumber !== null) {
      query += ', phone_number';
      placeholders.push('?');
      values.push(phoneNumber);
    }
    
    // Add personal_email if column exists and value provided
    if (personalEmail !== undefined && personalEmail !== null) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'personal_email'"
        );
        if (columns.length > 0) {
          query += ', personal_email';
          placeholders.push('?');
          values.push(personalEmail);
        }
      } catch (err) {
        // Column doesn't exist yet, skip it
      }
    }
    
    // Add username if column exists (set to personal_email initially)
    if (initialUsername) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'"
        );
        if (columns.length > 0) {
          query += ', username';
          placeholders.push('?');
          values.push(initialUsername);
        }
      } catch (err) {
        // Column doesn't exist yet, skip it
      }
    }
    
    // Add has_supervisor_privileges if column exists and role is supervisor
    if (hasSupervisorPrivileges !== null) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_supervisor_privileges'"
        );
        if (columns.length > 0) {
          query += ', has_supervisor_privileges';
          placeholders.push('?');
          values.push(hasSupervisorPrivileges ? 1 : 0);
        }
      } catch (err) {
        // Column doesn't exist yet, skip it
      }
    }
    
    query += `) VALUES (${placeholders.join(', ')})`;
    
    const [result] = await pool.execute(query, values);
    return this.findById(result.insertId);
  }

  static async findAll(includeArchived = false) {
    // Check if has_supervisor_privileges column exists
    let hasSupervisorPrivilegesField = '';
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_supervisor_privileges'"
      );
      if (columns.length > 0) {
        hasSupervisorPrivilegesField = ', u.has_supervisor_privileges';
      }
    } catch (err) {
      // Column doesn't exist yet, skip it
    }
    
    let query = `
      SELECT DISTINCT 
        u.id, 
        u.email, 
        u.role, 
        u.status, 
        u.completed_at, 
        u.terminated_at, 
        u.status_expires_at, 
        u.is_active, 
        u.first_name, 
        u.last_name, 
        u.created_at${hasSupervisorPrivilegesField},
        GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') as agencies,
        GROUP_CONCAT(DISTINCT a.id ORDER BY a.id SEPARATOR ',') as agency_ids
      FROM users u
      LEFT JOIN user_agencies ua ON u.id = ua.user_id
      LEFT JOIN agencies a ON ua.agency_id = a.id
    `;
    if (!includeArchived) {
      query += ' WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)';
    }
    let groupByFields = 'u.id, u.email, u.role, u.status, u.completed_at, u.terminated_at, u.status_expires_at, u.is_active, u.first_name, u.last_name, u.created_at';
    if (hasSupervisorPrivilegesField) {
      groupByFields += ', u.has_supervisor_privileges';
    }
    query += ` GROUP BY ${groupByFields}`;
    query += ' ORDER BY u.created_at DESC';
    const [rows] = await pool.execute(query);
    return rows;
  }

  static async archive(id, archivedByUserId, archivedByAgencyId = null) {
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    if (hasAgencyColumn) {
      const [result] = await pool.execute(
        'UPDATE users SET is_archived = TRUE, archived_at = NOW(), archived_by_user_id = ?, archived_by_agency_id = ? WHERE id = ?',
        [archivedByUserId, archivedByAgencyId, id]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        'UPDATE users SET is_archived = TRUE, archived_at = NOW(), archived_by_user_id = ? WHERE id = ?',
        [archivedByUserId, id]
      );
      return result.affectedRows > 0;
    }
  }

  static async restore(id, userAgencyIds = []) {
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    if (hasAgencyColumn && userAgencyIds.length > 0) {
      // Only restore if user's agency matches archived_by_agency_id
      const placeholders = userAgencyIds.map(() => '?').join(',');
      const [result] = await pool.execute(
        `UPDATE users SET is_archived = FALSE, archived_at = NULL, archived_by_user_id = NULL, archived_by_agency_id = NULL WHERE id = ? AND is_archived = TRUE AND archived_by_agency_id IN (${placeholders})`,
        [id, ...userAgencyIds]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        'UPDATE users SET is_archived = FALSE, archived_at = NULL, archived_by_user_id = NULL WHERE id = ? AND is_archived = TRUE',
        [id]
      );
      return result.affectedRows > 0;
    }
  }

  static async delete(id, userAgencyIds = []) {
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    if (hasAgencyColumn && userAgencyIds.length > 0) {
      // Only delete if user's agency matches archived_by_agency_id
      const placeholders = userAgencyIds.map(() => '?').join(',');
      const [result] = await pool.execute(
        `DELETE FROM users WHERE id = ? AND is_archived = TRUE AND archived_by_agency_id IN (${placeholders})`,
        [id, ...userAgencyIds]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        'DELETE FROM users WHERE id = ? AND is_archived = TRUE',
        [id]
      );
      return result.affectedRows > 0;
    }
  }

  static async findAllArchived(filters = {}) {
    const { agencyIds, userRole } = filters;
    
    // Check if archived_by_agency_id column exists
    let hasAgencyColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'archived_by_agency_id'"
      );
      hasAgencyColumn = columns.length > 0;
    } catch (err) {
      console.error('Error checking for archived_by_agency_id column:', err);
    }

    let query = 'SELECT id, email, role, status, completed_at, terminated_at, status_expires_at, first_name, last_name, created_at, archived_at, archived_by_user_id FROM users WHERE is_archived = TRUE';
    const params = [];

    // Filter by archived_by_agency_id
    // - If agencyIds is null (super_admin, no filter), don't filter
    // - If agencyIds is an array, filter by those agencies
    if (hasAgencyColumn && agencyIds !== null && agencyIds !== undefined && agencyIds.length > 0) {
      const placeholders = agencyIds.map(() => '?').join(',');
      query += ` AND archived_by_agency_id IN (${placeholders})`;
      params.push(...agencyIds);
    } else if (hasAgencyColumn && userRole !== 'super_admin') {
      // For non-super_admin users, if no agencyIds provided, return empty (they shouldn't see anything)
      query += ' AND 1=0'; // Always false condition
    }

    query += ' ORDER BY archived_at DESC';
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async update(id, userData) {
    const { firstName, lastName, role, phoneNumber, isActive, hasSupervisorPrivileges, personalPhone, workPhone, workPhoneExtension } = userData;
    
    // Get current user to check if it's superadmin
    const currentUser = await this.findById(id);
    if (!currentUser) {
      throw new Error('User not found');
    }
    
    // CRITICAL: Application-layer protection for superadmin account
    // This replaces database triggers which require SUPER privilege in Cloud SQL
    // Protection happens BEFORE any update, even if role is not in the update
    if (currentUser.email === 'superadmin@plottwistco.com') {
      // If trying to change role away from super_admin, block it
      if (role !== undefined && role !== 'super_admin') {
        throw new Error('Cannot change role of superadmin@plottwistco.com - this account must remain super_admin');
      }
      // Always ensure role is super_admin for superadmin account, even if not provided
      // This prevents accidental role loss
      if (currentUser.role !== 'super_admin') {
        console.warn(`⚠️  WARNING: Superadmin account (${currentUser.email}) had incorrect role (${currentUser.role}). Restoring to super_admin.`);
        // Force role to super_admin
        userData.role = 'super_admin';
      }
    }
    
    // Additional protection: Prevent removing super_admin role from any user who currently has it
    // This provides an extra safety layer to prevent accidental demotion of super admins
    if (role !== undefined && currentUser.role === 'super_admin' && role !== 'super_admin') {
      throw new Error('Cannot remove super_admin role from a user who currently has it');
    }
    
    const updates = [];
    const values = [];
    let hasSupervisorPrivilegesAdded = false; // Track if we've already added this column

    if (firstName !== undefined) {
      updates.push('first_name = ?');
      values.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push('last_name = ?');
      values.push(lastName);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
      
      // Auto-set has_supervisor_privileges based on role
      // BUT only if hasSupervisorPrivileges is NOT explicitly provided
      // If hasSupervisorPrivileges is provided, it takes precedence
      if (hasSupervisorPrivileges === undefined) {
        const wasSupervisor = currentUser.role === 'supervisor';
        const willBeSupervisor = role === 'supervisor';
        
        if (wasSupervisor !== willBeSupervisor) {
          // Role is changing to/from supervisor, update the boolean
          try {
            const [columns] = await pool.execute(
              "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_supervisor_privileges'"
            );
            if (columns.length > 0) {
              updates.push('has_supervisor_privileges = ?');
              values.push(willBeSupervisor ? 1 : 0);
              hasSupervisorPrivilegesAdded = true;
              console.log('User.update: Auto-setting has_supervisor_privileges to', willBeSupervisor ? 1 : 0, 'based on role change');
            }
          } catch (err) {
            // Column doesn't exist yet, skip it
          }
        } else if (willBeSupervisor && (currentUser.has_supervisor_privileges !== true && currentUser.has_supervisor_privileges !== 1)) {
          // Role is already supervisor but boolean is not set, ensure it's set
          try {
            const [columns] = await pool.execute(
              "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_supervisor_privileges'"
            );
            if (columns.length > 0) {
              updates.push('has_supervisor_privileges = ?');
              values.push(1);
              hasSupervisorPrivilegesAdded = true;
              console.log('User.update: Auto-setting has_supervisor_privileges to 1 for existing supervisor');
            }
          } catch (err) {
            // Column doesn't exist yet, skip it
          }
        }
      } else {
        console.log('User.update: hasSupervisorPrivileges explicitly provided, skipping auto-set based on role');
      }
    }
    if (phoneNumber !== undefined) {
      updates.push('phone_number = ?');
      values.push(phoneNumber);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive);
    }
    if (hasSupervisorPrivileges !== undefined && !hasSupervisorPrivilegesAdded) {
      // Check if column exists before trying to update
      // Only add if we haven't already added it (e.g., from role-based auto-setting)
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_supervisor_privileges'"
        );
        if (columns.length > 0) {
          updates.push('has_supervisor_privileges = ?');
          // Ensure boolean is converted to 1/0 for MySQL
          const boolValue = hasSupervisorPrivileges ? 1 : 0;
          console.log('User.update: Setting has_supervisor_privileges to', boolValue, 'for user', id);
          values.push(boolValue);
        } else {
          console.warn('has_supervisor_privileges column does not exist yet');
        }
      } catch (err) {
        // Column doesn't exist yet, skip it
        console.warn('has_supervisor_privileges column does not exist yet:', err.message);
      }
    } else if (hasSupervisorPrivileges !== undefined && hasSupervisorPrivilegesAdded) {
      console.log('User.update: has_supervisor_privileges already added from role change, using explicit value instead');
      // Replace the last value (which was from role-based auto-setting) with the explicit value
      const boolValue = hasSupervisorPrivileges ? 1 : 0;
      values[values.length - 1] = boolValue;
      console.log('User.update: Overriding with explicit value:', boolValue);
    }
    if (personalPhone !== undefined) {
      // Check if column exists before trying to update
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'personal_phone'"
        );
        if (columns.length > 0) {
          updates.push('personal_phone = ?');
          values.push(personalPhone);
        }
      } catch (err) {
        // Column doesn't exist yet, skip it
        console.warn('personal_phone column does not exist yet');
      }
    }
    if (workPhone !== undefined) {
      // Check if column exists before trying to update
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'work_phone'"
        );
        if (columns.length > 0) {
          updates.push('work_phone = ?');
          values.push(workPhone);
        }
      } catch (err) {
        // Column doesn't exist yet, skip it
        console.warn('work_phone column does not exist yet');
      }
    }
    if (workPhoneExtension !== undefined) {
      // Check if column exists before trying to update
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'work_phone_extension'"
        );
        if (columns.length > 0) {
          updates.push('work_phone_extension = ?');
          values.push(workPhoneExtension);
        }
      } catch (err) {
        // Column doesn't exist yet, skip it
        console.warn('work_phone_extension column does not exist yet');
      }
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    
    // Execute update - application-layer protection already enforced above
    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    // Verify the role after update (double-check protection)
    // This is a safety net in case of direct database access or other bypasses
    const updatedUser = await this.findById(id);
    if (updatedUser.email === 'superadmin@plottwistco.com' && updatedUser.role !== 'super_admin') {
      console.error(`❌ CRITICAL: Superadmin role was changed! Restoring immediately...`);
      await pool.execute(
        "UPDATE users SET role = 'super_admin' WHERE id = ?",
        [id]
      );
      // Return the corrected user
      return this.findById(id);
    }
    
    return updatedUser;
  }

  static async deactivate(userId) {
    const [result] = await pool.execute(
      'UPDATE users SET is_active = FALSE WHERE id = ?',
      [userId]
    );
    return result.affectedRows > 0;
  }

  static async getAgencies(userId) {
    const [rows] = await pool.execute(
      `SELECT a.* FROM agencies a 
       JOIN user_agencies ua ON a.id = ua.agency_id 
       WHERE ua.user_id = ?`,
      [userId]
    );
    return rows;
  }

  static async getPrograms(userId) {
    const [rows] = await pool.execute(
      `SELECT p.*, a.name as agency_name FROM programs p 
       JOIN user_programs up ON p.id = up.program_id 
       JOIN agencies a ON p.agency_id = a.id
       WHERE up.user_id = ?`,
      [userId]
    );
    return rows;
  }

  static async assignToAgency(userId, agencyId) {
    await pool.execute(
      'INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id',
      [userId, agencyId]
    );
  }

  static async assignToProgram(userId, programId) {
    await pool.execute(
      'INSERT INTO user_programs (user_id, program_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id',
      [userId, programId]
    );
  }

  static async removeFromAgency(userId, agencyId) {
    await pool.execute(
      'DELETE FROM user_agencies WHERE user_id = ? AND agency_id = ?',
      [userId, agencyId]
    );
  }

  static async removeFromProgram(userId, programId) {
    await pool.execute(
      'DELETE FROM user_programs WHERE user_id = ? AND program_id = ?',
      [userId, programId]
    );
  }

  static async generateInvitationToken(userId, expiresInDays = 30) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    
    await pool.execute(
      'UPDATE users SET invitation_token = ?, invitation_token_expires_at = ? WHERE id = ?',
      [token, expiresAt, userId]
    );
    
    return token;
  }

  static async validateInvitationToken(token) {
    const [rows] = await pool.execute(
      'SELECT id, email, invitation_token_expires_at FROM users WHERE invitation_token = ?',
      [token]
    );
    
    if (rows.length === 0) {
      return null;
    }
    
    const user = rows[0];
    if (user.invitation_token_expires_at && new Date(user.invitation_token_expires_at) < new Date()) {
      return null; // Token expired
    }
    
    return user;
  }

  static async setTemporaryPassword(userId, password, expiresInHours = 48) {
    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);
    
    await pool.execute(
      'UPDATE users SET temporary_password_hash = ?, temporary_password_expires_at = ? WHERE id = ?',
      [passwordHash, expiresAt, userId]
    );
    
    return { password, expiresAt };
  }

  static async generatePasswordlessToken(userId, expiresInHours = 48) {
    const crypto = (await import('crypto')).default;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);
    
    await pool.execute(
      'UPDATE users SET passwordless_token = ?, passwordless_token_expires_at = ? WHERE id = ?',
      [token, expiresAt, userId]
    );
    
    return { token, expiresAt };
  }

  static async markTokenAsUsed(userId) {
    // Mark token as used by setting passwordless_token to NULL
    // This makes the token single-use
    await pool.execute(
      'UPDATE users SET passwordless_token = NULL, passwordless_token_expires_at = NULL WHERE id = ?',
      [userId]
    );
  }

  static async updateUsername(userId, newUsername) {
    // Update username field
    await pool.execute(
      'UPDATE users SET username = ? WHERE id = ?',
      [newUsername, userId]
    );
    // Also update email field for login compatibility
    await pool.execute(
      'UPDATE users SET email = ? WHERE id = ?',
      [newUsername, userId]
    );
    return this.findById(userId);
  }

  static async setWorkEmail(userId, workEmail) {
    await pool.execute(
      'UPDATE users SET work_email = ? WHERE id = ?',
      [workEmail, userId]
    );
    return this.findById(userId);
  }

  static async changePassword(userId, newPassword) {
    const bcrypt = (await import('bcrypt')).default;
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    await pool.execute(
      'UPDATE users SET password_hash = ?, temporary_password_hash = NULL, temporary_password_expires_at = NULL WHERE id = ?',
      [passwordHash, userId]
    );
    
    return this.findById(userId);
  }

  static async validatePasswordlessToken(token) {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      console.log('[validatePasswordlessToken] Invalid token format:', typeof token, token?.length);
      return null;
    }
    
    // Build query dynamically to handle missing columns
    let query = 'SELECT id, email, first_name, last_name, role, status, passwordless_token_expires_at, password_hash, passwordless_token';
    
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('pending_access_locked', 'pending_identity_verified', 'username', 'personal_email')",
        [dbName]
      );
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      if (existingColumns.includes('pending_access_locked')) query += ', pending_access_locked';
      if (existingColumns.includes('pending_identity_verified')) query += ', pending_identity_verified';
      if (existingColumns.includes('username')) query += ', username';
      if (existingColumns.includes('personal_email')) query += ', personal_email';
    } catch (err) {
      // If we can't check columns, just use the base query
    }
    
    query += ' FROM users WHERE passwordless_token = ?';
    const [rows] = await pool.execute(query, [token.trim()]);
    
    if (rows.length === 0) {
      console.log('[validatePasswordlessToken] Token not found in database (may have been used)');
      return null; // Token not found (either invalid or already used and set to NULL)
    }
    
    const user = rows[0];
    
    // Note: If token was used, passwordless_token would be NULL and the WHERE clause wouldn't match
    // So if we get here, the token exists and hasn't been used yet
    // But we can double-check by verifying passwordless_token matches
    if (!user.passwordless_token || user.passwordless_token !== token.trim()) {
      console.log('[validatePasswordlessToken] Token mismatch or already used');
      return null;
    }
    
    // Check if token expired (with a small buffer to account for clock skew)
    if (user.passwordless_token_expires_at) {
      const expiresAt = new Date(user.passwordless_token_expires_at);
      const now = new Date();
      // Add 1 minute buffer to account for clock skew between server and client
      const bufferMs = 60 * 1000; // 1 minute
      if (expiresAt.getTime() < (now.getTime() - bufferMs)) {
        console.log('[validatePasswordlessToken] Token expired. Expires:', expiresAt.toISOString(), 'Now:', now.toISOString());
        return null; // Token expired
      }
    }
    
    // Check if pending access is locked (only if column exists)
    if (user.status === 'pending' && user.pending_access_locked) {
      console.log('[validatePasswordlessToken] Pending access is locked');
      return null; // Access locked
    }
    
    console.log('[validatePasswordlessToken] Token validated successfully for user:', user.id);
    return user;
  }

  static async validatePendingIdentity(token, lastName) {
    const user = await this.validatePasswordlessToken(token);
    if (!user) {
      return null;
    }
    
    // Only validate identity for pending users
    if (user.status !== 'pending') {
      return user; // Not a pending user, return as-is
    }
    
    // Check if already verified
    if (user.pending_identity_verified) {
      return user;
    }
    
    // Verify last name (case-insensitive)
    if (!user.last_name || user.last_name.toLowerCase().trim() !== lastName.toLowerCase().trim()) {
      return null; // Last name doesn't match
    }
    
    // Mark as verified
    await pool.execute(
      'UPDATE users SET pending_identity_verified = TRUE WHERE id = ?',
      [user.id]
    );
    
    // Return updated user
    const updatedUser = await this.findById(user.id);
    return {
      ...updatedUser,
      pending_identity_verified: true
    };
  }

  static async lockPendingAccess(userId) {
    // Lock access and invalidate passwordless token
    await pool.execute(
      'UPDATE users SET pending_access_locked = TRUE, passwordless_token = NULL, passwordless_token_expires_at = NULL WHERE id = ?',
      [userId]
    );
    return this.findById(userId);
  }

  static async generateTemporaryPassword() {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const password = Array.from(crypto.randomBytes(length))
      .map(byte => charset[byte % charset.length])
      .join('');
    return password;
  }

  static async getAccountInfo(userId) {
    // This will be implemented with UserAccount model
    // For now, return user basic info
    const user = await this.findById(userId);
    return {
      email: user?.email,
      phoneNumber: user?.phone_number
    };
  }

  static async getOnboardingChecklist(userId) {
    // This will be implemented with OnboardingChecklist model
    // For now, return empty array
    return [];
  }

  static async updateStatus(userId, status, actorUserId = null) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    let updates = [];
    let values = [];

    if (status === 'completed') {
      updates.push('status = ?');
      updates.push('completed_at = ?');
      updates.push('status_expires_at = ?');
      values.push('completed', now, expiresAt);
    } else if (status === 'terminated') {
      updates.push('status = ?');
      updates.push('terminated_at = ?');
      updates.push('status_expires_at = ?');
      // Terminated users will be auto-marked as inactive after 7 days
      values.push('terminated', now, expiresAt);
    } else if (status === 'active') {
      updates.push('status = ?');
      updates.push('completed_at = NULL');
      updates.push('terminated_at = NULL');
      updates.push('status_expires_at = NULL');
      updates.push('is_active = TRUE');
      // Clear pending fields when moving to active
      updates.push('pending_completed_at = NULL');
      updates.push('pending_auto_complete_at = NULL');
      updates.push('pending_identity_verified = FALSE');
      updates.push('pending_access_locked = FALSE');
      updates.push('pending_completion_notified = FALSE');
      values.push('active');
    } else if (status === 'pending') {
      updates.push('status = ?');
      updates.push('completed_at = NULL');
      updates.push('terminated_at = NULL');
      updates.push('status_expires_at = NULL');
      updates.push('pending_completed_at = NULL');
      updates.push('pending_auto_complete_at = NULL');
      updates.push('pending_identity_verified = FALSE');
      updates.push('pending_access_locked = FALSE');
      updates.push('pending_completion_notified = FALSE');
      values.push('pending');
    } else if (status === 'ready_for_review') {
      updates.push('status = ?');
      updates.push('completed_at = NULL');
      updates.push('terminated_at = NULL');
      updates.push('status_expires_at = NULL');
      // Keep pending_completed_at if it was set
      values.push('ready_for_review');
    }

    values.push(userId);
    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(userId);
  }

  // Auto-process terminated users: mark inactive after 7 days, archive after 14 days
  static async processTerminatedUsers() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Mark terminated users as inactive if terminated_at is 7+ days ago and still active
    const [inactiveResult] = await pool.execute(
      `UPDATE users 
       SET is_active = FALSE 
       WHERE status = 'terminated' 
       AND terminated_at <= ? 
       AND (is_active IS NULL OR is_active = TRUE)
       AND (is_archived IS NULL OR is_archived = FALSE)`,
      [sevenDaysAgo]
    );

    // Archive terminated users if terminated_at is 14+ days ago and not already archived
    const [archiveResult] = await pool.execute(
      `UPDATE users 
       SET is_archived = TRUE, archived_at = NOW() 
       WHERE status = 'terminated' 
       AND terminated_at <= ? 
       AND (is_archived IS NULL OR is_archived = FALSE)`,
      [fourteenDaysAgo]
    );

    return {
      markedInactive: inactiveResult.affectedRows,
      archived: archiveResult.affectedRows
    };
  }

  // Auto-process completed users: mark inactive after 7 days and add to approved employee list
  static async processCompletedUsers() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Find completed users who completed 7+ days ago and are still active
    const [completedUsers] = await pool.execute(
      `SELECT u.id, u.email, u.first_name, u.last_name, ua.agency_id
       FROM users u
       INNER JOIN user_agencies ua ON u.id = ua.user_id
       WHERE u.status = 'completed'
       AND u.completed_at <= ?
       AND (u.is_active IS NULL OR u.is_active = TRUE)
       AND (u.is_archived IS NULL OR u.is_archived = FALSE)`,
      [sevenDaysAgo]
    );

    let markedInactive = 0;
    let addedToApproved = 0;

    const ApprovedEmployee = (await import('./ApprovedEmployee.model.js')).default;
    const Agency = (await import('./Agency.model.js')).default;
    const bcrypt = (await import('bcrypt')).default;

    for (const user of completedUsers) {
      // Mark user as inactive
      await pool.execute(
        'UPDATE users SET is_active = FALSE WHERE id = ?',
        [user.id]
      );
      markedInactive++;

      // Check if email already exists in approved_employee_emails for this agency
      const existing = await ApprovedEmployee.findByEmail(user.email, user.agency_id);
      
      if (!existing) {
        // Get agency to check for company default password
        const agency = await Agency.findById(user.agency_id);
        let passwordHash = null;

        if (agency && agency.company_default_password_hash) {
          passwordHash = agency.company_default_password_hash;
        } else {
          // Generate a temporary password hash if no company default
          const tempPassword = `temp_${user.id}_${Date.now()}`;
          passwordHash = await bcrypt.hash(tempPassword, 10);
        }

        // Add to approved_employee_emails
        await ApprovedEmployee.create({
          email: user.email,
          agencyId: user.agency_id,
          requiresVerification: false,
          passwordHash: passwordHash
        });
        addedToApproved++;
      }
    }

    return {
      markedInactive,
      addedToApproved
    };
  }

  static async isAccessExpired(userId) {
    try {
      const user = await this.findById(userId);
      if (!user || !user.status_expires_at) {
        return false;
      }
      return new Date(user.status_expires_at) < new Date();
    } catch (err) {
      console.error('Error checking access expiration:', err);
      return false; // Default to not expired if there's an error
    }
  }

  static async checkStatusExpiration(userId) {
    const user = await this.findById(userId);
    if (!user) {
      return { expired: false, status: null };
    }
    
    const expired = user.status_expires_at && new Date(user.status_expires_at) < new Date();
    return {
      expired,
      status: user.status,
      expiresAt: user.status_expires_at
    };
  }

  static async getStatusMessage(userId) {
    try {
      const user = await this.findById(userId);
      if (!user) {
        return null;
      }

      const userStatus = user.status || 'active';

      // Get user's primary agency for contact info
      let agencies = [];
      try {
        agencies = await this.getAgencies(userId);
      } catch (err) {
        console.error('Error getting agencies for status message:', err);
      }
      const primaryAgency = agencies[0] || null;
      const agencyName = primaryAgency?.name || 'your agency';
      const agencyTeamName = primaryAgency?.team_name || agencyName;
      const agencyContact = primaryAgency?.contact_info || 'your agency administrator';

      if (userStatus === 'terminated') {
        return `The account with this username has been terminated. If you think this is a mistake, please contact ${agencyName}.`;
      }

      if (userStatus === 'completed') {
        const expired = await this.isAccessExpired(userId);
        if (expired) {
          return `The account associated with this username has been marked as Onboarding Completed by the affiliated agency. Please contact ${agencyName} if you believe this is a mistake. All associated links and information can be accessed through the ${agencyTeamName}'s website. If you require additional information, please contact ${agencyContact}. A copy of your confirmation and signed documents is available on the ${agencyTeamName}'s website.`;
        }
      }

      return null;
    } catch (err) {
      console.error('Error getting status message:', err);
      return null;
    }
  }

  /**
   * Get all supervisees for a supervisor in an agency
   */
  static async getSupervisees(supervisorId, agencyId = null) {
    const SupervisorAssignment = (await import('./SupervisorAssignment.model.js')).default;
    return await SupervisorAssignment.findBySupervisor(supervisorId, agencyId);
  }

  /**
   * Get all supervisors for a supervisee in an agency
   */
  static async getSupervisors(superviseeId, agencyId = null) {
    const SupervisorAssignment = (await import('./SupervisorAssignment.model.js')).default;
    return await SupervisorAssignment.findBySupervisee(superviseeId, agencyId);
  }

  /**
   * Check if a user is a supervisor (using has_supervisor_privileges as source of truth)
   */
  static isSupervisor(user) {
    if (!user) return false;
    // Primary check: has_supervisor_privileges boolean (source of truth)
    if (user.has_supervisor_privileges === true || user.has_supervisor_privileges === 1 || user.has_supervisor_privileges === '1') {
      return true;
    }
    // Fallback: role check for backward compatibility
    if (user.role === 'supervisor') return true;
    return false;
  }

  /**
   * Check if a user can be assigned as a supervisor (has supervisor role OR has supervisor privileges)
   */
  static canBeAssignedAsSupervisor(user) {
    if (!user) return false;
    // Use isSupervisor() as primary check
    if (this.isSupervisor(user)) return true;
    // Also allow admins/superadmins/CPAs with supervisor privileges
    const hasPrivileges = user.has_supervisor_privileges === true || 
                          user.has_supervisor_privileges === 1 || 
                          user.has_supervisor_privileges === '1';
    if (hasPrivileges && 
        (user.role === 'admin' || user.role === 'super_admin' || user.role === 'clinical_practice_assistant')) {
      return true;
    }
    return false;
  }

  /**
   * Check if a supervisor has access to a user (for supervisors: check assignment, for CPAs: check agency)
   */
  static async supervisorHasAccess(supervisorId, targetUserId, agencyId) {
    const supervisor = await this.findById(supervisorId);
    if (!supervisor) {
      return false;
    }

    // CPAs have access to all users in their agency (primary role takes precedence)
    if (supervisor.role === 'clinical_practice_assistant') {
      const supervisorAgencies = await this.getAgencies(supervisorId);
      const targetUserAgencies = await this.getAgencies(targetUserId);
      const supervisorAgencyIds = supervisorAgencies.map(a => a.id);
      const targetAgencyIds = targetUserAgencies.map(a => a.id);
      return supervisorAgencyIds.some(id => targetAgencyIds.includes(id));
    }

    // Check if user is a supervisor (using boolean as source of truth)
    const isSupervisor = this.isSupervisor(supervisor);
    
    if (isSupervisor) {
      const SupervisorAssignment = (await import('./SupervisorAssignment.model.js')).default;
      // Check all agencies if agencyId not specified
      if (agencyId) {
        return await SupervisorAssignment.supervisorHasAccess(supervisorId, targetUserId, agencyId);
      } else {
        // Check all agencies the supervisor belongs to
        const supervisorAgencies = await this.getAgencies(supervisorId);
        for (const agency of supervisorAgencies) {
          const hasAccess = await SupervisorAssignment.supervisorHasAccess(supervisorId, targetUserId, agency.id);
          if (hasAccess) {
            return true;
          }
        }
        return false;
      }
    }

    return false;
  }
}

export default User;

