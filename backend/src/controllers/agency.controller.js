import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import { validationResult } from 'express-validator';

export const getAllAgencies = async (req, res, next) => {
  try {
    const includeInactive = req.user.role === 'admin' || req.user.role === 'super_admin';
    const includeArchived = false; // Don't include archived by default
    
    // Super admins see all agencies
    if (req.user.role === 'super_admin') {
      const agencies = await Agency.findAll(includeInactive, includeArchived);
      return res.json(agencies);
    }
    
    // Regular admins and others see only their assigned agencies
    const userAgencies = await User.getAgencies(req.user.id);
    res.json(userAgencies);
  } catch (error) {
    next(error);
  }
};

export const getAgencyById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const agency = await Agency.findById(id);
    
    if (!agency) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    res.json(agency);
  } catch (error) {
    next(error);
  }
};

/**
 * Get organization by slug (public route - no auth required)
 * Supports all organization types (Agency, School, Program, Learning)
 */
export const getAgencyBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const agency = await Agency.findBySlug(slug);
    
    if (!agency) {
      return res.status(404).json({ error: { message: 'Organization not found' } });
    }

    res.json(agency);
  } catch (error) {
    next(error);
  }
};

export const createAgency = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(e => `${e.param}: ${e.msg}`).join(', ');
      return res.status(400).json({ error: { message: `Validation failed: ${errorMessages}`, errors: errors.array() } });
    }

    const { name, slug, logoUrl, logoPath, colorPalette, terminologySettings, isActive, iconId, trainingFocusDefaultIconId, moduleDefaultIconId, userDefaultIconId, documentDefaultIconId, onboardingTeamEmail, phoneNumber, phoneExtension, portalUrl, themeSettings, customParameters, organizationType, statusExpiredIconId, tempPasswordExpiredIconId, taskOverdueIconId, onboardingCompletedIconId, invitationExpiredIconId, firstLoginIconId, firstLoginPendingIconId, passwordChangedIconId } = req.body;
    
    // Ensure colorPalette is properly formatted
    let formattedColorPalette = colorPalette;
    if (colorPalette && typeof colorPalette === 'object') {
      formattedColorPalette = colorPalette;
    } else if (colorPalette && typeof colorPalette === 'string') {
      try {
        formattedColorPalette = JSON.parse(colorPalette);
      } catch (e) {
        formattedColorPalette = null;
      }
    }
    
    // Ensure themeSettings is properly formatted
    let formattedThemeSettings = themeSettings;
    if (themeSettings && typeof themeSettings === 'string') {
      try {
        formattedThemeSettings = JSON.parse(themeSettings);
      } catch (e) {
        formattedThemeSettings = null;
      }
    }
    
    // Ensure customParameters is properly formatted
    let formattedCustomParameters = customParameters;
    if (customParameters !== undefined) {
      if (typeof customParameters === 'object' && customParameters !== null) {
        formattedCustomParameters = customParameters;
      } else if (typeof customParameters === 'string' && customParameters.trim()) {
        try {
          formattedCustomParameters = JSON.parse(customParameters);
        } catch (e) {
          formattedCustomParameters = null;
        }
      } else {
        formattedCustomParameters = null;
      }
    }
    
    const agency = await Agency.create({ 
      name, 
      slug, 
      logoUrl,
      logoPath, 
      colorPalette: formattedColorPalette, 
      terminologySettings, 
      isActive, 
      iconId,
      trainingFocusDefaultIconId,
      moduleDefaultIconId,
      userDefaultIconId,
      documentDefaultIconId,
      onboardingTeamEmail,
      phoneNumber,
      phoneExtension,
      portalUrl,
      themeSettings: formattedThemeSettings,
      customParameters: formattedCustomParameters,
      organizationType: organizationType || 'agency',
      statusExpiredIconId,
      tempPasswordExpiredIconId,
      taskOverdueIconId,
      onboardingCompletedIconId,
      invitationExpiredIconId,
      firstLoginIconId,
      firstLoginPendingIconId,
      passwordChangedIconId
    });
    res.status(201).json(agency);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: { message: 'Agency with this slug already exists' } });
    }
    next(error);
  }
};

export const updateAgency = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Agency update validation errors:', errors.array());
      console.error('Request body:', JSON.stringify(req.body, null, 2));
      return res.status(400).json({ 
        error: { 
          message: 'Validation failed', 
          errors: errors.array(),
          details: errors.array().map(e => `${e.param}: ${e.msg}`).join(', ')
        } 
      });
    }

    const { id } = req.params;
    const { name, slug, logoUrl, logoPath, colorPalette, terminologySettings, isActive, iconId, trainingFocusDefaultIconId, moduleDefaultIconId, userDefaultIconId, documentDefaultIconId, manageAgenciesIconId, manageModulesIconId, manageDocumentsIconId, manageUsersIconId, platformSettingsIconId, viewAllProgressIconId, progressDashboardIconId, settingsIconId, certificateTemplateUrl, onboardingTeamEmail, phoneNumber, phoneExtension, portalUrl, themeSettings, customParameters } = req.body;
    
    // Validate Google Docs URL if provided
    if (certificateTemplateUrl && certificateTemplateUrl.trim() !== '') {
      const GoogleDocsService = (await import('../services/googleDocs.service.js')).default;
      if (!GoogleDocsService.isValidGoogleDocUrl(certificateTemplateUrl)) {
        return res.status(400).json({ error: { message: 'Invalid Google Docs URL format. Please provide a valid Google Docs share URL.' } });
      }
    }
    
    // Ensure colorPalette is properly formatted
    let formattedColorPalette = colorPalette;
    if (colorPalette !== undefined) {
      if (typeof colorPalette === 'object') {
        formattedColorPalette = colorPalette;
      } else if (typeof colorPalette === 'string' && colorPalette.trim()) {
        try {
          formattedColorPalette = JSON.parse(colorPalette);
        } catch (e) {
          // If parsing fails, try to construct from individual color values
          formattedColorPalette = null;
        }
      } else {
        formattedColorPalette = null;
      }
    }
    
    // Ensure themeSettings is properly formatted
    let formattedThemeSettings = themeSettings;
    if (themeSettings !== undefined) {
      if (typeof themeSettings === 'object') {
        formattedThemeSettings = themeSettings;
      } else if (typeof themeSettings === 'string' && themeSettings.trim()) {
        try {
          formattedThemeSettings = JSON.parse(themeSettings);
        } catch (e) {
          formattedThemeSettings = null;
        }
      } else {
        formattedThemeSettings = null;
      }
    }
    
    // Ensure customParameters is properly formatted
    let formattedCustomParameters = customParameters;
    if (customParameters !== undefined) {
      if (typeof customParameters === 'object' && customParameters !== null) {
        formattedCustomParameters = customParameters;
      } else if (typeof customParameters === 'string' && customParameters.trim()) {
        try {
          formattedCustomParameters = JSON.parse(customParameters);
        } catch (e) {
          formattedCustomParameters = null;
        }
      } else {
        formattedCustomParameters = null;
      }
    }
    
    const agency = await Agency.update(id, { 
      name, 
      slug, 
      logoUrl,
      logoPath, 
      colorPalette: formattedColorPalette, 
      terminologySettings, 
      isActive, 
      iconId,
      trainingFocusDefaultIconId,
      moduleDefaultIconId,
      userDefaultIconId,
      documentDefaultIconId,
      manageAgenciesIconId,
      manageModulesIconId,
      manageDocumentsIconId,
      manageUsersIconId,
      platformSettingsIconId,
      viewAllProgressIconId,
      progressDashboardIconId,
      settingsIconId,
      certificateTemplateUrl: certificateTemplateUrl || null,
      onboardingTeamEmail,
      phoneNumber,
      phoneExtension,
      portalUrl,
      themeSettings: formattedThemeSettings,
      customParameters: formattedCustomParameters,
      organizationType,
      statusExpiredIconId,
      tempPasswordExpiredIconId,
      taskOverdueIconId,
      onboardingCompletedIconId,
      invitationExpiredIconId,
      firstLoginIconId,
      firstLoginPendingIconId,
      passwordChangedIconId
    });
    if (!agency) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    res.json(agency);
  } catch (error) {
    next(error);
  }
};

export const archiveAgency = async (req, res, next) => {
  try {
    const { id } = req.params;
    const archived = await Agency.archive(id, req.user.id);
    
    if (!archived) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    const agency = await Agency.findById(id);
    res.json({ message: 'Agency archived successfully', agency });
  } catch (error) {
    next(error);
  }
};

export const restoreAgency = async (req, res, next) => {
  try {
    const { id } = req.params;
    const restored = await Agency.restore(id);
    
    if (!restored) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    const agency = await Agency.findById(id);
    res.json({ message: 'Agency restored successfully', agency });
  } catch (error) {
    next(error);
  }
};

export const getArchivedAgencies = async (req, res, next) => {
  try {
    // Only super admins can view archived agencies
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const agencies = await Agency.findAllArchived();
    res.json(agencies);
  } catch (error) {
    next(error);
  }
};

export const getAgencyByPortalUrl = async (req, res, next) => {
  try {
    const { portalUrl } = req.params;
    const agency = await Agency.findByPortalUrl(portalUrl);
    
    if (!agency) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    res.json(agency);
  } catch (error) {
    next(error);
  }
};

export const getThemeByPortalUrl = async (req, res, next) => {
  try {
    const { portalUrl } = req.params;
    const agency = await Agency.findByPortalUrl(portalUrl);
    
    if (!agency) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    // Parse JSON fields if they're strings
    const colorPalette = typeof agency.color_palette === 'string' 
      ? JSON.parse(agency.color_palette) 
      : agency.color_palette;
    const themeSettings = typeof agency.theme_settings === 'string'
      ? JSON.parse(agency.theme_settings)
      : agency.theme_settings;
    const terminologySettings = typeof agency.terminology_settings === 'string'
      ? JSON.parse(agency.terminology_settings)
      : agency.terminology_settings;

    // Return theme data for frontend
    res.json({
      colorPalette: colorPalette || {},
      logoUrl: agency.logo_url,
      themeSettings: themeSettings || {},
      terminologySettings: terminologySettings || {},
      agencyName: agency.name
    });
  } catch (error) {
    next(error);
  }
};

export const getLoginThemeByPortalUrl = async (req, res, next) => {
  try {
    const { portalUrl } = req.params;
    const agency = await Agency.findByPortalUrl(portalUrl);
    
    if (!agency) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    // Get platform branding (includes organization name and logo)
    const PlatformBranding = (await import('../models/PlatformBranding.model.js')).default;
    const platformBranding = await PlatformBranding.get();

    // Parse JSON fields if they're strings
    const colorPalette = typeof agency.color_palette === 'string' 
      ? JSON.parse(agency.color_palette) 
      : agency.color_palette;
    const themeSettings = typeof agency.theme_settings === 'string'
      ? JSON.parse(agency.theme_settings)
      : agency.theme_settings;

    // Build a base URL for absolute asset URLs (Cloud Run is behind a proxy)
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = `${proto}://${host}`;

    const normalizeUploadsPath = (p) => {
      if (!p) return null;
      let cleaned = p;
      // Allow inputs like "/uploads/icons/x.png", "uploads/icons/x.png", "icons/x.png"
      if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
      if (cleaned.startsWith('uploads/')) cleaned = cleaned.substring('uploads/'.length);
      return cleaned;
    };

    // Get agency logo URL (priority: logo_path > icon_file_path > logo_url)
    let agencyLogoUrl = agency.logo_url;
    if (agency.logo_path) {
      const cleaned = normalizeUploadsPath(agency.logo_path);
      agencyLogoUrl = cleaned ? `${baseUrl}/uploads/${cleaned}` : agency.logo_url;
    } else if (agency.icon_file_path) {
      const cleaned = normalizeUploadsPath(agency.icon_file_path);
      agencyLogoUrl = cleaned ? `${baseUrl}/uploads/${cleaned}` : agency.logo_url;
    }

    // Get platform logo URL
    let platformLogoUrl = null;
    if (platformBranding.organization_logo_path) {
      const cleaned = normalizeUploadsPath(platformBranding.organization_logo_path);
      platformLogoUrl = cleaned ? `${baseUrl}/uploads/${cleaned}` : null;
    }

    // Return combined theme data for login page
    res.json({
      agency: {
        name: agency.name,
        organizationType: agency.organization_type || 'agency',
        logoUrl: agencyLogoUrl,
        colorPalette: colorPalette || {},
        themeSettings: themeSettings || {}
      },
      platform: {
        organizationName: platformBranding.organization_name || '',
        logoUrl: platformLogoUrl,
        tagline: platformBranding.tagline
      }
    });
  } catch (error) {
    next(error);
  }
};
