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
          people_ops_term: 'People Operations',
          organization_name: null,
          organization_logo_icon_id: null
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
        query = `SELECT pb.*,
          ma_i.file_path as manage_agencies_icon_path, ma_i.name as manage_agencies_icon_name,
          mm_i.file_path as manage_modules_icon_path, mm_i.name as manage_modules_icon_name,
          md_i.file_path as manage_documents_icon_path, md_i.name as manage_documents_icon_name,
          mu_i.file_path as manage_users_icon_path, mu_i.name as manage_users_icon_name,
          ps_i.file_path as platform_settings_icon_path, ps_i.name as platform_settings_icon_name,
          vap_i.file_path as view_all_progress_icon_path, vap_i.name as view_all_progress_icon_name,
          pd_i.file_path as progress_dashboard_icon_path, pd_i.name as progress_dashboard_icon_name,
          s_i.file_path as settings_icon_path, s_i.name as settings_icon_name,
          mb_i.file_path as master_brand_icon_path, mb_i.name as master_brand_icon_name,
          aan_i.file_path as all_agencies_notifications_icon_path, aan_i.name as all_agencies_notifications_icon_name${fontSelects}${orgSelects}
          FROM platform_branding pb
          LEFT JOIN icons ma_i ON pb.manage_agencies_icon_id = ma_i.id
          LEFT JOIN icons mm_i ON pb.manage_modules_icon_id = mm_i.id
          LEFT JOIN icons md_i ON pb.manage_documents_icon_id = md_i.id
          LEFT JOIN icons mu_i ON pb.manage_users_icon_id = mu_i.id
          LEFT JOIN icons ps_i ON pb.platform_settings_icon_id = ps_i.id
          LEFT JOIN icons vap_i ON pb.view_all_progress_icon_id = vap_i.id
          LEFT JOIN icons pd_i ON pb.progress_dashboard_icon_id = pd_i.id
          LEFT JOIN icons s_i ON pb.settings_icon_id = s_i.id
          LEFT JOIN icons mb_i ON pb.master_brand_icon_id = mb_i.id
          LEFT JOIN icons aan_i ON pb.all_agencies_notifications_icon_id = aan_i.id${orgJoins}${fontJoins}
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
          people_ops_term: 'People Operations',
          organization_name: null,
          organization_logo_icon_id: null
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
          people_ops_term: 'People Operations',
          organization_name: null,
          organization_logo_icon_id: null
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
      manageAgenciesIconId,
      manageModulesIconId,
      manageDocumentsIconId,
      manageUsersIconId,
      platformSettingsIconId,
      viewAllProgressIconId,
      progressDashboardIconId,
      settingsIconId,
      allAgenciesNotificationsIconId,
      organizationName,
      organizationLogoIconId
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
      
      // Check if organization fields exist and update them
      if (organizationName !== undefined || organizationLogoIconId !== undefined) {
        try {
          const [orgColumns] = await pool.execute(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'platform_branding' AND COLUMN_NAME = 'organization_name'"
          );
          if (orgColumns.length > 0) {
            if (organizationName !== undefined) {
              updates.push('organization_name = ?');
              values.push(organizationName || null);
            }
            if (organizationLogoIconId !== undefined) {
              updates.push('organization_logo_icon_id = ?');
              values.push(organizationLogoIconId || null);
            }
          } else {
            console.warn('PlatformBranding.update: organization_name column does not exist. Migration 092 may not have run.');
          }
        } catch (e) {
          console.warn('PlatformBranding.update: Error checking for organization fields:', e.message);
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
                  !update.includes('settings_icon_id')) {
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

