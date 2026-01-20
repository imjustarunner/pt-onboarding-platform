import pool from '../config/database.js';

/**
 * Agency Model
 * 
 * NOTE: This model represents ALL organization types (Agency, School, Program, Learning).
 * The table name remains "agencies" for backward compatibility, but conceptually
 * this model handles all organization types as specified by the organization_type field.
 * 
 * Organization Types:
 * - 'agency': Traditional agency organizations (default, backward compatible)
 * - 'school': School organizations with school-specific portals
 * - 'program': Standalone program initiatives
 * - 'learning': Learning-focused organizations (e.g., tutoring companies)
 */
class Agency {
  /**
   * Find all organizations (agencies, schools, programs, learning)
   * @param {Object} options - Query options
   * @param {boolean} options.includeInactive - Include inactive organizations
   * @param {boolean} options.includeArchived - Include archived organizations
   * @param {string} options.organizationType - Filter by organization type ('agency', 'school', 'program', 'learning')
   * @returns {Promise<Array>} Array of organization objects
   */
  static async findAll(includeInactive = false, includeArchived = false, organizationType = null) {
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
    
    // Check if organization_type column exists
    let hasOrganizationType = false;
    try {
      const [orgTypeColumns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'organization_type'"
      );
      hasOrganizationType = orgTypeColumns.length > 0;
    } catch (e) {
      hasOrganizationType = false;
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

    // Check if chat_icon_id column exists
    let hasChatIconId = false;
    try {
      const [chatCols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'chat_icon_id'"
      );
      hasChatIconId = chatCols.length > 0;
    } catch (e) {
      hasChatIconId = false;
    }
    
    let query;
    if (hasIconId) {
      // Join with icons table to get master icon file path
      query = `SELECT a.*,
        master_i.file_path as icon_file_path, master_i.name as icon_name${
          hasChatIconId ? ", chat_i.file_path as chat_icon_path, chat_i.name as chat_icon_name" : ''
        }
        FROM agencies a
        LEFT JOIN icons master_i ON a.icon_id = master_i.id${
          hasChatIconId ? "\n        LEFT JOIN icons chat_i ON a.chat_icon_id = chat_i.id" : ''
        }`;
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
    
    // Filter by organization_type if specified and column exists
    if (hasOrganizationType && organizationType) {
      conditions.push('a.organization_type = ?');
      params.push(organizationType);
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

    // Check if chat_icon_id column exists
    let hasChatIconId = false;
    try {
      const [chatCols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'chat_icon_id'"
      );
      hasChatIconId = chatCols.length > 0;
    } catch (e) {
      hasChatIconId = false;
    }

    // Check if "My Dashboard" card icon columns exist
    let hasMyDashboardIcons = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'my_dashboard_checklist_icon_id'"
      );
      hasMyDashboardIcons = columns.length > 0;
    } catch (e) {
      hasMyDashboardIcons = false;
    }

    let query;
    if (hasDashboardIcons) {
      const myDashSelects = hasMyDashboardIcons
        ? `,
        mdc_i.file_path as my_dashboard_checklist_icon_path, mdc_i.name as my_dashboard_checklist_icon_name,
        mdt_i.file_path as my_dashboard_training_icon_path, mdt_i.name as my_dashboard_training_icon_name,
        mdd_i.file_path as my_dashboard_documents_icon_path, mdd_i.name as my_dashboard_documents_icon_name,
        mdm_i.file_path as my_dashboard_my_account_icon_path, mdm_i.name as my_dashboard_my_account_icon_name,
        mdod_i.file_path as my_dashboard_on_demand_training_icon_path, mdod_i.name as my_dashboard_on_demand_training_icon_name`
        : '';
      const myDashJoins = hasMyDashboardIcons
        ? `
        LEFT JOIN icons mdc_i ON a.my_dashboard_checklist_icon_id = mdc_i.id
        LEFT JOIN icons mdt_i ON a.my_dashboard_training_icon_id = mdt_i.id
        LEFT JOIN icons mdd_i ON a.my_dashboard_documents_icon_id = mdd_i.id
        LEFT JOIN icons mdm_i ON a.my_dashboard_my_account_icon_id = mdm_i.id
        LEFT JOIN icons mdod_i ON a.my_dashboard_on_demand_training_icon_id = mdod_i.id`
        : '';

      // Join with icons table to get icon file paths (including master icon)
      query = `SELECT a.*,
        master_i.file_path as icon_file_path, master_i.name as icon_name,
        ${hasChatIconId ? 'chat_i.file_path as chat_icon_path, chat_i.name as chat_icon_name,' : ''}
        ma_i.file_path as manage_agencies_icon_path, ma_i.name as manage_agencies_icon_name,
        mm_i.file_path as manage_modules_icon_path, mm_i.name as manage_modules_icon_name,
        md_i.file_path as manage_documents_icon_path, md_i.name as manage_documents_icon_name,
        mu_i.file_path as manage_users_icon_path, mu_i.name as manage_users_icon_name,
        ps_i.file_path as platform_settings_icon_path, ps_i.name as platform_settings_icon_name,
        vap_i.file_path as view_all_progress_icon_path, vap_i.name as view_all_progress_icon_name,
        pd_i.file_path as progress_dashboard_icon_path, pd_i.name as progress_dashboard_icon_name,
        s_i.file_path as settings_icon_path, s_i.name as settings_icon_name${myDashSelects}
        FROM agencies a
        ${hasIconId ? 'LEFT JOIN icons master_i ON a.icon_id = master_i.id' : ''}
        ${hasChatIconId ? 'LEFT JOIN icons chat_i ON a.chat_icon_id = chat_i.id' : ''}
        LEFT JOIN icons ma_i ON a.manage_agencies_icon_id = ma_i.id
        LEFT JOIN icons mm_i ON a.manage_modules_icon_id = mm_i.id
        LEFT JOIN icons md_i ON a.manage_documents_icon_id = md_i.id
        LEFT JOIN icons mu_i ON a.manage_users_icon_id = mu_i.id
        LEFT JOIN icons ps_i ON a.platform_settings_icon_id = ps_i.id
        LEFT JOIN icons vap_i ON a.view_all_progress_icon_id = vap_i.id
        LEFT JOIN icons pd_i ON a.progress_dashboard_icon_id = pd_i.id
        LEFT JOIN icons s_i ON a.settings_icon_id = s_i.id${myDashJoins}
        WHERE a.id = ?`;
    } else {
      // Even without dashboard icons, join for master icon if column exists
      if (hasIconId) {
        query = `SELECT a.*,
          master_i.file_path as icon_file_path, master_i.name as icon_name${
            hasChatIconId ? ", chat_i.file_path as chat_icon_path, chat_i.name as chat_icon_name" : ''
          }
          FROM agencies a
          LEFT JOIN icons master_i ON a.icon_id = master_i.id${
            hasChatIconId ? "\n          LEFT JOIN icons chat_i ON a.chat_icon_id = chat_i.id" : ''
          }
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

    // School-specific profile + contacts (best-effort; migration may not be applied yet).
    // We keep these attached to the org object so admin UIs can render "School directory" fields.
    if (agency && String(agency.organization_type || 'agency').toLowerCase() === 'school') {
      try {
        const [profiles] = await pool.execute(
          `SELECT
             district_name,
             school_number,
             itsco_email,
             school_days_times,
             school_address,
             location_label,
             primary_contact_name,
             primary_contact_email,
             primary_contact_role
           FROM school_profiles
           WHERE school_organization_id = ?
           LIMIT 1`,
          [id]
        );
        const schoolProfile = profiles?.[0] || null;
        agency.school_profile = schoolProfile;

        // Helpful UI backfill: the Address tab uses agencies.street_address. If it's empty but the
        // school profile has a value (from bulk import), expose it via street_address so the admin
        // immediately sees it and can Save.
        if (!agency.street_address && schoolProfile?.school_address) {
          agency.street_address = schoolProfile.school_address;
        }

        const [contacts] = await pool.execute(
          `SELECT
             id,
             full_name,
             email,
             role_title,
             notes,
             raw_source_text,
             is_primary,
             created_at,
             updated_at
           FROM school_contacts
           WHERE school_organization_id = ?
           ORDER BY is_primary DESC, full_name ASC, email ASC`,
          [id]
        );
        agency.school_contacts = Array.isArray(contacts) ? contacts : [];
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        agency.school_profile = null;
        agency.school_contacts = [];
      }
    }
    
    return agency;
  }

  /**
   * Find organization by slug
   * @param {string} slug - Organization slug
   * @returns {Promise<Object|null>} Organization object or null
   */
  static async findBySlug(slug) {
    // Include "My Dashboard" card icon paths when available so the portal can render them.
    let hasMyDashboardIcons = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'my_dashboard_checklist_icon_id'"
      );
      hasMyDashboardIcons = columns.length > 0;
    } catch (e) {
      hasMyDashboardIcons = false;
    }

    if (hasMyDashboardIcons) {
      const [rows] = await pool.execute(
        `SELECT a.*,
          mdc_i.file_path as my_dashboard_checklist_icon_path, mdc_i.name as my_dashboard_checklist_icon_name,
          mdt_i.file_path as my_dashboard_training_icon_path, mdt_i.name as my_dashboard_training_icon_name,
          mdd_i.file_path as my_dashboard_documents_icon_path, mdd_i.name as my_dashboard_documents_icon_name,
          mdm_i.file_path as my_dashboard_my_account_icon_path, mdm_i.name as my_dashboard_my_account_icon_name,
          mdod_i.file_path as my_dashboard_on_demand_training_icon_path, mdod_i.name as my_dashboard_on_demand_training_icon_name
         FROM agencies a
         LEFT JOIN icons mdc_i ON a.my_dashboard_checklist_icon_id = mdc_i.id
         LEFT JOIN icons mdt_i ON a.my_dashboard_training_icon_id = mdt_i.id
         LEFT JOIN icons mdd_i ON a.my_dashboard_documents_icon_id = mdd_i.id
         LEFT JOIN icons mdm_i ON a.my_dashboard_my_account_icon_id = mdm_i.id
         LEFT JOIN icons mdod_i ON a.my_dashboard_on_demand_training_icon_id = mdod_i.id
         WHERE a.slug = ? AND a.is_active = TRUE`,
        [slug]
      );
      return rows[0] || null;
    }

    const [rows] = await pool.execute('SELECT * FROM agencies WHERE slug = ? AND is_active = TRUE', [slug]);
    return rows[0] || null;
  }
  
  /**
   * Find organizations by type
   * @param {string} organizationType - Organization type ('agency', 'school', 'program', 'learning')
   * @param {boolean} includeInactive - Include inactive organizations
   * @returns {Promise<Array>} Array of organization objects
   */
  static async findByType(organizationType, includeInactive = false) {
    return this.findAll(includeInactive, false, organizationType);
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
    
    const normalized = portalUrl.toLowerCase();
    const [rows] = await pool.execute(query, [normalized]);
    const agency = rows[0] || null;
    if (agency) return agency;

    // Fallback: many routes use slug as the portal identifier
    return await this.findBySlug(normalized);
  }

  static async create(agencyData) {
    const {
      name,
      slug,
      logoUrl,
      logoPath,
      colorPalette,
      terminologySettings,
      isActive,
      iconId,
      chatIconId,
      trainingFocusDefaultIconId,
      moduleDefaultIconId,
      userDefaultIconId,
      documentDefaultIconId,
      companyDefaultPasswordHash,
      useDefaultPassword,
      onboardingTeamEmail,
      phoneNumber,
      phoneExtension,
      portalUrl,
      themeSettings,
      customParameters,
      organizationType,
      // Notification icon ids (optional; columns may not exist in all DBs)
      statusExpiredIconId,
      tempPasswordExpiredIconId,
      taskOverdueIconId,
      onboardingCompletedIconId,
      invitationExpiredIconId,
      firstLoginIconId,
      firstLoginPendingIconId,
      passwordChangedIconId,

      // Tier system (agency-specific; optional columns)
      tierSystemEnabled,
      tierThresholds
    } = agencyData;
    
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

    // Check if chat_icon_id column exists
    let hasChatIconId = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'chat_icon_id'"
      );
      hasChatIconId = cols.length > 0;
    } catch (e) {
      hasChatIconId = false;
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
    
    // Check if organization_type column exists
    let hasOrganizationType = false;
    try {
      const [orgTypeColumns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'organization_type'"
      );
      hasOrganizationType = orgTypeColumns.length > 0;
    } catch (e) {
      hasOrganizationType = false;
    }
    
    // Default organization_type to 'agency' for backward compatibility
    const orgType = organizationType || 'agency';

    // Check if tier system columns exist
    let hasTierSystemEnabled = false;
    let hasTierThresholdsJson = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME IN ('tier_system_enabled','tier_thresholds_json')"
      );
      const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
      hasTierSystemEnabled = names.has('tier_system_enabled');
      hasTierThresholdsJson = names.has('tier_thresholds_json');
    } catch {
      hasTierSystemEnabled = false;
      hasTierThresholdsJson = false;
    }
    
    // Build dynamic INSERT query based on available columns
    // Check if logo_path column exists
    let hasLogoPath = false;
    try {
      const [logoPathColumns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'logo_path'"
      );
      hasLogoPath = logoPathColumns.length > 0;
    } catch (e) {
      hasLogoPath = false;
    }
    
    const insertFields = ['name', 'slug', 'logo_url', 'color_palette', 'terminology_settings', 'is_active'];
    const insertValues = [name, slug, logoUrl || null, colorPalette ? JSON.stringify(colorPalette) : null, terminologySettings ? JSON.stringify(terminologySettings) : null, isActive !== undefined ? isActive : true];
    
    if (hasLogoPath) {
      insertFields.push('logo_path');
      insertValues.push(logoPath || null);
    }
    
    if (hasOrganizationType) {
      insertFields.push('organization_type');
      insertValues.push(orgType);
    }

    if (hasTierSystemEnabled) {
      insertFields.push('tier_system_enabled');
      insertValues.push(
        tierSystemEnabled === undefined || tierSystemEnabled === null
          ? 1
          : (tierSystemEnabled === true || tierSystemEnabled === 1 || tierSystemEnabled === '1' || String(tierSystemEnabled).toLowerCase() === 'true')
            ? 1
            : 0
      );
    }
    if (hasTierThresholdsJson) {
      insertFields.push('tier_thresholds_json');
      insertValues.push(tierThresholds ? JSON.stringify(tierThresholds) : null);
    }
    
    if (hasIconId) {
      insertFields.push('icon_id');
      insertValues.push(iconId || null);
    }

    if (hasChatIconId) {
      insertFields.push('chat_icon_id');
      insertValues.push(chatIconId || null);
    }
    
    if (hasPortalConfig) {
      insertFields.push('onboarding_team_email', 'phone_number', 'phone_extension', 'portal_url', 'theme_settings');
      insertValues.push(onboardingTeamEmail || null, phoneNumber || null, phoneExtension || null, portalUrl ? portalUrl.toLowerCase() : null, themeSettings ? JSON.stringify(themeSettings) : null);
    }
    
    // Check if notification icon columns exist
    let hasNotificationIcons = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'status_expired_icon_id'"
      );
      hasNotificationIcons = columns.length > 0;
    } catch (e) {
      hasNotificationIcons = false;
    }
    
    if (hasNotificationIcons) {
      insertFields.push('status_expired_icon_id', 'temp_password_expired_icon_id', 'task_overdue_icon_id', 'onboarding_completed_icon_id', 'invitation_expired_icon_id', 'first_login_icon_id', 'first_login_pending_icon_id', 'password_changed_icon_id');
      insertValues.push(statusExpiredIconId || null, tempPasswordExpiredIconId || null, taskOverdueIconId || null, onboardingCompletedIconId || null, invitationExpiredIconId || null, firstLoginIconId || null, firstLoginPendingIconId || null, passwordChangedIconId || null);
    }
    
    const placeholders = insertFields.map(() => '?').join(', ');
    const [result] = await pool.execute(
      `INSERT INTO agencies (${insertFields.join(', ')}) VALUES (${placeholders})`,
      insertValues
    );
    return this.findById(result.insertId);
  }

  static async update(id, agencyData) {
    const { name, slug, logoUrl, logoPath, colorPalette, terminologySettings, isActive, iconId, chatIconId, trainingFocusDefaultIconId, moduleDefaultIconId, userDefaultIconId, documentDefaultIconId, companyDefaultPasswordHash, useDefaultPassword, manageAgenciesIconId, manageModulesIconId, manageDocumentsIconId, manageUsersIconId, platformSettingsIconId, viewAllProgressIconId, progressDashboardIconId, settingsIconId, myDashboardChecklistIconId, myDashboardTrainingIconId, myDashboardDocumentsIconId, myDashboardMyAccountIconId, myDashboardOnDemandTrainingIconId, certificateTemplateUrl, onboardingTeamEmail, phoneNumber, phoneExtension, portalUrl, themeSettings, customParameters, featureFlags, organizationType, statusExpiredIconId, tempPasswordExpiredIconId, taskOverdueIconId, onboardingCompletedIconId, invitationExpiredIconId, firstLoginIconId, firstLoginPendingIconId, passwordChangedIconId, streetAddress, city, state, postalCode, tierSystemEnabled, tierThresholds,
      companyProfileIconId, teamRolesIconId, billingIconId, packagesIconId, checklistItemsIconId, fieldDefinitionsIconId, brandingTemplatesIconId, assetsIconId, communicationsIconId, integrationsIconId, archiveIconId
    } = agencyData;
    
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

    // Check if chat_icon_id column exists
    let hasChatIconId = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'chat_icon_id'"
      );
      hasChatIconId = cols.length > 0;
    } catch (e) {
      hasChatIconId = false;
    }
    
    const updates = [];
    const values = [];

    // Branding template state (optional columns)
    let hasTemplateState = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'default_branding_template_id'"
      );
      hasTemplateState = (cols || []).length > 0;
    } catch {
      hasTemplateState = false;
    }

    // Check if tier system columns exist (optional)
    let hasTierSystemEnabled = false;
    let hasTierThresholdsJson = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME IN ('tier_system_enabled','tier_thresholds_json')"
      );
      const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
      hasTierSystemEnabled = names.has('tier_system_enabled');
      hasTierThresholdsJson = names.has('tier_thresholds_json');
    } catch {
      hasTierSystemEnabled = false;
      hasTierThresholdsJson = false;
    }

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (hasTemplateState) {
      if (agencyData.defaultBrandingTemplateId !== undefined) {
        updates.push('default_branding_template_id = ?');
        values.push(agencyData.defaultBrandingTemplateId ?? null);
      }
      if (agencyData.currentBrandingTemplateId !== undefined) {
        updates.push('current_branding_template_id = ?');
        values.push(agencyData.currentBrandingTemplateId ?? null);
      }
    }
    if (slug !== undefined) {
      updates.push('slug = ?');
      values.push(slug);
    }
    // Check if logo_path column exists
    let hasLogoPath = false;
    try {
      const [logoPathColumns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'logo_path'"
      );
      hasLogoPath = logoPathColumns.length > 0;
    } catch (e) {
      hasLogoPath = false;
    }
    
    if (logoUrl !== undefined) {
      updates.push('logo_url = ?');
      values.push(logoUrl);
    }
    if (hasLogoPath && logoPath !== undefined) {
      updates.push('logo_path = ?');
      values.push(logoPath);
    }
    if (colorPalette !== undefined) {
      updates.push('color_palette = ?');
      values.push(JSON.stringify(colorPalette));
    }
    if (terminologySettings !== undefined) {
      updates.push('terminology_settings = ?');
      values.push(terminologySettings ? JSON.stringify(terminologySettings) : null);
    }
    if (hasTierSystemEnabled && tierSystemEnabled !== undefined) {
      updates.push('tier_system_enabled = ?');
      values.push(
        (tierSystemEnabled === true || tierSystemEnabled === 1 || tierSystemEnabled === '1' || String(tierSystemEnabled).toLowerCase() === 'true')
          ? 1
          : 0
      );
    }
    if (hasTierThresholdsJson && tierThresholds !== undefined) {
      updates.push('tier_thresholds_json = ?');
      values.push(tierThresholds ? JSON.stringify(tierThresholds) : null);
    }
    if (streetAddress !== undefined) {
      updates.push('street_address = ?');
      values.push(streetAddress || null);
    }
    if (city !== undefined) {
      updates.push('city = ?');
      values.push(city || null);
    }
    if (state !== undefined) {
      updates.push('state = ?');
      values.push(state || null);
    }
    if (postalCode !== undefined) {
      updates.push('postal_code = ?');
      values.push(postalCode || null);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive);
    }
    if (iconId !== undefined && hasIconId) {
      updates.push('icon_id = ?');
      values.push(iconId);
    }

    if (chatIconId !== undefined && hasChatIconId) {
      updates.push('chat_icon_id = ?');
      values.push(chatIconId === '' ? null : (chatIconId || null));
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

    // Check if settings menu icon columns exist
    let hasSettingsMenuIcons = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'company_profile_icon_id'"
      );
      hasSettingsMenuIcons = (cols || []).length > 0;
    } catch {
      hasSettingsMenuIcons = false;
    }

    if (hasSettingsMenuIcons) {
      if (companyProfileIconId !== undefined) {
        updates.push('company_profile_icon_id = ?');
        values.push(companyProfileIconId || null);
      }
      if (teamRolesIconId !== undefined) {
        updates.push('team_roles_icon_id = ?');
        values.push(teamRolesIconId || null);
      }
      if (billingIconId !== undefined) {
        updates.push('billing_icon_id = ?');
        values.push(billingIconId || null);
      }
      if (packagesIconId !== undefined) {
        updates.push('packages_icon_id = ?');
        values.push(packagesIconId || null);
      }
      if (checklistItemsIconId !== undefined) {
        updates.push('checklist_items_icon_id = ?');
        values.push(checklistItemsIconId || null);
      }
      if (fieldDefinitionsIconId !== undefined) {
        updates.push('field_definitions_icon_id = ?');
        values.push(fieldDefinitionsIconId || null);
      }
      if (brandingTemplatesIconId !== undefined) {
        updates.push('branding_templates_icon_id = ?');
        values.push(brandingTemplatesIconId || null);
      }
      if (assetsIconId !== undefined) {
        updates.push('assets_icon_id = ?');
        values.push(assetsIconId || null);
      }
      if (communicationsIconId !== undefined) {
        updates.push('communications_icon_id = ?');
        values.push(communicationsIconId || null);
      }
      if (integrationsIconId !== undefined) {
        updates.push('integrations_icon_id = ?');
        values.push(integrationsIconId || null);
      }
      if (archiveIconId !== undefined) {
        updates.push('archive_icon_id = ?');
        values.push(archiveIconId || null);
      }
    }

    // Check if "My Dashboard" card icon columns exist
    if (
      myDashboardChecklistIconId !== undefined ||
      myDashboardTrainingIconId !== undefined ||
      myDashboardDocumentsIconId !== undefined ||
      myDashboardMyAccountIconId !== undefined ||
      myDashboardOnDemandTrainingIconId !== undefined
    ) {
      let hasMyDashboardIcons = false;
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'my_dashboard_checklist_icon_id'"
        );
        hasMyDashboardIcons = columns.length > 0;
      } catch (e) {
        hasMyDashboardIcons = false;
      }

      if (hasMyDashboardIcons) {
        if (myDashboardChecklistIconId !== undefined) {
          updates.push('my_dashboard_checklist_icon_id = ?');
          values.push(myDashboardChecklistIconId || null);
        }
        if (myDashboardTrainingIconId !== undefined) {
          updates.push('my_dashboard_training_icon_id = ?');
          values.push(myDashboardTrainingIconId || null);
        }
        if (myDashboardDocumentsIconId !== undefined) {
          updates.push('my_dashboard_documents_icon_id = ?');
          values.push(myDashboardDocumentsIconId || null);
        }
        if (myDashboardMyAccountIconId !== undefined) {
          updates.push('my_dashboard_my_account_icon_id = ?');
          values.push(myDashboardMyAccountIconId || null);
        }
        if (myDashboardOnDemandTrainingIconId !== undefined) {
          updates.push('my_dashboard_on_demand_training_icon_id = ?');
          values.push(myDashboardOnDemandTrainingIconId || null);
        }
      }
    }
    
    // Check if organization_type column exists
    let hasOrganizationType = false;
    try {
      const [orgTypeColumns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'organization_type'"
      );
      hasOrganizationType = orgTypeColumns.length > 0;
    } catch (e) {
      hasOrganizationType = false;
    }
    
    if (hasOrganizationType && organizationType !== undefined) {
      updates.push('organization_type = ?');
      values.push(organizationType);
    }
    
    // Check if notification icon columns exist
    let hasNotificationIcons = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'status_expired_icon_id'"
      );
      hasNotificationIcons = columns.length > 0;
    } catch (e) {
      hasNotificationIcons = false;
    }
    
    if (hasNotificationIcons) {
      if (statusExpiredIconId !== undefined) {
        updates.push('status_expired_icon_id = ?');
        values.push(statusExpiredIconId || null);
      }
      if (tempPasswordExpiredIconId !== undefined) {
        updates.push('temp_password_expired_icon_id = ?');
        values.push(tempPasswordExpiredIconId || null);
      }
      if (taskOverdueIconId !== undefined) {
        updates.push('task_overdue_icon_id = ?');
        values.push(taskOverdueIconId || null);
      }
      if (onboardingCompletedIconId !== undefined) {
        updates.push('onboarding_completed_icon_id = ?');
        values.push(onboardingCompletedIconId || null);
      }
      if (invitationExpiredIconId !== undefined) {
        updates.push('invitation_expired_icon_id = ?');
        values.push(invitationExpiredIconId || null);
      }
      if (firstLoginIconId !== undefined) {
        updates.push('first_login_icon_id = ?');
        values.push(firstLoginIconId || null);
      }
      if (firstLoginPendingIconId !== undefined) {
        updates.push('first_login_pending_icon_id = ?');
        values.push(firstLoginPendingIconId || null);
      }
      if (passwordChangedIconId !== undefined) {
        updates.push('password_changed_icon_id = ?');
        values.push(passwordChangedIconId || null);
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
    if (featureFlags !== undefined) {
      let hasFeatureFlags = false;
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'feature_flags'"
        );
        hasFeatureFlags = columns.length > 0;
      } catch (e) {
        hasFeatureFlags = false;
      }
      if (hasFeatureFlags) {
        updates.push('feature_flags = ?');
        values.push(featureFlags ? JSON.stringify(featureFlags) : null);
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

