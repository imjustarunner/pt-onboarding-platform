import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { listMyGuardianClients } from '../controllers/clientGuardian.controller.js';
import {
  getGuardianPortalOverview,
  listGuardianSkillBuilderEvents,
  getGuardianSkillBuilderEventDetail,
  getGuardianSkillBuilderSessionCurriculum,
  listGuardianSkillBuilderEventPosts,
  ensureGuardianSkillBuilderEventChatThread,
  listGuardianDependentsForAgency,
  listGuardianRegistrationCatalog,
  guardianEnrollCompanyEvent,
  guardianEnrollLearningClass,
  listMyClientIntakeSignedDocuments,
  getMyClientIntakeSignedDocumentDownloadUrl
} from '../controllers/guardianPortal.controller.js';
import {
  getMyClientWaiverProfile,
  postMyClientWaiverSectionCreate,
  postMyClientWaiverSectionRevoke,
  putMyClientWaiverSection
} from '../controllers/guardianWaiver.controller.js';

const router = express.Router();

router.use(authenticate);

// Guard: only guardian portal accounts
router.use((req, res, next) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  if (role !== 'client_guardian') {
    return res.status(403).json({ error: { message: 'Guardian access required' } });
  }
  next();
});

router.get('/clients', listMyGuardianClients);
router.get('/clients/:clientId/intake-documents', listMyClientIntakeSignedDocuments);
router.get('/clients/:clientId/intake-documents/:documentId/download-url', getMyClientIntakeSignedDocumentDownloadUrl);
router.get('/overview', getGuardianPortalOverview);
router.get('/skill-builders/events', listGuardianSkillBuilderEvents);
router.get('/skill-builders/events/:eventId/detail', getGuardianSkillBuilderEventDetail);
router.get('/skill-builders/events/:eventId/sessions/:sessionId/curriculum', getGuardianSkillBuilderSessionCurriculum);
router.get('/skill-builders/events/:eventId/posts', listGuardianSkillBuilderEventPosts);
router.get('/skill-builders/events/:eventId/chat-thread', ensureGuardianSkillBuilderEventChatThread);

router.get('/dependents', listGuardianDependentsForAgency);
router.get('/registration/catalog', listGuardianRegistrationCatalog);
router.post('/registration/company-events/:eventId/enroll', guardianEnrollCompanyEvent);
router.post('/registration/learning-classes/:classId/enroll', guardianEnrollLearningClass);

// Reusable guardian–client waivers (agency feature: guardianWaiversEnabled)
router.get('/waivers/clients/:clientId', getMyClientWaiverProfile);
router.post('/waivers/clients/:clientId/sections/:sectionKey', postMyClientWaiverSectionCreate);
router.put('/waivers/clients/:clientId/sections/:sectionKey', putMyClientWaiverSection);
router.post('/waivers/clients/:clientId/sections/:sectionKey/revoke', postMyClientWaiverSectionRevoke);

export default router;

