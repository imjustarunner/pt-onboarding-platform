import { validationResult } from 'express-validator';
import OrganizationDuplicationService from '../services/organizationDuplication.service.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';

export const duplicateOrganization = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { name, slug, portalUrl } = req.body;

    const result = await OrganizationDuplicationService.duplicateOrganization({
      sourceOrganizationId: id,
      newName: name,
      newSlug: slug,
      newPortalUrl: portalUrl || null,
      requestingUser: req.user
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const getOrganizationAffiliation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgId = parseInt(id, 10);
    if (!orgId) {
      return res.status(400).json({ error: { message: 'Invalid organization id' } });
    }

    const affiliatedAgencyId =
      (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
      (await AgencySchool.getActiveAgencyIdForSchool(orgId));

    res.json({ affiliatedAgencyId: affiliatedAgencyId || null });
  } catch (error) {
    next(error);
  }
};

export const applyAffiliatedAgencyBranding = async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgId = parseInt(id, 10);
    if (!orgId) {
      return res.status(400).json({ error: { message: 'Invalid organization id' } });
    }

    const org = await Agency.findById(orgId);
    if (!org) {
      return res.status(404).json({ error: { message: 'Organization not found' } });
    }
    const orgType = String(org.organization_type || 'agency').toLowerCase();
    if (!['school', 'program', 'learning'].includes(orgType)) {
      return res.status(400).json({ error: { message: 'Only school/program/learning organizations can apply affiliated agency branding' } });
    }

    const affiliatedAgencyId =
      (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
      (await AgencySchool.getActiveAgencyIdForSchool(orgId));
    if (!affiliatedAgencyId) {
      return res.status(400).json({ error: { message: 'No affiliated agency is set for this organization' } });
    }

    // Permission: super admins can apply to any. Admins must have access to the affiliated agency.
    if (req.user?.role !== 'super_admin') {
      const userAgencies = await User.getAgencies(req.user.id);
      const canUseAgency = userAgencies.some((a) => a?.id === affiliatedAgencyId);
      if (!canUseAgency) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const agency = await Agency.findById(affiliatedAgencyId);
    if (!agency) {
      return res.status(404).json({ error: { message: 'Affiliated agency not found' } });
    }

    const parseJson = (v) => {
      if (!v) return null;
      if (typeof v === 'object') return v;
      try { return JSON.parse(v); } catch { return null; }
    };

    const updated = await Agency.update(orgId, {
      logoUrl: agency.logo_url ?? null,
      logoPath: agency.logo_path ?? null,
      colorPalette: parseJson(agency.color_palette) || {},
      terminologySettings: parseJson(agency.terminology_settings) || null,
      themeSettings: parseJson(agency.theme_settings) || null,
      iconId: agency.icon_id ?? null,
      trainingFocusDefaultIconId: agency.training_focus_default_icon_id ?? null,
      moduleDefaultIconId: agency.module_default_icon_id ?? null,
      userDefaultIconId: agency.user_default_icon_id ?? null,
      documentDefaultIconId: agency.document_default_icon_id ?? null,
      progressDashboardIconId: agency.progress_dashboard_icon_id ?? null,
      manageModulesIconId: agency.manage_modules_icon_id ?? null,
      manageDocumentsIconId: agency.manage_documents_icon_id ?? null,
      manageUsersIconId: agency.manage_users_icon_id ?? null,
      settingsIconId: agency.settings_icon_id ?? null,
      myDashboardChecklistIconId: agency.my_dashboard_checklist_icon_id ?? null,
      myDashboardTrainingIconId: agency.my_dashboard_training_icon_id ?? null,
      myDashboardDocumentsIconId: agency.my_dashboard_documents_icon_id ?? null,
      myDashboardMyAccountIconId: agency.my_dashboard_my_account_icon_id ?? null,
      myDashboardOnDemandTrainingIconId: agency.my_dashboard_on_demand_training_icon_id ?? null,
      statusExpiredIconId: agency.status_expired_icon_id ?? null,
      tempPasswordExpiredIconId: agency.temp_password_expired_icon_id ?? null,
      taskOverdueIconId: agency.task_overdue_icon_id ?? null,
      onboardingCompletedIconId: agency.onboarding_completed_icon_id ?? null,
      invitationExpiredIconId: agency.invitation_expired_icon_id ?? null,
      firstLoginIconId: agency.first_login_icon_id ?? null,
      firstLoginPendingIconId: agency.first_login_pending_icon_id ?? null,
      passwordChangedIconId: agency.password_changed_icon_id ?? null
    });

    res.json({ organization: updated });
  } catch (error) {
    next(error);
  }
};

