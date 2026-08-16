import express from 'express';
import multer from 'multer';
import { body } from 'express-validator';
import { publicIntakeLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  approvePublicIntake,
  createPublicIntakeSession,
  createPublicConsent,
  savePublicIntakeProgress,
  getPublicIntakeProgress,
  finalizePublicIntake,
  getPublicIntakeLink,
  getPublicIntakeTemplateHtml,
  getPublicIntakePacketSection,
  viewPublicPacketSectionHtml,
  viewPublicDocumentVersionHtml,
  getPublicIntakeDisclosureContext,
  listPublicCareers,
  getPublicIntakeRegistrationCatalog,
  lookupPublicRegistrationAccount,
  matchPublicIntakeClient,
  reportPublicIntakeLoginHelp,
  getPublicIntakeStatus,
  getSchoolIntakeLink,
  previewPublicTemplate,
  signPublicIntakeDocument,
  submitPublicIntake,
  uploadIntakeFiles,
  saveInsuranceCardPhotos,
  saveGuardianPaymentCard,
  getStripeConfig,
  createStripeSetupIntent,
  identifyPreferencesUser,
  savePreferencesUser,
  getPublicRegistrationReceipt,
  getPublicLinkedTranslation
} from '../controllers/publicIntake.controller.js';
import { downloadPublicIntakeSummaryPdf, emailPublicIntakeSummaryPdf, viewPublicIntakeSummaryHtml } from '../controllers/intakeSummaryPdf.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(publicIntakeLimiter);

router.get('/registration-receipt/:submissionId', getPublicRegistrationReceipt);
router.get('/careers/:agencySlug', listPublicCareers);
router.get('/school/:organizationId', getSchoolIntakeLink);
router.post(
  '/:publicKey/session',
  [
    body('captchaToken').optional().isString()
  ],
  createPublicIntakeSession
);
router.get('/:publicKey/account-lookup', lookupPublicRegistrationAccount);
router.get('/:publicKey/registration-catalog', getPublicIntakeRegistrationCatalog);
router.post('/:publicKey/match-client', matchPublicIntakeClient);
router.post('/:publicKey/login-help', reportPublicIntakeLoginHelp);
router.get('/:publicKey/linked-translation', getPublicLinkedTranslation);
router.get('/:publicKey/progress', getPublicIntakeProgress);
router.post(
  '/:publicKey/progress',
  [
    body('sessionToken').notEmpty().withMessage('sessionToken is required'),
    body('intakeData').optional(),
    body('step').optional()
  ],
  savePublicIntakeProgress
);
router.get('/:publicKey', getPublicIntakeLink);
router.get('/:publicKey/status/:submissionId', getPublicIntakeStatus);
router.get('/:publicKey/document/:templateId/preview', previewPublicTemplate);
router.get('/:publicKey/document/:templateId/html', getPublicIntakeTemplateHtml);
router.get('/:publicKey/document/:templateId/view', viewPublicDocumentVersionHtml);
router.get('/:publicKey/packet-section/:sectionKey', getPublicIntakePacketSection);
router.get('/:publicKey/packet-section/:sectionKey/view', viewPublicPacketSectionHtml);
router.get('/:publicKey/disclosure-context', getPublicIntakeDisclosureContext);
router.post('/:publicKey/approve', authenticate, approvePublicIntake);

router.post(
  '/:publicKey/consent',
  [
    body('signerName').notEmpty().withMessage('signerName is required'),
    body('signerInitials').optional({ nullable: true }).isString(),
    body('signerEmail').notEmpty().withMessage('signerEmail is required'),
    body('signerPhone').optional({ nullable: true }).isString(),
    body('sessionToken').optional({ nullable: true }).isString()
  ],
  createPublicConsent
);

router.post(
  '/:publicKey/submit',
  [
    body('submissionId').isInt().withMessage('submissionId is required'),
    body('signatureData').notEmpty().withMessage('signatureData is required')
  ],
  submitPublicIntake
);

router.post(
  '/:publicKey/:submissionId/upload',
  upload.array('files', 10),
  uploadIntakeFiles
);

router.post(
  '/:publicKey/:submissionId/document/:templateId/sign',
  [
    body('signatureData').optional().isString(),
    body('fieldValues').optional()
  ],
  signPublicIntakeDocument
);

router.post(
  '/:publicKey/:submissionId/finalize',
  [
    body('submissionId').optional().isInt(),
    body('sessionToken').optional().isString()
  ],
  finalizePublicIntake
);

router.get('/:publicKey/:submissionId/summary', viewPublicIntakeSummaryHtml);
router.post(
  '/:publicKey/:submissionId/summary-pdf',
  [
    body('sessionToken').notEmpty().withMessage('sessionToken is required')
  ],
  downloadPublicIntakeSummaryPdf
);
router.post(
  '/:publicKey/:submissionId/summary-pdf/email',
  [
    body('sessionToken').notEmpty().withMessage('sessionToken is required'),
    body('email').isEmail()
  ],
  emailPublicIntakeSummaryPdf
);

router.post(
  '/:publicKey/:submissionId/insurance-card-photos',
  upload.fields([
    { name: 'primary_front', maxCount: 1 },
    { name: 'primary_back', maxCount: 1 },
    { name: 'secondary_front', maxCount: 1 },
    { name: 'secondary_back', maxCount: 1 }
  ]),
  saveInsuranceCardPhotos
);

router.post('/:publicKey/preferences/identify', identifyPreferencesUser);
router.put('/:publicKey/preferences/save', savePreferencesUser);

// Stripe card collection endpoints
router.get('/:publicKey/stripe-config', getStripeConfig);
router.post('/:publicKey/:submissionId/stripe-setup-intent', createStripeSetupIntent);

router.post(
  '/:publicKey/:submissionId/payment-card',
  [
    // Stripe path: stripePaymentMethodId replaces raw card fields
    body('stripePaymentMethodId').optional().isString(),
    body('stripeCustomerId').optional().isString(),
    // QB Payments fallback: card fields required only when no stripe PM
    body('card.number').optional().isString(),
    body('card.expMonth').optional().isString(),
    body('card.expYear').optional().isString(),
    body('card.cvc').optional().isString()
  ],
  saveGuardianPaymentCard
);

export default router;
