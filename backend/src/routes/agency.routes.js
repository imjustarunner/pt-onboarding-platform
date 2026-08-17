import express from 'express';
import { body } from 'express-validator';
import { getAllAgencies, getAgencyById, getAgencyBySlug, createAgency, updateAgency, archiveAgency, restoreAgency, deleteAgencyHard, getArchivedAgencies, getAgencyByPortalUrl, getThemeByPortalUrl, getLoginThemeByPortalUrl, listAffiliatedOrganizations, resolvePortalByHost, getAgencyNotificationSender, putAgencyNotificationSender } from '../controllers/agency.controller.js';
import { getTenantPeopleSnapshot } from '../controllers/agencyTenantPeopleSnapshot.controller.js';
import {
  getAgencyDisclosureSettings,
  putAgencyDisclosureSettings
} from '../controllers/clientDisclosure.controller.js';
import {
  getAgencySchoolIntakeMaster,
  putAgencySchoolIntakeMaster,
  listAgencySchoolPacketTemplateVersions,
  getAgencySchoolPacketTemplateVersion
} from '../controllers/agencySchoolIntakeMaster.controller.js';
import {
  getAgencyOfficeIntakeMaster,
  putAgencyOfficeIntakeMaster,
  getAgencyOfficePacketTemplate,
  putAgencyOfficePacketTemplate,
  downloadAgencyOfficePacketTemplatePdf,
  listAgencyOfficePacketTemplateVersions,
  getAgencyOfficePacketTemplateVersion,
  getAgencyPacketBrand,
  putAgencyPacketBrandVersion,
  uploadAgencyPacketBrandAsset,
  packetBrandUpload,
  listAgencyChannelIntakeMasters,
  getAgencyChannelIntakeMaster,
  putAgencyChannelIntakeMaster
} from '../controllers/agencyOfficeIntakeMaster.controller.js';
import {
  getAgencyAnnouncements,
  updateAgencyAnnouncements,
  getAgencyDashboardBanner,
  listAgencyBannerAnnouncements,
  listAgencyScheduledAnnouncements,
  createAgencyScheduledAnnouncement,
  updateAgencyScheduledAnnouncement,
  deleteAgencyScheduledAnnouncement,
  listAnnouncementAudienceGroups,
  postClubAnnouncementWithThread
} from '../controllers/agencyAnnouncements.controller.js';
import {
  getManagementTeam,
  getManagementTeamToday,
  getManagementTeamConfig,
  updateManagementTeamConfig,
  listCoverage,
  setCoverage,
  deleteCoverage,
  listEligibleUsers,
  getRoleTypes
} from '../controllers/agencyManagementTeam.controller.js';
import { listAgencyNotificationTriggers, updateAgencyNotificationTrigger } from '../controllers/agencyNotificationTriggers.controller.js';
import { getAgencyNotificationPreferences, updateAgencyNotificationPreferences } from '../controllers/agencyNotificationPreferences.controller.js';
import {
  listProgramReminderSchedules,
  createProgramReminderSchedule,
  updateProgramReminderSchedule,
  deleteProgramReminderSchedule
} from '../controllers/programReminderSchedule.controller.js';
import {
  listCompanyEventsForAgency,
  exportCompanyEventsDirectoryRosterPdf,
  listInternalRegistrationPromosForAgency,
  listCompanyEventAudienceOptions,
  createCompanyEvent,
  updateCompanyEvent,
  deleteCompanyEvent,
  downloadCompanyEventIcsForAgency,
  listCompanyEventResponses,
  listCompanyEventDeliveryLogs,
  closeCompanyEventVoting,
  sendCompanyEventVotingSms,
  sendCompanyEventDirectMessage,
  listCompanyEventNeedList,
  createCompanyEventNeedListItem,
  patchCompanyEventNeedListItem,
  deleteCompanyEventNeedListItem,
  sendCompanyEventInvitations,
  sendCompanyEventReminders,
  listCompanyEventGuestRegistrations,
  saveCompanyEventSmsDraft,
  listCompanyEventTemplates,
  createCompanyEventTemplate,
  updateCompanyEventTemplate,
  deleteCompanyEventTemplate,
  getCompanyEventAnalytics,
  exportCompanyEventResponsesCsv,
  listCompanyEventSessionSurveys,
  attachCompanyEventSessionSurvey,
  detachCompanyEventSessionSurvey,
  copyCompanyEventToTarget
} from '../controllers/companyEvents.controller.js';
import {
  listSchoolStaffUsers, listAgencySchoolStaffAccounts, bulkSetAgencySchoolStaffTemporaryPasswords, previewSchoolStaffAccountAccessEmail, saveSchoolStaffAccountAccessEmailTemplate, testSchoolStaffAccountAccessEmail, queueSchoolStaffAccountAccessEmails, getSchoolStaffAccountAccessEmailSend, getPendingSchoolStaffAccessPasswordSync, syncSchoolStaffAccountAccessSendPasswords, createSchoolContact, updateSchoolContact, deleteSchoolContact, createSchoolStaffUserFromContact, activateSchoolStaffUser, revokeSchoolStaffAccess
} from '../controllers/schoolStaffAdmin.controller.js';
import {
  getAdminUpdateOptions,
  listAdminUpdates,
  createAdminUpdate,
  getAdminUpdate,
  updateAdminUpdate,
  deleteAdminUpdate,
  addAdminUpdateTopic,
  updateAdminUpdateTopic,
  deleteAdminUpdateTopic,
  addAdminUpdateItem,
  updateAdminUpdateItem,
  deleteAdminUpdateItem,
  refreshAdminUpdatePeople,
  previewAdminUpdate,
  testAdminUpdate,
  scheduleAdminUpdate,
  cancelAdminUpdate,
  getAdminUpdateActivity,
  getAdminUpdatePublicLink
} from '../controllers/adminUpdate.controller.js';
import {
  createBookClubBook,
  getBookClub,
  getPublicBookClubByPortal,
  listBookClubBooksForTenant,
  listBookClubInterests,
  setupBookClub,
  updateBookClub,
  updateBookClubBook
} from '../controllers/bookClub.controller.js';
import { authenticate, requireBackofficeAdmin, requireBackofficeAdminOrClubManagerForAgency, requireSuperAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Common validation for icon IDs (allows null to clear icons)
const validateIconId = (fieldName) => body(fieldName).optional().custom((value) => {
  if (value === null || value === undefined || value === '') return true;
  const num = parseInt(value);
  return !isNaN(num) && num > 0;
}).withMessage(`${fieldName} must be a positive integer or null`);

// Validation for creating agencies (name and slug required)
const validateCreateAgency = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('officialName').optional().isLength({ max: 255 }).withMessage('officialName must be 255 characters or less'),
  body('slug').trim().notEmpty().withMessage('Slug is required').matches(/^[a-z0-9-]+$/).withMessage('Slug must be lowercase alphanumeric with hyphens only'),
  body('organizationType').optional().isIn(['agency', 'school', 'program', 'learning', 'clinical', 'affiliation', 'life_coach', 'consultant']).withMessage('organizationType must be one of: agency, school, program, learning, clinical, affiliation, life_coach, consultant'),
  body('affiliatedAgencyId').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).withMessage('affiliatedAgencyId must be a positive integer'),
  body('customDomain').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    const v = String(value).trim();
    if (!v) return true;
    // Hostname only (no scheme/path)
    if (v.includes('://')) return false;
    if (v.includes('/') || v.includes('?') || v.includes('#')) return false;
    // Basic hostname chars (allow dots + hyphens). Keep it permissive but safe.
    if (!/^[a-zA-Z0-9.-]+(:\d+)?$/.test(v)) return false;
    return true;
  }).withMessage('customDomain must be a hostname like "app.agency2.com" (no https://, no path)'),
  body('logoUrl').optional().custom((value) => {
    if (!value || value === null || value === '') return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }).withMessage('Logo URL must be a valid URL'),
  body('colorPalette')
    .optional({ nullable: true })
    .custom((value) => value === null || (typeof value === 'object' && !Array.isArray(value)))
    .withMessage('Color palette must be an object or null'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validateIconId('chatIconId'),
  validateIconId('trainingFocusDefaultIconId'),
  validateIconId('moduleDefaultIconId'),
  validateIconId('userDefaultIconId'),
  validateIconId('documentDefaultIconId'),
  validateIconId('manageAgenciesIconId'),
  validateIconId('progressDashboardIconId'),
  validateIconId('viewAllProgressIconId'),
  validateIconId('manageClientsIconId'),
  validateIconId('schoolOverviewIconId'),
  validateIconId('externalCalendarAuditIconId'),
  validateIconId('skillBuildersAvailabilityIconId'),
  validateIconId('manageModulesIconId'),
  validateIconId('manageDocumentsIconId'),
  validateIconId('manageUsersIconId'),
  validateIconId('platformSettingsIconId'),
  validateIconId('settingsIconId'),
  validateIconId('dashboardNotificationsIconId'),
  validateIconId('dashboardCommunicationsIconId'),
  validateIconId('dashboardChatsIconId'),
  validateIconId('dashboardPayrollIconId'),
  validateIconId('dashboardBillingIconId'),
  validateIconId('myDashboardChecklistIconId'),
  validateIconId('myDashboardMomentumListIconId'),
  validateIconId('myDashboardMomentumStickiesIconId'),
  validateIconId('myDashboardTrainingIconId'),
  validateIconId('myDashboardDocumentsIconId'),
  validateIconId('myDashboardMyAccountIconId'),
  validateIconId('myDashboardOnDemandTrainingIconId'),
  validateIconId('schoolPortalProvidersIconId'),
  validateIconId('schoolPortalDaysIconId'),
  validateIconId('schoolPortalRosterIconId'),
  validateIconId('schoolPortalSkillsGroupsIconId'),
  validateIconId('schoolPortalContactAdminIconId'),
  validateIconId('schoolPortalSchoolStaffIconId'),
  validateIconId('schoolPortalParentQrIconId'),
  validateIconId('schoolPortalParentSignIconId'),
  validateIconId('schoolPortalUploadPacketIconId'),
  validateIconId('schoolPortalEventsIconId'),
  validateIconId('schoolPortalDigitalFormsIconId'),
  validateIconId('supportTicketCreatedIconId'),
  validateIconId('clubAddMemberIconId'),
  validateIconId('clubAddSeasonIconId'),
  validateIconId('clubSettingsIconId'),
  body('ticketingNotificationOrgTypes').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return null; } })() : value;
    if (!Array.isArray(parsed)) return false;
    const allowed = new Set(['school', 'program', 'learning', 'clinical']);
    return parsed.every((t) => allowed.has(String(t || '').trim().toLowerCase()));
  }).withMessage('ticketingNotificationOrgTypes must be an array containing only: school, program, learning, clinical'),
  body('certificateTemplateUrl').optional().isURL().withMessage('Certificate template URL must be a valid URL'),
  body('onboardingTeamEmail').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }).withMessage('Onboarding team email must be a valid email address or empty'),
  body('phoneNumber').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    // Normalize common Unicode "smart" dashes to ASCII hyphen so numbers like
    // "(719) 475‑6130" (U+2011) validate correctly.
    const normalized = String(value)
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
      .replace(/\u00A0/g, ' ');
    // Strip any hidden/unexpected characters (copy/paste artifacts).
    const sanitized = normalized.replace(/[^\d\s\(\)\-\+\.]/g, '');
    const digits = sanitized.replace(/\D/g, '');
    if (!digits.length) return false;
    // Basic guardrail: if present, should look like a phone-ish value.
    if (digits.length < 7) return false;
    return /^[\d\s\(\)\-\+\.]+$/.test(sanitized);
  }).withMessage('Phone number must be a valid phone format or empty'),
  body('phoneExtension').optional({ nullable: true, checkFalsy: true }).matches(/^[a-zA-Z0-9]{0,10}$/).withMessage('Phone extension must be alphanumeric and max 10 characters'),
  body('portalUrl').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    return /^[a-z0-9-]+$/.test(value);
  }).withMessage('Portal URL must be lowercase alphanumeric with hyphens only or empty'),
  body('themeSettings').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Theme settings must be a valid JSON object'),
  body('customParameters').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Custom parameters must be a valid JSON object')
  ,
  body('featureFlags').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Feature flags must be a valid JSON object')
  ,
  body('tenantAvailableAgencyFeaturesJson').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('tenantAvailableAgencyFeaturesJson must be a valid JSON object')
  ,
  body('intakeRetentionPolicy').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Intake retention policy must be a valid JSON object')
  ,
  body('sessionSettings').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Session settings must be a valid JSON object')
];

// Validation for updating agencies (name and slug optional, can update just branding)
const validateUpdateAgency = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('officialName').optional().isLength({ max: 255 }).withMessage('officialName must be 255 characters or less'),
  body('slug').optional().trim().notEmpty().withMessage('Slug cannot be empty').matches(/^[a-z0-9-]+$/).withMessage('Slug must be lowercase alphanumeric with hyphens only'),
  body('organizationType').optional().isIn(['agency', 'school', 'program', 'learning', 'clinical', 'affiliation', 'life_coach', 'consultant']).withMessage('organizationType must be one of: agency, school, program, learning, clinical, affiliation, life_coach, consultant'),
  body('affiliatedAgencyId').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).withMessage('affiliatedAgencyId must be a positive integer'),
  body('customDomain').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    const v = String(value).trim();
    if (!v) return true;
    if (v.includes('://')) return false;
    if (v.includes('/') || v.includes('?') || v.includes('#')) return false;
    if (!/^[a-zA-Z0-9.-]+(:\d+)?$/.test(v)) return false;
    return true;
  }).withMessage('customDomain must be a hostname like "app.agency2.com" (no https://, no path)'),
  body('logoUrl').optional().custom((value) => {
    // Allow null, undefined, or empty string
    if (!value || value === null || value === '' || value === undefined) return true;
    // If a value is provided, it must be a valid URL
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }).withMessage('Logo URL must be a valid URL or empty'),
  body('colorPalette')
    .optional({ nullable: true })
    .custom((value) => value === null || (typeof value === 'object' && !Array.isArray(value)))
    .withMessage('Color palette must be an object or null'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validateIconId('chatIconId'),
  validateIconId('trainingFocusDefaultIconId'),
  validateIconId('moduleDefaultIconId'),
  validateIconId('userDefaultIconId'),
  validateIconId('documentDefaultIconId'),
  validateIconId('manageAgenciesIconId'),
  validateIconId('progressDashboardIconId'),
  validateIconId('viewAllProgressIconId'),
  validateIconId('manageClientsIconId'),
  validateIconId('schoolOverviewIconId'),
  validateIconId('externalCalendarAuditIconId'),
  validateIconId('skillBuildersAvailabilityIconId'),
  validateIconId('manageModulesIconId'),
  validateIconId('manageDocumentsIconId'),
  validateIconId('manageUsersIconId'),
  validateIconId('platformSettingsIconId'),
  validateIconId('settingsIconId'),
  validateIconId('dashboardNotificationsIconId'),
  validateIconId('dashboardCommunicationsIconId'),
  validateIconId('dashboardChatsIconId'),
  validateIconId('dashboardPayrollIconId'),
  validateIconId('dashboardBillingIconId'),
  validateIconId('myDashboardChecklistIconId'),
  validateIconId('myDashboardMomentumListIconId'),
  validateIconId('myDashboardMomentumStickiesIconId'),
  validateIconId('myDashboardTrainingIconId'),
  validateIconId('myDashboardDocumentsIconId'),
  validateIconId('myDashboardMyAccountIconId'),
  validateIconId('myDashboardOnDemandTrainingIconId'),
  validateIconId('schoolPortalProvidersIconId'),
  validateIconId('schoolPortalDaysIconId'),
  validateIconId('schoolPortalRosterIconId'),
  validateIconId('schoolPortalSkillsGroupsIconId'),
  validateIconId('schoolPortalContactAdminIconId'),
  validateIconId('schoolPortalSchoolStaffIconId'),
  validateIconId('schoolPortalParentQrIconId'),
  validateIconId('schoolPortalParentSignIconId'),
  validateIconId('schoolPortalUploadPacketIconId'),
  validateIconId('schoolPortalEventsIconId'),
  validateIconId('schoolPortalDigitalFormsIconId'),
  validateIconId('supportTicketCreatedIconId'),
  validateIconId('clubAddMemberIconId'),
  validateIconId('clubAddSeasonIconId'),
  validateIconId('clubSettingsIconId'),
  body('ticketingNotificationOrgTypes').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return null; } })() : value;
    if (!Array.isArray(parsed)) return false;
    const allowed = new Set(['school', 'program', 'learning', 'clinical']);
    return parsed.every((t) => allowed.has(String(t || '').trim().toLowerCase()));
  }).withMessage('ticketingNotificationOrgTypes must be an array containing only: school, program, learning, clinical'),
  body('certificateTemplateUrl').optional().custom((value) => {
    // Allow null, undefined, or empty string
    if (!value || value === null || value === '' || value === undefined) return true;
    // If a value is provided, validate it's a URL
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }).withMessage('Certificate template URL must be a valid URL or empty'),
  body('onboardingTeamEmail').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }).withMessage('Onboarding team email must be a valid email address or empty'),
  body('phoneNumber').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    const normalized = String(value)
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
      .replace(/\u00A0/g, ' ');
    const sanitized = normalized.replace(/[^\d\s\(\)\-\+\.]/g, '');
    const digits = sanitized.replace(/\D/g, '');
    if (!digits.length) return false;
    if (digits.length < 7) return false;
    return /^[\d\s\(\)\-\+\.]+$/.test(sanitized);
  }).withMessage('Phone number must be a valid phone format or empty'),
  body('phoneExtension').optional({ nullable: true, checkFalsy: true }).matches(/^[a-zA-Z0-9]{0,10}$/).withMessage('Phone extension must be alphanumeric and max 10 characters'),
  body('portalUrl').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    return /^[a-z0-9-]+$/.test(value);
  }).withMessage('Portal URL must be lowercase alphanumeric with hyphens only or empty'),
  body('themeSettings').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Theme settings must be a valid JSON object'),
  body('customParameters').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Custom parameters must be a valid JSON object')
  ,
  body('featureFlags').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Feature flags must be a valid JSON object')
  ,
  body('tenantAvailableAgencyFeaturesJson').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('tenantAvailableAgencyFeaturesJson must be a valid JSON object')
  ,
  body('intakeRetentionPolicy').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Intake retention policy must be a valid JSON object')
  ,
  body('sessionSettings').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Session settings must be a valid JSON object')
  ,
  body('publicAvailabilityEnabled')
    .optional()
    .isBoolean()
    .withMessage('publicAvailabilityEnabled must be a boolean')
];

// Public routes (no auth required) - must come before /:id route
router.get('/resolve', resolvePortalByHost);
router.get('/slug/:slug', getAgencyBySlug); // Get organization by slug (supports all organization types)
router.get('/portal/:portalUrl', getAgencyByPortalUrl);
router.get('/portal/:portalUrl/theme', getThemeByPortalUrl);
router.get('/portal/:portalUrl/login-theme', getLoginThemeByPortalUrl);
router.get('/portal/:portalUrl/book-club/public', getPublicBookClubByPortal);
router.get('/portal/:portalUrl/bookclub/public', getPublicBookClubByPortal);

// Protected routes
router.get('/', authenticate, getAllAgencies);
router.get('/archived', authenticate, requireSuperAdmin, getArchivedAgencies);
router.get('/management-team/eligible-users', authenticate, requireSuperAdmin, listEligibleUsers);
router.get('/management-team/role-types', authenticate, getRoleTypes);
router.get('/:id/affiliated-organizations', authenticate, requireBackofficeAdmin, listAffiliatedOrganizations);
router.get('/:id/settings-people-snapshot', authenticate, requireBackofficeAdmin, getTenantPeopleSnapshot);
router.get('/:id/disclosure-settings', authenticate, getAgencyDisclosureSettings);
router.put('/:id/disclosure-settings', authenticate, putAgencyDisclosureSettings);
router.get('/:agencyId/school-intake-master', authenticate, getAgencySchoolIntakeMaster);
router.put('/:agencyId/school-intake-master', authenticate, putAgencySchoolIntakeMaster);
router.get('/:agencyId/school-packet-template-versions', authenticate, listAgencySchoolPacketTemplateVersions);
router.get('/:agencyId/school-packet-template-versions/:version', authenticate, getAgencySchoolPacketTemplateVersion);
router.get('/:agencyId/office-intake-master', authenticate, getAgencyOfficeIntakeMaster);
router.put('/:agencyId/office-intake-master', authenticate, putAgencyOfficeIntakeMaster);
router.get('/:agencyId/office-packet-template', authenticate, getAgencyOfficePacketTemplate);
router.put('/:agencyId/office-packet-template', authenticate, putAgencyOfficePacketTemplate);
router.get('/:agencyId/office-packet-template/pdf', authenticate, downloadAgencyOfficePacketTemplatePdf);
router.get('/:agencyId/office-packet-template-versions', authenticate, listAgencyOfficePacketTemplateVersions);
router.get('/:agencyId/office-packet-template-versions/:version', authenticate, getAgencyOfficePacketTemplateVersion);
router.get('/:agencyId/office-packet-brand', authenticate, getAgencyPacketBrand);
router.put('/:agencyId/office-packet-brand/version', authenticate, putAgencyPacketBrandVersion);
router.post(
  '/:agencyId/office-packet-brand/:slot',
  authenticate,
  packetBrandUpload.single('file'),
  uploadAgencyPacketBrandAsset
);
router.get('/:agencyId/channel-intake-masters', authenticate, listAgencyChannelIntakeMasters);
router.get('/:agencyId/channel-intake-masters/:channel', authenticate, getAgencyChannelIntakeMaster);
router.put('/:agencyId/channel-intake-masters/:channel', authenticate, putAgencyChannelIntakeMaster);
router.get('/:id', authenticate, getAgencyById);

// School Staff admin (school orgs only). Includes staff role support.
router.get('/:id/school-staff/accounts', authenticate, listAgencySchoolStaffAccounts);
router.post('/:id/school-staff/accounts/bulk-temporary-password', authenticate, bulkSetAgencySchoolStaffTemporaryPasswords);
router.post('/:id/school-staff/accounts/access-email/preview', authenticate, previewSchoolStaffAccountAccessEmail);
router.post('/:id/school-staff/accounts/access-email/template', authenticate, saveSchoolStaffAccountAccessEmailTemplate);
router.post('/:id/school-staff/accounts/access-email/test', authenticate, testSchoolStaffAccountAccessEmail);
router.post('/:id/school-staff/accounts/access-email/send', authenticate, queueSchoolStaffAccountAccessEmails);
router.get('/:id/school-staff/accounts/access-email/sends/:sendId', authenticate, getSchoolStaffAccountAccessEmailSend);
router.get('/:id/school-staff/accounts/access-email/pending-password-sync', authenticate, getPendingSchoolStaffAccessPasswordSync);
router.post('/:id/school-staff/accounts/access-email/sends/:sendId/sync-temporary-password', authenticate, syncSchoolStaffAccountAccessSendPasswords);
router.get('/:id/admin-updates/options', authenticate, getAdminUpdateOptions);
router.get('/:id/admin-updates', authenticate, listAdminUpdates);
router.post('/:id/admin-updates', authenticate, createAdminUpdate);
router.get('/:id/admin-updates/:updateId', authenticate, getAdminUpdate);
router.put('/:id/admin-updates/:updateId', authenticate, updateAdminUpdate);
router.delete('/:id/admin-updates/:updateId', authenticate, deleteAdminUpdate);
router.post('/:id/admin-updates/:updateId/topics', authenticate, addAdminUpdateTopic);
router.put('/:id/admin-updates/:updateId/topics/:topicId', authenticate, updateAdminUpdateTopic);
router.delete('/:id/admin-updates/:updateId/topics/:topicId', authenticate, deleteAdminUpdateTopic);
router.post('/:id/admin-updates/:updateId/topics/:topicId/items', authenticate, addAdminUpdateItem);
router.put('/:id/admin-updates/:updateId/items/:itemId', authenticate, updateAdminUpdateItem);
router.delete('/:id/admin-updates/:updateId/items/:itemId', authenticate, deleteAdminUpdateItem);
router.post('/:id/admin-updates/:updateId/refresh-people', authenticate, refreshAdminUpdatePeople);
router.get('/:id/admin-updates/:updateId/preview', authenticate, previewAdminUpdate);
router.post('/:id/admin-updates/:updateId/test', authenticate, testAdminUpdate);
router.post('/:id/admin-updates/:updateId/schedule', authenticate, scheduleAdminUpdate);
router.post('/:id/admin-updates/:updateId/cancel', authenticate, cancelAdminUpdate);
router.get('/:id/admin-updates/:updateId/activity', authenticate, getAdminUpdateActivity);
router.get('/:id/admin-updates/:updateId/public-link', authenticate, getAdminUpdatePublicLink);
router.get('/:id/school-staff/users', authenticate, listSchoolStaffUsers);
router.post('/:id/school-contacts', authenticate, createSchoolContact);
router.put('/:id/school-contacts/:contactId', authenticate, updateSchoolContact);
router.delete('/:id/school-contacts/:contactId', authenticate, deleteSchoolContact);
router.post('/:id/school-contacts/:contactId/create-user', authenticate, createSchoolStaffUserFromContact);
router.post('/:id/school-staff/users/:userId/activate', authenticate, activateSchoolStaffUser);
router.post('/:id/school-staff/users/:userId/revoke-access', authenticate, revokeSchoolStaffAccess);

router.get('/:id/announcements', authenticate, requireBackofficeAdmin, getAgencyAnnouncements);
router.put('/:id/announcements', authenticate, requireBackofficeAdmin, updateAgencyAnnouncements);
router.get('/:id/announcements/banner', authenticate, listAgencyBannerAnnouncements);
router.get('/:id/announcements/list', authenticate, requireBackofficeAdminOrClubManagerForAgency, listAgencyScheduledAnnouncements);
router.get('/:id/announcements/audience-groups', authenticate, requireBackofficeAdminOrClubManagerForAgency, listAnnouncementAudienceGroups);
router.post('/:id/announcements', authenticate, requireBackofficeAdminOrClubManagerForAgency, createAgencyScheduledAnnouncement);
router.post('/:id/announcements/with-thread', authenticate, requireBackofficeAdminOrClubManagerForAgency, postClubAnnouncementWithThread);
router.put('/:id/announcements/:announcementId', authenticate, requireBackofficeAdminOrClubManagerForAgency, updateAgencyScheduledAnnouncement);
router.delete('/:id/announcements/:announcementId', authenticate, requireBackofficeAdminOrClubManagerForAgency, deleteAgencyScheduledAnnouncement);
router.get('/:id/dashboard-banner', authenticate, getAgencyDashboardBanner);
router.get('/:id/management-team', authenticate, getManagementTeam);
router.get('/:id/management-team/today', authenticate, getManagementTeamToday);
router.get('/:id/management-team/config', authenticate, getManagementTeamConfig);
router.put('/:id/management-team/config', authenticate, updateManagementTeamConfig);
router.get('/:id/management-team/coverage', authenticate, listCoverage);
router.post('/:id/management-team/coverage', authenticate, setCoverage);
router.delete('/:id/management-team/coverage', authenticate, deleteCoverage);
router.get('/:id/notification-triggers', authenticate, requireBackofficeAdmin, listAgencyNotificationTriggers);
router.put('/:id/notification-triggers/:triggerKey', authenticate, requireBackofficeAdmin, updateAgencyNotificationTrigger);
router.get('/:id/notification-preferences', authenticate, requireBackofficeAdmin, getAgencyNotificationPreferences);
router.put('/:id/notification-preferences', authenticate, requireBackofficeAdmin, updateAgencyNotificationPreferences);
router.get('/:id/notification-sender', authenticate, requireSuperAdmin, getAgencyNotificationSender);
router.put('/:id/notification-sender', authenticate, requireSuperAdmin, putAgencyNotificationSender);

// Program reminder schedules
router.get('/:id/program-reminders', authenticate, requireBackofficeAdmin, listProgramReminderSchedules);
router.post('/:id/program-reminders', authenticate, requireBackofficeAdmin, createProgramReminderSchedule);
router.put('/:id/program-reminders/:scheduleId', authenticate, requireBackofficeAdmin, updateProgramReminderSchedule);
router.delete('/:id/program-reminders/:scheduleId', authenticate, requireBackofficeAdmin, deleteProgramReminderSchedule);
router.get('/:id/company-events/:eventId/ics', authenticate, downloadCompanyEventIcsForAgency);
router.get('/:id/company-events/directory/roster.pdf', authenticate, exportCompanyEventsDirectoryRosterPdf);
router.get('/:id/company-events', authenticate, listCompanyEventsForAgency);
router.get('/:id/company-events/internal-registration-feed', authenticate, listInternalRegistrationPromosForAgency);
router.get('/:id/company-events/audience-options', authenticate, listCompanyEventAudienceOptions);
router.post('/:id/company-events', authenticate, createCompanyEvent);
router.put('/:id/company-events/:eventId', authenticate, updateCompanyEvent);
router.delete('/:id/company-events/:eventId', authenticate, deleteCompanyEvent);
router.post('/:id/company-events/:eventId/copy-to', authenticate, requireSuperAdmin, copyCompanyEventToTarget);
router.get('/:id/company-events/:eventId/responses', authenticate, listCompanyEventResponses);
router.get('/:id/company-events/:eventId/delivery-logs', authenticate, listCompanyEventDeliveryLogs);
router.get('/:id/company-events/:eventId/analytics', authenticate, getCompanyEventAnalytics);
router.get('/:id/company-events/:eventId/responses.csv', authenticate, exportCompanyEventResponsesCsv);
router.get('/:id/company-events/:eventId/session-surveys', authenticate, listCompanyEventSessionSurveys);
router.post('/:id/company-events/:eventId/session-surveys', authenticate, attachCompanyEventSessionSurvey);
router.delete('/:id/company-events/:eventId/session-surveys/:attachmentId', authenticate, detachCompanyEventSessionSurvey);
router.post('/:id/company-events/:eventId/close-voting', authenticate, closeCompanyEventVoting);
router.post('/:id/company-events/:eventId/send-sms-vote', authenticate, sendCompanyEventVotingSms);
router.post('/:id/company-events/:eventId/send-direct-message', authenticate, sendCompanyEventDirectMessage);
router.get('/:id/company-events/:eventId/need-list', authenticate, listCompanyEventNeedList);
router.post('/:id/company-events/:eventId/need-list', authenticate, createCompanyEventNeedListItem);
router.patch('/:id/company-events/:eventId/need-list/:itemId', authenticate, patchCompanyEventNeedListItem);
router.delete('/:id/company-events/:eventId/need-list/:itemId', authenticate, deleteCompanyEventNeedListItem);
router.post('/:id/company-events/:eventId/send-invitations', authenticate, sendCompanyEventInvitations);
router.post('/:id/company-events/:eventId/send-reminders', authenticate, sendCompanyEventReminders);
router.get('/:id/company-events/:eventId/guest-registrations', authenticate, listCompanyEventGuestRegistrations);
router.post('/:id/company-events/:eventId/sms-compose', authenticate, saveCompanyEventSmsDraft);
router.post('/:id/company-events/:eventId/sms-schedule', authenticate, saveCompanyEventSmsDraft);
router.get('/:id/company-events/templates', authenticate, listCompanyEventTemplates);
router.post('/:id/company-events/templates', authenticate, createCompanyEventTemplate);
router.put('/:id/company-events/templates/:templateId', authenticate, updateCompanyEventTemplate);
router.delete('/:id/company-events/templates/:templateId', authenticate, deleteCompanyEventTemplate);
router.get('/:id/book-club', authenticate, getBookClub);
router.put('/:id/book-club', authenticate, updateBookClub);
router.post('/:id/book-club/setup', authenticate, setupBookClub);
router.get('/:id/book-club/books', authenticate, listBookClubBooksForTenant);
router.post('/:id/book-club/books', authenticate, createBookClubBook);
router.put('/:id/book-club/books/:bookId', authenticate, updateBookClubBook);
router.get('/:id/book-club/interests', authenticate, listBookClubInterests);
router.post('/', authenticate, requireBackofficeAdmin, validateCreateAgency, createAgency);
router.put('/:id', authenticate, requireBackofficeAdminOrClubManagerForAgency, validateUpdateAgency, updateAgency);
router.post('/:id/archive', authenticate, requireSuperAdmin, archiveAgency);
router.post('/:id/restore', authenticate, requireSuperAdmin, restoreAgency);
router.delete('/:id', authenticate, requireSuperAdmin, deleteAgencyHard);

export default router;
