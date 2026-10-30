import { downloadEnrollmentCopy } from '../services/guardianEnrollmentCopies.service.js';
import { enrollmentOptions, startGuardianEnrollment } from '../services/guardianEnrollmentStart.service.js';
import * as guardianSessionBooking from '../controllers/guardianSessionBooking.controller.js';
import { listSharedFiles,sharedFile } from '../services/guardianFileShares.service.js';
import { guardianCheckins } from '../services/guardianCheckins.service.js';
import { authorizedClient } from '../services/guardianAppointments.service.js';
import { ensureClientSecureConversation } from '../services/clientSecureConversation.service.js';
import {familyAccount,updateFamilyAccount} from '../services/familyPortalAccount.service.js';
import * as guardianInvitations from '../controllers/guardianInvitation.controller.js';
import * as guardianDemographics from '../controllers/guardianDemographics.controller.js';
import * as notificationSetup from '../controllers/guardianNotificationSetup.controller.js';
import { listClientNotificationHistory } from '../controllers/clientNotificationHistory.controller.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate,requireActiveStatus } from '../middleware/auth.middleware.js';
import {guardianHelpUpload,submitHelp} from '../controllers/guardianPortalHelp.controller.js';
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

router.get('/account',requireActiveStatus,async(req,res,next)=>{try{if(req.guardianPreviewMode)return res.status(403).json({error:{message:'Preview cannot access account details'}});res.set('Cache-Control','no-store').json(await familyAccount(req.user.id));}catch(e){next(e);}});
router.get('/enrollments/options', requireActiveStatus, async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json(await enrollmentOptions(req.user)); } catch (error) { next(error); }
});
router.post('/enrollments', requireActiveStatus, rateLimit({ windowMs: 60 * 60 * 1000, max: 15 }), async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store').status(201).json(await startGuardianEnrollment({
      user: req.user, linkId: req.body?.linkId, subject: req.body?.subject,
      ipAddress: req.ip, userAgent: req.get('user-agent')
    }));
  } catch (error) { next(error); }
});
router.put('/account',requireActiveStatus,rateLimit({windowMs:60000,max:10}),async(req,res,next)=>{try{if(req.guardianPreviewMode)return res.status(403).json({error:{message:'Preview cannot edit account details'}});res.json(await updateFamilyAccount({userId:req.user.id,agencyId:Number(req.body.agencyId),input:req.body}));}catch(e){next(e);}});
router.get('/clients/:clientId/session-booking', guardianSessionBooking.options);
router.get('/clients/:clientId/session-booking/slots', guardianSessionBooking.slots);
router.post('/clients/:clientId/session-booking', guardianSessionBooking.book);
router.get('/clients/:clientId/enrollment-copies/:submissionId/download', async(req,res,next)=>{
  try {
    if(req.guardianPreviewMode)return res.status(403).json({error:{message:'Preview does not expose signed enrollment copies.'}});
    const {body,filename}=await downloadEnrollmentCopy({userId:req.user.id,clientId:Number(req.params.clientId),submissionId:Number(req.params.submissionId),agencyId:Number(req.query.agencyId)||null});
    res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}).send(body);
  }catch(e){next(e);}
});
router.get('/clients/:clientId/appointments', guardianAppointments.list);
router.get('/clients/:clientId/reminder-preferences', guardianAppointments.getPreferences);
router.put('/clients/:clientId/reminder-preferences', guardianAppointments.savePreferences);
router.post('/clients/:clientId/appointments/:appointmentId/requests', guardianAppointments.requestChange);
router.post('/clients/:clientId/appointments/:appointmentId/cancel-preview', guardianAppointments.cancelPreview);
router.post('/clients/:clientId/appointments/:appointmentId/cancel', guardianAppointments.cancel);
router.post('/clients/:clientId/appointments/:appointmentId/replacement-offer', replacementResponse);
router.get('/clients/:clientId/notification-history', listClientNotificationHistory);
router.get('/clients/:clientId/notification-setup', notificationSetup.getSetup);
router.post('/clients/:clientId/notification-setup/sms-consent', notificationSetup.beginConsent);
router.get('/clients', listMyGuardianClients);
router.get('/clients/:clientId/shared-files',requireActiveStatus,async(req,res,next)=>{try{res.set('Cache-Control','no-store').json({files:await listSharedFiles(req.user.id,Number(req.params.clientId),req.query)});}catch(e){next(e);}});
router.get('/clients/:clientId/shared-files/:shareId',requireActiveStatus,async(req,res,next)=>{try{const f=await sharedFile(req.user.id,Number(req.params.clientId),Number(req.params.shareId),req.query);res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':f.type,'Content-Disposition':`attachment; filename="${f.name}"`}).send(f.body);}catch(e){next(e);}});
router.get('/clients/:clientId/checkins',requireActiveStatus,async(req,res,next)=>{try{if(req.guardianPreviewMode)return res.status(403).json({error:{message:'Preview cannot access client records'}});res.set('Cache-Control','no-store').json(await guardianCheckins({userId:req.user.id,clientId:Number(req.params.clientId),agencyId:req.query.agencyId,serviceId:req.query.serviceId}));}catch(e){next(e);}});
router.get('/clients/:clientId/details', guardianDemographics.read);
router.get('/clients/:clientId/care-access',requireActiveStatus,async(req,res,next)=>{try{
  if(req.guardianPreviewMode)return res.status(403).json({error:{message:'Preview cannot access care conversations'}});
  const clientId=Number(req.params.clientId);
  const client=await authorizedClient(req.user.id,clientId,'clinical_messages',req.query);
  const conversation=await ensureClientSecureConversation({clientId,agencyId:client.agency_id,serviceId:client.service?.id,actorUserId:req.user.id});
  res.set('Cache-Control','no-store').json({participants:conversation.participants,shared:true});
}catch(e){next(e);}});
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
router.post('/technology-help',requireActiveStatus,rateLimit({windowMs:60*60*1000,max:10}),guardianHelpUpload.array('screenshots',3),submitHelp);
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
