import pool from '../config/database.js';

class Agency {
  static async findAll(includeInactive = false, includeArchived = false) {
    // Check if is_archived column exists
    let hasArchiveColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'is_archived'"
      );
      hasArchiveColumn = columns.length > 0;
    } catch (e) {
      hasArchiveColumn = false;
    }
    
    // Check if icon_id column exists
    let hasIconId = false;
    try {
      const [iconColumns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconId = iconColumns.length > 0;
    } catch (e) {
      hasIconId = false;
    }
    
    let query;
    if (hasIconId) {
      // Join with icons table to get master icon file path
      query = `SELECT a.*,
        master_i.file_path as icon_file_path, master_i.name as icon_name
        FROM agencies a
        LEFT JOIN icons master_i ON a.icon_id = master_i.id`;
    } else {
      query = 'SELECT * FROM agencies';
    }
    
    const params = [];
    const conditions = [];
    
    if (!includeInactive) {
      conditions.push('a.is_active = TRUE');
    }
    
    if (hasArchiveColumn && !includeArchived) {
      conditions.push('(a.is_archived = FALSE OR a.is_archived IS NULL)');
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY a.name ASC';
    
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findById(id) {
    // Check if dashboard action icon columns exist
    let hasDashboardIcons = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'manage_agencies_icon_id'"
      );
      hasDashboardIcons = columns.length > 0;
    } catch (e) {
      hasDashboardIcons = false;
    }

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

    // Check if icon_id column exists
    let hasIconId = false;
    try {
      const [iconColumns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconId = iconColumns.length > 0;
    } catch (e) {
      hasIconId = false;
    }

    let query;
    if (hasDashboardIcons) {
      // Join with icons table to get icon file paths (including master icon)
      query = `SELECT a.*,
        master_i.file_path as icon_file_path, master_i.name as icon_name,
        ma_i.file_path as manage_agencies_icon_path, ma_i.name as manage_agencies_icon_name,
        mm_i.file_path as manage_modules_icon_path, mm_i.name as manage_modules_icon_name,
        md_i.file_path as manage_documents_icon_path, md_i.name as manage_documents_icon_name,
        mu_i.file_path as manage_users_icon_path, mu_i.name as manage_users_icon_name,
        ps_i.file_path as platform_settings_icon_path, ps_i.name as platform_settings_icon_name,
        vap_i.file_path as view_all_progress_icon_path, vap_i.name as view_all_progress_icon_name,
        pd_i.file_path as progress_dashboard_icon_path, pd_i.name as progress_dashboard_icon_name,
        s_i.file_path as settings_icon_path, s_i.name as settings_icon_name
        FROM agencies a
        ${hasIconId ? 'LEFT JOIN icons master_i ON a.icon_id = master_i.id' : ''}
        LEFT JOIN icons ma_i ON a.manage_agencies_icon_id = ma_i.id
        LEFT JOIN icons mm_i ON a.manage_modules_icon_id = mm_i.id
        LEFT JOIN icons md_i ON a.manage_documents_icon_id = md_i.id
        LEFT JOIN icons mu_i ON a.manage_users_icon_id = mu_i.id
        LEFT JOIN icons ps_i ON a.platform_settings_icon_id = ps_i.id
        LEFT JOIN icons vap_i ON a.view_all_progress_icon_id = vap_i.id
        LEFT JOIN icons pd_i ON a.progress_dashboard_icon_id = pd_i.id
        LEFT JOIN icons s_i ON a.settings_icon_id = s_i.id
        WHERE a.id = ?`;
    } else {
      // Even without dashboard icons, join for master icon if column exists
      if (hasIconId) {
        query = `SELECT a.*,
          master_i.file_path as icon_file_path, master_i.name as icon_name
          FROM agencies a
          LEFT JOIN icons master_i ON a.icon_id = master_i.id
          WHERE a.id = ?`;
      } else {
        query = 'SELECT * FROM agencies WHERE id = ?';
      }
    }
    
    const [rows] = await pool.execute(query, [id]);
    const agency = rows[0] || null;
    
    // Set company_default_password_hash to null if column doesn't exist
    if (agency && !hasCompanyDefaultPassword) {
      agency.company_default_password_hash = null;
    }
    
    return agency;
  }

  static async findBySlug(slug) {
    const [rows] = await pool.execute(
      'SELECT * FROM agencies WHERE slug = ?',
      [slug]
    );
    return rows[0] || null;
  }

  static async findByPortalUrl(portalUrl) {
    if (!portalUrl) return null;
    
    // Check if portal_url column exists
    let hasPortalUrl = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'portal_url'"
      );
      hasPortalUrl = columns.length > 0;
    } catch (e) {
      hasPortalUrl = false;
    }
    
    if (!hasPortalUrl) {
      return null;
    }
    
    // Check if icon_id column exists for joining
    let hasIconId = false;
    try {
      const [iconColumns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconId = iconColumns.length > 0;
    } catch (e) {
      hasIconId = false;
    }
    
    let query;
    if (hasIconId) {
      query = `SELECT a.*,
        master_i.file_path as icon_file_path, master_i.name as icon_name
        FROM agencies a
        LEFT JOIN icons master_i ON a.icon_id = master_i.id
        WHERE a.portal_url = ? AND a.is_active = TRUE`;
    } else {
      query = 'SELECT * FROM agencies WHERE portal_url = ? AND is_active = TRUE';
    }
    
    const [rows] = await pool.execute(query, [portalUrl.toLowerCase()]);
    return rows[0] || null;
  }

  static async create(agencyData) {
    const { name, slug, logoUrl, colorPalette, terminologySettings, isActive, iconId, trainingFocusDefaultIconId, moduleDefaultIconId, userDefaultIconId, documentDefaultIconId, companyDefaultPasswordHash, useDefaultPassword, onboardingTeamEmail, phoneNumber, phoneExtension, portalUrl, themeSettings, customParameters } = agencyData;
    
    // Check if icon_id column exists
    let hasIconId = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconId = columns.length > 0;
    } catch (e) {
      // If check fails, assume column doesn't exist
      hasIconId = false;
    }
    
    // Check if portal config columns exist
    let hasPortalConfig = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'portal_url'"
      );
      hasPortalConfig = columns.length > 0;
    } catch (e) {
      hasPortalConfig = false;
    }
    
    if (hasIconId && hasPortalConfig) {
      const [result] = await pool.execute(
        'INSERT INTO agencies (name, slug, logo_url, color_palette, terminology_settings, is_active, icon_id, onboarding_team_email, phone_number, phone_extension, portal_url, theme_settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, slug, logoUrl || null, colorPalette ? JSON.stringify(colorPalette) : null, terminologySettings ? JSON.stringify(terminologySettings) : null, isActive !== undefined ? isActive : true, iconId || null, onboardingTeamEmail || null, phoneNumber || null, phoneExtension || null, portalUrl ? portalUrl.toLowerCase() : null, themeSettings ? JSON.stringify(themeSettings) : null]
      );
      return this.findById(result.insertId);
    } else if (hasIconId) {
      const [result] = await pool.execute(
        'INSERT INTO agencies (name, slug, logo_url, color_palette, terminology_settings, is_active, icon_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, slug, logoUrl || null, colorPalette ? JSON.stringify(colorPalette) : null, terminologySettings ? JSON.stringify(terminologySettings) : null, isActive !== undefined ? isActive : true, iconId || null]
      );
      return this.findById(result.insertId);
    } else if (hasPortalConfig) {
      // Column doesn't exist, create without icon_id but with portal config
      const [result] = await pool.execute(
        'INSERT INTO agencies (name, slug, logo_url, color_palette, terminology_settings, is_active, onboarding_team_email, phone_number, phone_extension, portal_url, theme_settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [name, slug, logoUrl || null, colorPalette ? JSON.stringify(colorPalette) : null, terminologySettings ? JSON.stringify(terminologySettings) : null, isActive !== undefined ? isActive : true, onboardingTeamEmail || null, phoneNumber || null, phoneExtension || null, portalUrl ? portalUrl.toLowerCase() : null, themeSettings ? JSON.stringify(themeSettings) : null]
      );
      return this.findById(result.insertId);
    } else {
      // Column doesn't exist, create without icon_id
      const [result] = await pool.execute(
        'INSERT INTO agencies (name, slug, logo_url, color_palette, terminology_settings, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        [name, slug, logoUrl || null, colorPalette ? JSON.stringify(colorPalette) : null, terminologySettings ? JSON.stringify(terminologySettings) : null, isActive !== undefined ? isActive : true]
      );
      return this.findById(result.insertId);
    }
  }

  static async update(id, agencyData) {
    const { name, slug, logoUrl, colorPalette, terminologySettings, isActive, iconId, trainingFocusDefaultIconId, moduleDefaultIconId, userDefaultIconId, documentDefaultIconId, companyDefaultPasswordHash, useDefaultPassword, manageAgenciesIconId, manageModulesIconId, manageDocumentsIconId, manageUsersIconId, platformSettingsIconId, viewAllProgressIconId, progressDashboardIconId, settingsIconId, certificateTemplateUrl, onboardingTeamEmail, phoneNumber, phoneExtension, portalUrl, themeSettings, customParameters } = agencyData;
    
    // Check if icon_id column exists
    let hasIconId = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'icon_id'"
      );
      hasIconId = columns.length > 0;
    } catch (e) {
      // If check fails, assume column doesn't exist
      hasIconId = false;
    }
    
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (slug !== undefined) {
      updates.push('slug = ?');
      values.push(slug);
    }
    if (logoUrl !== undefined) {
      updates.push('logo_url = ?');
      values.push(logoUrl);
    }
    if (colorPalette !== undefined) {
      updates.push('color_palette = ?');
      values.push(JSON.stringify(colorPalette));
    }
    if (terminologySettings !== undefined) {
      updates.push('terminology_settings = ?');
      values.push(terminologySettings ? JSON.stringify(terminologySettings) : null);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive);
    }
    if (iconId !== undefined && hasIconId) {
      updates.push('icon_id = ?');
      values.push(iconId);
    }
    
    // Check if default icon columns exist
    let hasDefaultIcons = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'training_focus_default_icon_id'"
      );
      hasDefaultIcons = columns.length > 0;
    } catch (e) {
      hasDefaultIcons = false;
    }
    
    if (hasDefaultIcons) {
      if (trainingFocusDefaultIconId !== undefined) {
        updates.push('training_focus_default_icon_id = ?');
        values.push(trainingFocusDefaultIconId || null);
      }
      if (moduleDefaultIconId !== undefined) {
        updates.push('module_default_icon_id = ?');
        values.push(moduleDefaultIconId || null);
      }
      if (userDefaultIconId !== undefined) {
        updates.push('user_default_icon_id = ?');
        values.push(userDefaultIconId || null);
      }
      if (documentDefaultIconId !== undefined) {
        updates.push('document_default_icon_id = ?');
        values.push(documentDefaultIconId || null);
      }
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
    
    if (hasUseDefaultPassword && useDefaultPassword !== undefined) {
      updates.push('use_default_password = ?');
      values.push(useDefaultPassword);
    }
    
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
    
    if (hasCompanyDefaultPassword && companyDefaultPasswordHash !== undefined) {
      updates.push('company_default_password_hash = ?');
      values.push(companyDefaultPasswordHash);
    }
    
    // Check if dashboard action icon columns exist
    let hasDashboardIcons = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'manage_agencies_icon_id'"
      );
      hasDashboardIcons = columns.length > 0;
    } catch (e) {
      hasDashboardIcons = false;
    }
    
    if (hasDashboardIcons) {
      if (manageAgenciesIconId !== undefined) {
        updates.push('manage_agencies_icon_id = ?');
        values.push(manageAgenciesIconId || null);
      }
      if (manageModulesIconId !== undefined) {
        updates.push('manage_modules_icon_id = ?');
        values.push(manageModulesIconId || null);
      }
      if (manageDocumentsIconId !== undefined) {
        updates.push('manage_documents_icon_id = ?');
        values.push(manageDocumentsIconId || null);
      }
      if (manageUsersIconId !== undefined) {
        updates.push('manage_users_icon_id = ?');
        values.push(manageUsersIconId || null);
      }
      if (platformSettingsIconId !== undefined) {
        updates.push('platform_settings_icon_id = ?');
        values.push(platformSettingsIconId || null);
      }
      if (viewAllProgressIconId !== undefined) {
        updates.push('view_all_progress_icon_id = ?');
        values.push(viewAllProgressIconId || null);
      }
      if (progressDashboardIconId !== undefined) {
        updates.push('progress_dashboard_icon_id = ?');
        values.push(progressDashboardIconId || null);
      }
      if (settingsIconId !== undefined) {
        updates.push('settings_icon_id = ?');
        values.push(settingsIconId || null);
      }
    }
    
    // Check if portal config columns exist
    let hasPortalConfig = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'portal_url'"
      );
      hasPortalConfig = columns.length > 0;
    } catch (e) {
      hasPortalConfig = false;
    }
    
    if (hasPortalConfig) {
      if (onboardingTeamEmail !== undefined) {
        updates.push('onboarding_team_email = ?');
        values.push(onboardingTeamEmail || null);
      }
      if (phoneNumber !== undefined) {
        updates.push('phone_number = ?');
        values.push(phoneNumber || null);
      }
      if (phoneExtension !== undefined) {
        updates.push('phone_extension = ?');
        values.push(phoneExtension || null);
      }
      if (portalUrl !== undefined) {
        updates.push('portal_url = ?');
        values.push(portalUrl ? portalUrl.toLowerCase() : null);
      }
    if (themeSettings !== undefined) {
      updates.push('theme_settings = ?');
      values.push(themeSettings ? JSON.stringify(themeSettings) : null);
    }
    if (customParameters !== undefined) {
      // Check if custom_parameters column exists
      let hasCustomParams = false;
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'custom_parameters'"
        );
        hasCustomParams = columns.length > 0;
      } catch (e) {
        hasCustomParams = false;
      }
      
      if (hasCustomParams) {
        updates.push('custom_parameters = ?');
        values.push(customParameters ? JSON.stringify(customParameters) : null);
      }
    }
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    await pool.execute(
      `UPDATE agencies SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async archive(id, archivedByUserId) {
    // Check if is_archived column exists
    let hasArchiveColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'is_archived'"
      );
      hasArchiveColumn = columns.length > 0;
    } catch (e) {
      hasArchiveColumn = false;
    }
    
    if (!hasArchiveColumn) {
      throw new Error('Archive functionality is not available. Please run the migration to add archive fields.');
    }
    
    const [result] = await pool.execute(
      'UPDATE agencies SET is_archived = TRUE, archived_at = NOW(), archived_by_user_id = ? WHERE id = ?',
      [archivedByUserId, id]
    );
    return result.affectedRows > 0;
  }

  static async restore(id) {
    // Check if is_archived column exists
    let hasArchiveColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'is_archived'"
      );
      hasArchiveColumn = columns.length > 0;
    } catch (e) {
      hasArchiveColumn = false;
    }
    
    if (!hasArchiveColumn) {
      throw new Error('Archive functionality is not available. Please run the migration to add archive fields.');
    }
    
    const [result] = await pool.execute(
      'UPDATE agencies SET is_archived = FALSE, archived_at = NULL, archived_by_user_id = NULL WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async findAllArchived() {
    // Check if is_archived column exists
    let hasArchiveColumn = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'is_archived'"
      );
      hasArchiveColumn = columns.length > 0;
    } catch (e) {
      hasArchiveColumn = false;
    }
    
    if (!hasArchiveColumn) {
      return []; // Return empty array if archive column doesn't exist
    }
    
    const [rows] = await pool.execute(
      'SELECT * FROM agencies WHERE is_archived = TRUE ORDER BY archived_at DESC'
    );
    return rows;
  }
}

export default Agency;

