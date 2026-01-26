import pool from '../config/database.js';

class PlatformBranding {
  static async get() {
    try {
      // First check if platform_branding table exists
      let tableExists = false;
      try {
        const [tables] = await pool.execute(
          "SELECT COUNT(*) as count FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding'"
        );
        tableExists = tables[0].count > 0;
      } catch (e) {
        tableExists = false;
      }

      if (!tableExists) {
        // Return default branding if table doesn't exist
        return {
          id: null,
          tagline: 'The gold standard for behavioral health workflows.',
          primary_color: '#C69A2B',
          secondary_color: '#1D2633',
          accent_color: '#3A4C6B',
          success_color: '#2F8F83',
          background_color: '#F3F6FA',
          error_color: '#CC3D3D',
          warning_color: '#E6A700',
          header_font: 'Inter',
          body_font: 'Source Sans 3',
          numeric_font: 'IBM Plex Mono',
          display_font: 'Montserrat',
          people_ops_term: 'People Operations'
        };
      }

      // Check if dashboard action icon columns exist
      let hasDashboardIcons = false;
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'manage_agencies_icon_id'"
        );
        hasDashboardIcons = columns.length > 0;
      } catch (e) {
        hasDashboardIcons = false;
      }

      // Check if font_id columns exist
      let hasFontIds = false;
      try {
        const [fontColumns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'header_font_id'"
        );
        hasFontIds = fontColumns.length > 0;
      } catch (e) {
        hasFontIds = false;
      }

      let query;
      if (hasDashboardIcons) {
      // Check if manage_clients_icon_id exists (optional)
      let hasManageClientsIcon = false;
      try {
        const [cols] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'manage_clients_icon_id'"
        );
        hasManageClientsIcon = cols.length > 0;
      } catch (e) {
        hasManageClientsIcon = false;
      }

      // Check if extra dashboard quick-action icons exist (optional)
      let hasExtraDashboardQuickActionIcons = false;
      let hasExternalCalendarAuditIcon = false;
      try {
        const [cols] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME IN ('dashboard_notifications_icon_id','external_calendar_audit_icon_id')"
        );
        const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
        hasExtraDashboardQuickActionIcons = names.has('dashboard_notifications_icon_id');
        hasExternalCalendarAuditIcon = names.has('external_calendar_audit_icon_id');
      } catch (e) {
        hasExtraDashboardQuickActionIcons = false;
        hasExternalCalendarAuditIcon = false;
      }
      // Check if organization fields exist
      let hasOrgFields = false;
      try {
        const [orgColumns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'organization_name'"
        );
        hasOrgFields = orgColumns.length > 0;
      } catch (e) {
        hasOrgFields = false;
      }

        // Join with icons table to get icon file paths
        let fontJoins = '';
        let fontSelects = '';
        if (hasFontIds) {
          fontJoins = `
          LEFT JOIN fonts hf ON pb.header_font_id = hf.id
          LEFT JOIN fonts bf ON pb.body_font_id = bf.id
          LEFT JOIN fonts nf ON pb.numeric_font_id = nf.id
          LEFT JOIN fonts df ON pb.display_font_id = df.id`;
          fontSelects = `,
          hf.name as header_font_name, hf.family_name as header_font_family, hf.file_path as header_font_path,
          bf.name as body_font_name, bf.family_name as body_font_family, bf.file_path as body_font_path,
          nf.name as numeric_font_name, nf.family_name as numeric_font_family, nf.file_path as numeric_font_path,
          df.name as display_font_name, df.family_name as display_font_family, df.file_path as display_font_path`;
        }
        let orgSelects = '';
        let orgJoins = '';
        if (hasOrgFields) {
          orgSelects = `,
          org_i.file_path as organization_logo_path, org_i.name as organization_logo_name`;
          orgJoins = `
          LEFT JOIN icons org_i ON pb.organization_logo_icon_id = org_i.id`;
        }
        
        // Check if settings icon columns exist and add joins
        let settingsIconSelects = '';
        let settingsIconJoins = '';
        try {
          const [settingsIconColumns] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'company_profile_icon_id'"
          );
          if (settingsIconColumns.length > 0) {
            settingsIconSelects = `,
          cp_i.file_path as company_profile_icon_path, cp_i.name as company_profile_icon_name,
          tr_i.file_path as team_roles_icon_path, tr_i.name as team_roles_icon_name,
          b_i.file_path as billing_icon_path, b_i.name as billing_icon_name,
          pkg_i.file_path as packages_icon_path, pkg_i.name as packages_icon_name,
          ci_i.file_path as checklist_items_icon_path, ci_i.name as checklist_items_icon_name,
          fd_i.file_path as field_definitions_icon_path, fd_i.name as field_definitions_icon_name,
          bt_i.file_path as branding_templates_icon_path, bt_i.name as branding_templates_icon_name,
          a_i.file_path as assets_icon_path, a_i.name as assets_icon_name,
          comm_i.file_path as communications_icon_path, comm_i.name as communications_icon_name,
          int_i.file_path as integrations_icon_path, int_i.name as integrations_icon_name,
          arch_i.file_path as archive_icon_path, arch_i.name as archive_icon_name`;
            settingsIconJoins = `
          LEFT JOIN icons cp_i ON pb.company_profile_icon_id = cp_i.id
          LEFT JOIN icons tr_i ON pb.team_roles_icon_id = tr_i.id
          LEFT JOIN icons b_i ON pb.billing_icon_id = b_i.id
          LEFT JOIN icons pkg_i ON pb.packages_icon_id = pkg_i.id
          LEFT JOIN icons ci_i ON pb.checklist_items_icon_id = ci_i.id
          LEFT JOIN icons fd_i ON pb.field_definitions_icon_id = fd_i.id
          LEFT JOIN icons bt_i ON pb.branding_templates_icon_id = bt_i.id
          LEFT JOIN icons a_i ON pb.assets_icon_id = a_i.id
          LEFT JOIN icons comm_i ON pb.communications_icon_id = comm_i.id
          LEFT JOIN icons int_i ON pb.integrations_icon_id = int_i.id
          LEFT JOIN icons arch_i ON pb.archive_icon_id = arch_i.id`;
          }
        } catch (e) {
          // Settings icon columns don't exist yet, skip
        }

        // Check if "My Dashboard" card icon columns exist and add joins
        let myDashboardIconSelects = '';
        let myDashboardIconJoins = '';
        try {
          const [myDashColumns] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'my_dashboard_checklist_icon_id'"
          );
          if (myDashColumns.length > 0) {
            myDashboardIconSelects = `,
          mdc_i.file_path as my_dashboard_checklist_icon_path, mdc_i.name as my_dashboard_checklist_icon_name,
          mdt_i.file_path as my_dashboard_training_icon_path, mdt_i.name as my_dashboard_training_icon_name,
          mdd_i.file_path as my_dashboard_documents_icon_path, mdd_i.name as my_dashboard_documents_icon_name,
          mdm_i.file_path as my_dashboard_my_account_icon_path, mdm_i.name as my_dashboard_my_account_icon_name,
          mdod_i.file_path as my_dashboard_on_demand_training_icon_path, mdod_i.name as my_dashboard_on_demand_training_icon_name,
          mdp_i.file_path as my_dashboard_payroll_icon_path, mdp_i.name as my_dashboard_payroll_icon_name,
          mds_i.file_path as my_dashboard_submit_icon_path, mds_i.name as my_dashboard_submit_icon_name`;
            myDashboardIconJoins = `
          LEFT JOIN icons mdc_i ON pb.my_dashboard_checklist_icon_id = mdc_i.id
          LEFT JOIN icons mdt_i ON pb.my_dashboard_training_icon_id = mdt_i.id
          LEFT JOIN icons mdd_i ON pb.my_dashboard_documents_icon_id = mdd_i.id
          LEFT JOIN icons mdm_i ON pb.my_dashboard_my_account_icon_id = mdm_i.id
          LEFT JOIN icons mdod_i ON pb.my_dashboard_on_demand_training_icon_id = mdod_i.id
          LEFT JOIN icons mdp_i ON pb.my_dashboard_payroll_icon_id = mdp_i.id
          LEFT JOIN icons mds_i ON pb.my_dashboard_submit_icon_id = mds_i.id`;
          }
        } catch (e) {
          // "My Dashboard" icon columns don't exist yet, skip
        }
        
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
          LEFT JOIN icons dn_i ON pb.dashboard_notifications_icon_id = dn_i.id
          LEFT JOIN icons dcomm_i ON pb.dashboard_communications_icon_id = dcomm_i.id
          LEFT JOIN icons dchats_i ON pb.dashboard_chats_icon_id = dchats_i.id
          LEFT JOIN icons dpay_i ON pb.dashboard_payroll_icon_id = dpay_i.id
          LEFT JOIN icons dbill_i ON pb.dashboard_billing_icon_id = dbill_i.id`
          : '';

        const extCalSelects = hasExternalCalendarAuditIcon
          ? `,
          eca_i.file_path as external_calendar_audit_icon_path, eca_i.name as external_calendar_audit_icon_name`
          : '';

        const extCalJoins = hasExternalCalendarAuditIcon
          ? `
          LEFT JOIN icons eca_i ON pb.external_calendar_audit_icon_id = eca_i.id`
          : '';

        query = `SELECT pb.*,
          ${hasManageClientsIcon ? 'mc_i.file_path as manage_clients_icon_path, mc_i.name as manage_clients_icon_name,' : ''}
          ma_i.file_path as manage_agencies_icon_path, ma_i.name as manage_agencies_icon_name,
          mm_i.file_path as manage_modules_icon_path, mm_i.name as manage_modules_icon_name,
          md_i.file_path as manage_documents_icon_path, md_i.name as manage_documents_icon_name,
          mu_i.file_path as manage_users_icon_path, mu_i.name as manage_users_icon_name,
          ps_i.file_path as platform_settings_icon_path, ps_i.name as platform_settings_icon_name,
          vap_i.file_path as view_all_progress_icon_path, vap_i.name as view_all_progress_icon_name,
          pd_i.file_path as progress_dashboard_icon_path, pd_i.name as progress_dashboard_icon_name,
          s_i.file_path as settings_icon_path, s_i.name as settings_icon_name,
          mb_i.file_path as master_brand_icon_path, mb_i.name as master_brand_icon_name,
          aan_i.file_path as all_agencies_notifications_icon_path, aan_i.name as all_agencies_notifications_icon_name${extraDashSelects}${extCalSelects}${fontSelects}${orgSelects}${settingsIconSelects}${myDashboardIconSelects}
          FROM platform_branding pb
          ${hasManageClientsIcon ? 'LEFT JOIN icons mc_i ON pb.manage_clients_icon_id = mc_i.id' : ''}
          LEFT JOIN icons ma_i ON pb.manage_agencies_icon_id = ma_i.id
          LEFT JOIN icons mm_i ON pb.manage_modules_icon_id = mm_i.id
          LEFT JOIN icons md_i ON pb.manage_documents_icon_id = md_i.id
          LEFT JOIN icons mu_i ON pb.manage_users_icon_id = mu_i.id
          LEFT JOIN icons ps_i ON pb.platform_settings_icon_id = ps_i.id
          LEFT JOIN icons vap_i ON pb.view_all_progress_icon_id = vap_i.id
          LEFT JOIN icons pd_i ON pb.progress_dashboard_icon_id = pd_i.id
          LEFT JOIN icons s_i ON pb.settings_icon_id = s_i.id
          LEFT JOIN icons mb_i ON pb.master_brand_icon_id = mb_i.id
          LEFT JOIN icons aan_i ON pb.all_agencies_notifications_icon_id = aan_i.id${extraDashJoins}${extCalJoins}${orgJoins}${fontJoins}${settingsIconJoins}${myDashboardIconJoins}
          ORDER BY pb.id DESC LIMIT 1`;
      } else {
        // Even if dashboard icons don't exist, try to include master brand icon if column exists
        // Check if master_brand_icon_id column exists
        let hasMasterBrandIcon = false;
        try {
          const [masterBrandColumns] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'master_brand_icon_id'"
          );
          hasMasterBrandIcon = masterBrandColumns.length > 0;
        } catch (e) {
          hasMasterBrandIcon = false;
        }
        
        if (hasMasterBrandIcon) {
          query = `SELECT pb.*,
            mb_i.file_path as master_brand_icon_path, mb_i.name as master_brand_icon_name
            FROM platform_branding pb
            LEFT JOIN icons mb_i ON pb.master_brand_icon_id = mb_i.id
            ORDER BY pb.id DESC LIMIT 1`;
        } else {
          query = 'SELECT * FROM platform_branding ORDER BY id DESC LIMIT 1';
        }
      }

      let rows;
      try {
        [rows] = await pool.execute(query);
      } catch (queryError) {
        // If query fails (e.g., columns don't exist), try simple query
        if (queryError.message.includes('Unknown column') || queryError.code === 'ER_BAD_FIELD_ERROR') {
          console.warn('PlatformBranding.get: Dashboard icon columns may not exist, using simple query');
          // Even in fallback, try to include master brand icon if column exists
          let hasMasterBrandIcon = false;
          try {
            const [masterBrandColumns] = await pool.execute(
              "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'master_brand_icon_id'"
            );
            hasMasterBrandIcon = masterBrandColumns.length > 0;
          } catch (e) {
            hasMasterBrandIcon = false;
          }
          
          if (hasMasterBrandIcon) {
            try {
              [rows] = await pool.execute(`SELECT pb.*,
                mb_i.file_path as master_brand_icon_path, mb_i.name as master_brand_icon_name
                FROM platform_branding pb
                LEFT JOIN icons mb_i ON pb.master_brand_icon_id = mb_i.id
                ORDER BY pb.id DESC LIMIT 1`);
            } catch (e) {
              // If that also fails, use simple query
              [rows] = await pool.execute('SELECT * FROM platform_branding ORDER BY id DESC LIMIT 1');
            }
          } else {
            [rows] = await pool.execute('SELECT * FROM platform_branding ORDER BY id DESC LIMIT 1');
          }
        } else {
          throw queryError;
        }
      }
      
      if (rows.length === 0) {
        // Return default branding if none exists
        return {
          id: null,
          tagline: 'The gold standard for behavioral health workflows.',
          primary_color: '#C69A2B',
          secondary_color: '#1D2633',
          accent_color: '#3A4C6B',
          success_color: '#2F8F83',
          background_color: '#F3F6FA',
          error_color: '#CC3D3D',
          warning_color: '#E6A700',
          header_font: 'Inter',
          body_font: 'Source Sans 3',
          numeric_font: 'IBM Plex Mono',
          display_font: 'Montserrat',
          people_ops_term: 'People Operations'
        };
      }
      
      const result = rows[0];
      
      // Log what columns we got back (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log('PlatformBranding.get: Result keys:', Object.keys(result || {}));
        console.log('PlatformBranding.get: Icon ID fields:', {
          training_focus: result?.training_focus_default_icon_id,
          module: result?.module_default_icon_id,
          user: result?.user_default_icon_id,
          document: result?.document_default_icon_id,
          master_brand: result?.master_brand_icon_id
        });
        console.log('PlatformBranding.get: Dashboard icon paths:', {
          manage_agencies: result?.manage_agencies_icon_path,
          manage_modules: result?.manage_modules_icon_path,
          manage_documents: result?.manage_documents_icon_path,
          manage_users: result?.manage_users_icon_path,
          master_brand: result?.master_brand_icon_path
        });
      }
      
      return result;
    } catch (error) {
      console.error('PlatformBranding.get: Error:', error);
      // If table doesn't exist, return defaults
      if (error.code === 'ER_NO_SUCH_TABLE' || error.message.includes('doesn\'t exist')) {
        return {
          id: null,
          tagline: 'The gold standard for behavioral health workflows.',
          primary_color: '#C69A2B',
          secondary_color: '#1D2633',
          accent_color: '#3A4C6B',
          success_color: '#2F8F83',
          background_color: '#F3F6FA',
          error_color: '#CC3D3D',
          warning_color: '#E6A700',
          header_font: 'Inter',
          body_font: 'Source Sans 3',
          numeric_font: 'IBM Plex Mono',
          display_font: 'Montserrat',
          people_ops_term: 'People Operations'
        };
      }
      throw error;
    }
  }

  static async update(brandingData, userId) {
    const {
      tagline,
      primaryColor,
      secondaryColor,
      accentColor,
      successColor,
      backgroundColor,
      errorColor,
      warningColor,
      headerFont,
      bodyFont,
      numericFont,
      displayFont,
      headerFontId,
      bodyFontId,
      numericFontId,
      displayFontId,
      peopleOpsTerm,
      trainingFocusDefaultIconId,
      moduleDefaultIconId,
      userDefaultIconId,
      documentDefaultIconId,
      masterBrandIconId,
      manageClientsIconId,
      manageAgenciesIconId,
      manageModulesIconId,
      manageDocumentsIconId,
      manageUsersIconId,
      platformSettingsIconId,
      viewAllProgressIconId,
      progressDashboardIconId,
      settingsIconId,
      dashboardNotificationsIconId,
      dashboardCommunicationsIconId,
      dashboardChatsIconId,
      dashboardPayrollIconId,
      dashboardBillingIconId,
      externalCalendarAuditIconId,
        myDashboardChecklistIconId,
        myDashboardTrainingIconId,
        myDashboardDocumentsIconId,
        myDashboardMyAccountIconId,
        myDashboardOnDemandTrainingIconId,
        myDashboardPayrollIconId,
        myDashboardSubmitIconId,
      allAgenciesNotificationsIconId,
      organizationName,
      organizationLogoIconId,
      organizationLogoUrl,
      organizationLogoPath,
      companyProfileIconId,
      teamRolesIconId,
      billingIconId,
      packagesIconId,
      checklistItemsIconId,
      fieldDefinitionsIconId,
      brandingTemplatesIconId,
      assetsIconId,
      communicationsIconId,
      integrationsIconId,
      archiveIconId,
      defaultBrandingTemplateId,
      currentBrandingTemplateId
    } = brandingData;

    // Check if branding exists
    const existing = await this.get();
    
    if (existing.id) {
      // Build update query dynamically to handle optional icon fields
      const updates = [];
      const values = [];
      
      if (tagline !== undefined) { updates.push('tagline = ?'); values.push(tagline); }
      if (primaryColor !== undefined) { updates.push('primary_color = ?'); values.push(primaryColor); }
      if (secondaryColor !== undefined) { updates.push('secondary_color = ?'); values.push(secondaryColor); }
      if (accentColor !== undefined) { updates.push('accent_color = ?'); values.push(accentColor); }
      if (successColor !== undefined) { updates.push('success_color = ?'); values.push(successColor); }
      if (backgroundColor !== undefined) { updates.push('background_color = ?'); values.push(backgroundColor); }
      if (errorColor !== undefined) { updates.push('error_color = ?'); values.push(errorColor); }
      if (warningColor !== undefined) { updates.push('warning_color = ?'); values.push(warningColor); }
      // Check if font_id columns exist
      let hasFontIds = false;
      try {
        const [fontColumns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'header_font_id'"
        );
        hasFontIds = fontColumns.length > 0;
      } catch (e) {
        hasFontIds = false;
      }

      // Support both font_id (new) and font name (old) for backward compatibility
      if (hasFontIds) {
        if (headerFontId !== undefined) { updates.push('header_font_id = ?'); values.push(headerFontId || null); }
        if (bodyFontId !== undefined) { updates.push('body_font_id = ?'); values.push(bodyFontId || null); }
        if (numericFontId !== undefined) { updates.push('numeric_font_id = ?'); values.push(numericFontId || null); }
        if (displayFontId !== undefined) { updates.push('display_font_id = ?'); values.push(displayFontId || null); }
      }
      // Keep old font name columns for backward compatibility
      if (headerFont !== undefined) { updates.push('header_font = ?'); values.push(headerFont); }
      if (bodyFont !== undefined) { updates.push('body_font = ?'); values.push(bodyFont); }
      if (numericFont !== undefined) { updates.push('numeric_font = ?'); values.push(numericFont); }
      if (displayFont !== undefined) { updates.push('display_font = ?'); values.push(displayFont); }
      // Check if people_ops_term column exists
      let hasPeopleOpsTerm = true;
      try {
        const [peopleOpsColumns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'people_ops_term'"
        );
        hasPeopleOpsTerm = peopleOpsColumns.length > 0;
      } catch (e) {
        hasPeopleOpsTerm = false;
      }
      
      if (hasPeopleOpsTerm && peopleOpsTerm !== undefined) { 
        updates.push('people_ops_term = ?'); 
        values.push(peopleOpsTerm); 
      }
      
      // Check if default icon columns exist
      let hasDefaultIcons = false;
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'training_focus_default_icon_id'"
        );
        hasDefaultIcons = columns.length > 0;
      } catch (e) {
        hasDefaultIcons = false;
      }
      
      if (hasDefaultIcons) {
        if (trainingFocusDefaultIconId !== undefined) { 
          updates.push('training_focus_default_icon_id = ?'); 
          values.push(trainingFocusDefaultIconId || null);
          console.log('PlatformBranding.update: Setting training_focus_default_icon_id to:', trainingFocusDefaultIconId || null);
        }
        if (moduleDefaultIconId !== undefined) { 
          updates.push('module_default_icon_id = ?'); 
          values.push(moduleDefaultIconId || null);
          console.log('PlatformBranding.update: Setting module_default_icon_id to:', moduleDefaultIconId || null);
        }
        if (userDefaultIconId !== undefined) { 
          updates.push('user_default_icon_id = ?'); 
          values.push(userDefaultIconId || null);
          console.log('PlatformBranding.update: Setting user_default_icon_id to:', userDefaultIconId || null);
        }
        if (documentDefaultIconId !== undefined) { 
          updates.push('document_default_icon_id = ?'); 
          values.push(documentDefaultIconId || null);
          console.log('PlatformBranding.update: Setting document_default_icon_id to:', documentDefaultIconId || null);
        }
        
        // Check if master_brand_icon_id column exists and handle it
        if (masterBrandIconId !== undefined) {
          try {
            const [masterBrandColumns] = await pool.execute(
              "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'master_brand_icon_id'"
            );
            if (masterBrandColumns.length > 0) {
              updates.push('master_brand_icon_id = ?');
              values.push(masterBrandIconId ?? null);
              console.log('PlatformBranding.update: Setting master_brand_icon_id to:', masterBrandIconId ?? null);
            } else {
              console.warn('PlatformBranding.update: master_brand_icon_id column does not exist. Migration 053 may not have run.');
            }
          } catch (e) {
            console.warn('PlatformBranding.update: Error checking for master_brand_icon_id column:', e.message);
          }
        }
      } else {
        console.warn('PlatformBranding.update: Default icon columns do not exist in database. Migration 041 may not have run.');
      }
      
      // Check if dashboard action icon columns exist
      let hasDashboardIcons = false;
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'manage_agencies_icon_id'"
        );
        hasDashboardIcons = columns.length > 0;
      } catch (e) {
        hasDashboardIcons = false;
      }
      
      if (hasDashboardIcons) {
        if (manageClientsIconId !== undefined) {
          // Optional column; keep best-effort for older DBs.
          try {
            const [cols] = await pool.execute(
              "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'manage_clients_icon_id'"
            );
            if ((cols || []).length > 0) {
              updates.push('manage_clients_icon_id = ?');
              values.push(manageClientsIconId ?? null);
              console.log('PlatformBranding.update: Setting manage_clients_icon_id to:', manageClientsIconId ?? null);
            }
          } catch (e) {
            console.warn('PlatformBranding.update: Error checking for manage_clients_icon_id column:', e.message);
          }
        }

        if (
          dashboardNotificationsIconId !== undefined ||
          dashboardCommunicationsIconId !== undefined ||
          dashboardChatsIconId !== undefined ||
          dashboardPayrollIconId !== undefined ||
          dashboardBillingIconId !== undefined
        ) {
          try {
            const [cols] = await pool.execute(
              "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME IN ('dashboard_notifications_icon_id','dashboard_communications_icon_id','dashboard_chats_icon_id','dashboard_payroll_icon_id','dashboard_billing_icon_id')"
            );
            const names = new Set((cols || []).map((c) => c.COLUMN_NAME));
            if (dashboardNotificationsIconId !== undefined && names.has('dashboard_notifications_icon_id')) {
              updates.push('dashboard_notifications_icon_id = ?');
              values.push(dashboardNotificationsIconId ?? null);
            }
            if (dashboardCommunicationsIconId !== undefined && names.has('dashboard_communications_icon_id')) {
              updates.push('dashboard_communications_icon_id = ?');
              values.push(dashboardCommunicationsIconId ?? null);
            }
            if (dashboardChatsIconId !== undefined && names.has('dashboard_chats_icon_id')) {
              updates.push('dashboard_chats_icon_id = ?');
              values.push(dashboardChatsIconId ?? null);
            }
            if (dashboardPayrollIconId !== undefined && names.has('dashboard_payroll_icon_id')) {
              updates.push('dashboard_payroll_icon_id = ?');
              values.push(dashboardPayrollIconId ?? null);
            }
            if (dashboardBillingIconId !== undefined && names.has('dashboard_billing_icon_id')) {
              updates.push('dashboard_billing_icon_id = ?');
              values.push(dashboardBillingIconId ?? null);
            }
          } catch (e) {
            console.warn('PlatformBranding.update: Error checking for dashboard quick action icon columns:', e.message);
          }
        }
        if (manageAgenciesIconId !== undefined) { 
          updates.push('manage_agencies_icon_id = ?'); 
          values.push(manageAgenciesIconId ?? null);
          console.log('PlatformBranding.update: Setting manage_agencies_icon_id to:', manageAgenciesIconId ?? null);
        }
        if (manageModulesIconId !== undefined) { 
          updates.push('manage_modules_icon_id = ?'); 
          values.push(manageModulesIconId ?? null);
          console.log('PlatformBranding.update: Setting manage_modules_icon_id to:', manageModulesIconId ?? null);
        }
        if (manageDocumentsIconId !== undefined) { 
          updates.push('manage_documents_icon_id = ?'); 
          values.push(manageDocumentsIconId ?? null);
          console.log('PlatformBranding.update: Setting manage_documents_icon_id to:', manageDocumentsIconId ?? null);
        }
        if (manageUsersIconId !== undefined) { 
          updates.push('manage_users_icon_id = ?'); 
          values.push(manageUsersIconId ?? null);
          console.log('PlatformBranding.update: Setting manage_users_icon_id to:', manageUsersIconId ?? null);
        }
        if (platformSettingsIconId !== undefined) { 
          updates.push('platform_settings_icon_id = ?'); 
          values.push(platformSettingsIconId ?? null);
          console.log('PlatformBranding.update: Setting platform_settings_icon_id to:', platformSettingsIconId ?? null);
        }
        if (viewAllProgressIconId !== undefined) { 
          updates.push('view_all_progress_icon_id = ?'); 
          values.push(viewAllProgressIconId ?? null);
          console.log('PlatformBranding.update: Setting view_all_progress_icon_id to:', viewAllProgressIconId ?? null);
        }
        if (progressDashboardIconId !== undefined) { 
          updates.push('progress_dashboard_icon_id = ?'); 
          values.push(progressDashboardIconId ?? null);
          console.log('PlatformBranding.update: Setting progress_dashboard_icon_id to:', progressDashboardIconId ?? null);
        }
        if (settingsIconId !== undefined) { 
          updates.push('settings_icon_id = ?'); 
          values.push(settingsIconId ?? null);
          console.log('PlatformBranding.update: Setting settings_icon_id to:', settingsIconId ?? null);
        }
      }

      // Check if "My Dashboard" card icon columns exist
      if (
        myDashboardChecklistIconId !== undefined ||
        myDashboardTrainingIconId !== undefined ||
        myDashboardDocumentsIconId !== undefined ||
        myDashboardMyAccountIconId !== undefined ||
        myDashboardOnDemandTrainingIconId !== undefined ||
        myDashboardPayrollIconId !== undefined ||
        myDashboardSubmitIconId !== undefined
      ) {
        try {
          const [myDashColumns] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'my_dashboard_checklist_icon_id'"
          );
          if (myDashColumns.length > 0) {
            if (myDashboardChecklistIconId !== undefined) {
              updates.push('my_dashboard_checklist_icon_id = ?');
              values.push(myDashboardChecklistIconId ?? null);
            }
            if (myDashboardTrainingIconId !== undefined) {
              updates.push('my_dashboard_training_icon_id = ?');
              values.push(myDashboardTrainingIconId ?? null);
            }
            if (myDashboardDocumentsIconId !== undefined) {
              updates.push('my_dashboard_documents_icon_id = ?');
              values.push(myDashboardDocumentsIconId ?? null);
            }
            if (myDashboardMyAccountIconId !== undefined) {
              updates.push('my_dashboard_my_account_icon_id = ?');
              values.push(myDashboardMyAccountIconId ?? null);
            }
            if (myDashboardOnDemandTrainingIconId !== undefined) {
              updates.push('my_dashboard_on_demand_training_icon_id = ?');
              values.push(myDashboardOnDemandTrainingIconId ?? null);
            }
            if (myDashboardPayrollIconId !== undefined) {
              updates.push('my_dashboard_payroll_icon_id = ?');
              values.push(myDashboardPayrollIconId ?? null);
            }
            if (myDashboardSubmitIconId !== undefined) {
              updates.push('my_dashboard_submit_icon_id = ?');
              values.push(myDashboardSubmitIconId ?? null);
            }
          } else {
            console.warn('PlatformBranding.update: My Dashboard icon columns do not exist. Migration 125 may not have run.');
          }
        } catch (e) {
          console.warn('PlatformBranding.update: Error checking for My Dashboard icon columns:', e.message);
        }
      }
      
      // External Calendar Audit quick-action icon (optional)
      if (externalCalendarAuditIconId !== undefined) {
        try {
          const [cols] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'external_calendar_audit_icon_id'"
          );
          if ((cols || []).length > 0) {
            updates.push('external_calendar_audit_icon_id = ?');
            values.push(externalCalendarAuditIconId ?? null);
          }
        } catch {
          // ignore
        }
      }

      // Check if all_agencies_notifications_icon_id column exists (separate from dashboard icons)
      if (allAgenciesNotificationsIconId !== undefined) {
        try {
          const [notificationsIconColumns] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'all_agencies_notifications_icon_id'"
          );
          if (notificationsIconColumns.length > 0) {
            updates.push('all_agencies_notifications_icon_id = ?');
            values.push(allAgenciesNotificationsIconId ?? null);
            console.log('PlatformBranding.update: Setting all_agencies_notifications_icon_id to:', allAgenciesNotificationsIconId ?? null);
          } else {
            console.warn('PlatformBranding.update: all_agencies_notifications_icon_id column does not exist. Migration 061 may not have run.');
          }
        } catch (e) {
          console.warn('PlatformBranding.update: Error checking for all_agencies_notifications_icon_id column:', e.message);
        }
      } else {
        console.warn('PlatformBranding.update: Dashboard icon columns do not exist. Migration 047 may not have run.');
      }
      
      // Branding template state (optional)
      let hasTemplateState = false;
      try {
        const [cols] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'default_branding_template_id'"
        );
        hasTemplateState = (cols || []).length > 0;
      } catch (e) {
        hasTemplateState = false;
      }

      if (hasTemplateState) {
        if (defaultBrandingTemplateId !== undefined) {
          updates.push('default_branding_template_id = ?');
          values.push(defaultBrandingTemplateId ?? null);
        }
        if (currentBrandingTemplateId !== undefined) {
          updates.push('current_branding_template_id = ?');
          values.push(currentBrandingTemplateId ?? null);
        }
      }

      // Check if organization fields exist
      let hasOrgFields = false;
      try {
        const [orgColumns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'organization_name'"
        );
        hasOrgFields = orgColumns.length > 0;
      } catch (e) {
        hasOrgFields = false;
      }
      
      if (hasOrgFields) {
        if (organizationName !== undefined) {
          updates.push('organization_name = ?');
          values.push(organizationName?.trim() || null);
          console.log('PlatformBranding.update: Setting organization_name to:', organizationName?.trim() || null);
        }
        if (organizationLogoIconId !== undefined) {
          updates.push('organization_logo_icon_id = ?');
          values.push(organizationLogoIconId || null);
          console.log('PlatformBranding.update: Setting organization_logo_icon_id to:', organizationLogoIconId || null);
        }
        // Check if organization_logo_url column exists
        try {
          const [logoUrlColumns] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'organization_logo_url'"
          );
          if (logoUrlColumns.length > 0 && organizationLogoUrl !== undefined) {
            updates.push('organization_logo_url = ?');
            values.push(organizationLogoUrl?.trim() || null);
            console.log('PlatformBranding.update: Setting organization_logo_url to:', organizationLogoUrl?.trim() || null);
          }
        } catch (e) {
          console.warn('PlatformBranding.update: Error checking for organization_logo_url column:', e.message);
        }
      }
      
      updates.push('updated_by_user_id = ?');
      values.push(userId);
      values.push(existing.id);
      
      if (updates.length > 1) { // More than just updated_by_user_id
        try {
          await pool.execute(
            `UPDATE platform_branding SET ${updates.join(', ')} WHERE id = ?`,
            values
          );
        } catch (updateError) {
          // If error is about unknown column, it means migration hasn't run yet
          // Try again without dashboard icon columns
          if (updateError.message.includes('Unknown column') || updateError.code === 'ER_BAD_FIELD_ERROR') {
            console.warn('PlatformBranding.update: Some columns may not exist, retrying without dashboard icon columns');
            // Filter out dashboard icon updates and try again
            const filteredUpdates = [];
            const filteredValues = [];
            updates.forEach((update, index) => {
              if (!update.includes('manage_agencies_icon_id') &&
                  !update.includes('manage_modules_icon_id') &&
                  !update.includes('manage_documents_icon_id') &&
                  !update.includes('manage_users_icon_id') &&
                  !update.includes('platform_settings_icon_id') &&
                  !update.includes('view_all_progress_icon_id') &&
                  !update.includes('progress_dashboard_icon_id') &&
                  !update.includes('settings_icon_id') &&
                  !update.includes('my_dashboard_checklist_icon_id') &&
                  !update.includes('my_dashboard_training_icon_id') &&
                  !update.includes('my_dashboard_documents_icon_id') &&
                  !update.includes('my_dashboard_my_account_icon_id') &&
                  !update.includes('my_dashboard_on_demand_training_icon_id')) {
                filteredUpdates.push(update);
                filteredValues.push(values[index]);
              }
            });
            // Add updated_by_user_id back
            filteredUpdates.push('updated_by_user_id = ?');
            filteredValues.push(userId);
            filteredValues.push(existing.id);
            
            if (filteredUpdates.length > 1) {
              await pool.execute(
                `UPDATE platform_branding SET ${filteredUpdates.join(', ')} WHERE id = ?`,
                filteredValues
              );
            }
          } else {
            throw updateError;
          }
        }
      }
    } else {
      // Insert new - build query dynamically based on which columns exist
      // Check if people_ops_term column exists for INSERT
      let hasPeopleOpsTermForInsert = true;
      try {
        const [peopleOpsColumns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'people_ops_term'"
        );
        hasPeopleOpsTermForInsert = peopleOpsColumns.length > 0;
      } catch (e) {
        hasPeopleOpsTermForInsert = false;
      }
      
      // Check if default icon columns exist for INSERT
      let hasDefaultIconsForInsert = false;
      try {
        const [columns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'training_focus_default_icon_id'"
        );
        hasDefaultIconsForInsert = columns.length > 0;
      } catch (e) {
        hasDefaultIconsForInsert = false;
      }
      
      const insertFields = [
        'tagline', 'primary_color', 'secondary_color', 'accent_color',
        'success_color', 'background_color', 'error_color', 'warning_color',
        'header_font', 'body_font', 'numeric_font', 'display_font'
      ];
      const insertValues = [
        tagline, primaryColor, secondaryColor, accentColor,
        successColor, backgroundColor, errorColor, warningColor,
        headerFont, bodyFont, numericFont, displayFont
      ];
      
      if (hasPeopleOpsTermForInsert) {
        insertFields.push('people_ops_term');
        insertValues.push(peopleOpsTerm);
      }
      
      if (hasDefaultIconsForInsert) {
        insertFields.push('training_focus_default_icon_id', 'module_default_icon_id', 'user_default_icon_id', 'document_default_icon_id');
        insertValues.push(
          trainingFocusDefaultIconId || null,
          moduleDefaultIconId || null,
          userDefaultIconId || null,
          documentDefaultIconId || null
        );
        // Check if master_brand_icon_id column exists and add it if it does
        try {
          const [masterBrandColumns] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'master_brand_icon_id'"
          );
          if (masterBrandColumns.length > 0 && masterBrandIconId !== undefined) {
            insertFields.push('master_brand_icon_id');
            insertValues.push(masterBrandIconId || null);
          }
        } catch (e) {
          // Column doesn't exist, skip
        }
      }
      
      // Check if all_agencies_notifications_icon_id column exists for INSERT
      if (allAgenciesNotificationsIconId !== undefined) {
        try {
          const [notificationsIconColumns] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'all_agencies_notifications_icon_id'"
          );
          if (notificationsIconColumns.length > 0) {
            insertFields.push('all_agencies_notifications_icon_id');
            insertValues.push(allAgenciesNotificationsIconId || null);
          }
        } catch (e) {
          // Column doesn't exist, skip
        }
      }

      // External Calendar Audit quick-action icon (optional) - for INSERT
      if (externalCalendarAuditIconId !== undefined) {
        try {
          const [cols] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'external_calendar_audit_icon_id'"
          );
          if ((cols || []).length > 0) {
            insertFields.push('external_calendar_audit_icon_id');
            insertValues.push(externalCalendarAuditIconId || null);
          }
        } catch {
          // ignore
        }
      }
      
      // Check if organization fields exist for INSERT
      let hasOrgFieldsForInsert = false;
      try {
        const [orgColumns] = await pool.execute(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'organization_name'"
        );
        hasOrgFieldsForInsert = orgColumns.length > 0;
      } catch (e) {
        hasOrgFieldsForInsert = false;
      }
      
      if (hasOrgFieldsForInsert) {
        insertFields.push('organization_name');
        insertValues.push(organizationName?.trim() || null);
        
        insertFields.push('organization_logo_icon_id');
        insertValues.push(organizationLogoIconId || null);
        
        // Check if organization_logo_url column exists
        try {
          const [logoUrlColumns] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'organization_logo_url'"
          );
          if (logoUrlColumns.length > 0) {
            insertFields.push('organization_logo_url');
            insertValues.push(organizationLogoUrl?.trim() || null);
          }
        } catch (e) {
          // Column doesn't exist, skip
        }
        
        // Check if organization_logo_path column exists
        try {
          const [logoPathColumns] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'organization_logo_path'"
          );
          if (logoPathColumns.length > 0) {
            insertFields.push('organization_logo_path');
            insertValues.push(organizationLogoPath || null);
          }
        } catch (e) {
          // Column doesn't exist, skip
        }
        
        // Handle settings icon fields for insert
        const settingsIconFields = [
          { field: 'company_profile_icon_id', value: companyProfileIconId },
          { field: 'team_roles_icon_id', value: teamRolesIconId },
          { field: 'billing_icon_id', value: billingIconId },
          { field: 'packages_icon_id', value: packagesIconId },
          { field: 'checklist_items_icon_id', value: checklistItemsIconId },
          { field: 'field_definitions_icon_id', value: fieldDefinitionsIconId },
          { field: 'branding_templates_icon_id', value: brandingTemplatesIconId },
          { field: 'assets_icon_id', value: assetsIconId },
          { field: 'communications_icon_id', value: communicationsIconId },
          { field: 'integrations_icon_id', value: integrationsIconId },
          { field: 'archive_icon_id', value: archiveIconId }
        ];
        
        for (const { field, value } of settingsIconFields) {
          try {
            const [columns] = await pool.execute(
              `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = '${field}'`
            );
            if (columns.length > 0) {
              insertFields.push(field);
              insertValues.push(value === null || value === '' ? null : parseInt(value));
            }
          } catch (e) {
            // Column doesn't exist, skip
          }
        }
      }
      
      insertFields.push('updated_by_user_id');
      insertValues.push(userId);
      
      const placeholders = insertFields.map(() => '?').join(', ');
      
      try {
        await pool.execute(
          `INSERT INTO platform_branding (${insertFields.join(', ')}) VALUES (${placeholders})`,
          insertValues
        );
      } catch (insertError) {
        console.error('PlatformBranding.update: Insert error:', insertError);
        console.error('PlatformBranding.update: Insert error details:', {
          message: insertError.message,
          code: insertError.code,
          sqlMessage: insertError.sqlMessage,
          sql: `INSERT INTO platform_branding (${insertFields.join(', ')}) VALUES (${placeholders})`
        });
        throw insertError;
      }
    }

    return this.get();
  }

  /**
   * Apply template data to platform branding
   * This is a convenience method that merges template data with existing branding
   * @param {Object} templateData - Template data to apply
   * @param {number} userId - User ID applying the template
   * @returns {Promise<Object>} Updated branding
   */
  static async applyTemplateData(templateData, userId) {
    const currentBranding = await this.get();
    
    // Merge template data with current branding
    const updateData = {
      ...currentBranding,
      ...templateData
    };

    // Remove non-updatable fields
    delete updateData.id;
    delete updateData.created_at;
    delete updateData.updated_at;
    delete updateData.updated_by_user_id;

    // Update branding
    return await this.update(updateData, userId);
  }
}

export default PlatformBranding;

