import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getMySkillBuildersProgram,
  listMyAssignedSkillBuilderEvents,
  listUpcomingSkillBuilderEventsForApply,
  applyToSkillBuilderEvent,
  listMySkillBuilderEventClients,
  getMySkillBuilderWorkSchedule,
  getSkillBuilderEventDetail,
  listSkillBuilderEventSessions,
  putSkillBuilderEventSessionProviders,
  getSkillBuilderEventProviderWorkSchedule,
  putSkillBuilderEventProviderWorkSchedule,
  patchSkillBuilderEventGroupMeetings,
  listSkillBuilderEventPosts,
  createSkillBuilderEventPost,
  skillBuilderEventClockIn,
  skillBuilderEventClockOut,
  quickEnrollClientToSkillBuilderEvent,
  listSkillBuildersEventsDirectory,
  getSkillBuilderPortalCompanyEventForEdit,
  putSkillBuilderPortalCompanyEventForEdit,
  getSkillBuilderEventSkillsGroupRoster,
  postSkillBuilderEventSkillsGroupRoster,
  patchSkillBuilderEventSession,
  listSkillBuilderEventProviderAttendance,
  listSkillBuilderEventClientAttendance,
  putSkillBuilderClientSessionAttendance,
  postSkillBuilderSessionCurriculum,
  getSkillBuilderSessionCurriculumFile,
  deleteSkillBuilderSessionCurriculum,
  listSkillBuilderEventProgramDocuments,
  listSkillBuilderProgramOrganizationDocuments,
  postSkillBuilderEventProgramDocument,
  postSkillBuilderProgramOrganizationProgramDocument,
  deleteSkillBuilderEventProgramDocument,
  deleteSkillBuilderProgramOrganizationProgramDocument,
  patchSkillBuilderEventProgramDocument,
  patchSkillBuilderProgramOrganizationProgramDocument,
  postSkillBuilderSessionCurriculumFromLibrary,
  listSkillBuilderSessionClinicalNotes,
  getSkillBuilderSessionClinicalNotesBoard,
  getSkillBuilderSessionClinicalNote,
  putSkillBuilderSessionClinicalNoteManual,
  postSkillBuilderSessionClinicalNoteGenerate,
  deleteSkillBuilderSessionClinicalNotes,
  deleteSkillBuilderSessionClinicalNoteForClient,
  listSkillBuilderActivityOptionsForEvent,
  postSkillBuilderActivityOption,
  patchSkillBuilderActivityOption,
  deleteSkillBuilderActivityOption,
  listMySkillBuilderClinicalNotesIndex,
  listSkillBuilderProgramDocumentActivityOptions,
  postSkillBuilderProgramDocumentActivityOption,
  patchSkillBuilderProgramDocumentActivityOption,
  deleteSkillBuilderProgramDocumentActivityOption
} from '../controllers/skillBuildersProviderHub.controller.js';
import {
  listMasterSkillBuilderClients,
  patchCoordinatorSkillBuilderClient,
  confirmClientReadyForGroups,
  coordinatorAssignClientToEvent,
  coordinatorUnassignClientFromEvent,
  listCoordinatorSkillBuilderCompanyEvents,
  getClientSkillBuilderDetail,
  listSkillBuilderClientNotes,
  createSkillBuilderClientNote,
  addSkillBuilderTransportPickup,
  ensureSkillBuilderEventChatThread,
  confirmClientActiveForSkillBuilderEvent
} from '../controllers/skillBuildersClientManagement.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/me/program', getMySkillBuildersProgram);
router.get('/me/assigned-events', listMyAssignedSkillBuilderEvents);
router.get('/me/upcoming-events', listUpcomingSkillBuilderEventsForApply);
router.post('/me/applications', applyToSkillBuilderEvent);
router.get('/me/clients', listMySkillBuilderEventClients);
router.get('/me/work-schedule', getMySkillBuilderWorkSchedule);
router.get('/me/clinical-notes', listMySkillBuilderClinicalNotesIndex);

router.get('/program-organizations/:programOrganizationId/program-documents', listSkillBuilderProgramOrganizationDocuments);
router.post('/program-organizations/:programOrganizationId/program-documents', ...postSkillBuilderProgramOrganizationProgramDocument);
router.delete(
  '/program-organizations/:programOrganizationId/program-documents/:documentId',
  deleteSkillBuilderProgramOrganizationProgramDocument
);
router.patch(
  '/program-organizations/:programOrganizationId/program-documents/:documentId',
  patchSkillBuilderProgramOrganizationProgramDocument
);
router.get(
  '/program-organizations/:programOrganizationId/program-documents/:documentId/activity-options',
  listSkillBuilderProgramDocumentActivityOptions
);
router.post(
  '/program-organizations/:programOrganizationId/program-documents/:documentId/activity-options',
  postSkillBuilderProgramDocumentActivityOption
);
router.patch(
  '/program-organizations/:programOrganizationId/program-documents/:documentId/activity-options/:optionId',
  patchSkillBuilderProgramDocumentActivityOption
);
router.delete(
  '/program-organizations/:programOrganizationId/program-documents/:documentId/activity-options/:optionId',
  deleteSkillBuilderProgramDocumentActivityOption
);

router.get('/events/directory', listSkillBuildersEventsDirectory);
router.get('/coordinator/master-clients', listMasterSkillBuilderClients);
router.get('/coordinator/company-events-search', listCoordinatorSkillBuilderCompanyEvents);
router.patch('/coordinator/clients/:clientId', patchCoordinatorSkillBuilderClient);
router.post('/coordinator/clients/:clientId/confirm-ready', confirmClientReadyForGroups);
router.post('/coordinator/clients/:clientId/assign-event', coordinatorAssignClientToEvent);
router.post('/coordinator/clients/:clientId/unassign-event', coordinatorUnassignClientFromEvent);
router.get('/clients/:clientId/builder-detail', getClientSkillBuilderDetail);
router.get('/clients/:clientId/builder-notes', listSkillBuilderClientNotes);
router.post('/clients/:clientId/builder-notes', createSkillBuilderClientNote);
router.post('/clients/:clientId/transport-pickups', addSkillBuilderTransportPickup);
router.get('/events/:eventId/chat-thread', ensureSkillBuilderEventChatThread);
router.post('/events/:eventId/clients/:clientId/confirm-active', confirmClientActiveForSkillBuilderEvent);
router.get('/events/:eventId/company-event-edit', getSkillBuilderPortalCompanyEventForEdit);
router.put('/events/:eventId/company-event-edit', putSkillBuilderPortalCompanyEventForEdit);
router.get('/events/:eventId/skills-group-roster', getSkillBuilderEventSkillsGroupRoster);
router.post('/events/:eventId/skills-group-roster', postSkillBuilderEventSkillsGroupRoster);
router.get('/events/:eventId/sessions', listSkillBuilderEventSessions);
router.patch('/events/:eventId/sessions/:sessionId', patchSkillBuilderEventSession);
router.get('/events/:eventId/program-documents', listSkillBuilderEventProgramDocuments);
router.post('/events/:eventId/program-documents', ...postSkillBuilderEventProgramDocument);
router.delete('/events/:eventId/program-documents/:documentId', deleteSkillBuilderEventProgramDocument);
router.patch('/events/:eventId/program-documents/:documentId', patchSkillBuilderEventProgramDocument);
router.post('/events/:eventId/sessions/:sessionId/curriculum-from-library', postSkillBuilderSessionCurriculumFromLibrary);
router.post('/events/:eventId/sessions/:sessionId/curriculum', ...postSkillBuilderSessionCurriculum);
router.get('/events/:eventId/sessions/:sessionId/curriculum', getSkillBuilderSessionCurriculumFile);
router.delete('/events/:eventId/sessions/:sessionId/curriculum', deleteSkillBuilderSessionCurriculum);
router.get('/events/:eventId/sessions/:sessionId/clinical-notes', listSkillBuilderSessionClinicalNotes);
router.get('/events/:eventId/sessions/:sessionId/clinical-notes-board', getSkillBuilderSessionClinicalNotesBoard);
router.get('/events/:eventId/sessions/:sessionId/clinical-notes/clients/:clientId', getSkillBuilderSessionClinicalNote);
router.put('/events/:eventId/sessions/:sessionId/clinical-notes/clients/:clientId', putSkillBuilderSessionClinicalNoteManual);
router.post(
  '/events/:eventId/sessions/:sessionId/clinical-notes/clients/:clientId/generate',
  postSkillBuilderSessionClinicalNoteGenerate
);
router.delete(
  '/events/:eventId/sessions/:sessionId/clinical-notes/clients/:clientId',
  deleteSkillBuilderSessionClinicalNoteForClient
);
router.delete('/events/:eventId/sessions/:sessionId/clinical-notes', deleteSkillBuilderSessionClinicalNotes);
router.get('/events/:eventId/activity-options', listSkillBuilderActivityOptionsForEvent);
router.post('/events/:eventId/activity-options', postSkillBuilderActivityOption);
router.patch('/events/:eventId/activity-options/:optionId', patchSkillBuilderActivityOption);
router.delete('/events/:eventId/activity-options/:optionId', deleteSkillBuilderActivityOption);
router.put('/events/:eventId/sessions/:sessionId/providers', putSkillBuilderEventSessionProviders);
router.put('/events/:eventId/sessions/:sessionId/client-attendance', putSkillBuilderClientSessionAttendance);
router.get('/events/:eventId/attendance/providers', listSkillBuilderEventProviderAttendance);
router.get('/events/:eventId/attendance/clients', listSkillBuilderEventClientAttendance);
router.get('/events/:eventId/detail', getSkillBuilderEventDetail);
router.get('/events/:eventId/providers/:providerUserId/work-schedule', getSkillBuilderEventProviderWorkSchedule);
router.put('/events/:eventId/providers/:providerUserId/work-schedule', putSkillBuilderEventProviderWorkSchedule);
router.patch('/events/:eventId/group-meetings', patchSkillBuilderEventGroupMeetings);
router.get('/events/:eventId/posts', listSkillBuilderEventPosts);
router.post('/events/:eventId/posts', createSkillBuilderEventPost);
router.post('/events/:eventId/kiosk/clock-in', skillBuilderEventClockIn);
router.post('/events/:eventId/kiosk/clock-out', skillBuilderEventClockOut);
router.post('/events/:eventId/quick-enroll-client', quickEnrollClientToSkillBuilderEvent);

export default router;
