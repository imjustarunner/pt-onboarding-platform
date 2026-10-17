import * as guardianInvitations from '../controllers/guardianInvitation.controller.js';
import * as guardianDemographics from '../controllers/guardianDemographics.controller.js';
import * as notificationSetup from '../controllers/guardianNotificationSetup.controller.js';
import { listClientNotificationHistory } from '../controllers/clientNotificationHistory.controller.js';
import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { listMyGuardianClients } from '../controllers/clientGuardian.controller.js';
import {
  getGuardianPortalOverview,
  listGuardianSkillBuilderEvents,
  getGuardianSkillBuilderEventDetail,
  getGuardianSkillBuilderSessionCurriculum,
  listGuardianSkillBuilderProgramDocuments,
  getGuardianSkillBuilderProgramDocumentFile,
  getGuardianSkillBuilderProgramDocumentResponse,
  putGuardianSkillBuilderProgramDocumentResponse,
  downloadGuardianSkillBuilderProgramDocumentResponsePdf,
  getGuardianSkillBuilderClassPresentation,
  listGuardianSkillBuilderEventPosts,
  ensureGuardianSkillBuilderEventChatThread,
  listGuardianDependentsForAgency,
  listGuardianRegistrationCatalog,
  guardianEnrollCompanyEvent,
  guardianEnrollLearningClass,
  listMyClientIntakeSignedDocuments,
  getMyClientIntakeSignedDocumentDownloadUrl,
  listGuardianCompanyEvents,
  getGuardianCompanyEventDetail,
  getGuardianDependentPlanProgress,
  postGuardianPlanRating,
  postGuardianPlanAcknowledgment
} from '../controllers/guardianPortal.controller.js';
import {
  getMyClientWaiverProfile,
  postMyClientWaiverSectionCreate,
  postMyClientWaiverSectionRevoke,
  putMyClientWaiverSection
} from '../controllers/guardianWaiver.controller.js';
import {
  listGuardianMessageThreads,
  listGuardianThreadMessages,
  sendGuardianThreadMessage,
  openGuardianClientThread,
  listGuardianSmsAudit,
  listGuardianEmails,
  getGuardianEmail,
  replyGuardianEmail
} from '../controllers/guardianMessages.controller.js';
import {
  listGuardianSupportTickets,
  createGuardianSupportTicket,
  getGuardianSupportTicket,
  sendGuardianSupportTicketMessage
} from '../controllers/guardianSupportTickets.controller.js';
import {
  listClientAffiliatedContacts,
  createClientAffiliatedContact,
  patchClientAffiliatedContact,
  deleteClientAffiliatedContact
} from '../controllers/clientContactAffiliation.controller.js';

import * as guardianAppointments from '../controllers/guardianAppointments.controller.js';
import { response as replacementResponse } from '../controllers/appointmentReplacementOffer.controller.js';

const router = express.Router();

router.use(authenticate);

// Guard: only guardian portal accounts
router.use((req, res, next) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  const previewMode = String(req.query?.previewMode || '').trim().toLowerCase();
  const isSuperadminPreview = role === 'super_admin' && previewMode === 'superadmin';
  req.guardianPreviewMode = isSuperadminPreview;
  if (role !== 'client_guardian' && role !== 'client' && !isSuperadminPreview) {
    return res.status(403).json({ error: { message: 'Guardian access required' } });
  }
  next();
});


// These enrollment document handlers restrict both listing and downloads to
// the signed-in guardian's own submissions, in addition to active-link and
// document permissions. A broader clinical-disclosure grant is not required
// to retrieve their own signed forms. Clinical chart documents retain their
// separate disclosure checks on the clinical routes.

router.get('/clients/:clientId/appointments', guardianAppointments.list);
router.get('/clients/:clientId/reminder-preferences', guardianAppointments.getPreferences);
router.put('/clients/:clientId/reminder-preferences', guardianAppointments.savePreferences);
router.post('/clients/:clientId/appointments/:appointmentId/requests', guardianAppointments.requestChange);
router.post('/clients/:clientId/appointments/:appointmentId/cancel', guardianAppointments.cancel);
router.post('/clients/:clientId/appointments/:appointmentId/replacement-offer', replacementResponse);
router.get('/clients/:clientId/notification-history', listClientNotificationHistory);
router.get('/clients/:clientId/notification-setup', notificationSetup.getSetup);
router.post('/clients/:clientId/notification-setup/sms-consent', notificationSetup.beginConsent);
router.get('/clients', listMyGuardianClients);
router.get('/clients/:clientId/details', guardianDemographics.read);
router.post('/clients/:clientId/details', guardianDemographics.submit);
router.get('/messages', listGuardianMessageThreads);
router.post('/messages/open', openGuardianClientThread);
router.get('/emails', listGuardianEmails);
router.get('/emails/:conversationId', getGuardianEmail);
router.post('/emails/:conversationId', replyGuardianEmail);
router.get('/messages/:threadId', listGuardianThreadMessages);
router.post('/messages/:threadId', sendGuardianThreadMessage);
router.get('/sms-audit', listGuardianSmsAudit);
router.get('/support-tickets', listGuardianSupportTickets);
router.post('/support-tickets', createGuardianSupportTicket);
router.get('/support-tickets/:ticketId', getGuardianSupportTicket);
router.post('/support-tickets/:ticketId/messages', sendGuardianSupportTicketMessage);
router.get('/clients/:clientId/intake-documents', listMyClientIntakeSignedDocuments);
router.get('/clients/:clientId/intake-documents/:documentId/download-url', getMyClientIntakeSignedDocumentDownloadUrl);
router.get('/invitations', guardianInvitations.list);
router.post('/invitations/:inviteId/resend', guardianInvitations.resend);
router.get('/overview', getGuardianPortalOverview);
router.get('/skill-builders/events', listGuardianSkillBuilderEvents);
router.get('/skill-builders/events/:eventId/detail', getGuardianSkillBuilderEventDetail);
router.get('/skill-builders/events/:eventId/sessions/:sessionId/curriculum', getGuardianSkillBuilderSessionCurriculum);
router.get('/skill-builders/events/:eventId/program-documents', listGuardianSkillBuilderProgramDocuments);
router.get('/skill-builders/events/:eventId/program-documents/:documentId/file', getGuardianSkillBuilderProgramDocumentFile);
router.get('/skill-builders/events/:eventId/program-documents/:documentId/response', getGuardianSkillBuilderProgramDocumentResponse);
router.put('/skill-builders/events/:eventId/program-documents/:documentId/response', putGuardianSkillBuilderProgramDocumentResponse);
router.get('/skill-builders/events/:eventId/program-documents/:documentId/download', downloadGuardianSkillBuilderProgramDocumentResponsePdf);
router.get('/skill-builders/events/:eventId/class-presentation', getGuardianSkillBuilderClassPresentation);
router.get('/skill-builders/events/:eventId/posts', listGuardianSkillBuilderEventPosts);
router.get('/skill-builders/events/:eventId/chat-thread', ensureGuardianSkillBuilderEventChatThread);

router.get('/dependents', listGuardianDependentsForAgency);
router.get('/dependents/:clientId/plan-progress', getGuardianDependentPlanProgress);
router.post('/dependents/:clientId/plan-progress/ratings', postGuardianPlanRating);
router.post('/dependents/:clientId/plan-progress/acknowledgments/:linkId', postGuardianPlanAcknowledgment);
router.get('/registration/catalog', listGuardianRegistrationCatalog);
router.post('/registration/company-events/:eventId/enroll', guardianEnrollCompanyEvent);
router.post('/registration/learning-classes/:classId/enroll', guardianEnrollLearningClass);

// Non-Skill-Builders program events the guardian's dependents are enrolled in
router.get('/company-events', listGuardianCompanyEvents);
router.get('/company-events/:eventId/detail', getGuardianCompanyEventDetail);

// Reusable guardian–client waivers (agency feature: guardianWaiversEnabled)
router.get('/waivers/clients/:clientId', getMyClientWaiverProfile);
router.post('/waivers/clients/:clientId/sections/:sectionKey', postMyClientWaiverSectionCreate);
router.put('/waivers/clients/:clientId/sections/:sectionKey', putMyClientWaiverSection);
router.post('/waivers/clients/:clientId/sections/:sectionKey/revoke', postMyClientWaiverSectionRevoke);

// Affiliated contacts / appointment reminder recipients
router.get('/clients/:clientId/contacts', listClientAffiliatedContacts);
router.post('/clients/:clientId/contacts', createClientAffiliatedContact);
router.patch('/clients/:clientId/contacts/:affiliationId', patchClientAffiliatedContact);
router.delete('/clients/:clientId/contacts/:affiliationId', deleteClientAffiliatedContact);

export default router;
