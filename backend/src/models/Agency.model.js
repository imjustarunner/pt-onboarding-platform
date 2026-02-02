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
      // Check if manage_clients_icon_id column exists (optional)
      let hasManageClientsIcon = false;
      try {
        const [cols] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'manage_clients_icon_id'"
        );
        hasManageClientsIcon = cols.length > 0;
      } catch (e) {
        hasManageClientsIcon = false;
      }

      // Check if extra dashboard quick-action icons exist (optional)
      let hasExtraDashboardQuickActionIcons = false;
      try {
        const [cols] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'dashboard_notifications_icon_id'"
        );
        hasExtraDashboardQuickActionIcons = (cols || []).length > 0;
      } catch (e) {
        hasExtraDashboardQuickActionIcons = false;
      }

      // Optional quick action icons (added over time via migrations)
      let hasExternalCalendarAuditIcon = false;
      let hasSkillBuildersAvailabilityIcon = false;
      let hasSchoolOverviewIcon = false;
      let hasProgramOverviewIcon = false;
      let hasProviderAvailabilityDashboardIcon = false;
      let hasExecutiveReportIcon = false;
      try {
        const [cols] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME IN ('external_calendar_audit_icon_id','skill_builders_availability_icon_id','school_overview_icon_id','program_overview_icon_id','provider_availability_dashboard_icon_id','executive_report_icon_id')"
        );
        const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
        hasExternalCalendarAuditIcon = names.has('external_calendar_audit_icon_id');
        hasSkillBuildersAvailabilityIcon = names.has('skill_builders_availability_icon_id');
        hasSchoolOverviewIcon = names.has('school_overview_icon_id');
        hasProgramOverviewIcon = names.has('program_overview_icon_id');
        hasProviderAvailabilityDashboardIcon = names.has('provider_availability_dashboard_icon_id');
        hasExecutiveReportIcon = names.has('executive_report_icon_id');
      } catch (e) {
        hasExternalCalendarAuditIcon = false;
        hasSkillBuildersAvailabilityIcon = false;
        hasSchoolOverviewIcon = false;
        hasProgramOverviewIcon = false;
        hasProviderAvailabilityDashboardIcon = false;
        hasExecutiveReportIcon = false;
      }

      const schoolOverviewSelects = hasSchoolOverviewIcon
        ? `,
        sov_i.file_path as school_overview_icon_path, sov_i.name as school_overview_icon_name`
        : '';

      const schoolOverviewJoins = hasSchoolOverviewIcon
        ? `
        LEFT JOIN icons sov_i ON a.school_overview_icon_id = sov_i.id`
        : '';

      const programOverviewSelects = hasProgramOverviewIcon
        ? `,
        pov_i.file_path as program_overview_icon_path, pov_i.name as program_overview_icon_name`
        : '';

      const programOverviewJoins = hasProgramOverviewIcon
        ? `
        LEFT JOIN icons pov_i ON a.program_overview_icon_id = pov_i.id`
        : '';

      const providerAvailabilitySelects = hasProviderAvailabilityDashboardIcon
        ? `,
        pad_i.file_path as provider_availability_dashboard_icon_path, pad_i.name as provider_availability_dashboard_icon_name`
        : '';

      const providerAvailabilityJoins = hasProviderAvailabilityDashboardIcon
        ? `
        LEFT JOIN icons pad_i ON a.provider_availability_dashboard_icon_id = pad_i.id`
        : '';

      const executiveReportSelects = hasExecutiveReportIcon
        ? `,
        er_i.file_path as executive_report_icon_path, er_i.name as executive_report_icon_name`
        : '';

      const executiveReportJoins = hasExecutiveReportIcon
        ? `
        LEFT JOIN icons er_i ON a.executive_report_icon_id = er_i.id`
        : '';

      const extraDashSelects = hasExtraDashboardQuickActionIcons
        ? `,
        dn_i.file_path as dashboard_notifications_icon_path, dn_i.name as dashboard_notifications_icon_name,
        dcomm_i.file_path as dashboard_communications_icon_path, dcomm_i.name as dashboard_communications_icon_name,
        dchats_i.file_path as dashboard_chats_icon_path, dchats_i.name as dashboard_chats_icon_name,
        dpay_i.file_path as dashboard_payroll_icon_path, dpay_i.name as dashboard_payroll_icon_name,
        dbill_i.file_path as dashboard_billing_icon_path, dbill_i.name as dashboard_billing_icon_name`
        : '';

      const extraDashJoins = hasExtraDashboardQuickActionIcons
        ? `
        LEFT JOIN icons dn_i ON a.dashboard_notifications_icon_id = dn_i.id
        LEFT JOIN icons dcomm_i ON a.dashboard_communications_icon_id = dcomm_i.id
        LEFT JOIN icons dchats_i ON a.dashboard_chats_icon_id = dchats_i.id
        LEFT JOIN icons dpay_i ON a.dashboard_payroll_icon_id = dpay_i.id
        LEFT JOIN icons dbill_i ON a.dashboard_billing_icon_id = dbill_i.id`
        : '';

      const extCalSelects = hasExternalCalendarAuditIcon
        ? `,
        eca_i.file_path as external_calendar_audit_icon_path, eca_i.name as external_calendar_audit_icon_name`
        : '';

      const extCalJoins = hasExternalCalendarAuditIcon
        ? `
        LEFT JOIN icons eca_i ON a.external_calendar_audit_icon_id = eca_i.id`
        : '';

      // School Portal home card icons (optional; needed for School Portal users who cannot call /icons)
      let schoolPortalSelects = '';
      let schoolPortalJoins = '';
      try {
        const want = [
          { col: 'school_portal_providers_icon_id', alias: 'sp_prov_i', path: 'school_portal_providers_icon_path', name: 'school_portal_providers_icon_name' },
          { col: 'school_portal_days_icon_id', alias: 'sp_days_i', path: 'school_portal_days_icon_path', name: 'school_portal_days_icon_name' },
          { col: 'school_portal_roster_icon_id', alias: 'sp_roster_i', path: 'school_portal_roster_icon_path', name: 'school_portal_roster_icon_name' },
          { col: 'school_portal_skills_groups_icon_id', alias: 'sp_sk_i', path: 'school_portal_skills_groups_icon_path', name: 'school_portal_skills_groups_icon_name' },
          { col: 'school_portal_contact_admin_icon_id', alias: 'sp_ca_i', path: 'school_portal_contact_admin_icon_path', name: 'school_portal_contact_admin_icon_name' },
          { col: 'school_portal_school_staff_icon_id', alias: 'sp_staff_i', path: 'school_portal_school_staff_icon_path', name: 'school_portal_school_staff_icon_name' },
          { col: 'school_portal_parent_qr_icon_id', alias: 'sp_pqr_i', path: 'school_portal_parent_qr_icon_path', name: 'school_portal_parent_qr_icon_name' },
          { col: 'school_portal_parent_sign_icon_id', alias: 'sp_psign_i', path: 'school_portal_parent_sign_icon_path', name: 'school_portal_parent_sign_icon_name' },
          { col: 'school_portal_upload_packet_icon_id', alias: 'sp_up_i', path: 'school_portal_upload_packet_icon_path', name: 'school_portal_upload_packet_icon_name' },
          { col: 'school_portal_public_documents_icon_id', alias: 'sp_docs_i', path: 'school_portal_public_documents_icon_path', name: 'school_portal_public_documents_icon_name' }
        ];
        const ph = want.map(() => '?').join(',');
        const [cols] = await pool.execute(
          `SELECT COLUMN_NAME
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'agencies'
             AND COLUMN_NAME IN (${ph})`,
          want.map((x) => x.col)
        );
        const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
        const present = want.filter((x) => names.has(x.col));
        if (present.length) {
          schoolPortalSelects = `,
        ${present.map((x) => `${x.alias}.file_path as ${x.path}, ${x.alias}.name as ${x.name}`).join(',\n        ')}`;
          schoolPortalJoins = `
        ${present.map((x) => `LEFT JOIN icons ${x.alias} ON a.${x.col} = ${x.alias}.id`).join('\n        ')}`;
        }
      } catch {
        // ignore
      }

      const skillBuildersSelects = hasSkillBuildersAvailabilityIcon
        ? `,
        sba_i.file_path as skill_builders_availability_icon_path, sba_i.name as skill_builders_availability_icon_name`
        : '';

      const skillBuildersJoins = hasSkillBuildersAvailabilityIcon
        ? `
        LEFT JOIN icons sba_i ON a.skill_builders_availability_icon_id = sba_i.id`
        : '';

      const myDashSelects = hasMyDashboardIcons
        ? `,
        mdc_i.file_path as my_dashboard_checklist_icon_path, mdc_i.name as my_dashboard_checklist_icon_name,
        mdt_i.file_path as my_dashboard_training_icon_path, mdt_i.name as my_dashboard_training_icon_name,
        mdd_i.file_path as my_dashboard_documents_icon_path, mdd_i.name as my_dashboard_documents_icon_name,
        mdm_i.file_path as my_dashboard_my_account_icon_path, mdm_i.name as my_dashboard_my_account_icon_name,
        mdsch_i.file_path as my_dashboard_my_schedule_icon_path, mdsch_i.name as my_dashboard_my_schedule_icon_name,
        mdcli_i.file_path as my_dashboard_clients_icon_path, mdcli_i.name as my_dashboard_clients_icon_name,
        mdod_i.file_path as my_dashboard_on_demand_training_icon_path, mdod_i.name as my_dashboard_on_demand_training_icon_name,
        mdp_i.file_path as my_dashboard_payroll_icon_path, mdp_i.name as my_dashboard_payroll_icon_name,
        mds_i.file_path as my_dashboard_submit_icon_path, mds_i.name as my_dashboard_submit_icon_name,
        mdcom_i.file_path as my_dashboard_communications_icon_path, mdcom_i.name as my_dashboard_communications_icon_name,
        mdchat_i.file_path as my_dashboard_chats_icon_path, mdchat_i.name as my_dashboard_chats_icon_name,
        mdn_i.file_path as my_dashboard_notifications_icon_path, mdn_i.name as my_dashboard_notifications_icon_name,
        mdsup_i.file_path as my_dashboard_supervision_icon_path, mdsup_i.name as my_dashboard_supervision_icon_name`
        : '';
      const myDashJoins = hasMyDashboardIcons
        ? `
        LEFT JOIN icons mdc_i ON a.my_dashboard_checklist_icon_id = mdc_i.id
        LEFT JOIN icons mdt_i ON a.my_dashboard_training_icon_id = mdt_i.id
        LEFT JOIN icons mdd_i ON a.my_dashboard_documents_icon_id = mdd_i.id
        LEFT JOIN icons mdm_i ON a.my_dashboard_my_account_icon_id = mdm_i.id
        LEFT JOIN icons mdsch_i ON a.my_dashboard_my_schedule_icon_id = mdsch_i.id
        LEFT JOIN icons mdcli_i ON a.my_dashboard_clients_icon_id = mdcli_i.id
        LEFT JOIN icons mdod_i ON a.my_dashboard_on_demand_training_icon_id = mdod_i.id
        LEFT JOIN icons mdp_i ON a.my_dashboard_payroll_icon_id = mdp_i.id
        LEFT JOIN icons mds_i ON a.my_dashboard_submit_icon_id = mds_i.id
        LEFT JOIN icons mdcom_i ON a.my_dashboard_communications_icon_id = mdcom_i.id
        LEFT JOIN icons mdchat_i ON a.my_dashboard_chats_icon_id = mdchat_i.id
        LEFT JOIN icons mdn_i ON a.my_dashboard_notifications_icon_id = mdn_i.id
        LEFT JOIN icons mdsup_i ON a.my_dashboard_supervision_icon_id = mdsup_i.id`
        : '';

      // Join with icons table to get icon file paths (including master icon)
      query = `SELECT a.*,
        master_i.file_path as icon_file_path, master_i.name as icon_name,
        ${hasChatIconId ? 'chat_i.file_path as chat_icon_path, chat_i.name as chat_icon_name,' : ''}
        ${hasManageClientsIcon ? 'mc_i.file_path as manage_clients_icon_path, mc_i.name as manage_clients_icon_name,' : ''}
        ma_i.file_path as manage_agencies_icon_path, ma_i.name as manage_agencies_icon_name,
        mm_i.file_path as manage_modules_icon_path, mm_i.name as manage_modules_icon_name,
        md_i.file_path as manage_documents_icon_path, md_i.name as manage_documents_icon_name,
        mu_i.file_path as manage_users_icon_path, mu_i.name as manage_users_icon_name,
        ps_i.file_path as platform_settings_icon_path, ps_i.name as platform_settings_icon_name,
        vap_i.file_path as view_all_progress_icon_path, vap_i.name as view_all_progress_icon_name,
        pd_i.file_path as progress_dashboard_icon_path, pd_i.name as progress_dashboard_icon_name,
        s_i.file_path as settings_icon_path, s_i.name as settings_icon_name${extraDashSelects}${extCalSelects}${schoolOverviewSelects}${programOverviewSelects}${providerAvailabilitySelects}${executiveReportSelects}${skillBuildersSelects}${myDashSelects}${schoolPortalSelects}
        FROM agencies a
        ${hasIconId ? 'LEFT JOIN icons master_i ON a.icon_id = master_i.id' : ''}
        ${hasChatIconId ? 'LEFT JOIN icons chat_i ON a.chat_icon_id = chat_i.id' : ''}
        ${hasManageClientsIcon ? 'LEFT JOIN icons mc_i ON a.manage_clients_icon_id = mc_i.id' : ''}
        LEFT JOIN icons ma_i ON a.manage_agencies_icon_id = ma_i.id
        LEFT JOIN icons mm_i ON a.manage_modules_icon_id = mm_i.id
        LEFT JOIN icons md_i ON a.manage_documents_icon_id = md_i.id
        LEFT JOIN icons mu_i ON a.manage_users_icon_id = mu_i.id
        LEFT JOIN icons ps_i ON a.platform_settings_icon_id = ps_i.id
        LEFT JOIN icons vap_i ON a.view_all_progress_icon_id = vap_i.id
        LEFT JOIN icons pd_i ON a.progress_dashboard_icon_id = pd_i.id
        LEFT JOIN icons s_i ON a.settings_icon_id = s_i.id${extraDashJoins}${extCalJoins}${schoolOverviewJoins}${programOverviewJoins}${providerAvailabilityJoins}${executiveReportJoins}${skillBuildersJoins}${myDashJoins}${schoolPortalJoins}
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
        let profiles = null;
        try {
          const [rows] = await pool.execute(
          `SELECT
             district_name,
             school_number,
             itsco_email,
             school_days_times,
               bell_schedule_start_time,
               bell_schedule_end_time,
             school_address,
             location_label,
             primary_contact_name,
             primary_contact_email,
             primary_contact_role,
             secondary_contact_text
           FROM school_profiles
           WHERE school_organization_id = ?
           LIMIT 1`,
          [id]
        );
          profiles = rows;
        } catch (e) {
          // Backward-compatible: bell schedule columns may not exist yet.
          if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
          const [rows] = await pool.execute(
            `SELECT
               district_name,
               school_number,
               itsco_email,
               school_days_times,
               school_address,
               location_label,
               primary_contact_name,
               primary_contact_email,
               primary_contact_role,
               secondary_contact_text
             FROM school_profiles
             WHERE school_organization_id = ?
             LIMIT 1`,
            [id]
          );
          profiles = rows;
        }
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

    // Best-effort: include affiliated agency id for child orgs (school/program/learning)
    // via organization_affiliations (if migrated).
    let hasOrgAffiliations = false;
    try {
      const [tables] = await pool.execute(
        "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organization_affiliations'"
      );
      hasOrgAffiliations = Number(tables?.[0]?.cnt || 0) > 0;
    } catch (e) {
      hasOrgAffiliations = false;
    }

    if (hasMyDashboardIcons) {
      const [rows] = await pool.execute(
        `SELECT a.*,
          mdc_i.file_path as my_dashboard_checklist_icon_path, mdc_i.name as my_dashboard_checklist_icon_name,
          mdt_i.file_path as my_dashboard_training_icon_path, mdt_i.name as my_dashboard_training_icon_name,
          mdd_i.file_path as my_dashboard_documents_icon_path, mdd_i.name as my_dashboard_documents_icon_name,
          mdm_i.file_path as my_dashboard_my_account_icon_path, mdm_i.name as my_dashboard_my_account_icon_name,
          mdsch_i.file_path as my_dashboard_my_schedule_icon_path, mdsch_i.name as my_dashboard_my_schedule_icon_name,
          mdcli_i.file_path as my_dashboard_clients_icon_path, mdcli_i.name as my_dashboard_clients_icon_name,
          mdod_i.file_path as my_dashboard_on_demand_training_icon_path, mdod_i.name as my_dashboard_on_demand_training_icon_name,
          mdp_i.file_path as my_dashboard_payroll_icon_path, mdp_i.name as my_dashboard_payroll_icon_name,
          mds_i.file_path as my_dashboard_submit_icon_path, mds_i.name as my_dashboard_submit_icon_name,
          mdcom_i.file_path as my_dashboard_communications_icon_path, mdcom_i.name as my_dashboard_communications_icon_name,
          mdchat_i.file_path as my_dashboard_chats_icon_path, mdchat_i.name as my_dashboard_chats_icon_name,
          mdn_i.file_path as my_dashboard_notifications_icon_path, mdn_i.name as my_dashboard_notifications_icon_name
          ${hasOrgAffiliations ? ', oa.agency_id AS affiliated_agency_id' : ''}
         FROM agencies a
         ${hasOrgAffiliations ? '\n         LEFT JOIN organization_affiliations oa ON oa.organization_id = a.id AND oa.is_active = TRUE' : ''}
         LEFT JOIN icons mdc_i ON a.my_dashboard_checklist_icon_id = mdc_i.id
         LEFT JOIN icons mdt_i ON a.my_dashboard_training_icon_id = mdt_i.id
         LEFT JOIN icons mdd_i ON a.my_dashboard_documents_icon_id = mdd_i.id
         LEFT JOIN icons mdm_i ON a.my_dashboard_my_account_icon_id = mdm_i.id
         LEFT JOIN icons mdsch_i ON a.my_dashboard_my_schedule_icon_id = mdsch_i.id
         LEFT JOIN icons mdcli_i ON a.my_dashboard_clients_icon_id = mdcli_i.id
         LEFT JOIN icons mdod_i ON a.my_dashboard_on_demand_training_icon_id = mdod_i.id
         LEFT JOIN icons mdp_i ON a.my_dashboard_payroll_icon_id = mdp_i.id
         LEFT JOIN icons mds_i ON a.my_dashboard_submit_icon_id = mds_i.id
         LEFT JOIN icons mdcom_i ON a.my_dashboard_communications_icon_id = mdcom_i.id
         LEFT JOIN icons mdchat_i ON a.my_dashboard_chats_icon_id = mdchat_i.id
         LEFT JOIN icons mdn_i ON a.my_dashboard_notifications_icon_id = mdn_i.id
         WHERE a.slug = ? AND a.is_active = TRUE`,
        [slug]
      );
      return rows[0] || null;
    }

    if (hasOrgAffiliations) {
      const [rows] = await pool.execute(
        `SELECT a.*, oa.agency_id AS affiliated_agency_id
         FROM agencies a
         LEFT JOIN organization_affiliations oa
           ON oa.organization_id = a.id
          AND oa.is_active = TRUE
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
      officialName,
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
      supportTicketCreatedIconId,

      // "My Dashboard" card icon overrides (optional columns)
      myDashboardChecklistIconId,
      myDashboardTrainingIconId,
      myDashboardDocumentsIconId,
      myDashboardMyAccountIconId,
      myDashboardMyScheduleIconId,
      myDashboardClientsIconId,
      myDashboardOnDemandTrainingIconId,
      myDashboardPayrollIconId,
      myDashboardSubmitIconId,
      myDashboardCommunicationsIconId,
      myDashboardChatsIconId,
      myDashboardNotificationsIconId,
      myDashboardSupervisionIconId,

      // School Portal dashboard card icon overrides (agency-level; optional columns)
      schoolPortalProvidersIconId,
      schoolPortalDaysIconId,
      schoolPortalRosterIconId,
      schoolPortalSkillsGroupsIconId,
      schoolPortalContactAdminIconId,
      schoolPortalSchoolStaffIconId,
      schoolPortalParentQrIconId,
      schoolPortalParentSignIconId,
      schoolPortalUploadPacketIconId,
      schoolPortalPublicDocumentsIconId,

      // Tier system (agency-specific; optional columns)
      tierSystemEnabled,
      tierThresholds,

      // Ticketing notifications (optional columns)
      ticketingNotificationOrgTypes
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

    // Check if official_name column exists (optional)
    let hasOfficialName = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'official_name'"
      );
      hasOfficialName = (cols || []).length > 0;
    } catch {
      hasOfficialName = false;
    }
    
    const insertFields = ['name', 'slug', 'logo_url', 'color_palette', 'terminology_settings', 'is_active'];
    const insertValues = [name, slug, logoUrl || null, colorPalette ? JSON.stringify(colorPalette) : null, terminologySettings ? JSON.stringify(terminologySettings) : null, isActive !== undefined ? isActive : true];

    if (hasOfficialName) {
      insertFields.push('official_name');
      insertValues.push(officialName || null);
    }
    
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
    
    // Check which notification icon columns exist (optional, best-effort)
    let hasNotificationIcons = false;
    let hasSupportTicketCreatedIcon = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME IN ('status_expired_icon_id','support_ticket_created_icon_id')"
      );
      const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
      hasNotificationIcons = names.has('status_expired_icon_id');
      hasSupportTicketCreatedIcon = names.has('support_ticket_created_icon_id');
    } catch (e) {
      hasNotificationIcons = false;
      hasSupportTicketCreatedIcon = false;
    }

    if (supportTicketCreatedIconId !== undefined && !hasSupportTicketCreatedIcon) {
      const err = new Error(
        'Cannot save Support ticket notification icon: database missing agencies.support_ticket_created_icon_id. Run database/migrations/308_support_ticket_notifications.sql.'
      );
      err.status = 409;
      throw err;
    }
    
    if (hasNotificationIcons) {
      insertFields.push(
        'status_expired_icon_id',
        'temp_password_expired_icon_id',
        'task_overdue_icon_id',
        'onboarding_completed_icon_id',
        'invitation_expired_icon_id',
        'first_login_icon_id',
        'first_login_pending_icon_id',
        'password_changed_icon_id'
      );
      insertValues.push(
        statusExpiredIconId || null,
        tempPasswordExpiredIconId || null,
        taskOverdueIconId || null,
        onboardingCompletedIconId || null,
        invitationExpiredIconId || null,
        firstLoginIconId || null,
        firstLoginPendingIconId || null,
        passwordChangedIconId || null
      );
    }

    if (hasSupportTicketCreatedIcon) {
      insertFields.push('support_ticket_created_icon_id');
      insertValues.push(supportTicketCreatedIconId || null);
    }

    // Ticketing notification org-type scope (optional)
    let hasTicketingOrgTypes = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'ticketing_notification_org_types_json'"
      );
      hasTicketingOrgTypes = (cols || []).length > 0;
    } catch {
      hasTicketingOrgTypes = false;
    }
    if (ticketingNotificationOrgTypes !== undefined && !hasTicketingOrgTypes) {
      const err = new Error(
        'Cannot save ticketing notification scope: database missing agencies.ticketing_notification_org_types_json. Run database/migrations/308_support_ticket_notifications.sql.'
      );
      err.status = 409;
      throw err;
    }
    if (hasTicketingOrgTypes) {
      insertFields.push('ticketing_notification_org_types_json');
      insertValues.push(
        ticketingNotificationOrgTypes === null || ticketingNotificationOrgTypes === undefined
          ? null
          : JSON.stringify(ticketingNotificationOrgTypes)
      );
    }

    // "My Dashboard" icon overrides (optional)
    let hasMyDashboardIcons = false;
    try {
      const [columns] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'my_dashboard_checklist_icon_id'"
      );
      hasMyDashboardIcons = (columns || []).length > 0;
    } catch (e) {
      hasMyDashboardIcons = false;
    }
    if (hasMyDashboardIcons) {
      insertFields.push(
        'my_dashboard_checklist_icon_id',
        'my_dashboard_training_icon_id',
        'my_dashboard_documents_icon_id',
        'my_dashboard_my_account_icon_id',
        'my_dashboard_my_schedule_icon_id',
        'my_dashboard_clients_icon_id',
        'my_dashboard_on_demand_training_icon_id',
        'my_dashboard_payroll_icon_id',
        'my_dashboard_submit_icon_id',
        'my_dashboard_communications_icon_id',
        'my_dashboard_chats_icon_id',
        'my_dashboard_notifications_icon_id',
        'my_dashboard_supervision_icon_id'
      );
      insertValues.push(
        myDashboardChecklistIconId || null,
        myDashboardTrainingIconId || null,
        myDashboardDocumentsIconId || null,
        myDashboardMyAccountIconId || null,
        myDashboardMyScheduleIconId || null,
        myDashboardClientsIconId || null,
        myDashboardOnDemandTrainingIconId || null,
        myDashboardPayrollIconId || null,
        myDashboardSubmitIconId || null,
        myDashboardCommunicationsIconId || null,
        myDashboardChatsIconId || null,
        myDashboardNotificationsIconId || null,
        myDashboardSupervisionIconId || null
      );
    }

    // School Portal dashboard card icons (optional)
    let hasSchoolPortalIcons = false;
    let hasSchoolPortalStaffIcon = false;
    let hasParentQr = false;
    let hasParentSign = false;
    let hasUploadPacket = false;
    let hasPublicDocs = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME IN ('school_portal_providers_icon_id','school_portal_school_staff_icon_id','school_portal_parent_qr_icon_id','school_portal_parent_sign_icon_id','school_portal_upload_packet_icon_id','school_portal_public_documents_icon_id')"
      );
      const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
      hasSchoolPortalIcons = names.has('school_portal_providers_icon_id');
      hasSchoolPortalStaffIcon = names.has('school_portal_school_staff_icon_id');
      hasParentQr = names.has('school_portal_parent_qr_icon_id');
      hasParentSign = names.has('school_portal_parent_sign_icon_id');
      hasUploadPacket = names.has('school_portal_upload_packet_icon_id');
      hasPublicDocs = names.has('school_portal_public_documents_icon_id');
    } catch (e) {
      hasSchoolPortalIcons = false;
      hasSchoolPortalStaffIcon = false;
      hasParentQr = false;
      hasParentSign = false;
      hasUploadPacket = false;
      hasPublicDocs = false;
    }
    if (schoolPortalSchoolStaffIconId !== undefined && !hasSchoolPortalStaffIcon) {
      const err = new Error(
        'Cannot save School staff card icon: database missing agencies.school_portal_school_staff_icon_id. Run database/migrations/291_school_portal_school_staff_card_icon.sql.'
      );
      err.status = 409;
      throw err;
    }
    if (schoolPortalParentQrIconId !== undefined && !hasParentQr) {
      const err = new Error(
        'Cannot save Parent QR code icon: database missing agencies.school_portal_parent_qr_icon_id. Run database/migrations/293_school_portal_parent_packet_cards_icons.sql.'
      );
      err.status = 409;
      throw err;
    }
    if (schoolPortalParentSignIconId !== undefined && !hasParentSign) {
      const err = new Error(
        'Cannot save Parent fill + sign icon: database missing agencies.school_portal_parent_sign_icon_id. Run database/migrations/293_school_portal_parent_packet_cards_icons.sql.'
      );
      err.status = 409;
      throw err;
    }
    if (schoolPortalUploadPacketIconId !== undefined && !hasUploadPacket) {
      const err = new Error(
        'Cannot save Upload packet icon: database missing agencies.school_portal_upload_packet_icon_id. Run database/migrations/293_school_portal_parent_packet_cards_icons.sql.'
      );
      err.status = 409;
      throw err;
    }
    if (schoolPortalPublicDocumentsIconId !== undefined && !hasPublicDocs) {
      const err = new Error(
        'Cannot save Documents icon: database missing agencies.school_portal_public_documents_icon_id. Run database/migrations/303_school_portal_public_documents_card_icon.sql.'
      );
      err.status = 409;
      throw err;
    }
    if (hasSchoolPortalIcons) {
      insertFields.push(
        'school_portal_providers_icon_id',
        'school_portal_days_icon_id',
        'school_portal_roster_icon_id',
        'school_portal_skills_groups_icon_id',
        'school_portal_contact_admin_icon_id',
        ...(hasSchoolPortalStaffIcon ? ['school_portal_school_staff_icon_id'] : []),
        ...(hasParentQr ? ['school_portal_parent_qr_icon_id'] : []),
        ...(hasParentSign ? ['school_portal_parent_sign_icon_id'] : []),
        ...(hasUploadPacket ? ['school_portal_upload_packet_icon_id'] : []),
        ...(hasPublicDocs ? ['school_portal_public_documents_icon_id'] : [])
      );
      insertValues.push(
        schoolPortalProvidersIconId || null,
        schoolPortalDaysIconId || null,
        schoolPortalRosterIconId || null,
        schoolPortalSkillsGroupsIconId || null,
        schoolPortalContactAdminIconId || null,
        ...(hasSchoolPortalStaffIcon ? [schoolPortalSchoolStaffIconId || null] : []),
        ...(hasParentQr ? [schoolPortalParentQrIconId || null] : []),
        ...(hasParentSign ? [schoolPortalParentSignIconId || null] : []),
        ...(hasUploadPacket ? [schoolPortalUploadPacketIconId || null] : []),
        ...(hasPublicDocs ? [schoolPortalPublicDocumentsIconId || null] : [])
      );
    }
    
    const placeholders = insertFields.map(() => '?').join(', ');
    const [result] = await pool.execute(
      `INSERT INTO agencies (${insertFields.join(', ')}) VALUES (${placeholders})`,
      insertValues
    );
    return this.findById(result.insertId);
  }

  static async update(id, agencyData) {
    const { name, officialName, slug, logoUrl, logoPath, colorPalette, terminologySettings, isActive, iconId, chatIconId, trainingFocusDefaultIconId, moduleDefaultIconId, userDefaultIconId, documentDefaultIconId, companyDefaultPasswordHash, useDefaultPassword, manageAgenciesIconId, manageModulesIconId, manageDocumentsIconId, manageUsersIconId, platformSettingsIconId, viewAllProgressIconId, progressDashboardIconId, settingsIconId, externalCalendarAuditIconId, skillBuildersAvailabilityIconId, myDashboardChecklistIconId, myDashboardTrainingIconId, myDashboardDocumentsIconId, myDashboardMyAccountIconId, myDashboardMyScheduleIconId, myDashboardClientsIconId, myDashboardOnDemandTrainingIconId, myDashboardPayrollIconId, myDashboardSubmitIconId, myDashboardCommunicationsIconId, myDashboardChatsIconId, myDashboardNotificationsIconId, myDashboardSupervisionIconId, certificateTemplateUrl, onboardingTeamEmail, phoneNumber, phoneExtension, portalUrl, themeSettings, customParameters, featureFlags, publicAvailabilityEnabled, organizationType, statusExpiredIconId, tempPasswordExpiredIconId, taskOverdueIconId, onboardingCompletedIconId, invitationExpiredIconId, firstLoginIconId, firstLoginPendingIconId, passwordChangedIconId, supportTicketCreatedIconId, ticketingNotificationOrgTypes, streetAddress, city, state, postalCode, tierSystemEnabled, tierThresholds,
      schoolPortalProvidersIconId, schoolPortalDaysIconId, schoolPortalRosterIconId, schoolPortalSkillsGroupsIconId, schoolPortalContactAdminIconId, schoolPortalSchoolStaffIconId, schoolPortalParentQrIconId, schoolPortalParentSignIconId, schoolPortalUploadPacketIconId,
      schoolPortalPublicDocumentsIconId,
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

    // Check if official_name column exists (optional)
    let hasOfficialName = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'official_name'"
      );
      hasOfficialName = (cols || []).length > 0;
    } catch {
      hasOfficialName = false;
    }
    if (hasOfficialName && officialName !== undefined) {
      updates.push('official_name = ?');
      values.push(officialName || null);
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
      if (agencyData.manageClientsIconId !== undefined) {
        // Optional column; keep best-effort for older DBs.
        try {
          const [cols] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'manage_clients_icon_id'"
          );
          if ((cols || []).length > 0) {
            updates.push('manage_clients_icon_id = ?');
            values.push(agencyData.manageClientsIconId || null);
          }
        } catch {
          // ignore
        }
      }

      if (agencyData.schoolOverviewIconId !== undefined) {
        // Optional column; keep best-effort for older DBs.
        try {
          const [cols] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'school_overview_icon_id'"
          );
          if ((cols || []).length > 0) {
            updates.push('school_overview_icon_id = ?');
            values.push(agencyData.schoolOverviewIconId || null);
          }
        } catch {
          // ignore
        }
      }
      if (agencyData.programOverviewIconId !== undefined) {
        try {
          const [cols] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'program_overview_icon_id'"
          );
          if ((cols || []).length > 0) {
            updates.push('program_overview_icon_id = ?');
            values.push(agencyData.programOverviewIconId || null);
          } else {
            const err = new Error(
              'Cannot save Program Overview icon: database missing agencies.program_overview_icon_id. Run database/migrations/313_dashboard_action_icons_program_overview_provider_availability_executive_report.sql.'
            );
            err.status = 409;
            throw err;
          }
        } catch (e) {
          if (e?.status) throw e;
          // ignore
        }
      }
      if (agencyData.providerAvailabilityDashboardIconId !== undefined) {
        try {
          const [cols] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'provider_availability_dashboard_icon_id'"
          );
          if ((cols || []).length > 0) {
            updates.push('provider_availability_dashboard_icon_id = ?');
            values.push(agencyData.providerAvailabilityDashboardIconId || null);
          } else {
            const err = new Error(
              'Cannot save Provider Availability icon: database missing agencies.provider_availability_dashboard_icon_id. Run database/migrations/313_dashboard_action_icons_program_overview_provider_availability_executive_report.sql.'
            );
            err.status = 409;
            throw err;
          }
        } catch (e) {
          if (e?.status) throw e;
          // ignore
        }
      }
      if (agencyData.executiveReportIconId !== undefined) {
        try {
          const [cols] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'executive_report_icon_id'"
          );
          if ((cols || []).length > 0) {
            updates.push('executive_report_icon_id = ?');
            values.push(agencyData.executiveReportIconId || null);
          } else {
            const err = new Error(
              'Cannot save Executive Report icon: database missing agencies.executive_report_icon_id. Run database/migrations/313_dashboard_action_icons_program_overview_provider_availability_executive_report.sql.'
            );
            err.status = 409;
            throw err;
          }
        } catch (e) {
          if (e?.status) throw e;
          // ignore
        }
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

      // External Calendar Audit quick-action icon (optional)
      if (externalCalendarAuditIconId !== undefined) {
        try {
          const [cols] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'external_calendar_audit_icon_id'"
          );
          if ((cols || []).length > 0) {
            updates.push('external_calendar_audit_icon_id = ?');
            values.push(externalCalendarAuditIconId || null);
          }
        } catch {
          // ignore
        }
      }

      // Skill Builders Availability quick-action icon (optional)
      if (skillBuildersAvailabilityIconId !== undefined) {
        try {
          const [cols] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'skill_builders_availability_icon_id'"
          );
          if ((cols || []).length > 0) {
            updates.push('skill_builders_availability_icon_id = ?');
            values.push(skillBuildersAvailabilityIconId || null);
          }
        } catch {
          // ignore
        }
      }

      // New dashboard quick-action icon overrides (optional; best-effort for older DBs)
      if (
        agencyData.dashboardNotificationsIconId !== undefined ||
        agencyData.dashboardCommunicationsIconId !== undefined ||
        agencyData.dashboardChatsIconId !== undefined ||
        agencyData.dashboardPayrollIconId !== undefined ||
        agencyData.dashboardBillingIconId !== undefined
      ) {
        try {
          const [cols] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME IN ('dashboard_notifications_icon_id','dashboard_communications_icon_id','dashboard_chats_icon_id','dashboard_payroll_icon_id','dashboard_billing_icon_id')"
          );
          const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
          if (agencyData.dashboardNotificationsIconId !== undefined && names.has('dashboard_notifications_icon_id')) {
            updates.push('dashboard_notifications_icon_id = ?');
            values.push(agencyData.dashboardNotificationsIconId || null);
          }
          if (agencyData.dashboardCommunicationsIconId !== undefined && names.has('dashboard_communications_icon_id')) {
            updates.push('dashboard_communications_icon_id = ?');
            values.push(agencyData.dashboardCommunicationsIconId || null);
          }
          if (agencyData.dashboardChatsIconId !== undefined && names.has('dashboard_chats_icon_id')) {
            updates.push('dashboard_chats_icon_id = ?');
            values.push(agencyData.dashboardChatsIconId || null);
          }
          if (agencyData.dashboardPayrollIconId !== undefined && names.has('dashboard_payroll_icon_id')) {
            updates.push('dashboard_payroll_icon_id = ?');
            values.push(agencyData.dashboardPayrollIconId || null);
          }
          if (agencyData.dashboardBillingIconId !== undefined && names.has('dashboard_billing_icon_id')) {
            updates.push('dashboard_billing_icon_id = ?');
            values.push(agencyData.dashboardBillingIconId || null);
          }
        } catch {
          // ignore
        }
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
      myDashboardMyScheduleIconId !== undefined ||
      myDashboardClientsIconId !== undefined ||
      myDashboardOnDemandTrainingIconId !== undefined ||
      myDashboardPayrollIconId !== undefined ||
      myDashboardSubmitIconId !== undefined ||
      myDashboardCommunicationsIconId !== undefined ||
      myDashboardChatsIconId !== undefined ||
      myDashboardNotificationsIconId !== undefined
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
        if (myDashboardMyScheduleIconId !== undefined) {
          updates.push('my_dashboard_my_schedule_icon_id = ?');
          values.push(myDashboardMyScheduleIconId || null);
        }
        if (myDashboardClientsIconId !== undefined) {
          updates.push('my_dashboard_clients_icon_id = ?');
          values.push(myDashboardClientsIconId || null);
        }
        if (myDashboardOnDemandTrainingIconId !== undefined) {
          updates.push('my_dashboard_on_demand_training_icon_id = ?');
          values.push(myDashboardOnDemandTrainingIconId || null);
        }
        if (myDashboardPayrollIconId !== undefined) {
          updates.push('my_dashboard_payroll_icon_id = ?');
          values.push(myDashboardPayrollIconId || null);
        }
        if (myDashboardSubmitIconId !== undefined) {
          updates.push('my_dashboard_submit_icon_id = ?');
          values.push(myDashboardSubmitIconId || null);
        }
        if (myDashboardCommunicationsIconId !== undefined) {
          updates.push('my_dashboard_communications_icon_id = ?');
          values.push(myDashboardCommunicationsIconId || null);
        }
        if (myDashboardChatsIconId !== undefined) {
          updates.push('my_dashboard_chats_icon_id = ?');
          values.push(myDashboardChatsIconId || null);
        }
        if (myDashboardNotificationsIconId !== undefined) {
          updates.push('my_dashboard_notifications_icon_id = ?');
          values.push(myDashboardNotificationsIconId || null);
        }
      }

      // School Portal dashboard card icons (optional)
      let hasSchoolPortalIcons = false;
      let hasSchoolPortalStaffIcon = false;
      let hasParentQr = false;
      let hasParentSign = false;
      let hasUploadPacket = false;
      let hasPublicDocs = false;
      try {
        const [cols] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME IN ('school_portal_providers_icon_id','school_portal_school_staff_icon_id','school_portal_parent_qr_icon_id','school_portal_parent_sign_icon_id','school_portal_upload_packet_icon_id','school_portal_public_documents_icon_id')"
        );
        const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
        hasSchoolPortalIcons = names.has('school_portal_providers_icon_id');
        hasSchoolPortalStaffIcon = names.has('school_portal_school_staff_icon_id');
        hasParentQr = names.has('school_portal_parent_qr_icon_id');
        hasParentSign = names.has('school_portal_parent_sign_icon_id');
        hasUploadPacket = names.has('school_portal_upload_packet_icon_id');
        hasPublicDocs = names.has('school_portal_public_documents_icon_id');
      } catch (e) {
        hasSchoolPortalIcons = false;
        hasSchoolPortalStaffIcon = false;
        hasParentQr = false;
        hasParentSign = false;
        hasUploadPacket = false;
        hasPublicDocs = false;
      }
      if (schoolPortalSchoolStaffIconId !== undefined && !hasSchoolPortalStaffIcon) {
        const err = new Error(
          'Cannot save School staff card icon: database missing agencies.school_portal_school_staff_icon_id. Run database/migrations/291_school_portal_school_staff_card_icon.sql.'
        );
        err.status = 409;
        throw err;
      }
      if (schoolPortalParentQrIconId !== undefined && !hasParentQr) {
        const err = new Error(
          'Cannot save Parent QR code icon: database missing agencies.school_portal_parent_qr_icon_id. Run database/migrations/293_school_portal_parent_packet_cards_icons.sql.'
        );
        err.status = 409;
        throw err;
      }
      if (schoolPortalParentSignIconId !== undefined && !hasParentSign) {
        const err = new Error(
          'Cannot save Parent fill + sign icon: database missing agencies.school_portal_parent_sign_icon_id. Run database/migrations/293_school_portal_parent_packet_cards_icons.sql.'
        );
        err.status = 409;
        throw err;
      }
      if (schoolPortalUploadPacketIconId !== undefined && !hasUploadPacket) {
        const err = new Error(
          'Cannot save Upload packet icon: database missing agencies.school_portal_upload_packet_icon_id. Run database/migrations/293_school_portal_parent_packet_cards_icons.sql.'
        );
        err.status = 409;
        throw err;
      }
      if (schoolPortalPublicDocumentsIconId !== undefined && !hasPublicDocs) {
        const err = new Error(
          'Cannot save Documents icon: database missing agencies.school_portal_public_documents_icon_id. Run database/migrations/303_school_portal_public_documents_card_icon.sql.'
        );
        err.status = 409;
        throw err;
      }
      if (hasSchoolPortalIcons) {
        if (schoolPortalProvidersIconId !== undefined) {
          updates.push('school_portal_providers_icon_id = ?');
          values.push(schoolPortalProvidersIconId || null);
        }
        if (schoolPortalDaysIconId !== undefined) {
          updates.push('school_portal_days_icon_id = ?');
          values.push(schoolPortalDaysIconId || null);
        }
        if (schoolPortalRosterIconId !== undefined) {
          updates.push('school_portal_roster_icon_id = ?');
          values.push(schoolPortalRosterIconId || null);
        }
        if (schoolPortalSkillsGroupsIconId !== undefined) {
          updates.push('school_portal_skills_groups_icon_id = ?');
          values.push(schoolPortalSkillsGroupsIconId || null);
        }
        if (schoolPortalContactAdminIconId !== undefined) {
          updates.push('school_portal_contact_admin_icon_id = ?');
          values.push(schoolPortalContactAdminIconId || null);
        }
        if (hasSchoolPortalStaffIcon && schoolPortalSchoolStaffIconId !== undefined) {
          updates.push('school_portal_school_staff_icon_id = ?');
          values.push(schoolPortalSchoolStaffIconId || null);
        }
        if (hasParentQr && schoolPortalParentQrIconId !== undefined) {
          updates.push('school_portal_parent_qr_icon_id = ?');
          values.push(schoolPortalParentQrIconId || null);
        }
        if (hasParentSign && schoolPortalParentSignIconId !== undefined) {
          updates.push('school_portal_parent_sign_icon_id = ?');
          values.push(schoolPortalParentSignIconId || null);
        }
        if (hasUploadPacket && schoolPortalUploadPacketIconId !== undefined) {
          updates.push('school_portal_upload_packet_icon_id = ?');
          values.push(schoolPortalUploadPacketIconId || null);
        }
        if (hasPublicDocs && schoolPortalPublicDocumentsIconId !== undefined) {
          updates.push('school_portal_public_documents_icon_id = ?');
          values.push(schoolPortalPublicDocumentsIconId || null);
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
    
    // Notification icon overrides (optional columns; some DBs may be partially migrated).
    let hasNotificationIcons = false;
    let hasSupportTicketCreatedIcon = false;
    let hasTicketingOrgTypes = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME IN ('status_expired_icon_id','support_ticket_created_icon_id','ticketing_notification_org_types_json')"
      );
      const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
      hasNotificationIcons = names.has('status_expired_icon_id');
      hasSupportTicketCreatedIcon = names.has('support_ticket_created_icon_id');
      hasTicketingOrgTypes = names.has('ticketing_notification_org_types_json');
    } catch (e) {
      hasNotificationIcons = false;
      hasSupportTicketCreatedIcon = false;
      hasTicketingOrgTypes = false;
    }

    if (supportTicketCreatedIconId !== undefined && !hasSupportTicketCreatedIcon) {
      const err = new Error(
        'Cannot save Support ticket notification icon: database missing agencies.support_ticket_created_icon_id. Run database/migrations/308_support_ticket_notifications.sql.'
      );
      err.status = 409;
      throw err;
    }
    if (ticketingNotificationOrgTypes !== undefined && !hasTicketingOrgTypes) {
      const err = new Error(
        'Cannot save ticketing notification scope: database missing agencies.ticketing_notification_org_types_json. Run database/migrations/308_support_ticket_notifications.sql.'
      );
      err.status = 409;
      throw err;
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

    if (hasSupportTicketCreatedIcon && supportTicketCreatedIconId !== undefined) {
      updates.push('support_ticket_created_icon_id = ?');
      values.push(supportTicketCreatedIconId || null);
    }

    if (hasTicketingOrgTypes && ticketingNotificationOrgTypes !== undefined) {
      updates.push('ticketing_notification_org_types_json = ?');
      values.push(
        ticketingNotificationOrgTypes === null || ticketingNotificationOrgTypes === undefined
          ? null
          : JSON.stringify(ticketingNotificationOrgTypes)
      );
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

    if (publicAvailabilityEnabled !== undefined) {
      let hasPublicAvailabilityEnabled = false;
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agencies' AND COLUMN_NAME = 'public_availability_enabled'"
        );
        hasPublicAvailabilityEnabled = columns.length > 0;
      } catch (e) {
        hasPublicAvailabilityEnabled = false;
      }
      if (hasPublicAvailabilityEnabled) {
        updates.push('public_availability_enabled = ?');
        values.push(Boolean(publicAvailabilityEnabled));
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

