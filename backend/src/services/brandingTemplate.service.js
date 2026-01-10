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
      if (templateData.primary_color) colorPalette.primary = templateData.primary_color;
      if (templateData.secondary_color) colorPalette.secondary = templateData.secondary_color;
      if (templateData.accent_color) colorPalette.accent = templateData.accent_color;
      if (templateData.success_color) colorPalette.success = templateData.success_color;
      if (templateData.error_color) colorPalette.error = templateData.error_color;
      if (templateData.warning_color) colorPalette.warning = templateData.warning_color;
      if (templateData.background_color) colorPalette.background = templateData.background_color;

      // Update agency with new color palette
      const updateData = {
        color_palette: JSON.stringify(colorPalette)
      };

      // Apply other template data if present (fonts, terminology, etc.)
      if (templateData.people_ops_term) {
        updateData.onboarding_team_email = templateData.people_ops_term; // Map to appropriate field
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
          console.log(`Applied scheduled agency template: ${agencyTemplate.name} for agency ${agency.id}`);
        } catch (error) {
          console.error(`Error applying scheduled agency template for agency ${agency.id}:`, error);
        }
      }
    }
  }
}

export default BrandingTemplateService;
