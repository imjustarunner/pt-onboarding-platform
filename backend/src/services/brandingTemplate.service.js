import PlatformBranding from '../models/PlatformBranding.model.js';
import Agency from '../models/Agency.model.js';

class BrandingTemplateService {
  /**
   * Extract selective branding data from current branding settings
   * @param {Object} branding - Current branding object (platform or agency)
   * @param {Object} includeFields - Object with boolean flags for what to include
   * @returns {Object} Extracted branding data
   */
  static extractBrandingData(branding, includeFields = {}) {
    const extracted = {};

    if (!branding) {
      console.warn('extractBrandingData: branding object is null or undefined');
      return extracted;
    }

    // Colors
    if (includeFields.colors) {
      if (includeFields.primaryColor !== false && branding.primary_color) extracted.primary_color = branding.primary_color;
      if (includeFields.secondaryColor !== false && branding.secondary_color) extracted.secondary_color = branding.secondary_color;
      if (includeFields.accentColor !== false && branding.accent_color) extracted.accent_color = branding.accent_color;
      if (includeFields.successColor !== false && branding.success_color) extracted.success_color = branding.success_color;
      if (includeFields.errorColor !== false && branding.error_color) extracted.error_color = branding.error_color;
      if (includeFields.warningColor !== false && branding.warning_color) extracted.warning_color = branding.warning_color;
      if (includeFields.backgroundColor !== false && branding.background_color) extracted.background_color = branding.background_color;
    }

    // Fonts
    if (includeFields.fonts) {
      // Support both font_id (new) and font name (old) for backward compatibility
      if (includeFields.headerFont !== false) {
        if (branding.header_font_id) extracted.header_font_id = branding.header_font_id;
        if (branding.header_font) extracted.header_font = branding.header_font; // Keep for backward compatibility
      }
      if (includeFields.bodyFont !== false) {
        if (branding.body_font_id) extracted.body_font_id = branding.body_font_id;
        if (branding.body_font) extracted.body_font = branding.body_font; // Keep for backward compatibility
      }
      if (includeFields.numericFont !== false) {
        if (branding.numeric_font_id) extracted.numeric_font_id = branding.numeric_font_id;
        if (branding.numeric_font) extracted.numeric_font = branding.numeric_font; // Keep for backward compatibility
      }
      if (includeFields.displayFont !== false) {
        if (branding.display_font_id) extracted.display_font_id = branding.display_font_id;
        if (branding.display_font) extracted.display_font = branding.display_font; // Keep for backward compatibility
      }
    }

    // Icons
    if (includeFields.icons) {
      // Default icons
      if (includeFields.trainingFocusDefaultIcon !== false && branding.training_focus_default_icon_id) extracted.training_focus_default_icon_id = branding.training_focus_default_icon_id;
      if (includeFields.moduleDefaultIcon !== false && branding.module_default_icon_id) extracted.module_default_icon_id = branding.module_default_icon_id;
      if (includeFields.userDefaultIcon !== false && branding.user_default_icon_id) extracted.user_default_icon_id = branding.user_default_icon_id;
      if (includeFields.documentDefaultIcon !== false && branding.document_default_icon_id) extracted.document_default_icon_id = branding.document_default_icon_id;

      if (includeFields.manageAgenciesIcon !== false && branding.manage_agencies_icon_id) extracted.manage_agencies_icon_id = branding.manage_agencies_icon_id;
      if (includeFields.manageModulesIcon !== false && branding.manage_modules_icon_id) extracted.manage_modules_icon_id = branding.manage_modules_icon_id;
      if (includeFields.manageDocumentsIcon !== false && branding.manage_documents_icon_id) extracted.manage_documents_icon_id = branding.manage_documents_icon_id;
      if (includeFields.manageUsersIcon !== false && branding.manage_users_icon_id) extracted.manage_users_icon_id = branding.manage_users_icon_id;
      if (includeFields.platformSettingsIcon !== false && branding.platform_settings_icon_id) extracted.platform_settings_icon_id = branding.platform_settings_icon_id;
      if (includeFields.viewAllProgressIcon !== false && branding.view_all_progress_icon_id) extracted.view_all_progress_icon_id = branding.view_all_progress_icon_id;
      if (includeFields.progressDashboardIcon !== false && branding.progress_dashboard_icon_id) extracted.progress_dashboard_icon_id = branding.progress_dashboard_icon_id;
      if (includeFields.settingsIcon !== false && branding.settings_icon_id) extracted.settings_icon_id = branding.settings_icon_id;
      if (includeFields.masterBrandIcon !== false && branding.master_brand_icon_id) extracted.master_brand_icon_id = branding.master_brand_icon_id;
      if (includeFields.allAgenciesNotificationsIcon !== false && branding.all_agencies_notifications_icon_id) extracted.all_agencies_notifications_icon_id = branding.all_agencies_notifications_icon_id;

      // Settings navigation icons
      if (includeFields.companyProfileIcon !== false && branding.company_profile_icon_id) extracted.company_profile_icon_id = branding.company_profile_icon_id;
      if (includeFields.teamRolesIcon !== false && branding.team_roles_icon_id) extracted.team_roles_icon_id = branding.team_roles_icon_id;
      if (includeFields.billingIcon !== false && branding.billing_icon_id) extracted.billing_icon_id = branding.billing_icon_id;
      if (includeFields.packagesIcon !== false && branding.packages_icon_id) extracted.packages_icon_id = branding.packages_icon_id;
      if (includeFields.checklistItemsIcon !== false && branding.checklist_items_icon_id) extracted.checklist_items_icon_id = branding.checklist_items_icon_id;
      if (includeFields.fieldDefinitionsIcon !== false && branding.field_definitions_icon_id) extracted.field_definitions_icon_id = branding.field_definitions_icon_id;
      if (includeFields.brandingTemplatesIcon !== false && branding.branding_templates_icon_id) extracted.branding_templates_icon_id = branding.branding_templates_icon_id;
      if (includeFields.assetsIcon !== false && branding.assets_icon_id) extracted.assets_icon_id = branding.assets_icon_id;
      if (includeFields.communicationsIcon !== false && branding.communications_icon_id) extracted.communications_icon_id = branding.communications_icon_id;
      if (includeFields.integrationsIcon !== false && branding.integrations_icon_id) extracted.integrations_icon_id = branding.integrations_icon_id;
      if (includeFields.archiveIcon !== false && branding.archive_icon_id) extracted.archive_icon_id = branding.archive_icon_id;
    }

    // Tagline
    if (includeFields.tagline && branding.tagline) {
      extracted.tagline = branding.tagline;
    }

    // Terminology (for agencies)
    if (includeFields.terminology && branding.people_ops_term) {
      extracted.people_ops_term = branding.people_ops_term;
    }

    console.log('extractBrandingData result:', {
      includeFields,
      extractedKeys: Object.keys(extracted),
      extracted: extracted
    });

    return extracted;
  }

  /**
   * Apply template data to target branding
   * @param {Object} templateData - Template data to apply
   * @param {string} targetScope - 'platform' or 'agency'
   * @param {number|null} targetAgencyId - Agency ID if targetScope is 'agency'
   * @returns {Promise<Object>} Updated branding object
   */
  static async applyBrandingData(templateData, targetScope, targetAgencyId = null, userId = null) {
    if (targetScope === 'platform') {
      // Get current platform branding
      const currentBranding = await PlatformBranding.get();
      
      // Map template data keys to PlatformBranding.update expected format
      const updateData = {};
      
      // Colors
      if (templateData.primary_color !== undefined) updateData.primaryColor = templateData.primary_color;
      if (templateData.secondary_color !== undefined) updateData.secondaryColor = templateData.secondary_color;
      if (templateData.accent_color !== undefined) updateData.accentColor = templateData.accent_color;
      if (templateData.success_color !== undefined) updateData.successColor = templateData.success_color;
      if (templateData.error_color !== undefined) updateData.errorColor = templateData.error_color;
      if (templateData.warning_color !== undefined) updateData.warningColor = templateData.warning_color;
      if (templateData.background_color !== undefined) updateData.backgroundColor = templateData.background_color;
      
      // Fonts - support both font_id and font name
      if (templateData.header_font_id !== undefined) updateData.headerFontId = templateData.header_font_id;
      else if (templateData.header_font !== undefined) updateData.headerFont = templateData.header_font;
      
      if (templateData.body_font_id !== undefined) updateData.bodyFontId = templateData.body_font_id;
      else if (templateData.body_font !== undefined) updateData.bodyFont = templateData.body_font;
      
      if (templateData.numeric_font_id !== undefined) updateData.numericFontId = templateData.numeric_font_id;
      else if (templateData.numeric_font !== undefined) updateData.numericFont = templateData.numeric_font;
      
      if (templateData.display_font_id !== undefined) updateData.displayFontId = templateData.display_font_id;
      else if (templateData.display_font !== undefined) updateData.displayFont = templateData.display_font;
      
      // Icons
      if (templateData.manage_agencies_icon_id !== undefined) updateData.manageAgenciesIconId = templateData.manage_agencies_icon_id;
      if (templateData.manage_modules_icon_id !== undefined) updateData.manageModulesIconId = templateData.manage_modules_icon_id;
      if (templateData.manage_documents_icon_id !== undefined) updateData.manageDocumentsIconId = templateData.manage_documents_icon_id;
      if (templateData.manage_users_icon_id !== undefined) updateData.manageUsersIconId = templateData.manage_users_icon_id;
      if (templateData.platform_settings_icon_id !== undefined) updateData.platformSettingsIconId = templateData.platform_settings_icon_id;
      if (templateData.view_all_progress_icon_id !== undefined) updateData.viewAllProgressIconId = templateData.view_all_progress_icon_id;
      if (templateData.progress_dashboard_icon_id !== undefined) updateData.progressDashboardIconId = templateData.progress_dashboard_icon_id;
      if (templateData.settings_icon_id !== undefined) updateData.settingsIconId = templateData.settings_icon_id;
      if (templateData.master_brand_icon_id !== undefined) updateData.masterBrandIconId = templateData.master_brand_icon_id;
      if (templateData.all_agencies_notifications_icon_id !== undefined) updateData.allAgenciesNotificationsIconId = templateData.all_agencies_notifications_icon_id;
      
      // Tagline
      if (templateData.tagline !== undefined) updateData.tagline = templateData.tagline;
      
      // Terminology
      if (templateData.people_ops_term !== undefined) updateData.peopleOpsTerm = templateData.people_ops_term;

      // Update platform branding
      return await PlatformBranding.update(updateData, userId);
    } else if (targetScope === 'agency' && targetAgencyId) {
      // Get current agency branding
      const agency = await Agency.findById(targetAgencyId);
      if (!agency) {
        throw new Error('Agency not found');
      }

      // Parse current color palette if it exists
      let colorPalette = {};
      if (agency.color_palette) {
        try {
          colorPalette = typeof agency.color_palette === 'string' 
            ? JSON.parse(agency.color_palette) 
            : agency.color_palette;
        } catch (e) {
          colorPalette = {};
        }
      }

      // Apply color template data to color palette
      if (templateData.primary_color !== undefined) colorPalette.primary = templateData.primary_color;
      if (templateData.secondary_color !== undefined) colorPalette.secondary = templateData.secondary_color;
      if (templateData.accent_color !== undefined) colorPalette.accent = templateData.accent_color;
      if (templateData.success_color !== undefined) colorPalette.success = templateData.success_color;
      if (templateData.error_color !== undefined) colorPalette.error = templateData.error_color;
      if (templateData.warning_color !== undefined) colorPalette.warning = templateData.warning_color;
      if (templateData.background_color !== undefined) colorPalette.background = templateData.background_color;

      // Map template icons to agency icon override columns (where available).
      // These match the agencies table columns used across dashboards/settings.
      const updateData = {
        colorPalette
      };

      // Dashboard / default icons
      if (templateData.training_focus_default_icon_id !== undefined) updateData.trainingFocusDefaultIconId = templateData.training_focus_default_icon_id;
      if (templateData.module_default_icon_id !== undefined) updateData.moduleDefaultIconId = templateData.module_default_icon_id;
      if (templateData.user_default_icon_id !== undefined) updateData.userDefaultIconId = templateData.user_default_icon_id;
      if (templateData.document_default_icon_id !== undefined) updateData.documentDefaultIconId = templateData.document_default_icon_id;

      if (templateData.manage_agencies_icon_id !== undefined) updateData.manageAgenciesIconId = templateData.manage_agencies_icon_id;
      if (templateData.manage_modules_icon_id !== undefined) updateData.manageModulesIconId = templateData.manage_modules_icon_id;
      if (templateData.manage_documents_icon_id !== undefined) updateData.manageDocumentsIconId = templateData.manage_documents_icon_id;
      if (templateData.manage_users_icon_id !== undefined) updateData.manageUsersIconId = templateData.manage_users_icon_id;
      if (templateData.platform_settings_icon_id !== undefined) updateData.platformSettingsIconId = templateData.platform_settings_icon_id;
      if (templateData.view_all_progress_icon_id !== undefined) updateData.viewAllProgressIconId = templateData.view_all_progress_icon_id;
      if (templateData.progress_dashboard_icon_id !== undefined) updateData.progressDashboardIconId = templateData.progress_dashboard_icon_id;
      if (templateData.settings_icon_id !== undefined) updateData.settingsIconId = templateData.settings_icon_id;

      // Settings navigation icons (platform defaults + agency overrides)
      if (templateData.company_profile_icon_id !== undefined) updateData.companyProfileIconId = templateData.company_profile_icon_id;
      if (templateData.team_roles_icon_id !== undefined) updateData.teamRolesIconId = templateData.team_roles_icon_id;
      if (templateData.billing_icon_id !== undefined) updateData.billingIconId = templateData.billing_icon_id;
      if (templateData.packages_icon_id !== undefined) updateData.packagesIconId = templateData.packages_icon_id;
      if (templateData.checklist_items_icon_id !== undefined) updateData.checklistItemsIconId = templateData.checklist_items_icon_id;
      if (templateData.field_definitions_icon_id !== undefined) updateData.fieldDefinitionsIconId = templateData.field_definitions_icon_id;
      if (templateData.branding_templates_icon_id !== undefined) updateData.brandingTemplatesIconId = templateData.branding_templates_icon_id;
      if (templateData.assets_icon_id !== undefined) updateData.assetsIconId = templateData.assets_icon_id;
      if (templateData.communications_icon_id !== undefined) updateData.communicationsIconId = templateData.communications_icon_id;
      if (templateData.integrations_icon_id !== undefined) updateData.integrationsIconId = templateData.integrations_icon_id;
      if (templateData.archive_icon_id !== undefined) updateData.archiveIconId = templateData.archive_icon_id;

      // Terminology: keep support for templates that store a people ops term
      // in the template_data (legacy naming).
      if (templateData.people_ops_term !== undefined) {
        // Store in terminology_settings (object) when possible.
        let terminology = {};
        try {
          terminology = typeof agency.terminology_settings === 'string'
            ? JSON.parse(agency.terminology_settings)
            : (agency.terminology_settings || {});
        } catch {
          terminology = {};
        }
        terminology.peopleOpsTerm = templateData.people_ops_term;
        updateData.terminologySettings = terminology;
      }

      return await Agency.update(targetAgencyId, updateData);
    } else {
      throw new Error('Invalid target scope or agency ID');
    }
  }

  /**
   * Check and apply scheduled templates
   * This should be called by a background job daily
   */
  static async checkScheduledTemplates() {
    const today = new Date().toISOString().split('T')[0];

    // Check platform schedules
    const BrandingTemplate = (await import('../models/BrandingTemplate.model.js')).default;

    const platformTemplate = await BrandingTemplate.getScheduledTemplates('platform', null, today);
    if (platformTemplate) {
      try {
        await this.applyBrandingData(platformTemplate.template_data, 'platform');
        // Best-effort: persist current template id if the columns exist
        try {
          await PlatformBranding.update({ currentBrandingTemplateId: platformTemplate.id }, null);
        } catch {
          // ignore
        }
        console.log(`Applied scheduled platform template: ${platformTemplate.name}`);
      } catch (error) {
        console.error('Error applying scheduled platform template:', error);
      }
    }

    // Check agency schedules
    const agencies = await Agency.findAll();
    
    for (const agency of agencies) {
      const agencyTemplate = await BrandingTemplate.getScheduledTemplates('agency', agency.id, today);
      if (agencyTemplate) {
        try {
          await this.applyBrandingData(agencyTemplate.template_data, 'agency', agency.id);
          // Best-effort: persist current template id if the columns exist
          try {
            await Agency.update(agency.id, { currentBrandingTemplateId: agencyTemplate.id });
          } catch {
            // ignore
          }
          console.log(`Applied scheduled agency template: ${agencyTemplate.name} for agency ${agency.id}`);
        } catch (error) {
          console.error(`Error applying scheduled agency template for agency ${agency.id}:`, error);
        }
      }
    }
  }
}

export default BrandingTemplateService;
