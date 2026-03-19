import express from 'express';
import {
  getSchoolClients,
  getProviderMyRoster,
  getSchoolPortalAffiliation,
  getSchoolPortalStats,
  listSchoolStaff,
  removeSchoolStaff,
  sendSchoolStaffResetPassword,
  addSchoolStaff,
  updateSchoolStaff,
  setPrimarySchoolStaff,
  updateSchoolStaffRoleFlags,
  forfeitSchoolAdmin,
  listSchoolPortalFaq,
  createSchoolPortalFaq,
  getClientWaitlistNote,
  upsertClientWaitlistNote,
  listClientComments,
  createClientComment,
  issueSchoolPortalClientSmartRoiLink,
  listSchoolPortalNotificationsFeed,
  markSchoolPortalNotificationsRead,
  dismissSchoolPortalNotifications,
  confirmProviderSchoolAvailability,
  listSchoolPortalBannerAnnouncements,
  createSchoolPortalAnnouncement,
  updateSchoolPortalAnnouncement,
  deleteSchoolPortalAnnouncement,
  createBulkSchoolPortalAnnouncements,
  listBulkSchoolPortalAnnouncements,
  updateBulkSchoolPortalAnnouncements,
  deleteBulkSchoolPortalAnnouncements,
  queryComplianceCorner,
  getSchoolStaffWaiverStatus,
  resetSchoolStaffWaiverStatusForTesting,
  restoreSchoolPortalIntakeArtifacts
} from '../controllers/schoolPortal.controller.js';
import {
  listSchoolProvidersForScheduling,
  listScheduleEntries,
  listAssignedClientsForProviderDay,
  createScheduleEntry,
  updateScheduleEntry,
  moveScheduleEntry,
  deleteScheduleEntry
} from '../controllers/schoolProviderSchedule.controller.js';
import {
  listSchoolDays,
  upsertSchoolDay,
  listDayProviders,
  addProviderToDay,
  getSoftScheduleSlots,
  putSoftScheduleSlots,
  moveSoftScheduleSlot
} from '../controllers/schoolSoftSchedule.controller.js';
import {
  getProviderSchoolProfile,
  getProviderSchoolCaseloadSlots,
  upsertProviderSchoolProfile
} from '../controllers/schoolProviderProfile.controller.js';
import {
  listSkillsGroups,
  createSkillsGroup,
  updateSkillsGroup,
  deleteSkillsGroup,
  updateSkillsGroupProvider,
  updateSkillsGroupClient,
  listSkillsEligibleClients,
  listSkillsEligibleProviders,
  listProviderSkillsGroupMeetings
} from '../controllers/schoolSkillsGroups.controller.js';
import {
  listSchoolPublicDocuments,
  createSchoolPublicDocument,
  updateSchoolPublicDocumentMeta,
  replaceSchoolPublicDocumentFile,
  deleteSchoolPublicDocument
} from '../controllers/schoolPublicDocuments.controller.js';
import { listSchoolPortalIntakeLinks } from '../controllers/schoolPortalIntakeLinks.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// School portal routes (authenticated)
// GET /api/school-portal/:organizationId/clients
router.get('/bulk-announcements', authenticate, listBulkSchoolPortalAnnouncements);
router.post('/bulk-announcements', authenticate, createBulkSchoolPortalAnnouncements);
router.put('/bulk-announcements/:groupId', authenticate, updateBulkSchoolPortalAnnouncements);
router.delete('/bulk-announcements/:groupId', authenticate, deleteBulkSchoolPortalAnnouncements);
router.get('/:organizationId/clients', authenticate, getSchoolClients);
router.get('/:organizationId/my-roster', authenticate, getProviderMyRoster);
router.post('/:organizationId/provider-availability/confirm', authenticate, confirmProviderSchoolAvailability);
router.get('/:organizationId/clients/:clientId/waitlist-note', authenticate, getClientWaitlistNote);
router.put('/:organizationId/clients/:clientId/waitlist-note', authenticate, upsertClientWaitlistNote);
router.get('/:organizationId/clients/:clientId/comments', authenticate, listClientComments);
router.post('/:organizationId/clients/:clientId/comments', authenticate, createClientComment);
router.post('/:organizationId/clients/:clientId/smart-roi-link', authenticate, issueSchoolPortalClientSmartRoiLink);
router.get('/:organizationId/notifications/feed', authenticate, listSchoolPortalNotificationsFeed);
router.post('/:organizationId/notifications/read', authenticate, markSchoolPortalNotificationsRead);
router.post('/:organizationId/notifications/dismiss', authenticate, dismissSchoolPortalNotifications);
router.get('/:organizationId/announcements/banner', authenticate, listSchoolPortalBannerAnnouncements);
router.post('/:organizationId/announcements', authenticate, createSchoolPortalAnnouncement);
router.put('/:organizationId/announcements/:announcementId', authenticate, updateSchoolPortalAnnouncement);
router.delete('/:organizationId/announcements/:announcementId', authenticate, deleteSchoolPortalAnnouncement);
router.post('/:organizationId/compliance-corner/query', authenticate, queryComplianceCorner);
router.get('/:schoolId/affiliation', authenticate, getSchoolPortalAffiliation);
router.get('/:organizationId/stats', authenticate, getSchoolPortalStats);
router.get('/:organizationId/school-staff-waiver/status', authenticate, getSchoolStaffWaiverStatus);
router.post('/:organizationId/school-staff-waiver/reset', authenticate, resetSchoolStaffWaiverStatusForTesting);
router.post('/:organizationId/admin-tools/restore-intake-artifacts', authenticate, restoreSchoolPortalIntakeArtifacts);
router.get('/:organizationId/school-staff', authenticate, listSchoolStaff);
router.delete('/:organizationId/school-staff/:userId', authenticate, removeSchoolStaff);
router.put('/:organizationId/school-staff/:userId', authenticate, updateSchoolStaff);
router.post('/:organizationId/school-staff/:userId/send-reset-password', authenticate, sendSchoolStaffResetPassword);
router.post('/:organizationId/school-staff/:userId/set-primary', authenticate, setPrimarySchoolStaff);
router.patch('/:organizationId/school-staff/:userId/roles', authenticate, updateSchoolStaffRoleFlags);
router.post('/:organizationId/school-staff/forfeit-school-admin', authenticate, forfeitSchoolAdmin);
router.post('/:organizationId/school-staff', authenticate, addSchoolStaff);
router.get('/:organizationId/faq', authenticate, listSchoolPortalFaq);
router.post('/:organizationId/faq', authenticate, createSchoolPortalFaq);

// School portal: shared public documents library (non-PHI)
router.get('/:organizationId/intake-links', authenticate, listSchoolPortalIntakeLinks);
router.get('/:organizationId/public-documents', authenticate, listSchoolPublicDocuments);
router.post('/:organizationId/public-documents', authenticate, createSchoolPublicDocument);
router.put('/:organizationId/public-documents/:documentId', authenticate, updateSchoolPublicDocumentMeta);
router.put('/:organizationId/public-documents/:documentId/file', authenticate, replaceSchoolPublicDocumentFile);
router.delete('/:organizationId/public-documents/:documentId', authenticate, deleteSchoolPublicDocument);

// Provider page within a school (profile + slot-based caseload)
router.get('/:schoolId/providers/:providerId/profile', authenticate, getProviderSchoolProfile);
router.put('/:schoolId/providers/:providerId/profile', authenticate, upsertProviderSchoolProfile);
router.get('/:schoolId/providers/:providerId/caseload-slots', authenticate, getProviderSchoolCaseloadSlots);

// School Portal redesign: days + soft schedule slots (Mon–Fri)
router.get('/:schoolId/days', authenticate, listSchoolDays);
router.post('/:schoolId/days/:weekday', authenticate, upsertSchoolDay);
router.get('/:schoolId/days/:weekday/providers', authenticate, listDayProviders);
router.post('/:schoolId/days/:weekday/providers', authenticate, addProviderToDay);
router.get('/:schoolId/days/:weekday/providers/:providerId/soft-slots', authenticate, getSoftScheduleSlots);
router.put('/:schoolId/days/:weekday/providers/:providerId/soft-slots', authenticate, putSoftScheduleSlots);
router.post('/:schoolId/days/:weekday/providers/:providerId/soft-slots/:slotId/move', authenticate, moveSoftScheduleSlot);

// Provider scheduling (school-entered schedule)
router.get('/:schoolId/providers/scheduling', authenticate, listSchoolProvidersForScheduling);
router.get('/:schoolId/providers/:providerId/assigned-clients', authenticate, listAssignedClientsForProviderDay);
router.get('/:schoolId/providers/:providerId/schedule-entries', authenticate, listScheduleEntries);
router.post('/:schoolId/providers/:providerId/schedule-entries', authenticate, createScheduleEntry);
router.put('/:schoolId/providers/:providerId/schedule-entries/:entryId', authenticate, updateScheduleEntry);
router.post('/:schoolId/providers/:providerId/schedule-entries/:entryId/move', authenticate, moveScheduleEntry);
router.delete('/:schoolId/providers/:providerId/schedule-entries/:entryId', authenticate, deleteScheduleEntry);

// School-scoped provider assignment (slot-safe)
// Skills Groups (org-scoped; initially used in school portal UI)
router.get('/:orgId/skills-groups', authenticate, listSkillsGroups);
router.post('/:orgId/skills-groups', authenticate, createSkillsGroup);
router.put('/:orgId/skills-groups/:groupId', authenticate, updateSkillsGroup);
router.delete('/:orgId/skills-groups/:groupId', authenticate, deleteSkillsGroup);
router.post('/:orgId/skills-groups/:groupId/providers', authenticate, updateSkillsGroupProvider);
router.post('/:orgId/skills-groups/:groupId/clients', authenticate, updateSkillsGroupClient);
router.get('/:orgId/skills-eligible-clients', authenticate, listSkillsEligibleClients);
router.get('/:orgId/skills-eligible-providers', authenticate, listSkillsEligibleProviders);
router.get('/:orgId/skills-group-meetings', authenticate, listProviderSkillsGroupMeetings);

export default router;
