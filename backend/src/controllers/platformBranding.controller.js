import PlatformBranding from '../models/PlatformBranding.model.js';
import { validationResult } from 'express-validator';

/** Map exported (GET) snake_case keys to update payload camelCase. */
function exportedToUpdatePayload(data) {
  if (!data || typeof data !== 'object') return {};
  const map = {
    tagline: 'tagline',
    primary_color: 'primaryColor',
    secondary_color: 'secondaryColor',
    accent_color: 'accentColor',
    success_color: 'successColor',
    background_color: 'backgroundColor',
    error_color: 'errorColor',
    warning_color: 'warningColor',
    header_font: 'headerFont',
    body_font: 'bodyFont',
    numeric_font: 'numericFont',
    display_font: 'displayFont',
    header_font_id: 'headerFontId',
    body_font_id: 'bodyFontId',
    numeric_font_id: 'numericFontId',
    display_font_id: 'displayFontId',
    people_ops_term: 'peopleOpsTerm',
    organization_name: 'organizationName',
    organization_logo_icon_id: 'organizationLogoIconId',
    organization_logo_url: 'organizationLogoUrl',
    organization_logo_path: 'organizationLogoPath',
    training_focus_default_icon_id: 'trainingFocusDefaultIconId',
    module_default_icon_id: 'moduleDefaultIconId',
    user_default_icon_id: 'userDefaultIconId',
    document_default_icon_id: 'documentDefaultIconId',
    master_brand_icon_id: 'masterBrandIconId',
    manage_agencies_icon_id: 'manageAgenciesIconId',
    manage_clients_icon_id: 'manageClientsIconId',
    school_overview_icon_id: 'schoolOverviewIconId',
    program_overview_icon_id: 'programOverviewIconId',
    provider_availability_dashboard_icon_id: 'providerAvailabilityDashboardIconId',
    executive_report_icon_id: 'executiveReportIconId',
    manage_modules_icon_id: 'manageModulesIconId',
    manage_documents_icon_id: 'manageDocumentsIconId',
    manage_users_icon_id: 'manageUsersIconId',
    platform_settings_icon_id: 'platformSettingsIconId',
    view_all_progress_icon_id: 'viewAllProgressIconId',
    progress_dashboard_icon_id: 'progressDashboardIconId',
    settings_icon_id: 'settingsIconId',
    dashboard_notifications_icon_id: 'dashboardNotificationsIconId',
    dashboard_communications_icon_id: 'dashboardCommunicationsIconId',
    dashboard_chats_icon_id: 'dashboardChatsIconId',
    dashboard_payroll_icon_id: 'dashboardPayrollIconId',
    dashboard_billing_icon_id: 'dashboardBillingIconId',
    all_agencies_notifications_icon_id: 'allAgenciesNotificationsIconId',
    external_calendar_audit_icon_id: 'externalCalendarAuditIconId',
    skill_builders_availability_icon_id: 'skillBuildersAvailabilityIconId',
    intake_links_icon_id: 'intakeLinksIconId',
    audit_center_icon_id: 'auditCenterIconId',
    marketing_social_icon_id: 'marketingSocialIconId',
    presence_icon_id: 'presenceIconId',
    beta_feedback_icon_id: 'betaFeedbackIconId',
    company_profile_icon_id: 'companyProfileIconId',
    team_roles_icon_id: 'teamRolesIconId',
    billing_icon_id: 'billingIconId',
    packages_icon_id: 'packagesIconId',
    checklist_items_icon_id: 'checklistItemsIconId',
    field_definitions_icon_id: 'fieldDefinitionsIconId',
    branding_templates_icon_id: 'brandingTemplatesIconId',
    assets_icon_id: 'assetsIconId',
    communications_icon_id: 'communicationsIconId',
    integrations_icon_id: 'integrationsIconId',
    archive_icon_id: 'archiveIconId',
    my_dashboard_checklist_icon_id: 'myDashboardChecklistIconId',
    my_dashboard_training_icon_id: 'myDashboardTrainingIconId',
    my_dashboard_documents_icon_id: 'myDashboardDocumentsIconId',
    my_dashboard_my_account_icon_id: 'myDashboardMyAccountIconId',
    my_dashboard_my_schedule_icon_id: 'myDashboardMyScheduleIconId',
    my_dashboard_clients_icon_id: 'myDashboardClientsIconId',
    my_dashboard_on_demand_training_icon_id: 'myDashboardOnDemandTrainingIconId',
    my_dashboard_payroll_icon_id: 'myDashboardPayrollIconId',
    my_dashboard_submit_icon_id: 'myDashboardSubmitIconId',
    my_dashboard_communications_icon_id: 'myDashboardCommunicationsIconId',
    my_dashboard_chats_icon_id: 'myDashboardChatsIconId',
    my_dashboard_notifications_icon_id: 'myDashboardNotificationsIconId',
    school_portal_providers_icon_id: 'schoolPortalProvidersIconId',
    school_portal_days_icon_id: 'schoolPortalDaysIconId',
    school_portal_roster_icon_id: 'schoolPortalRosterIconId',
    school_portal_skills_groups_icon_id: 'schoolPortalSkillsGroupsIconId',
    school_portal_contact_admin_icon_id: 'schoolPortalContactAdminIconId',
    school_portal_faq_icon_id: 'schoolPortalFaqIconId',
    school_portal_school_staff_icon_id: 'schoolPortalSchoolStaffIconId',
    school_portal_parent_qr_icon_id: 'schoolPortalParentQrIconId',
    school_portal_parent_sign_icon_id: 'schoolPortalParentSignIconId',
    school_portal_upload_packet_icon_id: 'schoolPortalUploadPacketIconId'
  };
  const out = {};
  for (const [snake, camel] of Object.entries(map)) {
    if (data[snake] !== undefined) out[camel] = data[snake];
  }
  return out;
}

const DEFAULT_BRANDING = {
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

export const getPlatformBranding = async (req, res, next) => {
  try {
    console.log('getPlatformBranding: Fetching platform branding...');
    const branding = await PlatformBranding.get();
    console.log('getPlatformBranding: Branding fetched successfully');
    res.json(branding);
  } catch (error) {
    console.error('getPlatformBranding: Error:', error);
    console.error('getPlatformBranding: Error stack:', error.stack);
    console.error('getPlatformBranding: Error code:', error.code, 'message:', error.message);
    // Return default branding on any failure so the app can load (e.g. missing icons/fonts tables, schema mismatch)
    console.warn('getPlatformBranding: Returning defaults due to error');
    res.json(DEFAULT_BRANDING);
  }
};

export const updatePlatformBranding = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

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
      schoolOverviewIconId,
      programOverviewIconId,
      providerAvailabilityDashboardIconId,
      executiveReportIconId,
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
      skillBuildersAvailabilityIconId,
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
      schoolPortalProvidersIconId,
      schoolPortalDaysIconId,
      schoolPortalRosterIconId,
      schoolPortalSkillsGroupsIconId,
      schoolPortalContactAdminIconId,
      schoolPortalFaqIconId,
      schoolPortalSchoolStaffIconId,
      schoolPortalParentQrIconId,
      schoolPortalParentSignIconId,
      schoolPortalUploadPacketIconId,
      maxInactivityTimeoutMinutes,
      betaFeedbackEnabled
    } = req.body;

    const branding = await PlatformBranding.update({
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
      headerFontId: headerFontId !== undefined ? (headerFontId === null || headerFontId === '' ? null : parseInt(headerFontId)) : undefined,
      bodyFontId: bodyFontId !== undefined ? (bodyFontId === null || bodyFontId === '' ? null : parseInt(bodyFontId)) : undefined,
      numericFontId: numericFontId !== undefined ? (numericFontId === null || numericFontId === '' ? null : parseInt(numericFontId)) : undefined,
      displayFontId: displayFontId !== undefined ? (displayFontId === null || displayFontId === '' ? null : parseInt(displayFontId)) : undefined,
      peopleOpsTerm,
      trainingFocusDefaultIconId,
      moduleDefaultIconId,
      userDefaultIconId,
      documentDefaultIconId,
      masterBrandIconId,
      manageClientsIconId: manageClientsIconId !== undefined ? (manageClientsIconId === null || manageClientsIconId === '' ? null : parseInt(manageClientsIconId, 10)) : undefined,
      manageAgenciesIconId: manageAgenciesIconId !== undefined ? (manageAgenciesIconId === null || manageAgenciesIconId === '' ? null : parseInt(manageAgenciesIconId, 10)) : undefined,
      schoolOverviewIconId: schoolOverviewIconId !== undefined ? (schoolOverviewIconId === null || schoolOverviewIconId === '' ? null : parseInt(schoolOverviewIconId, 10)) : undefined,
      programOverviewIconId: programOverviewIconId !== undefined ? (programOverviewIconId === null || programOverviewIconId === '' ? null : parseInt(programOverviewIconId, 10)) : undefined,
      providerAvailabilityDashboardIconId: providerAvailabilityDashboardIconId !== undefined ? (providerAvailabilityDashboardIconId === null || providerAvailabilityDashboardIconId === '' ? null : parseInt(providerAvailabilityDashboardIconId, 10)) : undefined,
      executiveReportIconId: executiveReportIconId !== undefined ? (executiveReportIconId === null || executiveReportIconId === '' ? null : parseInt(executiveReportIconId, 10)) : undefined,
      manageModulesIconId: manageModulesIconId !== undefined ? (manageModulesIconId === null || manageModulesIconId === '' ? null : parseInt(manageModulesIconId, 10)) : undefined,
      manageDocumentsIconId: manageDocumentsIconId !== undefined ? (manageDocumentsIconId === null || manageDocumentsIconId === '' ? null : parseInt(manageDocumentsIconId, 10)) : undefined,
      manageUsersIconId: manageUsersIconId !== undefined ? (manageUsersIconId === null || manageUsersIconId === '' ? null : parseInt(manageUsersIconId, 10)) : undefined,
      platformSettingsIconId: platformSettingsIconId !== undefined ? (platformSettingsIconId === null || platformSettingsIconId === '' ? null : parseInt(platformSettingsIconId, 10)) : undefined,
      viewAllProgressIconId: viewAllProgressIconId !== undefined ? (viewAllProgressIconId === null || viewAllProgressIconId === '' ? null : parseInt(viewAllProgressIconId, 10)) : undefined,
      progressDashboardIconId: progressDashboardIconId !== undefined ? (progressDashboardIconId === null || progressDashboardIconId === '' ? null : parseInt(progressDashboardIconId, 10)) : undefined,
      settingsIconId: settingsIconId !== undefined ? (settingsIconId === null || settingsIconId === '' ? null : parseInt(settingsIconId, 10)) : undefined,
      dashboardNotificationsIconId: dashboardNotificationsIconId !== undefined ? (dashboardNotificationsIconId === null || dashboardNotificationsIconId === '' ? null : parseInt(dashboardNotificationsIconId, 10)) : undefined,
      dashboardCommunicationsIconId: dashboardCommunicationsIconId !== undefined ? (dashboardCommunicationsIconId === null || dashboardCommunicationsIconId === '' ? null : parseInt(dashboardCommunicationsIconId, 10)) : undefined,
      dashboardChatsIconId: dashboardChatsIconId !== undefined ? (dashboardChatsIconId === null || dashboardChatsIconId === '' ? null : parseInt(dashboardChatsIconId, 10)) : undefined,
      dashboardPayrollIconId: dashboardPayrollIconId !== undefined ? (dashboardPayrollIconId === null || dashboardPayrollIconId === '' ? null : parseInt(dashboardPayrollIconId, 10)) : undefined,
      dashboardBillingIconId: dashboardBillingIconId !== undefined ? (dashboardBillingIconId === null || dashboardBillingIconId === '' ? null : parseInt(dashboardBillingIconId, 10)) : undefined,
      externalCalendarAuditIconId: externalCalendarAuditIconId !== undefined ? (externalCalendarAuditIconId === null || externalCalendarAuditIconId === '' ? null : parseInt(externalCalendarAuditIconId, 10)) : undefined,
      skillBuildersAvailabilityIconId: skillBuildersAvailabilityIconId !== undefined ? (skillBuildersAvailabilityIconId === null || skillBuildersAvailabilityIconId === '' ? null : parseInt(skillBuildersAvailabilityIconId, 10)) : undefined,
      myDashboardChecklistIconId: myDashboardChecklistIconId !== undefined ? (myDashboardChecklistIconId === null || myDashboardChecklistIconId === '' ? null : parseInt(myDashboardChecklistIconId)) : undefined,
      myDashboardTrainingIconId: myDashboardTrainingIconId !== undefined ? (myDashboardTrainingIconId === null || myDashboardTrainingIconId === '' ? null : parseInt(myDashboardTrainingIconId)) : undefined,
      myDashboardDocumentsIconId: myDashboardDocumentsIconId !== undefined ? (myDashboardDocumentsIconId === null || myDashboardDocumentsIconId === '' ? null : parseInt(myDashboardDocumentsIconId)) : undefined,
      myDashboardMyAccountIconId: myDashboardMyAccountIconId !== undefined ? (myDashboardMyAccountIconId === null || myDashboardMyAccountIconId === '' ? null : parseInt(myDashboardMyAccountIconId)) : undefined,
      myDashboardMyScheduleIconId: myDashboardMyScheduleIconId !== undefined ? (myDashboardMyScheduleIconId === null || myDashboardMyScheduleIconId === '' ? null : parseInt(myDashboardMyScheduleIconId)) : undefined,
      myDashboardClientsIconId: myDashboardClientsIconId !== undefined ? (myDashboardClientsIconId === null || myDashboardClientsIconId === '' ? null : parseInt(myDashboardClientsIconId)) : undefined,
      myDashboardOnDemandTrainingIconId: myDashboardOnDemandTrainingIconId !== undefined ? (myDashboardOnDemandTrainingIconId === null || myDashboardOnDemandTrainingIconId === '' ? null : parseInt(myDashboardOnDemandTrainingIconId)) : undefined,
      myDashboardPayrollIconId: myDashboardPayrollIconId !== undefined ? (myDashboardPayrollIconId === null || myDashboardPayrollIconId === '' ? null : parseInt(myDashboardPayrollIconId)) : undefined,
      myDashboardSubmitIconId: myDashboardSubmitIconId !== undefined ? (myDashboardSubmitIconId === null || myDashboardSubmitIconId === '' ? null : parseInt(myDashboardSubmitIconId)) : undefined,
      myDashboardCommunicationsIconId: myDashboardCommunicationsIconId !== undefined ? (myDashboardCommunicationsIconId === null || myDashboardCommunicationsIconId === '' ? null : parseInt(myDashboardCommunicationsIconId)) : undefined,
      myDashboardChatsIconId: myDashboardChatsIconId !== undefined ? (myDashboardChatsIconId === null || myDashboardChatsIconId === '' ? null : parseInt(myDashboardChatsIconId)) : undefined,
      myDashboardNotificationsIconId: myDashboardNotificationsIconId !== undefined ? (myDashboardNotificationsIconId === null || myDashboardNotificationsIconId === '' ? null : parseInt(myDashboardNotificationsIconId, 10)) : undefined,
      allAgenciesNotificationsIconId: allAgenciesNotificationsIconId !== undefined ? (allAgenciesNotificationsIconId === null || allAgenciesNotificationsIconId === '' ? null : parseInt(allAgenciesNotificationsIconId, 10)) : undefined,
      organizationName,
      organizationLogoIconId: organizationLogoIconId !== undefined ? (organizationLogoIconId === null || organizationLogoIconId === '' ? null : parseInt(organizationLogoIconId, 10)) : undefined,
      organizationLogoUrl,
      organizationLogoPath,
      companyProfileIconId: companyProfileIconId !== undefined ? (companyProfileIconId === null || companyProfileIconId === '' ? null : parseInt(companyProfileIconId)) : undefined,
      teamRolesIconId: teamRolesIconId !== undefined ? (teamRolesIconId === null || teamRolesIconId === '' ? null : parseInt(teamRolesIconId)) : undefined,
      billingIconId: billingIconId !== undefined ? (billingIconId === null || billingIconId === '' ? null : parseInt(billingIconId)) : undefined,
      packagesIconId: packagesIconId !== undefined ? (packagesIconId === null || packagesIconId === '' ? null : parseInt(packagesIconId)) : undefined,
      checklistItemsIconId: checklistItemsIconId !== undefined ? (checklistItemsIconId === null || checklistItemsIconId === '' ? null : parseInt(checklistItemsIconId)) : undefined,
      fieldDefinitionsIconId: fieldDefinitionsIconId !== undefined ? (fieldDefinitionsIconId === null || fieldDefinitionsIconId === '' ? null : parseInt(fieldDefinitionsIconId)) : undefined,
      brandingTemplatesIconId: brandingTemplatesIconId !== undefined ? (brandingTemplatesIconId === null || brandingTemplatesIconId === '' ? null : parseInt(brandingTemplatesIconId)) : undefined,
      assetsIconId: assetsIconId !== undefined ? (assetsIconId === null || assetsIconId === '' ? null : parseInt(assetsIconId)) : undefined,
      communicationsIconId: communicationsIconId !== undefined ? (communicationsIconId === null || communicationsIconId === '' ? null : parseInt(communicationsIconId)) : undefined,
      integrationsIconId: integrationsIconId !== undefined ? (integrationsIconId === null || integrationsIconId === '' ? null : parseInt(integrationsIconId)) : undefined,
      archiveIconId: archiveIconId !== undefined ? (archiveIconId === null || archiveIconId === '' ? null : parseInt(archiveIconId)) : undefined,
      schoolPortalProvidersIconId: schoolPortalProvidersIconId !== undefined ? (schoolPortalProvidersIconId === null || schoolPortalProvidersIconId === '' ? null : parseInt(schoolPortalProvidersIconId)) : undefined,
      schoolPortalDaysIconId: schoolPortalDaysIconId !== undefined ? (schoolPortalDaysIconId === null || schoolPortalDaysIconId === '' ? null : parseInt(schoolPortalDaysIconId)) : undefined,
      schoolPortalRosterIconId: schoolPortalRosterIconId !== undefined ? (schoolPortalRosterIconId === null || schoolPortalRosterIconId === '' ? null : parseInt(schoolPortalRosterIconId)) : undefined,
      schoolPortalSkillsGroupsIconId: schoolPortalSkillsGroupsIconId !== undefined ? (schoolPortalSkillsGroupsIconId === null || schoolPortalSkillsGroupsIconId === '' ? null : parseInt(schoolPortalSkillsGroupsIconId)) : undefined,
      schoolPortalContactAdminIconId: schoolPortalContactAdminIconId !== undefined ? (schoolPortalContactAdminIconId === null || schoolPortalContactAdminIconId === '' ? null : parseInt(schoolPortalContactAdminIconId)) : undefined,
      schoolPortalFaqIconId: schoolPortalFaqIconId !== undefined ? (schoolPortalFaqIconId === null || schoolPortalFaqIconId === '' ? null : parseInt(schoolPortalFaqIconId)) : undefined,
      schoolPortalSchoolStaffIconId: schoolPortalSchoolStaffIconId !== undefined ? (schoolPortalSchoolStaffIconId === null || schoolPortalSchoolStaffIconId === '' ? null : parseInt(schoolPortalSchoolStaffIconId)) : undefined,
      schoolPortalParentQrIconId: schoolPortalParentQrIconId !== undefined ? (schoolPortalParentQrIconId === null || schoolPortalParentQrIconId === '' ? null : parseInt(schoolPortalParentQrIconId)) : undefined,
      schoolPortalParentSignIconId: schoolPortalParentSignIconId !== undefined ? (schoolPortalParentSignIconId === null || schoolPortalParentSignIconId === '' ? null : parseInt(schoolPortalParentSignIconId)) : undefined,
      schoolPortalUploadPacketIconId: schoolPortalUploadPacketIconId !== undefined ? (schoolPortalUploadPacketIconId === null || schoolPortalUploadPacketIconId === '' ? null : parseInt(schoolPortalUploadPacketIconId)) : undefined,
      maxInactivityTimeoutMinutes: maxInactivityTimeoutMinutes !== undefined ? (maxInactivityTimeoutMinutes === null || maxInactivityTimeoutMinutes === '' ? null : Math.min(240, Math.max(1, parseInt(maxInactivityTimeoutMinutes, 10) || 30))) : undefined,
      betaFeedbackEnabled: betaFeedbackEnabled !== undefined ? !!betaFeedbackEnabled : undefined
    }, req.user.id);

    res.json(branding);
  } catch (error) {
    console.error('updatePlatformBranding: Error:', error);
    console.error('updatePlatformBranding: Error stack:', error.stack);
    console.error('updatePlatformBranding: Error details:', {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      errno: error.errno
    });
    next(error);
  }
};

/**
 * Restore platform branding from an exported backup (e.g. downloaded template).
 * Body should match the shape returned by GET /platform-branding (snake_case).
 */
export const restorePlatformBranding = async (req, res, next) => {
  try {
    const payload = exportedToUpdatePayload(req.body);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { message: 'No valid platform branding data to restore' } });
    }
    const branding = await PlatformBranding.update(payload, req.user.id);
    res.json(branding);
  } catch (error) {
    console.error('restorePlatformBranding: Error:', error);
    next(error);
  }
};

