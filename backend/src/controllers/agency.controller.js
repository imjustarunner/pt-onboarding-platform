import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import { validationResult } from 'express-validator';
import AgencySchool from '../models/AgencySchool.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import pool from '../config/database.js';

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

    const { name, slug, logoUrl, logoPath, colorPalette, terminologySettings, isActive, iconId, chatIconId, trainingFocusDefaultIconId, moduleDefaultIconId, userDefaultIconId, documentDefaultIconId, onboardingTeamEmail, phoneNumber, phoneExtension, portalUrl, themeSettings, customParameters, organizationType, affiliatedAgencyId, statusExpiredIconId, tempPasswordExpiredIconId, taskOverdueIconId, onboardingCompletedIconId, invitationExpiredIconId, firstLoginIconId, firstLoginPendingIconId, passwordChangedIconId, myDashboardChecklistIconId, myDashboardTrainingIconId, myDashboardDocumentsIconId, myDashboardMyAccountIconId, myDashboardOnDemandTrainingIconId, myDashboardPayrollIconId, myDashboardSubmitIconId, tierSystemEnabled, tierThresholds } = req.body;

    // Only super admins can create "agency" organizations. Admins can create school/program/learning.
    const requestedType = (organizationType || 'agency').toLowerCase();
    if (req.user?.role !== 'super_admin' && requestedType === 'agency') {
      return res.status(403).json({ error: { message: 'Only super admins can create agency organizations' } });
    }

    // For child org types, affiliated agency is required and must be allowed for this user.
    const isChildOrgType = ['school', 'program', 'learning'].includes(requestedType);
    let resolvedAffiliatedAgencyId = null;
    if (isChildOrgType) {
      resolvedAffiliatedAgencyId = parseInt(affiliatedAgencyId, 10);
      if (!resolvedAffiliatedAgencyId) {
        return res.status(400).json({ error: { message: 'affiliatedAgencyId is required for school/program/learning organizations' } });
      }

      const parentAgency = await Agency.findById(resolvedAffiliatedAgencyId);
      if (!parentAgency) {
        return res.status(404).json({ error: { message: 'Affiliated agency not found' } });
      }
      const parentType = String(parentAgency.organization_type || 'agency').toLowerCase();
      if (parentType !== 'agency') {
        return res.status(400).json({ error: { message: 'Affiliated agency must be an organization of type agency' } });
      }

      if (req.user?.role !== 'super_admin') {
        const userAgencies = await User.getAgencies(req.user.id);
        const canUseAgency = userAgencies.some((a) => a?.id === resolvedAffiliatedAgencyId && String(a.organization_type || 'agency').toLowerCase() === 'agency');
        if (!canUseAgency) {
          return res.status(403).json({ error: { message: 'You do not have access to affiliate to the selected agency' } });
        }
      }
    }
    
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
      chatIconId,
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
      organizationType: requestedType,
      statusExpiredIconId,
      tempPasswordExpiredIconId,
      taskOverdueIconId,
      onboardingCompletedIconId,
      invitationExpiredIconId,
      firstLoginIconId,
      firstLoginPendingIconId,
      passwordChangedIconId,
      myDashboardChecklistIconId,
      myDashboardTrainingIconId,
      myDashboardDocumentsIconId,
      myDashboardMyAccountIconId,
      myDashboardOnDemandTrainingIconId,
      myDashboardPayrollIconId,
      myDashboardSubmitIconId,
      tierSystemEnabled,
      tierThresholds
    });

    // Persist affiliation for child org types (school/program/learning).
    if (isChildOrgType && resolvedAffiliatedAgencyId) {
      try {
        await OrganizationAffiliation.deactivateAllForOrganization(agency.id);
        await OrganizationAffiliation.upsert({
          agencyId: resolvedAffiliatedAgencyId,
          organizationId: agency.id,
          isActive: true
        });
      } catch (e) {
        // best effort; do not block creation
      }
    }

    // If an admin (non-super-admin) created an organization, ensure they are assigned to it
    // so it shows up in their Organization Management list immediately.
    if (req.user?.role !== 'super_admin') {
      try {
        await User.assignToAgency(req.user.id, agency.id);
      } catch (e) {
        // best effort; do not block creation
      }
    }
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
    const { name, slug, logoUrl, logoPath, colorPalette, terminologySettings, isActive, iconId, chatIconId, trainingFocusDefaultIconId, moduleDefaultIconId, userDefaultIconId, documentDefaultIconId, manageAgenciesIconId, manageClientsIconId, manageModulesIconId, manageDocumentsIconId, manageUsersIconId, platformSettingsIconId, viewAllProgressIconId, progressDashboardIconId, settingsIconId, dashboardNotificationsIconId, dashboardCommunicationsIconId, dashboardChatsIconId, dashboardPayrollIconId, dashboardBillingIconId, externalCalendarAuditIconId, certificateTemplateUrl, onboardingTeamEmail, phoneNumber, phoneExtension, portalUrl, themeSettings, customParameters, featureFlags, organizationType, affiliatedAgencyId, statusExpiredIconId, tempPasswordExpiredIconId, taskOverdueIconId, onboardingCompletedIconId, invitationExpiredIconId, firstLoginIconId, firstLoginPendingIconId, passwordChangedIconId, myDashboardChecklistIconId, myDashboardTrainingIconId, myDashboardDocumentsIconId, myDashboardMyAccountIconId, myDashboardOnDemandTrainingIconId, myDashboardPayrollIconId, myDashboardSubmitIconId, streetAddress, city, state, postalCode, tierSystemEnabled, tierThresholds,
      companyProfileIconId, teamRolesIconId, billingIconId, packagesIconId, checklistItemsIconId, fieldDefinitionsIconId, brandingTemplatesIconId, assetsIconId, communicationsIconId, integrationsIconId, archiveIconId
    } = req.body;
    
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

    // Ensure featureFlags is properly formatted
    let formattedFeatureFlags = featureFlags;
    if (featureFlags !== undefined) {
      if (typeof featureFlags === 'object' && featureFlags !== null) {
        formattedFeatureFlags = featureFlags;
      } else if (typeof featureFlags === 'string' && featureFlags.trim()) {
        try {
          formattedFeatureFlags = JSON.parse(featureFlags);
        } catch (e) {
          formattedFeatureFlags = null;
        }
      } else {
        formattedFeatureFlags = null;
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
      chatIconId,
      trainingFocusDefaultIconId,
      moduleDefaultIconId,
      userDefaultIconId,
      documentDefaultIconId,
      streetAddress,
      city,
      state,
      postalCode,
      manageAgenciesIconId,
      manageClientsIconId,
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
      certificateTemplateUrl: certificateTemplateUrl || null,
      onboardingTeamEmail,
      phoneNumber,
      phoneExtension,
      portalUrl,
      themeSettings: formattedThemeSettings,
      customParameters: formattedCustomParameters,
      featureFlags: formattedFeatureFlags,
      organizationType,
      tierSystemEnabled,
      tierThresholds,
      statusExpiredIconId,
      tempPasswordExpiredIconId,
      taskOverdueIconId,
      onboardingCompletedIconId,
      invitationExpiredIconId,
      firstLoginIconId,
      firstLoginPendingIconId,
      passwordChangedIconId
      ,companyProfileIconId
      ,teamRolesIconId
      ,billingIconId
      ,packagesIconId
      ,checklistItemsIconId
      ,fieldDefinitionsIconId
      ,brandingTemplatesIconId
      ,assetsIconId
      ,communicationsIconId
      ,integrationsIconId
      ,archiveIconId
    });
    if (!agency) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    // School-specific profile fields (district, ITSCO email, primary contact, etc.)
    // Persisted in school_profiles, but edited from the Organization Management UI.
    try {
      const orgType = String(agency.organization_type || organizationType || 'agency').toLowerCase();
      const sp = req.body?.schoolProfile && typeof req.body.schoolProfile === 'object' ? req.body.schoolProfile : null;
      if (orgType === 'school' && sp) {
        const districtName = sp.districtName !== undefined ? String(sp.districtName || '').trim() : '';
        const schoolNumber = sp.schoolNumber !== undefined ? String(sp.schoolNumber || '').trim() : '';
        const itscoEmail = sp.itscoEmail !== undefined ? String(sp.itscoEmail || '').trim() : '';
        const schoolDaysTimes = sp.schoolDaysTimes !== undefined ? String(sp.schoolDaysTimes || '').trim() : '';
        const primaryContactName = sp.primaryContactName !== undefined ? String(sp.primaryContactName || '').trim() : '';
        const primaryContactEmail = sp.primaryContactEmail !== undefined ? String(sp.primaryContactEmail || '').trim() : '';
        const primaryContactRole = sp.primaryContactRole !== undefined ? String(sp.primaryContactRole || '').trim() : '';
        const secondaryContactText = sp.secondaryContactText !== undefined ? String(sp.secondaryContactText || '').trim() : '';

        await pool.execute(
          `INSERT INTO school_profiles
            (school_organization_id, district_name, school_number, itsco_email, school_days_times,
             primary_contact_name, primary_contact_email, primary_contact_role, secondary_contact_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             district_name = COALESCE(VALUES(district_name), district_name),
             school_number = COALESCE(VALUES(school_number), school_number),
             itsco_email = COALESCE(VALUES(itsco_email), itsco_email),
             school_days_times = COALESCE(VALUES(school_days_times), school_days_times),
             primary_contact_name = COALESCE(VALUES(primary_contact_name), primary_contact_name),
             primary_contact_email = COALESCE(VALUES(primary_contact_email), primary_contact_email),
             primary_contact_role = COALESCE(VALUES(primary_contact_role), primary_contact_role),
             secondary_contact_text = COALESCE(VALUES(secondary_contact_text), secondary_contact_text)`,
          [
            parseInt(id, 10),
            districtName || null,
            schoolNumber || null,
            itscoEmail || null,
            schoolDaysTimes || null,
            primaryContactName || null,
            primaryContactEmail || null,
            primaryContactRole || null,
            secondaryContactText || null
          ]
        );
      }
    } catch (e) {
      // Don't block saving the base agency record if school_profiles isn't migrated yet.
      if (e?.code !== 'ER_NO_SUCH_TABLE') {
        console.warn('School profile upsert failed:', e);
      }
    }

    // Super admins can change affiliation for child org types (school/program/learning).
    // Admins can create child orgs, but cannot re-affiliate them later.
    if (affiliatedAgencyId !== undefined) {
      if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Only super admins can change affiliated agency' } });
      }

      const type = String(agency.organization_type || organizationType || 'agency').toLowerCase();
      const isChildOrgType = ['school', 'program', 'learning'].includes(type);
      if (!isChildOrgType) {
        return res.status(400).json({ error: { message: 'Affiliation can only be set for school/program/learning organizations' } });
      }

      const newAffId = parseInt(affiliatedAgencyId, 10);
      if (!newAffId) {
        return res.status(400).json({ error: { message: 'affiliatedAgencyId must be a positive integer' } });
      }
      const parentAgency = await Agency.findById(newAffId);
      if (!parentAgency) {
        return res.status(404).json({ error: { message: 'Affiliated agency not found' } });
      }
      const parentType = String(parentAgency.organization_type || 'agency').toLowerCase();
      if (parentType !== 'agency') {
        return res.status(400).json({ error: { message: 'Affiliated agency must be an organization of type agency' } });
      }

      await OrganizationAffiliation.deactivateAllForOrganization(agency.id);
      await OrganizationAffiliation.upsert({ agencyId: newAffId, organizationId: agency.id, isActive: true });
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

/**
 * List affiliated organizations (schools/programs/learning) for an agency.
 * GET /api/agencies/:id/affiliated-organizations
 */
export const listAffiliatedOrganizations = async (req, res, next) => {
  try {
    const { id } = req.params;
    const agencyId = parseInt(id, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });

    // Non-super-admin users must belong to this agency
    if (req.user.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const ok = (userAgencies || []).some((a) => parseInt(a.id, 10) === agencyId);
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const affiliated = await OrganizationAffiliation.listActiveOrganizationsForAgency(agencyId);
    const agency = await Agency.findById(agencyId);
    const out = [];
    if (agency) out.push(agency);
    for (const org of affiliated || []) {
      if (parseInt(org?.id, 10) === agencyId) continue;
      out.push(org);
    }

    res.json(out);
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

    // If this portal belongs to a school/program/learning org, brand it using the linked parent agency (agency_schools).
    const orgType = String(agency.organization_type || 'agency').toLowerCase();
    let brandingOrg = agency;
    if (['school', 'program', 'learning'].includes(orgType)) {
      const linkedAgencyId =
        (await OrganizationAffiliation.getActiveAgencyIdForOrganization(agency.id)) ||
        (await AgencySchool.getActiveAgencyIdForSchool(agency.id)); // legacy fallback
      if (linkedAgencyId) {
        const linkedAgency = await Agency.findById(linkedAgencyId);
        if (linkedAgency) brandingOrg = linkedAgency;
      }
    }

    // Parse JSON fields if they're strings
    const colorPalette = typeof brandingOrg.color_palette === 'string' 
      ? JSON.parse(brandingOrg.color_palette) 
      : brandingOrg.color_palette;
    const themeSettings = typeof brandingOrg.theme_settings === 'string'
      ? JSON.parse(brandingOrg.theme_settings)
      : brandingOrg.theme_settings;
    const terminologySettings = typeof brandingOrg.terminology_settings === 'string'
      ? JSON.parse(brandingOrg.terminology_settings)
      : brandingOrg.terminology_settings;

    // Best-effort: return an absolute logo URL if a logo_path/icon_file_path exists
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = `${proto}://${host}`;
    const normalizeUploadsPath = (p) => {
      if (!p) return null;
      let cleaned = p;
      if (cleaned.startsWith('/')) cleaned = cleaned.slice(1);
      if (cleaned.startsWith('uploads/')) cleaned = cleaned.substring('uploads/'.length);
      return cleaned;
    };
    let logoUrl = brandingOrg.logo_url;
    if (brandingOrg.logo_path) {
      const cleaned = normalizeUploadsPath(brandingOrg.logo_path);
      logoUrl = cleaned ? `${baseUrl}/uploads/${cleaned}` : brandingOrg.logo_url;
    } else if (brandingOrg.icon_file_path) {
      const cleaned = normalizeUploadsPath(brandingOrg.icon_file_path);
      logoUrl = cleaned ? `${baseUrl}/uploads/${cleaned}` : brandingOrg.logo_url;
    }

    // Return theme data for frontend
    res.json({
      brandingAgencyId: brandingOrg.id,
      portalOrganizationId: agency.id,
      colorPalette: colorPalette || {},
      logoUrl,
      themeSettings: themeSettings || {},
      terminologySettings: terminologySettings || {},
      agencyName: brandingOrg.name
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
    // If this portal belongs to a school/program/learning org, brand it using the linked parent agency (agency_schools).
    const orgType = String(agency.organization_type || 'agency').toLowerCase();
    let brandingOrg = agency;
    if (['school', 'program', 'learning'].includes(orgType)) {
      const linkedAgencyId =
        (await OrganizationAffiliation.getActiveAgencyIdForOrganization(agency.id)) ||
        (await AgencySchool.getActiveAgencyIdForSchool(agency.id)); // legacy fallback
      if (linkedAgencyId) {
        const linkedAgency = await Agency.findById(linkedAgencyId);
        if (linkedAgency) brandingOrg = linkedAgency;
      }
    }

    const colorPalette = typeof brandingOrg.color_palette === 'string' 
      ? JSON.parse(brandingOrg.color_palette) 
      : brandingOrg.color_palette;
    const themeSettings = typeof brandingOrg.theme_settings === 'string'
      ? JSON.parse(brandingOrg.theme_settings)
      : brandingOrg.theme_settings;

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
    let agencyLogoUrl = brandingOrg.logo_url;
    if (brandingOrg.logo_path) {
      const cleaned = normalizeUploadsPath(brandingOrg.logo_path);
      agencyLogoUrl = cleaned ? `${baseUrl}/uploads/${cleaned}` : brandingOrg.logo_url;
    } else if (brandingOrg.icon_file_path) {
      const cleaned = normalizeUploadsPath(brandingOrg.icon_file_path);
      agencyLogoUrl = cleaned ? `${baseUrl}/uploads/${cleaned}` : brandingOrg.logo_url;
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
        brandingAgencyId: brandingOrg.id,
        portalOrganizationId: agency.id,
        name: brandingOrg.name,
        // Preserve the portal org type so frontend can enforce school portal behavior.
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
