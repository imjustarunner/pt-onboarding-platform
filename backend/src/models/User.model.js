import pool from '../config/database.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

class User {
  static _statusEnumCache = null;

  static async _getUserStatusEnumValues() {
    if (Array.isArray(this._statusEnumCache) && this._statusEnumCache.length) return this._statusEnumCache;
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [rows] = await pool.execute(
        "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'status' LIMIT 1",
        [dbName]
      );
      const ct = rows?.[0]?.COLUMN_TYPE || rows?.[0]?.column_type || '';
      const m = String(ct).match(/^enum\((.*)\)$/i);
      if (!m?.[1]) return null;
      const vals = m[1]
        .split(/,(?=(?:[^']*'[^']*')*[^']*$)/)
        .map((s) => s.trim().replace(/^'+|'+$/g, '').replace(/^" +|"+$/g, ''))
        .filter(Boolean);
      this._statusEnumCache = vals;
      return vals;
    } catch {
      return null;
    }
  }

  static async _resolveUserStatus(inputStatus) {
    const requested = String(inputStatus || 'pending').trim();
    const allowed = await this._getUserStatusEnumValues();
    if (!allowed || allowed.length === 0) return requested || 'pending';

    // Exact match
    if (allowed.includes(requested)) return requested;

    // Case-insensitive match
    const reqUpper = requested.toUpperCase();
    const ci = allowed.find((v) => String(v).toUpperCase() === reqUpper);
    if (ci) return ci;

    // Legacy -> new lifecycle mapping
    const lower = requested.toLowerCase();
    if (lower === 'pending') {
      if (allowed.includes('PENDING_SETUP')) return 'PENDING_SETUP';
      if (allowed.includes('PREHIRE_OPEN')) return 'PREHIRE_OPEN';
    }
    if (lower === 'active' || lower === 'completed') {
      if (allowed.includes('ACTIVE_EMPLOYEE')) return 'ACTIVE_EMPLOYEE';
    }
    if (lower === 'archived') {
      if (allowed.includes('ARCHIVED')) return 'ARCHIVED';
    }

    // Fall back to column default-ish, otherwise first enum value.
    if (allowed.includes('PENDING_SETUP')) return 'PENDING_SETUP';
    if (allowed.includes('ACTIVE_EMPLOYEE')) return 'ACTIVE_EMPLOYEE';
    return allowed[0];
  }

  static normalizePhone(phone) {
    if (!phone) return null;
    const str = String(phone).trim();
    if (str.startsWith('+')) return '+' + str.slice(1).replace(/[^\d]/g, '');
    const digits = str.replace(/[^\d]/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return digits ? `+${digits}` : null;
  }

  static async findBySystemPhoneNumber(systemPhoneNumber) {
    const phone = this.normalizePhone(systemPhoneNumber);
    if (!phone) return null;
    // Only select minimal fields; callers can call findById for full user object
    const [rows] = await pool.execute(
      "SELECT id FROM users WHERE system_phone_number = ? LIMIT 1",
      [phone]
    );
    if (rows.length === 0) return null;
    return this.findById(rows[0].id);
  }
  static async findByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    // Check which columns exist to avoid errors if migrations haven't been run
    let query = 'SELECT id, email, phone_number, role, status, completed_at, terminated_at, status_expires_at, password_hash, first_name, last_name, invitation_token, invitation_token_expires_at, temporary_password_hash, temporary_password_expires_at, created_at';
    
    try {
      // Use explicit database name from environment variable instead of DATABASE() function
      // This is more reliable, especially with connection pooling and Unix sockets
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('work_email', 'personal_email', 'username', 'has_supervisor_privileges', 'has_provider_access', 'has_staff_access', 'personal_phone', 'work_phone', 'work_phone_extension', 'sso_password_override')",
        [dbName]
      );
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      if (existingColumns.includes('work_email')) query += ', work_email';
      if (existingColumns.includes('personal_email')) query += ', personal_email';
      // Only add username to SELECT if column exists (migration has been run)
      if (existingColumns.includes('username')) query += ', username';
      if (existingColumns.includes('has_supervisor_privileges')) query += ', has_supervisor_privileges';
      if (existingColumns.includes('has_provider_access')) query += ', has_provider_access';
      if (existingColumns.includes('has_staff_access')) query += ', has_staff_access';
      if (existingColumns.includes('personal_phone')) query += ', personal_phone';
      if (existingColumns.includes('work_phone')) query += ', work_phone';
      if (existingColumns.includes('work_phone_extension')) query += ', work_phone_extension';
      if (existingColumns.includes('sso_password_override')) query += ', sso_password_override';
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
      // Use LOWER(TRIM()) for case-insensitive matching; handles legacy data with different casing/whitespace
      query += ' FROM users WHERE LOWER(TRIM(email)) = ? OR LOWER(TRIM(work_email)) = ? OR LOWER(TRIM(username)) = ?';
      const [rows] = await pool.execute(query, [normalized, normalized, normalized]);
      if (rows[0]) return rows[0];
    } else {
      query += ' FROM users WHERE LOWER(TRIM(email)) = ? OR LOWER(TRIM(work_email)) = ?';
      const [rows] = await pool.execute(query, [normalized, normalized]);
      if (rows[0]) return rows[0];
    }

    // Fallback: allow additional login emails (aliases) when table exists.
    // This supports users linked to multiple agencies/brandings but sharing one account.
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [tables] = await pool.execute(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_login_emails' LIMIT 1",
        [dbName]
      );
      if (!tables || tables.length === 0) return null;

      const UserLoginEmail = (await import('./UserLoginEmail.model.js')).default;
      const userId = await UserLoginEmail.findUserIdByEmail(normalized);
      if (!userId) return null;

      // Re-run the same SELECT shape by user id (so callers still get password_hash, etc).
      const select = query.split(' FROM users ')[0];
      const [rows2] = await pool.execute(`${select} FROM users WHERE id = ? LIMIT 1`, [userId]);
      return rows2[0] || null;
    } catch {
      return null;
    }
  }

  static async findByUsername(username) {
    // Check which columns exist
    let query = 'SELECT id, email, phone_number, role, status, completed_at, terminated_at, status_expires_at, password_hash, first_name, last_name, invitation_token, invitation_token_expires_at, temporary_password_hash, temporary_password_expires_at, created_at';
    
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('work_email', 'personal_email', 'username', 'has_supervisor_privileges', 'has_provider_access', 'has_staff_access', 'personal_phone', 'work_phone', 'work_phone_extension', 'sso_password_override')",
        [dbName]
      );
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      if (existingColumns.includes('work_email')) query += ', work_email';
      if (existingColumns.includes('personal_email')) query += ', personal_email';
      if (existingColumns.includes('username')) query += ', username';
      if (existingColumns.includes('has_supervisor_privileges')) query += ', has_supervisor_privileges';
      if (existingColumns.includes('has_provider_access')) query += ', has_provider_access';
      if (existingColumns.includes('has_staff_access')) query += ', has_staff_access';
      if (existingColumns.includes('personal_phone')) query += ', personal_phone';
      if (existingColumns.includes('work_phone')) query += ', work_phone';
      if (existingColumns.includes('work_phone_extension')) query += ', work_phone_extension';
      if (existingColumns.includes('sso_password_override')) query += ', sso_password_override';
    } catch (err) {
      console.warn('Could not check for columns:', err.message);
    }
    
    // Use LOWER(TRIM()) for case-insensitive matching; handles legacy data with different casing/whitespace
    const normalized = String(username || '').trim().toLowerCase();
    query += ' FROM users WHERE LOWER(TRIM(username)) = ?';
    const [rows] = await pool.execute(query, [normalized]);
    if (rows[0]) return rows[0];
    // Fallback: user_login_emails when identifier looks like email (e.g. someone enters email in "username" field)
    if (normalized.includes('@')) {
      try {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [tables] = await pool.execute(
          "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_login_emails' LIMIT 1",
          [dbName]
        );
        if (tables?.length > 0) {
          const UserLoginEmail = (await import('./UserLoginEmail.model.js')).default;
          const userId = await UserLoginEmail.findUserIdByEmail(normalized);
          if (userId) {
            const select = query.split(' FROM users ')[0];
            const [rows2] = await pool.execute(`${select} FROM users WHERE id = ? LIMIT 1`, [userId]);
            return rows2[0] || null;
          }
        }
      } catch {
        // ignore
      }
    }
    return null;
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
      if (existingColumns.includes('has_provider_access')) query += ', has_provider_access';
      if (existingColumns.includes('has_staff_access')) query += ', has_staff_access';
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
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('pending_completed_at', 'pending_auto_complete_at', 'pending_identity_verified', 'pending_access_locked', 'pending_completion_notified', 'work_email', 'personal_email', 'preferred_name', 'username', 'has_supervisor_privileges', 'has_provider_access', 'has_staff_access', 'has_hiring_access', 'provider_accepting_new_clients', 'personal_phone', 'work_phone', 'work_phone_extension', 'system_phone_number', 'home_street_address', 'home_address_line2', 'home_city', 'home_state', 'home_postal_code', 'medcancel_enabled', 'medcancel_rate_schedule', 'company_card_enabled', 'profile_photo_path', 'password_changed_at', 'title', 'service_focus', 'skill_builder_eligible', 'has_skill_builder_coordinator_access', 'skill_builder_confirm_required_next_login', 'is_hourly_worker', 'sso_password_override')",
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
      if (existingColumns.includes('preferred_name')) query += ', preferred_name';
      if (existingColumns.includes('username')) query += ', username';
      if (existingColumns.includes('password_changed_at')) query += ', password_changed_at';
      if (existingColumns.includes('has_supervisor_privileges')) query += ', has_supervisor_privileges';
      if (existingColumns.includes('has_provider_access')) query += ', has_provider_access';
      if (existingColumns.includes('has_staff_access')) query += ', has_staff_access';
      if (existingColumns.includes('provider_accepting_new_clients')) query += ', provider_accepting_new_clients';
      if (existingColumns.includes('personal_phone')) query += ', personal_phone';
      if (existingColumns.includes('work_phone')) query += ', work_phone';
      if (existingColumns.includes('work_phone_extension')) query += ', work_phone_extension';
      if (existingColumns.includes('system_phone_number')) query += ', system_phone_number';
      if (existingColumns.includes('home_street_address')) query += ', home_street_address';
      if (existingColumns.includes('home_address_line2')) query += ', home_address_line2';
      if (existingColumns.includes('home_city')) query += ', home_city';
      if (existingColumns.includes('home_state')) query += ', home_state';
      if (existingColumns.includes('home_postal_code')) query += ', home_postal_code';
      if (existingColumns.includes('medcancel_enabled')) query += ', medcancel_enabled';
      if (existingColumns.includes('medcancel_rate_schedule')) query += ', medcancel_rate_schedule';
      if (existingColumns.includes('company_card_enabled')) query += ', company_card_enabled';
      if (existingColumns.includes('profile_photo_path')) query += ', profile_photo_path';
      if (existingColumns.includes('title')) query += ', title';
      if (existingColumns.includes('service_focus')) query += ', service_focus';
      if (existingColumns.includes('skill_builder_eligible')) query += ', skill_builder_eligible';
      if (existingColumns.includes('has_skill_builder_coordinator_access')) query += ', has_skill_builder_coordinator_access';
      if (existingColumns.includes('skill_builder_confirm_required_next_login')) query += ', skill_builder_confirm_required_next_login';
      if (existingColumns.includes('has_hiring_access')) query += ', has_hiring_access';
      if (existingColumns.includes('is_hourly_worker')) query += ', is_hourly_worker';
      if (existingColumns.includes('sso_password_override')) query += ', sso_password_override';
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
    // All new users should be pending by default (unless explicitly set otherwise).
    // IMPORTANT: DB enum values vary across deployments (legacy 'pending' vs new 'PENDING_SETUP' lifecycle).
    const userStatus = await this._resolveUserStatus(status || 'pending');
    
    // CRITICAL: Protect superadmin email - always force super_admin role
    let finalRole = role || 'provider';
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
    // Check if permission attribute columns exist
    let hasSupervisorPrivilegesField = '';
    let hasProviderAccessField = '';
    let hasStaffAccessField = '';
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('has_supervisor_privileges', 'has_provider_access', 'has_staff_access')"
      );
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      if (existingColumns.includes('has_supervisor_privileges')) {
        hasSupervisorPrivilegesField = ', u.has_supervisor_privileges';
      }
      if (existingColumns.includes('has_provider_access')) {
        hasProviderAccessField = ', u.has_provider_access';
      }
      if (existingColumns.includes('has_staff_access')) {
        hasStaffAccessField = ', u.has_staff_access';
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
    if (hasProviderAccessField) {
      groupByFields += ', u.has_provider_access';
    }
    if (hasStaffAccessField) {
      groupByFields += ', u.has_staff_access';
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

    // Immediately set status to ARCHIVED (no 7-day waiting period)
    if (hasAgencyColumn) {
      const [result] = await pool.execute(
        `UPDATE users 
         SET status = 'ARCHIVED', is_archived = TRUE, archived_at = NOW(), archived_by_user_id = ?, archived_by_agency_id = ? 
         WHERE id = ?`,
        [archivedByUserId, archivedByAgencyId, id]
      );
      return result.affectedRows > 0;
    } else {
      const [result] = await pool.execute(
        `UPDATE users 
         SET status = 'ARCHIVED', is_archived = TRUE, archived_at = NOW(), archived_by_user_id = ? 
         WHERE id = ?`,
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
    const {
      email,
      preferredName,
      personalEmail,
      title,
      serviceFocus,
      firstName,
      lastName,
      role,
      phoneNumber,
      isActive,
      hasSupervisorPrivileges,
      hasProviderAccess,
      hasStaffAccess,
      providerAcceptingNewClients,
      personalPhone,
      workPhone,
      workPhoneExtension,
      homeStreetAddress,
      homeAddressLine2,
      homeCity,
      homeState,
      homePostalCode,
      systemPhoneNumber,
      medcancelEnabled,
      medcancelRateSchedule,
      companyCardEnabled,
      skillBuilderEligible,
      hasSkillBuilderCoordinatorAccess,
      skillBuilderConfirmRequiredNextLogin,
      isHourlyWorker,
      hasHiringAccess,
      externalBusyIcsUrl
    } = userData;
    
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
      if (email !== undefined && String(email || '').toLowerCase() !== 'superadmin@plottwistco.com') {
        throw new Error('Cannot change login email of superadmin@plottwistco.com');
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

    // Protect school_staff: never allow changing to provider (distinct portal role)
    if (role !== undefined && currentUser.role === 'school_staff' && String(role || '').toLowerCase() === 'provider') {
      throw new Error('Cannot change school_staff role to provider – school_staff is a distinct portal role');
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
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(String(email || '').trim().toLowerCase());

      // Keep username aligned with email if username column exists AND it was previously tied to email.
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'"
        );
        if (columns.length > 0) {
          const currentUsername = currentUser.username === undefined ? null : currentUser.username;
          const currentEmail = currentUser.email || null;
          if (!currentUsername || (currentEmail && String(currentUsername).toLowerCase() === String(currentEmail).toLowerCase())) {
            updates.push('username = ?');
            values.push(String(email || '').trim().toLowerCase());
          }
        }
      } catch {
        // ignore (older DBs)
      }
    }

    // Preferred name (display-only)
    if (preferredName !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'preferred_name'"
        );
        if (columns.length > 0) {
          updates.push('preferred_name = ?');
          values.push(preferredName ? String(preferredName).trim() : null);
        }
      } catch {
        // ignore (older DBs)
      }
    }

    // Personal email (contact email; not used for login)
    if (personalEmail !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'personal_email'"
        );
        if (columns.length > 0) {
          updates.push('personal_email = ?');
          values.push(personalEmail ? String(personalEmail).trim().toLowerCase() : null);
        }
      } catch {
        // ignore (older DBs)
      }
    }

    // Title (account field)
    if (title !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'title'"
        );
        if (columns.length > 0) {
          updates.push('title = ?');
          values.push(title ? String(title).trim() : null);
        }
      } catch {
        // ignore (older DBs)
      }
    }

    // Service focus (account field)
    if (serviceFocus !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'service_focus'"
        );
        if (columns.length > 0) {
          updates.push('service_focus = ?');
          values.push(serviceFocus ? String(serviceFocus).trim() : null);
        }
      } catch {
        // ignore (older DBs)
      }
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

    // Home address (used for mileage calculations)
    if (homeStreetAddress !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'home_street_address'"
        );
        if (columns.length > 0) {
          updates.push('home_street_address = ?');
          values.push(homeStreetAddress);
        }
      } catch (err) {
        console.warn('home_street_address column does not exist yet');
      }
    }
    if (homeAddressLine2 !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'home_address_line2'"
        );
        if (columns.length > 0) {
          updates.push('home_address_line2 = ?');
          values.push(homeAddressLine2);
        }
      } catch (err) {
        console.warn('home_address_line2 column does not exist yet');
      }
    }
    if (homeCity !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'home_city'"
        );
        if (columns.length > 0) {
          updates.push('home_city = ?');
          values.push(homeCity);
        }
      } catch (err) {
        console.warn('home_city column does not exist yet');
      }
    }
    if (homeState !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'home_state'"
        );
        if (columns.length > 0) {
          updates.push('home_state = ?');
          values.push(homeState);
        }
      } catch (err) {
        console.warn('home_state column does not exist yet');
      }
    }
    if (homePostalCode !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'home_postal_code'"
        );
        if (columns.length > 0) {
          updates.push('home_postal_code = ?');
          values.push(homePostalCode);
        }
      } catch (err) {
        console.warn('home_postal_code column does not exist yet');
      }
    }

    if (systemPhoneNumber !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'system_phone_number'"
        );
        if (columns.length > 0) {
          updates.push('system_phone_number = ?');
          values.push(systemPhoneNumber);
        }
      } catch (err) {
        console.warn('system_phone_number column does not exist yet:', err.message);
      }
    }

    // Med Cancel (contract feature flag + schedule)
    if (medcancelEnabled !== undefined) {
      try {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'medcancel_enabled'",
          [dbName]
        );
        if (columns.length > 0) {
          updates.push('medcancel_enabled = ?');
          values.push(medcancelEnabled ? 1 : 0);
        } else {
          // If caller provided this field but DB doesn't have column, fail loudly so admins know to run migrations.
          throw new Error('Database is missing users.medcancel_enabled. Run migrations (see database/migrations/163_users_add_medcancel_flags.sql).');
        }
      } catch (err) {
        // If this field was provided, treat missing column as a real error (not silent no-op)
        throw err;
      }
    }
    if (medcancelRateSchedule !== undefined) {
      const val = medcancelRateSchedule === null ? null : String(medcancelRateSchedule || '').trim().toLowerCase();
      if (val !== null && val !== 'low' && val !== 'high' && val !== 'none') {
        throw new Error('medcancelRateSchedule must be low, high, none, or null');
      }
      try {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'medcancel_rate_schedule'",
          [dbName]
        );
        if (columns.length > 0) {
          updates.push('medcancel_rate_schedule = ?');
          values.push(val);
        } else {
          // If caller provided this field but DB doesn't have column, fail loudly so admins know to run migrations.
          throw new Error('Database is missing users.medcancel_rate_schedule. Run migrations (see database/migrations/163_users_add_medcancel_flags.sql and 165_users_medcancel_schedule_default_none.sql).');
        }
      } catch (err) {
        // If this field was provided, treat missing column as a real error (not silent no-op)
        throw err;
      }
    }

    // Company Card expense submissions (contract feature flag)
    if (companyCardEnabled !== undefined) {
      try {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'company_card_enabled'",
          [dbName]
        );
        if (columns.length > 0) {
          updates.push('company_card_enabled = ?');
          values.push(companyCardEnabled ? 1 : 0);
        } else {
          // If caller provided this field but DB doesn't have column, fail loudly so admins know to run migrations.
          throw new Error('Database is missing users.company_card_enabled. Run migrations (see database/migrations/173_users_add_company_card_enabled.sql).');
        }
      } catch (err) {
        throw err;
      }
    }

    // Skill Builder program eligibility
    if (skillBuilderEligible !== undefined) {
      try {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'skill_builder_eligible'",
          [dbName]
        );
        if (columns.length > 0) {
          updates.push('skill_builder_eligible = ?');
          values.push(skillBuilderEligible ? 1 : 0);
        } else {
          throw new Error('Database is missing users.skill_builder_eligible. Run migrations (see database/migrations/250_skill_builder_availability.sql).');
        }
      } catch (err) {
        throw err;
      }
    }

    // Skill Builder coordinator access (agency-scoped permission)
    if (hasSkillBuilderCoordinatorAccess !== undefined) {
      try {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_skill_builder_coordinator_access'",
          [dbName]
        );
        if (columns.length > 0) {
          updates.push('has_skill_builder_coordinator_access = ?');
          values.push(hasSkillBuilderCoordinatorAccess ? 1 : 0);
        } else {
          throw new Error('Database is missing users.has_skill_builder_coordinator_access. Run migrations (see database/migrations/335_users_skill_builder_coordinator_and_forced_confirm.sql).');
        }
      } catch (err) {
        throw err;
      }
    }

    // Force Skill Builder confirm prompt on next login
    if (skillBuilderConfirmRequiredNextLogin !== undefined) {
      try {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'skill_builder_confirm_required_next_login'",
          [dbName]
        );
        if (columns.length > 0) {
          updates.push('skill_builder_confirm_required_next_login = ?');
          values.push(skillBuilderConfirmRequiredNextLogin ? 1 : 0);
        } else {
          throw new Error('Database is missing users.skill_builder_confirm_required_next_login. Run migrations (see database/migrations/335_users_skill_builder_coordinator_and_forced_confirm.sql).');
        }
      } catch (err) {
        throw err;
      }
    }

    // Hourly worker (drives Direct/Indirect ratio card visibility)
    if (isHourlyWorker !== undefined) {
      try {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_hourly_worker'",
          [dbName]
        );
        if (columns.length > 0) {
          updates.push('is_hourly_worker = ?');
          values.push(isHourlyWorker ? 1 : 0);
        }
      } catch (err) {
        console.warn('is_hourly_worker column check failed:', err.message);
      }
    }

    // Hiring process access (applicants / prospective access)
    if (hasHiringAccess !== undefined) {
      try {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_hiring_access'",
          [dbName]
        );
        if (columns.length > 0) {
          updates.push('has_hiring_access = ?');
          values.push(hasHiringAccess ? 1 : 0);
        }
      } catch (err) {
        console.warn('has_hiring_access column check failed:', err.message);
      }
    }

    // External busy calendar ICS URL (for schedule overlays / auditing)
    if (externalBusyIcsUrl !== undefined) {
      const url = externalBusyIcsUrl === null ? null : String(externalBusyIcsUrl || '').trim();
      if (url && url.length > 1024) {
        throw new Error('externalBusyIcsUrl is too long (max 1024 chars)');
      }
      try {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'external_busy_ics_url'",
          [dbName]
        );
        if (columns.length > 0) {
          updates.push('external_busy_ics_url = ?');
          values.push(url || null);
        } else {
          throw new Error('Database is missing users.external_busy_ics_url. Run migrations (see database/migrations/251_user_external_busy_ics.sql).');
        }
      } catch (err) {
        throw err;
      }
    }
    
    // Handle permission attributes for cross-role capabilities
    if (hasProviderAccess !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_provider_access'"
        );
        if (columns.length > 0) {
          updates.push('has_provider_access = ?');
          values.push(hasProviderAccess ? 1 : 0);
        }
      } catch (err) {
        console.warn('has_provider_access column does not exist yet:', err.message);
      }
    }
    
    if (hasStaffAccess !== undefined) {
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_staff_access'"
        );
        if (columns.length > 0) {
          updates.push('has_staff_access = ?');
          values.push(hasStaffAccess ? 1 : 0);
        }
      } catch (err) {
        console.warn('has_staff_access column does not exist yet:', err.message);
      }
    }

    // Provider availability flag (Open/Closed for new clients)
    if (providerAcceptingNewClients !== undefined) {
      try {
        const dbName = process.env.DB_NAME || 'onboarding_stage';
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'provider_accepting_new_clients'",
          [dbName]
        );
        if (columns.length > 0) {
          updates.push('provider_accepting_new_clients = ?');
          values.push(providerAcceptingNewClients ? 1 : 0);
        } else {
          // If caller provided this field but DB doesn't have column, fail loudly so admins know to run migrations.
          throw new Error('Database is missing users.provider_accepting_new_clients. Run migrations (see database/migrations/196_users_add_provider_accepting_new_clients.sql).');
        }
      } catch (err) {
        throw err;
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

    // If supervisor privileges were turned off, remove supervisee assignments.
    // This keeps the source-of-truth boolean and join table consistent.
    try {
      const prevHasSupervisor =
        currentUser?.has_supervisor_privileges === true ||
        currentUser?.has_supervisor_privileges === 1 ||
        currentUser?.has_supervisor_privileges === '1';
      const nextHasSupervisor =
        updatedUser?.has_supervisor_privileges === true ||
        updatedUser?.has_supervisor_privileges === 1 ||
        updatedUser?.has_supervisor_privileges === '1';

      if (prevHasSupervisor && !nextHasSupervisor) {
        const SupervisorAssignment = (await import('./SupervisorAssignment.model.js')).default;
        await SupervisorAssignment.deleteAllForSupervisor(id);
      }
    } catch (e) {
      // Best-effort: older DBs may not have the table yet.
      if (e?.code !== 'ER_NO_SUCH_TABLE') {
        console.error('User.update: Failed to remove supervisor assignments after disabling supervisor privileges:', e);
      }
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
    // Best-effort: include icon paths when columns exist (keeps older DBs working).
    let hasIconId = false;
    let hasChatIconId = false;
    let hasMyDashboardIcons = false;
    let hasPayrollAccess = false;
    let hasH0032ManualMinutes = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME IN ('icon_id','chat_icon_id','my_dashboard_checklist_icon_id')"
      );
      const names = (cols || []).map((c) => c.COLUMN_NAME);
      hasIconId = names.includes('icon_id');
      hasChatIconId = names.includes('chat_icon_id');
      hasMyDashboardIcons = names.includes('my_dashboard_checklist_icon_id');
    } catch {
      hasIconId = false;
      hasChatIconId = false;
      hasMyDashboardIcons = false;
    }

    // Best-effort: include membership fields from user_agencies.
    try {
      const [uaCols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_agencies' AND COLUMN_NAME IN ('has_payroll_access','h0032_requires_manual_minutes','supervision_is_prelicensed','supervision_is_compensable','supervision_start_date','supervision_start_individual_hours','supervision_start_group_hours')"
      );
      const names = (uaCols || []).map((c) => c.COLUMN_NAME);
      hasPayrollAccess = names.includes('has_payroll_access');
      hasH0032ManualMinutes = names.includes('h0032_requires_manual_minutes');
      // Prelicensed supervision settings
      var hasSupervisionPrelicensed = names.includes('supervision_is_prelicensed'); // eslint-disable-line no-var
      var hasSupervisionCompensable = names.includes('supervision_is_compensable'); // eslint-disable-line no-var
      var hasSupervisionStartDate = names.includes('supervision_start_date'); // eslint-disable-line no-var
      var hasSupervisionStartInd = names.includes('supervision_start_individual_hours'); // eslint-disable-line no-var
      var hasSupervisionStartGrp = names.includes('supervision_start_group_hours'); // eslint-disable-line no-var
    } catch {
      hasPayrollAccess = false;
      hasH0032ManualMinutes = false;
      // Prelicensed supervision settings
      var hasSupervisionPrelicensed = false; // eslint-disable-line no-var
      var hasSupervisionCompensable = false; // eslint-disable-line no-var
      var hasSupervisionStartDate = false; // eslint-disable-line no-var
      var hasSupervisionStartInd = false; // eslint-disable-line no-var
      var hasSupervisionStartGrp = false; // eslint-disable-line no-var
    }

    const selectExtra = [
      hasIconId ? 'master_i.file_path as icon_file_path, master_i.name as icon_name' : null,
      hasChatIconId ? 'chat_i.file_path as chat_icon_path, chat_i.name as chat_icon_name' : null,
      // "My Dashboard" icon paths (needed for non-admin dashboards; they cannot call /icons).
      hasMyDashboardIcons ? 'mdc_i.file_path as my_dashboard_checklist_icon_path, mdc_i.name as my_dashboard_checklist_icon_name' : null,
      hasMyDashboardIcons ? 'mdt_i.file_path as my_dashboard_training_icon_path, mdt_i.name as my_dashboard_training_icon_name' : null,
      hasMyDashboardIcons ? 'mdd_i.file_path as my_dashboard_documents_icon_path, mdd_i.name as my_dashboard_documents_icon_name' : null,
      hasMyDashboardIcons ? 'mdm_i.file_path as my_dashboard_my_account_icon_path, mdm_i.name as my_dashboard_my_account_icon_name' : null,
      hasMyDashboardIcons ? 'mdsch_i.file_path as my_dashboard_my_schedule_icon_path, mdsch_i.name as my_dashboard_my_schedule_icon_name' : null,
      hasMyDashboardIcons ? 'mdod_i.file_path as my_dashboard_on_demand_training_icon_path, mdod_i.name as my_dashboard_on_demand_training_icon_name' : null,
      hasMyDashboardIcons ? 'mdp_i.file_path as my_dashboard_payroll_icon_path, mdp_i.name as my_dashboard_payroll_icon_name' : null,
      hasMyDashboardIcons ? 'mds_i.file_path as my_dashboard_submit_icon_path, mds_i.name as my_dashboard_submit_icon_name' : null,
      hasPayrollAccess ? 'ua.has_payroll_access' : null,
      hasH0032ManualMinutes ? 'ua.h0032_requires_manual_minutes' : null,
      hasSupervisionPrelicensed ? 'ua.supervision_is_prelicensed' : null,
      hasSupervisionCompensable ? 'ua.supervision_is_compensable' : null,
      hasSupervisionStartDate ? 'ua.supervision_start_date' : null,
      hasSupervisionStartInd ? 'ua.supervision_start_individual_hours' : null,
      hasSupervisionStartGrp ? 'ua.supervision_start_group_hours' : null
    ].filter(Boolean).join(', ');

    const joins = [
      hasIconId ? 'LEFT JOIN icons master_i ON a.icon_id = master_i.id' : null,
      hasChatIconId ? 'LEFT JOIN icons chat_i ON a.chat_icon_id = chat_i.id' : null,
      hasMyDashboardIcons ? 'LEFT JOIN icons mdc_i ON a.my_dashboard_checklist_icon_id = mdc_i.id' : null,
      hasMyDashboardIcons ? 'LEFT JOIN icons mdt_i ON a.my_dashboard_training_icon_id = mdt_i.id' : null,
      hasMyDashboardIcons ? 'LEFT JOIN icons mdd_i ON a.my_dashboard_documents_icon_id = mdd_i.id' : null,
      hasMyDashboardIcons ? 'LEFT JOIN icons mdm_i ON a.my_dashboard_my_account_icon_id = mdm_i.id' : null,
      hasMyDashboardIcons ? 'LEFT JOIN icons mdsch_i ON a.my_dashboard_my_schedule_icon_id = mdsch_i.id' : null,
      hasMyDashboardIcons ? 'LEFT JOIN icons mdod_i ON a.my_dashboard_on_demand_training_icon_id = mdod_i.id' : null,
      hasMyDashboardIcons ? 'LEFT JOIN icons mdp_i ON a.my_dashboard_payroll_icon_id = mdp_i.id' : null,
      hasMyDashboardIcons ? 'LEFT JOIN icons mds_i ON a.my_dashboard_submit_icon_id = mds_i.id' : null
    ].filter(Boolean).join('\n       ');

    const query = `SELECT a.*${selectExtra ? ', ' + selectExtra : ''}
       FROM agencies a
       JOIN user_agencies ua ON a.id = ua.agency_id
       ${joins ? joins : ''}
       WHERE ua.user_id = ?`;

    const [rows] = await pool.execute(query, [userId]);

    // Backoffice admin/support/staff should implicitly inherit access to all organizations
    // affiliated under their agency-type organizations.
    try {
      const [uRows] = await pool.execute('SELECT role FROM users WHERE id = ? LIMIT 1', [userId]);
      const role = String(uRows?.[0]?.role || '').toLowerCase();
      const canInherit = role === 'admin' || role === 'support' || role === 'staff';
      if (!canInherit) return rows;

      const parentAgencyIds = Array.from(
        new Set(
          (rows || [])
            .filter((o) => String(o?.organization_type || 'agency').toLowerCase() === 'agency')
            .map((o) => parseInt(o?.id, 10))
            .filter((n) => Number.isFinite(n) && n > 0)
        )
      );
      if (!parentAgencyIds.length) return rows;

      // Check table existence (backward compatible with older DBs)
      const [tblRows] = await pool.execute(
        `SELECT TABLE_NAME
         FROM information_schema.tables
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME IN ('organization_affiliations','agency_schools')`
      );
      const tbls = new Set((tblRows || []).map((t) => t.TABLE_NAME));
      const hasOrgAffiliations = tbls.has('organization_affiliations');
      const hasAgencySchools = tbls.has('agency_schools');
      if (!hasOrgAffiliations && !hasAgencySchools) return rows;

      const placeholders = parentAgencyIds.map(() => '?').join(',');
      const inherited = [];

      if (hasOrgAffiliations) {
        const [affRows] = await pool.execute(
          `SELECT a.*
           FROM organization_affiliations oa
           INNER JOIN agencies a ON a.id = oa.organization_id
           WHERE oa.is_active = TRUE
             AND oa.agency_id IN (${placeholders})`,
          parentAgencyIds
        );
        if (Array.isArray(affRows) && affRows.length) inherited.push(...affRows);
      }

      if (hasAgencySchools) {
        const [schoolRows] = await pool.execute(
          `SELECT a.*
           FROM agency_schools axs
           INNER JOIN agencies a ON a.id = axs.school_organization_id
           WHERE axs.is_active = TRUE
             AND axs.agency_id IN (${placeholders})`,
          parentAgencyIds
        );
        if (Array.isArray(schoolRows) && schoolRows.length) inherited.push(...schoolRows);
      }

      if (!inherited.length) return rows;

      const byId = new Map();
      for (const r of rows || []) {
        const id = parseInt(r?.id, 10);
        if (!id) continue;
        byId.set(id, r);
      }
      for (const r of inherited) {
        const id = parseInt(r?.id, 10);
        if (!id) continue;
        if (!byId.has(id)) byId.set(id, r);
      }
      return Array.from(byId.values());
    } catch {
      return rows;
    }
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

  static async getAgencyMembership(userId, agencyId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
      [userId, agencyId]
    );
    return rows?.[0] || null;
  }

  static async setAgencyPayrollAccess(userId, agencyId, enabled) {
    // Requires migrations to add user_agencies.has_payroll_access.
    await pool.execute(
      'UPDATE user_agencies SET has_payroll_access = ? WHERE user_id = ? AND agency_id = ?',
      [enabled ? 1 : 0, userId, agencyId]
    );
    const membership = await this.getAgencyMembership(userId, agencyId);
    return membership;
  }

  /** Set has_payroll_access for all agencies this user belongs to (global toggle from profile). */
  static async setPayrollAccessForAllAgencies(userId, enabled) {
    const val = enabled ? 1 : 0;
    const [result] = await pool.execute(
      'UPDATE user_agencies SET has_payroll_access = ? WHERE user_id = ?',
      [val, userId]
    );
    return result.affectedRows;
  }

  static async setAgencyH0032RequiresManualMinutes(userId, agencyId, enabled) {
    // Requires migrations to add user_agencies.h0032_requires_manual_minutes.
    await pool.execute(
      'UPDATE user_agencies SET h0032_requires_manual_minutes = ? WHERE user_id = ? AND agency_id = ?',
      [enabled ? 1 : 0, userId, agencyId]
    );
    const membership = await this.getAgencyMembership(userId, agencyId);
    return membership;
  }

  static async setAgencySupervisionPrelicensedSettings(userId, agencyId, {
    isPrelicensed,
    isCompensable,
    startDate,
    startIndividualHours,
    startGroupHours
  }) {
    const pre = isPrelicensed ? 1 : 0;
    const comp = isCompensable ? 1 : 0;
    const sd = startDate ? String(startDate).slice(0, 10) : null;
    const ind = Number(startIndividualHours || 0);
    const grp = Number(startGroupHours || 0);
    await pool.execute(
      `UPDATE user_agencies
       SET supervision_is_prelicensed = ?,
           supervision_is_compensable = ?,
           supervision_start_date = ?,
           supervision_start_individual_hours = ?,
           supervision_start_group_hours = ?
       WHERE user_id = ? AND agency_id = ?`,
      [pre, comp, sd, ind, grp, userId, agencyId]
    );
    return this.getAgencyMembership(userId, agencyId);
  }

  static async getAgencySupervisionCompensableMap(agencyId, userIds = []) {
    const ids = Array.from(new Set((userIds || []).map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0)));
    if (!ids.length) return {};
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_agencies' AND COLUMN_NAME = 'supervision_is_compensable'"
      );
      if (!cols?.length) return {};
    } catch {
      return {};
    }

    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT user_id, supervision_is_compensable
       FROM user_agencies
       WHERE agency_id = ?
         AND user_id IN (${placeholders})`,
      [agencyId, ...ids]
    );
    const out = {};
    for (const row of rows || []) {
      out[Number(row.user_id)] = row.supervision_is_compensable === 1 || row.supervision_is_compensable === true || String(row.supervision_is_compensable || '') === '1';
    }
    return out;
  }

  static async listPayrollAgencyIds(userId) {
    // Best-effort for older DBs (column may not exist yet).
    try {
      const [rows] = await pool.execute(
        'SELECT agency_id FROM user_agencies WHERE user_id = ? AND has_payroll_access = 1',
        [userId]
      );
      return (rows || []).map((r) => r.agency_id);
    } catch {
      return [];
    }
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
    
    // Temporary passwords are intended to *replace* the current password, so the user must
    // log in with the temporary password and then set a permanent one.
    // We store the hash in both password_hash (for login) and temporary_password_hash (to detect
    // "must change password" state until cleared by changePassword()).
    await pool.execute(
      'UPDATE users SET password_hash = ?, temporary_password_hash = ?, temporary_password_expires_at = ? WHERE id = ?',
      [passwordHash, passwordHash, expiresAt, userId]
    );
    
    return { password, expiresAt };
  }

  static async generatePasswordlessToken(userId, expiresInHours = 48, purpose = 'setup') {
    const crypto = (await import('crypto')).default;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);
    
    // Try to store purpose if the column exists (backward compatible)
    try {
      await pool.execute(
        'UPDATE users SET passwordless_token = ?, passwordless_token_expires_at = ?, passwordless_token_purpose = ? WHERE id = ?',
        [token, expiresAt, purpose || 'setup', userId]
      );
    } catch (e) {
      // Fallback for older DBs without passwordless_token_purpose
      await pool.execute(
        'UPDATE users SET passwordless_token = ?, passwordless_token_expires_at = ? WHERE id = ?',
        [token, expiresAt, userId]
      );
    }
    
    return { token, expiresAt };
  }

  static async markTokenAsUsed(userId) {
    // Mark token as used by setting passwordless_token to NULL
    // This makes the token single-use
    try {
      await pool.execute(
        'UPDATE users SET passwordless_token = NULL, passwordless_token_expires_at = NULL, passwordless_token_purpose = NULL WHERE id = ?',
        [userId]
      );
    } catch (e) {
      await pool.execute(
        'UPDATE users SET passwordless_token = NULL, passwordless_token_expires_at = NULL WHERE id = ?',
        [userId]
      );
    }
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

    // Best-effort: set password_changed_at when column exists (used for 6-month password expiry).
    let hasPasswordChangedAt = false;
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_changed_at' LIMIT 1",
        [dbName]
      );
      hasPasswordChangedAt = (cols || []).length > 0;
    } catch {
      hasPasswordChangedAt = false;
    }

    if (hasPasswordChangedAt) {
      await pool.execute(
        'UPDATE users SET password_hash = ?, password_changed_at = NOW(), temporary_password_hash = NULL, temporary_password_expires_at = NULL WHERE id = ?',
        [passwordHash, userId]
      );
    } else {
      await pool.execute(
        'UPDATE users SET password_hash = ?, temporary_password_hash = NULL, temporary_password_expires_at = NULL WHERE id = ?',
        [passwordHash, userId]
      );
    }
    
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
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME IN ('pending_access_locked', 'pending_identity_verified', 'username', 'personal_email', 'preferred_name', 'passwordless_token_purpose')",
        [dbName]
      );
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      if (existingColumns.includes('pending_access_locked')) query += ', pending_access_locked';
      if (existingColumns.includes('pending_identity_verified')) query += ', pending_identity_verified';
      if (existingColumns.includes('username')) query += ', username';
      if (existingColumns.includes('personal_email')) query += ', personal_email';
      if (existingColumns.includes('preferred_name')) query += ', preferred_name';
      if (existingColumns.includes('passwordless_token_purpose')) query += ', passwordless_token_purpose';
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

    // Handle new status lifecycle values
    if (status === 'ACTIVE_EMPLOYEE') {
      updates.push('status = ?');
      updates.push('completed_at = ?');
      updates.push('status_expires_at = NULL');
      updates.push('terminated_at = NULL');
      updates.push('termination_date = NULL');
      // Clear pending fields when moving to active employee
      updates.push('pending_completed_at = NULL');
      updates.push('pending_auto_complete_at = NULL');
      updates.push('pending_identity_verified = FALSE');
      updates.push('pending_access_locked = FALSE');
      updates.push('pending_completion_notified = FALSE');
      values.push('ACTIVE_EMPLOYEE', now);
    } else if (status === 'TERMINATED_PENDING') {
      updates.push('status = ?');
      updates.push('terminated_at = ?');
      updates.push('termination_date = ?');
      updates.push('status_expires_at = ?');
      values.push('TERMINATED_PENDING', now, now, expiresAt);
    } else if (status === 'ARCHIVED') {
      updates.push('status = ?');
      updates.push('is_archived = TRUE');
      updates.push('archived_at = NOW()');
      values.push('ARCHIVED');
    } else if (status === 'PENDING_SETUP') {
      updates.push('status = ?');
      updates.push('completed_at = NULL');
      updates.push('terminated_at = NULL');
      updates.push('termination_date = NULL');
      updates.push('status_expires_at = NULL');
      updates.push('pending_completed_at = NULL');
      updates.push('pending_auto_complete_at = NULL');
      updates.push('pending_identity_verified = FALSE');
      updates.push('pending_access_locked = FALSE');
      updates.push('pending_completion_notified = FALSE');
      values.push('PENDING_SETUP');
    } else if (status === 'PREHIRE_OPEN') {
      updates.push('status = ?');
      updates.push('completed_at = NULL');
      updates.push('terminated_at = NULL');
      updates.push('termination_date = NULL');
      updates.push('status_expires_at = NULL');
      // Keep pending fields for tracking
      values.push('PREHIRE_OPEN');
    } else if (status === 'PREHIRE_REVIEW') {
      updates.push('status = ?');
      updates.push('pending_completed_at = ?');
      // Keep other pending fields
      values.push('PREHIRE_REVIEW', now);
    } else if (status === 'ONBOARDING') {
      updates.push('status = ?');
      updates.push('completed_at = NULL');
      updates.push('terminated_at = NULL');
      updates.push('termination_date = NULL');
      updates.push('status_expires_at = NULL');
      // Clear pending fields when moving to onboarding
      updates.push('pending_completed_at = NULL');
      updates.push('pending_auto_complete_at = NULL');
      updates.push('pending_identity_verified = FALSE');
      updates.push('pending_access_locked = FALSE');
      updates.push('pending_completion_notified = FALSE');
      values.push('ONBOARDING');
    } else {
      // Fallback for any other status value
      updates.push('status = ?');
      values.push(status);
    }

    values.push(userId);
    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(userId);
  }

  // Auto-process terminated users: archive TERMINATED_PENDING users after 7 days
  static async processTerminatedUsers() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Archive TERMINATED_PENDING users if termination_date is 7+ days ago
    const [archiveResult] = await pool.execute(
      `UPDATE users 
       SET status = 'ARCHIVED', is_archived = TRUE, archived_at = NOW() 
       WHERE status = 'TERMINATED_PENDING' 
       AND termination_date <= ? 
       AND (is_archived IS NULL OR is_archived = FALSE)`,
      [sevenDaysAgo]
    );

    return {
      archived: archiveResult.affectedRows
    };
  }

  // Auto-process completed users: This method is now deprecated with new status lifecycle
  // Users are set to ACTIVE_EMPLOYEE when onboarding is complete, no processing needed
  static async processCompletedUsers() {
    // With new status lifecycle, users are set to ACTIVE_EMPLOYEE directly
    // No need to process "completed" status users anymore
    // Keeping method for backward compatibility but it does nothing
    return {
      markedInactive: 0,
      addedToApproved: 0
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

