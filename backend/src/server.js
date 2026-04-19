import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/config.js';
import requestLoggingMiddleware from './middleware/requestLogging.middleware.js';
import { accessDebugMiddleware } from './middleware/accessDebug.middleware.js';
import authRoutes from './routes/auth.routes.js';
import { verifyClubManagerEmail } from './controllers/auth.controller.js';
import { listClubs } from './controllers/summitStats.controller.js';
import userRoutes from './routes/user.routes.js';
import moduleRoutes from './routes/module.routes.js';
import progressRoutes from './routes/progress.routes.js';
import contentRoutes from './routes/content.routes.js';
import quizRoutes from './routes/quiz.routes.js';
import signatureRoutes from './routes/signature.routes.js';
import agencyRoutes from './routes/agency.routes.js';
import trackRoutes from './routes/track.routes.js';
import acknowledgmentRoutes from './routes/acknowledgment.routes.js';
import agencyDashboardRoutes from './routes/agencyDashboard.routes.js';
import adminActionsRoutes from './routes/adminActions.routes.js';
import taskRoutes from './routes/task.routes.js';
import documentTemplateRoutes from './routes/documentTemplate.routes.js';
import letterheadTemplateRoutes from './routes/letterheadTemplate.routes.js';
import documentSigningRoutes from './routes/documentSigning.routes.js';
import documentAcknowledgmentRoutes from './routes/documentAcknowledgment.routes.js';
import userDocumentRoutes from './routes/userDocument.routes.js';
import userSpecificDocumentRoutes from './routes/userSpecificDocument.routes.js';
import userComplianceDocumentRoutes from './routes/userComplianceDocument.routes.js';
import accountTypeRoutes from './routes/accountType.routes.js';
import userAccountRoutes from './routes/userAccount.routes.js';
import userInfoFieldDefinitionRoutes from './routes/userInfoFieldDefinition.routes.js';
import userInfoValueRoutes from './routes/userInfoValue.routes.js';
import userInfoCategoryRoutes from './routes/userInfoCategory.routes.js';
import customChecklistItemRoutes from './routes/customChecklistItem.routes.js';
import userChecklistAssignmentRoutes from './routes/userChecklistAssignment.routes.js';
import momentumStickiesRoutes from './routes/momentumStickies.routes.js';
import momentumChatRoutes from './routes/momentumChat.routes.js';
import taskListsRoutes from './routes/taskLists.routes.js';
import meetingAgendasRoutes from './routes/meetingAgendas.routes.js';
import approvedEmployeeRoutes from './routes/approvedEmployee.routes.js';
import publicTrainingRoutes from './routes/publicTraining.routes.js';
import agencyOnDemandTrainingRoutes from './routes/agencyOnDemandTraining.routes.js';
import certificateRoutes from './routes/certificate.routes.js';
import iconRoutes from './routes/icon.routes.js';
import logoRoutes from './routes/logo.routes.js';
import iconTemplateRoutes from './routes/iconTemplate.routes.js';
import platformBrandingRoutes from './routes/platformBranding.routes.js';
import platformRetentionSettingsRoutes from './routes/platformRetentionSettings.routes.js';
import onboardingPackageRoutes from './routes/onboardingPackage.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import emailTemplateRoutes from './routes/emailTemplate.routes.js';
import emailSettingsRoutes from './routes/emailSettings.routes.js';
import emailSenderIdentityRoutes from './routes/emailSenderIdentity.routes.js';
import notificationTriggerAdminRoutes from './routes/notificationTriggerAdmin.routes.js';
import userCommunicationRoutes from './routes/userCommunication.routes.js';
import userAdminDocsRoutes from './routes/userAdminDocs.routes.js';
import brandingTemplateRoutes from './routes/brandingTemplate.routes.js';
import fontRoutes from './routes/font.routes.js';
import activityLogRoutes from './routes/activityLog.routes.js';
import supervisorAssignmentRoutes from './routes/supervisorAssignment.routes.js';
import supervisionSessionsRoutes from './routes/supervisionSessions.routes.js';
import teamMeetingsRoutes from './routes/teamMeetings.routes.js';
import agencyCampaignsRoutes from './routes/agencyCampaigns.routes.js';
import healthCheckRoutes from './routes/healthCheck.routes.js';
import referralUploadRoutes from './routes/referralUpload.routes.js';
import referralOcrRoutes from './routes/referralOcr.routes.js';
import referralPacketDraftRoutes from './routes/referralPacketDraft.routes.js';
import publicIntakeRoutes from './routes/publicIntake.routes.js';
import intakeLinksRoutes from './routes/intakeLinks.routes.js';
import directoryRoutes from './routes/directory.routes.js';
import intakeFieldTemplatesRoutes from './routes/intakeFieldTemplates.routes.js';
import unassignedDocumentsRoutes from './routes/unassignedDocuments.routes.js';
import schoolPortalRoutes from './routes/schoolPortal.routes.js';
import socialFeedLinksRoutes from './routes/socialFeedLinks.routes.js';
import referralRoutes from './routes/referral.routes.js';
import bulkImportRoutes from './routes/bulkImport.routes.js';
import userPreferencesRoutes from './routes/userPreferences.routes.js';
import officeScheduleRoutes from './routes/officeSchedule.routes.js';
import voiceVideoRoutes from './routes/voiceVideo.routes.js';
import vonageRoutes from './routes/vonage.routes.js';
import messageRoutes from './routes/message.routes.js';
import smsNumbersRoutes from './routes/smsNumbers.routes.js';
import extensionsRoutes from './routes/extensions.routes.js';
import contactsRoutes from './routes/contacts.routes.js';
import presenceRoutes from './routes/presence.routes.js';
import chatRoutes from './routes/chat.routes.js';
import kudosRoutes from './routes/kudos.routes.js';
import kioskRoutes from './routes/kiosk.routes.js';
import emergencyBroadcastRoutes from './routes/emergencyBroadcast.routes.js';
import payrollRoutes from './routes/payroll.routes.js';
import companyCarRoutes from './routes/companyCar.routes.js';
// Budget routes lazy-loaded to avoid startup lag from @google-cloud/vision
import weatherRoutes from './routes/weather.routes.js';
import receivablesRoutes from './routes/receivables.routes.js';
import psychotherapyComplianceRoutes from './routes/psychotherapyCompliance.routes.js';
import platformRevenueRoutes from './routes/platformRevenue.routes.js';
import billingRoutes from './routes/billing.routes.js';
import executiveReportRoutes from './routes/executiveReport.routes.js';
import clientSettingsRoutes from './routes/clientSettings.routes.js';
import providerSettingsRoutes from './routes/providerSettings.routes.js';
import providerSearchRoutes from './routes/providerSearch.routes.js';
import communicationsRoutes from './routes/communications.routes.js';
import providerImportRoutes from './routes/providerImport.routes.js';
import noteAidRoutes from './routes/noteAid.routes.js';
import agencyCredentialingRoutes from './routes/agencyCredentialing.routes.js';
import schoolSettingsRoutes from './routes/schoolSettings.routes.js';
import bulkClientUploadRoutes from './routes/bulkClientUpload.routes.js';
import bulkSchoolUploadRoutes from './routes/bulkSchoolUpload.routes.js';
import providerSchedulingRoutes from './routes/providerScheduling.routes.js';
import phiDocumentsRoutes from './routes/phiDocuments.routes.js';
import agencySchoolsRoutes from './routes/agencySchools.routes.js';
import agencyDepartmentsRoutes from './routes/agencyDepartments.routes.js';
import clientRoutes from './routes/client.routes.js';
import guardianPortalRoutes from './routes/guardianPortal.routes.js';
import providerSelfRoutes from './routes/providerSelf.routes.js';
import staffRoutes from './routes/staff.routes.js';
import supportTicketsRoutes from './routes/supportTickets.routes.js';
import faqRoutes from './routes/faq.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import officeSettingsRoutes from './routes/officeSettings.routes.js';
import officeSlotActionsRoutes from './routes/officeSlotActions.routes.js';
import officeReviewRoutes from './routes/officeReview.routes.js';
import availabilityRoutes from './routes/availability.routes.js';
import hiringRoutes from './routes/hiring.routes.js';
import agencyPageOverlaysRoutes from './routes/agencyPageOverlays.routes.js';
import researchCandidateRoutes from './routes/researchCandidate.routes.js';
import publicProviderAvailabilityRoutes from './routes/publicProviderAvailability.routes.js';
import publicSchoolsRoutes from './routes/publicSchools.routes.js';
import skillBuildersProviderHubRoutes from './routes/skillBuildersProviderHub.routes.js';
import publicSkillBuildersRoutes from './routes/publicSkillBuilders.routes.js';
import publicHiringReferenceRoutes from './routes/publicHiringReference.routes.js';
import publicMarketingPagesRoutes from './routes/publicMarketingPages.routes.js';
import publicMarketingPagesAdminRoutes from './routes/publicMarketingPagesAdmin.routes.js';
import agentsRoutes from './routes/agents.routes.js';
import clinicalNoteGeneratorRoutes from './routes/clinicalNoteGenerator.routes.js';
import complianceCornerRoutes from './routes/complianceCorner.routes.js';
import learningBillingRoutes from './routes/learningBilling.routes.js';
import guardianBillingRoutes from './routes/guardianBilling.routes.js';
import learningProgramClassesRoutes from './routes/learningProgramClasses.routes.js';
import { serveSeasonBanner, serveSeasonLogo } from './controllers/learningProgramClasses.controller.js';
import learningStandardsRoutes from './routes/learningStandards.routes.js';
import learningGoalsRoutes from './routes/learningGoals.routes.js';
import learningProgressRoutes from './routes/learningProgress.routes.js';
import learningAssignmentsRoutes from './routes/learningAssignments.routes.js';
import learningContentGenerationRoutes from './routes/learningContentGeneration.routes.js';
import learningRecommendationsRoutes from './routes/learningRecommendations.routes.js';
import learningClassSessionsRoutes from './routes/learningClassSessions.routes.js';
import clubStoreRoutes from './routes/clubStore.routes.js';
import summitStatsRoutes from './routes/summitStats.routes.js';
import userSafetyRoutes from './routes/userSafety.routes.js';
import stravaRoutes from './routes/strava.routes.js';
import garminRoutes from './routes/garmin.routes.js';
import clinicalDataRoutes from './routes/clinicalData.routes.js';
import betaFeedbackRoutes from './routes/betaFeedback.routes.js';
import meRoutes from './routes/me.routes.js';
import gameProgressRoutes from './routes/gameProgress.routes.js';
import billingPolicyRoutes from './routes/billingPolicy.routes.js';
import companyEventClientsRoutes from './routes/companyEventClients.routes.js';
import companyEventsPublicRoutes from './routes/companyEventsPublic.routes.js';
import surveyRoutes from './routes/survey.routes.js';
import stripeWebhookRoutes from './routes/stripeWebhook.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy for accurate IP addresses (important for production behind load balancers/proxies)
// This allows req.ip to use X-Forwarded-For header
// Set to 1 to trust only the first hop (Google Cloud Load Balancer) - satisfies rate limiter security check
app.set('trust proxy', 1);

// API responses are highly dynamic and user-specific. Disable ETags to prevent 304 responses
// (which can cause XHR clients to receive empty bodies and show stale/empty state).
app.set('etag', false);

// Middleware
// CORS configuration with explicit headers for mobile browser compatibility
// Use a function to always allow localhost:5173 when running locally (port 3000),
// even if NODE_ENV/CORS_ORIGIN are set for production (e.g. after adding Google OAuth)
const corsOriginFn = (origin, callback) => {
  const port = Number(process.env.PORT || config.port) || 3000;
  const isLocalBackend = port === 3000;
  const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  // Native webview origins used by Capacitor/Ionic shells.
  const nativeAppOrigins = ['capacitor://localhost', 'ionic://localhost'];
  const allowed = Array.isArray(config.cors.origin)
    ? [...config.cors.origin]
    : [config.cors.origin];
  allowed.push(...nativeAppOrigins);
  if (isLocalBackend) {
    allowed.push(...localOrigins);
  }
  const allowedSet = new Set(allowed.map((o) => String(o || '').toLowerCase()));
  if (!origin || allowedSet.has(origin.toLowerCase())) {
    callback(null, true);
  } else {
    callback(null, false);
  }
};
app.use(cors({
  origin: corsOriginFn,
  credentials: true,
  // Explicitly set allowed headers for mobile browser compatibility
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Agency-Id'],
  // Explicitly set exposed headers (cookies are automatically exposed)
  exposedHeaders: ['Set-Cookie'],
  // Ensure preflight requests work correctly on mobile
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
}));
app.use(cookieParser());

// Stripe webhooks MUST be mounted before express.json() so they receive the raw body.
// Stripe's signature verification requires the exact raw bytes.
// Handles both /api/stripe/webhook (direct) and /api/stripe/connect-webhook (Connect).
app.use('/api/stripe', stripeWebhookRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware with body sanitization
// Must be after body parsing middleware (express.json, express.urlencoded)
// This ensures req.body is available for sanitization
app.use(requestLoggingMiddleware);

// Prevent caching of API JSON responses (especially important in local dev).
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Temporary diagnostics: logs high-signal details for unexpected 403s on key endpoints.
// Enable by setting ACCESS_DEBUG=1 in the environment (Cloud Run).
app.use(accessDebugMiddleware);

// File serving for GCS - redirects to signed URLs
// 
// Why signed URLs instead of proxying:
// 1. Better performance - files served directly from GCS, not through Cloud Run
// 2. Reduced Cloud Run costs - no bandwidth/CPU usage for file serving
// 3. Better scalability - GCS handles file serving, Cloud Run handles API requests
// 4. CDN-friendly - GCS can be fronted by Cloud CDN for global distribution
//
// Note: For public files (icons, fonts), consider making them public in GCS
// and serving directly without signed URLs for even better performance
const uploadsHandler = async (req, res, next) => {
  // Keep a best-effort resolved storage key so we can fall back to local files in dev.
  let resolvedFilePath = null;
  try {
    const StorageService = (await import('./services/storage.service.js')).default;
    
    // Extract file path from request
    // When route is "/uploads", Express strips "/uploads" from req.path
    // So req.path will be like "/icons/filename.png" or "/logos/filename.png"
    // Files are stored in GCS as "uploads/icons/..." or "uploads/logos/..."
    let filePath = req.path;
    
    // Remove leading slash (GCS paths should not start with /)
    filePath = filePath.replace(/^\//, '');
    
    if (!filePath || filePath === '/') {
      return res.status(404).json({ error: { message: 'File not found' } });
    }

    // HIPAA hardening: block sensitive PHI/intake object prefixes from generic /uploads routing.
    // These files must be accessed via dedicated authenticated controllers with audit logging.
    const sensitivePrefixes = ['phi-documents/', 'intake_signed/'];
    if (sensitivePrefixes.some((prefix) => filePath.startsWith(prefix))) {
      return res.status(403).json({ error: { message: 'Access denied for sensitive document path' } });
    }
    
    // Map /uploads/* requests to the correct GCS object keys.
    //
    // Most assets are stored under "uploads/..." in GCS (icons, logos, etc).
    // Fonts are stored under "fonts/..." in GCS (see StorageService.saveFont).
    // Templates may be stored under "templates/..." and other non-uploads prefixes.
    const isDirectPrefix = (p) =>
      p.startsWith('uploads/') ||
      p.startsWith('fonts/') ||
      p.startsWith('templates/') ||
      p.startsWith('signed/');

    if (!isDirectPrefix(filePath)) {
      filePath = `uploads/${filePath}`;
    }

    resolvedFilePath = filePath;

    const tryServeLocal = async (storageKey) => {
      try {
        const fs = (await import('fs/promises')).default;
        const ext = path.extname(storageKey).toLowerCase();
        const contentTypes = {
          '.pdf': 'application/pdf',
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.webp': 'image/webp',
          '.ico': 'image/x-icon',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
          '.otf': 'font/otf',
          '.eot': 'application/vnd.ms-fontobject'
        };

        // In local dev, files live under backend/uploads/* (no leading "uploads/" prefix).
        let rel = storageKey || '';
        if (rel.startsWith('uploads/')) rel = rel.substring('uploads/'.length);
        // Safety: prevent directory traversal (e.g., /uploads/../../etc/passwd)
        rel = String(rel || '').replace(/\\/g, '/');
        const uploadsRoot = path.resolve(__dirname, '../uploads');
        const candidate = path.resolve(uploadsRoot, rel);
        if (!candidate.startsWith(uploadsRoot + path.sep)) return false;

        const localPath = candidate;
        const buffer = await fs.readFile(localPath);

        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(buffer);
        console.log(`[File Request] Served local file fallback: ${localPath}`);
        return true;
      } catch (e) {
        return false;
      }
    };
    
    console.log(`[File Request] Requested path: ${req.path}, GCS path: ${filePath}`);
    
    // Check if file exists in GCS before generating signed URL
    const bucket = await StorageService.getGCSBucket();
    const file = bucket.file(filePath);
    let [exists] = await file.exists();

    // Backward compatibility:
    // Older deployments stored icons/logos directly under "icons/*" (without the "uploads/" prefix).
    // Our current /uploads handler maps everything to "uploads/*" in GCS, which can cause 404s
    // (and result in "blank" icons due to transparent-image fallback).
    // If the "uploads/*" key doesn't exist, try common legacy keys before failing.
    if (!exists) {
      const fallbackKeys = [];

      // Common historical receipts bug:
      // Some rows stored only the basename (e.g. "reimbursement-...png") and the frontend
      // requested "/uploads/<basename>", but the actual objects live under:
      // - uploads/reimbursements/<basename>
      // - uploads/company_card_expenses/<basename>
      // - uploads/pto_proofs/<basename>
      if (filePath.startsWith('uploads/')) {
        const tail = filePath.substring('uploads/'.length);
        if (tail && !tail.includes('/')) {
          fallbackKeys.push(`uploads/reimbursements/${tail}`);
          fallbackKeys.push(`uploads/company_card_expenses/${tail}`);
          fallbackKeys.push(`uploads/pto_proofs/${tail}`);
        }
      }

      // Strip leading "uploads/" (e.g. uploads/icons/x.svg -> icons/x.svg)
      if (filePath.startsWith('uploads/')) {
        fallbackKeys.push(filePath.substring('uploads/'.length));
      }

      // Explicit legacy icon/logos prefixes (extra safety)
      if (filePath.startsWith('uploads/icons/')) {
        fallbackKeys.push(`icons/${filePath.substring('uploads/icons/'.length)}`);
      }
      if (filePath.startsWith('uploads/logos/')) {
        fallbackKeys.push(`logos/${filePath.substring('uploads/logos/'.length)}`);
      }

      // De-dupe while preserving order
      const seen = new Set();
      const uniqueFallbacks = fallbackKeys.filter((k) => {
        const key = String(k || '').trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      for (const altKey of uniqueFallbacks) {
        try {
          const altFile = bucket.file(altKey);
          const [altExists] = await altFile.exists();
          if (altExists) {
            console.warn(`[File Request] Using legacy GCS key fallback: requested=${filePath} fallback=${altKey}`);
            resolvedFilePath = altKey;
            filePath = altKey;
            exists = true;
            break;
          }
        } catch {
          // ignore and keep trying
        }
      }
    }
    
    if (!exists) {
      // Development fallback: if the file exists on disk, serve it from backend/uploads.
      if (await tryServeLocal(filePath)) {
        return;
      }

      console.error(`[File Request] File not found in GCS: ${filePath}`);
      console.error(`[File Request] Bucket: ${process.env.PTONBOARDFILES || 'not set'}`);
      
      // List first few files in icons/ folder for debugging
      try {
        const [files] = await bucket.getFiles({ prefix: 'icons/', maxResults: 5 });
        console.log(`[File Request] Sample files in GCS icons/ folder: ${files.map(f => f.name).join(', ')}`);
      } catch (listErr) {
        console.error(`[File Request] Error listing GCS files:`, listErr.message);
      }
      
      // For image requests, return a 1x1 transparent PNG instead of JSON
      // This prevents broken image icons in the browser
      if (req.path.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
        const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(404).send(transparentPng);
      }
      
      return res.status(404).json({ error: { message: 'File not found in storage' } });
    }
    
    // Determine if this is an image or font file that needs CORS headers.
    // In production, we proxy these through backend so they load from the backend origin
    // (avoids frontend Cloud Run 404s and avoids GCS CORS issues on redirects).
    const isImageOrFont = req.path.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|eot)$/i);
    
    // In development: always proxy
    // In production: proxy images/fonts (CORS-safe), redirect other file types to signed URLs
    if (config.nodeEnv === 'development' || isImageOrFont) {
      try {
        const [buffer] = await file.download();
        const [metadata] = await file.getMetadata();
        const contentType = metadata.contentType || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        if (isImageOrFont) {
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        res.send(buffer);
        console.log(`[File Request] Successfully proxied file: ${filePath} (${contentType})`);
      } catch (proxyError) {
        console.error(`[File Request] Error proxying file: ${filePath}`, proxyError.message);
        // For images, return transparent PNG instead of error
        if (req.path.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
          const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'no-cache');
          return res.status(404).send(transparentPng);
        }
        throw proxyError;
      }
    } else {
      // For non-image/font files in production, use signed URLs (redirect)
      const signedUrl = await StorageService.getSignedUrl(filePath, 60);
      console.log(`[File Request] Generated signed URL for: ${filePath}`);
      res.redirect(302, signedUrl);
    }
  } catch (error) {
    // In development, return 404 instead of 500 for GCS errors (fonts/files may not be uploaded yet)
    // This allows the app to gracefully fall back to system fonts
    const isDevelopment = config.nodeEnv === 'development';
    const statusCode = isDevelopment ? 404 : 500;
    
    if (isDevelopment) {
      // If GCS isn't configured in dev, try serving from local disk.
      try {
        const raw = String(req.path || '').replace(/^\//, '');
        const isDirectPrefix = (p) =>
          p.startsWith('uploads/') ||
          p.startsWith('fonts/') ||
          p.startsWith('templates/') ||
          p.startsWith('signed/');

        let fallbackKey = resolvedFilePath || raw;
        if (fallbackKey && !isDirectPrefix(fallbackKey)) {
          fallbackKey = `uploads/${fallbackKey}`;
        }

        const fs = (await import('fs/promises')).default;
        let rel = fallbackKey || '';
        if (rel.startsWith('uploads/')) rel = rel.substring('uploads/'.length);
        const localPath = path.join(__dirname, '../uploads', rel);
        const buffer = await fs.readFile(localPath);
        const ext = path.extname(localPath).toLowerCase();
        const contentTypes = {
          '.pdf': 'application/pdf',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.webp': 'image/webp',
          '.ico': 'image/x-icon',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
          '.otf': 'font/otf',
          '.eot': 'application/vnd.ms-fontobject'
        };
        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(buffer);
        console.log(`[File Request] Served local file after GCS error (dev): ${localPath}`);
        return;
      } catch (localErr) {
        // Ignore and fall through to existing behavior
      }
      console.warn(`[File Request] GCS access failed in development (file may not exist): ${req.path}`, error.message);
    } else {
      console.error('[File Request] Error generating signed URL for file:', {
        path: req.path,
        error: error.message,
        stack: error.stack
      });
    }
    
    res.status(statusCode).json({ error: { message: 'File not available', details: error.message } });
  }
};

// Serve uploads from both `/uploads/*` and `/api/uploads/*`.
// This matters for single-domain deployments where the backend is path-routed under `/api`
// and `/uploads/*` would otherwise hit the frontend service.
app.use('/uploads', uploadsHandler);
app.use('/api/uploads', uploadsHandler);

// Static HTML/JS/CSS games from git submodule `games/` (repo root relative to backend/src)
const gamesContentRoot = path.resolve(__dirname, '../../games');
app.use(
  '/games-content',
  express.static(gamesContentRoot, {
    etag: true,
    maxAge: 0,
    fallthrough: false
  })
);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Health check routes (must be before authentication middleware)
app.use('/api/health-check', healthCheckRoutes);

// Public APIs (no auth). Mount early so they never get blocked by future auth gates.
app.use('/api/public/provider-availability', publicProviderAvailabilityRoutes);
app.use('/api/public/schools', publicSchoolsRoutes);
app.use('/api/public/skill-builders', publicSkillBuildersRoutes);
app.use('/api/public/marketing-pages', publicMarketingPagesRoutes);
app.use('/api/public/hiring/reference', publicHiringReferenceRoutes);
app.use('/api/company-events', companyEventsPublicRoutes);

// Club manager email verification (public, no auth) - mount before auth to avoid any auth middleware
app.get('/api/auth/verify-club-manager-email', verifyClubManagerEmail);
app.get('/api/auth/verify-club-manager-email/:token', verifyClubManagerEmail);

// Summit Stats Team Challenge: list clubs (public, no auth) - mount before summit-stats router
app.get('/api/summit-stats/clubs', listClubs);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/modules', contentRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/signatures', signatureRoutes);
// Mount agency public routes (resolve, slug, portal, login-theme) FIRST so unauthenticated
// login-page branding requests succeed. agencySchools/agencyDepartments use router.use(authenticate)
// and would 401 all /api/agencies/* requests if mounted before agencyRoutes.
app.use('/api/agencies', agencyRoutes);
app.use('/api/agencies', agencySchoolsRoutes);
app.use('/api/agencies', agencyDepartmentsRoutes);
app.use('/api/agencies', agencyDashboardRoutes);
app.use('/api/agencies', socialFeedLinksRoutes);
app.use('/api/me', meRoutes);
app.use('/api/games', gameProgressRoutes);
app.use('/api/tracks', trackRoutes);
app.use('/api/training-focuses', trackRoutes); // Alias for new terminology
app.use('/api/acknowledgments', acknowledgmentRoutes);
app.use('/api/admin-actions', adminActionsRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/document-templates', documentTemplateRoutes);
app.use('/api/letterhead-templates', letterheadTemplateRoutes);
app.use('/api/document-signing', documentSigningRoutes);
app.use('/api/document-acknowledgment', documentAcknowledgmentRoutes);
app.use('/api/user-documents', userDocumentRoutes);
app.use('/api/user-specific-documents', userSpecificDocumentRoutes);
app.use('/api/user-compliance-documents', userComplianceDocumentRoutes);
app.use('/api/account-types', accountTypeRoutes);
app.use('/api/users', userAccountRoutes);
app.use('/api/user-info-fields', userInfoFieldDefinitionRoutes);
app.use('/api/user-info-categories', userInfoCategoryRoutes);
app.use('/api', userInfoValueRoutes);
app.use('/api/agencies', agencyCredentialingRoutes);
app.use('/api/custom-checklist-items', customChecklistItemRoutes);
app.use('/api', userChecklistAssignmentRoutes);
app.use('/api', momentumStickiesRoutes);
app.use('/api', momentumChatRoutes);
app.use('/api', taskListsRoutes);
app.use('/api/meeting-agendas', meetingAgendasRoutes);
app.use('/api/approved-employees', approvedEmployeeRoutes);
app.use('/api/on-demand-training', publicTrainingRoutes);
app.use('/api/agency-on-demand-training', agencyOnDemandTrainingRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/icons', iconRoutes);
app.use('/api/logos', logoRoutes);
app.use('/api/icon-templates', iconTemplateRoutes);
app.use('/api/platform-branding', platformBrandingRoutes);
app.use('/api/platform/public-marketing-pages', publicMarketingPagesAdminRoutes);
app.use('/api/beta-feedback', betaFeedbackRoutes);
app.use('/api/platform-retention-settings', platformRetentionSettingsRoutes);
app.use('/api/onboarding-packages', onboardingPackageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/email-settings', emailSettingsRoutes);
app.use('/api/email-senders', emailSenderIdentityRoutes);
app.use('/api/notification-triggers', notificationTriggerAdminRoutes);
// Season banner/logo images are public (loaded by <img> which can't send auth headers).
// Must be registered before any catch-all '/api' router that uses router.use(authenticate).
app.get('/api/learning-program-classes/:classId/banner', serveSeasonBanner);
app.get('/api/learning-program-classes/:classId/logo', serveSeasonLogo);

app.use('/api', userCommunicationRoutes);
app.use('/api', userAdminDocsRoutes);
app.use('/api/users', userPreferencesRoutes);
app.use('/api/branding-templates', brandingTemplateRoutes);
app.use('/api/fonts', fontRoutes);
app.use('/api/activity-log', activityLogRoutes);
app.use('/api/supervisor-assignments', supervisorAssignmentRoutes);
app.use('/api/supervision', supervisionSessionsRoutes);
app.use('/api/team-meetings', teamMeetingsRoutes);
app.use('/api/agency-campaigns', agencyCampaignsRoutes);
app.use('/api/organizations', referralUploadRoutes); // Organization routes (referral upload, etc.)
app.use('/api/referrals', referralOcrRoutes);
app.use('/api/referral-packet-drafts', referralPacketDraftRoutes);
app.use('/api/public-intake', publicIntakeRoutes);
app.use('/api/intake-links', intakeLinksRoutes);
app.use('/api/directory', directoryRoutes);
app.use('/api/intake-field-templates', intakeFieldTemplatesRoutes);
app.use('/api/unassigned-documents', unassignedDocumentsRoutes);
app.use('/api/school-portal', schoolPortalRoutes); // School portal routes (restricted client views)
app.use('/api/referrals', referralRoutes); // Referral pipeline routes
app.use('/api/clients', clientRoutes); // Client management routes
app.use('/api/guardian-portal', guardianPortalRoutes); // Guardian portal routes
app.use('/api/bulk-import', bulkImportRoutes); // Bulk import routes (legacy migration tool)
app.use('/api/office-schedule', officeScheduleRoutes);
app.use('/api/learning-billing', learningBillingRoutes);
app.use('/api/guardian-billing', guardianBillingRoutes);
app.use('/api/learning-program-classes', learningProgramClassesRoutes);
app.use('/api/learning-standards', learningStandardsRoutes);
app.use('/api/learning-goals', learningGoalsRoutes);
app.use('/api/learning-progress', learningProgressRoutes);
app.use('/api/learning-assignments', learningAssignmentsRoutes);
app.use('/api/learning-content', learningContentGenerationRoutes);
app.use('/api/learning-recommendations', learningRecommendationsRoutes);
app.use('/api/learning-class-sessions', learningClassSessionsRoutes);
app.use('/api/club-store', clubStoreRoutes);
app.use('/api/summit-stats', summitStatsRoutes);
app.use('/api/user-safety', userSafetyRoutes);
app.use('/api/strava', stravaRoutes);
app.use('/api/garmin', garminRoutes);
app.use('/api/billing-policy', billingPolicyRoutes);
app.use('/api/clinical-data', clinicalDataRoutes);
app.use('/api/offices', officeSettingsRoutes);
app.use('/api/office-slots', officeSlotActionsRoutes);
app.use('/api/office-review', officeReviewRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/skill-builders', skillBuildersProviderHubRoutes);
app.use('/api/hiring', hiringRoutes);
app.use('/api/overlays', agencyPageOverlaysRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/clinical-notes', clinicalNoteGeneratorRoutes);
app.use('/api/compliance-corner', complianceCornerRoutes);
app.use('/api', researchCandidateRoutes);
  app.use('/api/voice-video', voiceVideoRoutes);
app.use('/api/vonage', vonageRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/sms-numbers', smsNumbersRoutes);
app.use('/api/extensions', extensionsRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/presence', presenceRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/kudos', kudosRoutes);
app.use('/api/kiosk', kioskRoutes);
app.use('/api/emergency-broadcasts', emergencyBroadcastRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/company-car', companyCarRoutes);
app.use('/api/company-events', companyEventClientsRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/budget', (req, res, next) => {
  import('./routes/budget.routes.js')
    .then((m) => m.default(req, res, next))
    .catch(next);
});
app.use('/api/weather', weatherRoutes);
app.use('/api/receivables', receivablesRoutes);
app.use('/api/psychotherapy-compliance', psychotherapyComplianceRoutes);
app.use('/api/platform-revenue', platformRevenueRoutes);
app.use('/api/executive-report', executiveReportRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/client-settings', clientSettingsRoutes);
app.use('/api/provider-settings', providerSettingsRoutes);
app.use('/api/provider-search', providerSearchRoutes);
app.use('/api/note-aid', noteAidRoutes);
app.use('/api/communications', communicationsRoutes);
app.use('/api/provider-import', providerImportRoutes);
app.use('/api/school-settings', schoolSettingsRoutes);
app.use('/api/bulk-client-upload', bulkClientUploadRoutes);
app.use('/api/bulk-school-upload', bulkSchoolUploadRoutes);
app.use('/api/provider-scheduling', providerSchedulingRoutes);
app.use('/api/provider-self', providerSelfRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/support-tickets', supportTicketsRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/phi-documents', phiDocumentsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  console.error('Error stack:', err.stack);
  console.error('Error details:', {
    message: err.message,
    code: err.code,
    sqlMessage: err.sqlMessage,
    sqlState: err.sqlState
  });

  // Normalize common MySQL errors into actionable 4xx responses
  const sqlMessage = String(err.sqlMessage || err.message || '');
  const isForeignKeyError =
    err.code === 'ER_NO_REFERENCED_ROW_2' ||
    err.errno === 1452 ||
    sqlMessage.includes('a foreign key constraint fails');
  const isEnumTruncation =
    err.code === 'ER_WARN_DATA_TRUNCATED' ||
    sqlMessage.toLowerCase().includes('data truncated for column');

  if (!err.status && isForeignKeyError) {
    return res.status(400).json({
      error: {
        message:
          'Invalid reference value (foreign key constraint). Please verify the referenced record still exists (agency/user/pay period/etc).',
        ...(config.nodeEnv === 'development' && {
          code: err.code,
          sqlMessage: err.sqlMessage,
          sqlState: err.sqlState
        })
      }
    });
  }

  if (!err.status && isEnumTruncation) {
    const enumColumnMatch = sqlMessage.match(/column '([^']+)'/i);
    const enumColumn = enumColumnMatch?.[1] || null;
    const enumHint = enumColumn === 'document_type'
      ? 'Invalid document type enum value. Run the latest DB migrations (including migrations 417 and 440 for document type expansions).'
      : enumColumn === 'document_action_type'
        ? 'Invalid document action type enum value. Run the latest DB migrations to expand supported action types.'
        : 'Invalid enum value provided. Run the latest DB migrations to expand supported values.';
    return res.status(400).json({
      error: {
        message: enumHint,
        ...(config.nodeEnv === 'development' && {
          code: err.code,
          enumColumn,
          sqlMessage: err.sqlMessage,
          sqlState: err.sqlState
        })
      }
    });
  }

  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      ...(config.nodeEnv === 'development' && { 
        stack: err.stack,
        code: err.code,
        sqlMessage: err.sqlMessage,
        sqlState: err.sqlState
      })
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Route not found' } });
});

// Export app for bootstrap.js (Cloud Run). When run directly (dev), listen here.
export { app };
const PORT_RAW = process.env.PORT ?? config.port ?? 8080;
const PORT = Number.parseInt(String(PORT_RAW), 10) || 8080;
const HOST = '0.0.0.0';
const isBootstrap = process.argv[1]?.includes('bootstrap');
if (!isBootstrap) {
  app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    console.log(`📝 Environment: ${config.nodeEnv}`);
  });
}

  // Run pending schema migrations on startup (safe/idempotent column additions)
  (async () => {
    try {
      const { default: pool } = await import('./config/database.js');
      // Migration 691 – season banner/logo columns
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'learning_program_classes'
           AND COLUMN_NAME = 'banner_image_path'`
      );
      if (!cols.length) {
        await pool.execute(
          `ALTER TABLE learning_program_classes
             ADD COLUMN banner_image_path VARCHAR(512) NULL DEFAULT NULL AFTER season_announcement_text,
             ADD COLUMN banner_focal_x    DECIMAL(5,2) NOT NULL DEFAULT 50.00,
             ADD COLUMN banner_focal_y    DECIMAL(5,2) NOT NULL DEFAULT 50.00,
             ADD COLUMN logo_image_path   VARCHAR(512) NULL DEFAULT NULL`
        );
        console.log('[startup] Migration 691 applied: season banner/logo columns added');
      }
    } catch (err) {
      console.warn('[startup] Migration 691 check skipped:', err.message);
    }
  })();

  // Migration 692 – max_heartrate + splits_json on challenge_workouts
  (async () => {
    try {
      const { default: pool } = await import('./config/database.js');
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'challenge_workouts'
           AND COLUMN_NAME = 'splits_json'`
      );
      if (!cols.length) {
        await pool.execute(
          `ALTER TABLE challenge_workouts
             ADD COLUMN max_heartrate SMALLINT UNSIGNED NULL DEFAULT NULL AFTER average_heartrate,
             ADD COLUMN splits_json   JSON NULL DEFAULT NULL AFTER max_heartrate`
        );
        console.log('[startup] Migration 692 applied: max_heartrate + splits_json added to challenge_workouts');
      }
    } catch (err) {
      console.warn('[startup] Migration 692 check skipped:', err.message);
    }
  })();

  // Migration 694 – comment attachment + icon on challenge_workout_comments
  (async () => {
    try {
      const { default: pool } = await import('./config/database.js');
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'challenge_workout_comments'
           AND COLUMN_NAME = 'attachment_path'`
      );
      if (!cols.length) {
        await pool.execute(
          `ALTER TABLE challenge_workout_comments
             ADD COLUMN attachment_path VARCHAR(512) NULL DEFAULT NULL AFTER comment_text,
             ADD COLUMN icon_id         INT          NULL DEFAULT NULL AFTER attachment_path`
        );
        console.log('[startup] Migration 694 applied: attachment_path + icon_id added to challenge_workout_comments');
      }
    } catch (err) {
      console.warn('[startup] Migration 694 check skipped:', err.message);
    }
  })();

  // Migration 693 – user profile fields on users table (gender, DOB, fitness background, etc.)
  // Storing these directly on users guarantees they persist regardless of challenge_member_applications.
  (async () => {
    try {
      const { default: pool } = await import('./config/database.js');
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
           AND COLUMN_NAME = 'profile_gender'`
      );
      if (!cols.length) {
        await pool.execute(
          `ALTER TABLE users
             ADD COLUMN profile_gender                VARCHAR(100)     NULL DEFAULT NULL,
             ADD COLUMN profile_date_of_birth         DATE             NULL DEFAULT NULL,
             ADD COLUMN profile_average_miles_per_week DECIMAL(6,2)    NULL DEFAULT NULL,
             ADD COLUMN profile_average_hours_per_week DECIMAL(6,2)    NULL DEFAULT NULL,
             ADD COLUMN profile_heard_about_club       TEXT             NULL DEFAULT NULL,
             ADD COLUMN profile_running_fitness_background TEXT         NULL DEFAULT NULL,
             ADD COLUMN profile_current_fitness_activities TEXT         NULL DEFAULT NULL`
        );
        console.log('[startup] Migration 693 applied: user profile columns added to users table');
      }
    } catch (err) {
      console.warn('[startup] Migration 693 check skipped:', err.message);
    }
  })();

  // Migration 695 – auto-import preferences on user_preferences
  (async () => {
    try {
      const { default: pool } = await import('./config/database.js');
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_preferences'
           AND COLUMN_NAME = 'auto_import_settings'`
      );
      if (!cols.length) {
        await pool.execute(
          `ALTER TABLE user_preferences
             ADD COLUMN auto_import_settings JSON NULL DEFAULT NULL COMMENT 'per-user auto-import config: {platform, allowedActivityTypes[], enabled}'`
        );
        console.log('[startup] Migration 695 applied: auto_import_settings added to user_preferences');
      }
    } catch (err) {
      console.warn('[startup] Migration 695 check skipped:', err.message);
    }
  })();

  // Migration 697 – source_workout_id + source_class_id on club_feed_posts
  (async () => {
    try {
      const { default: pool } = await import('./config/database.js');
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'club_feed_posts'
           AND COLUMN_NAME = 'source_workout_id'`
      );
      if (!cols.length) {
        await pool.execute(
          `ALTER TABLE club_feed_posts
             ADD COLUMN source_workout_id INT NULL DEFAULT NULL COMMENT 'challenge_workouts.id if post was created from a season workout',
             ADD COLUMN source_class_id   INT NULL DEFAULT NULL COMMENT 'learning_program_classes.id (season) the workout belongs to'`
        );
        console.log('[startup] Migration 697 applied: source_workout_id + source_class_id added to club_feed_posts');
      }
    } catch (err) {
      console.warn('[startup] Migration 697 check skipped:', err.message);
    }
  })();

  // Migration 698 – race result columns on challenge_workouts
  (async () => {
    try {
      const { default: pool } = await import('./config/database.js');
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'challenge_workouts'
           AND COLUMN_NAME = 'race_chip_time_seconds'`
      );
      if (!cols.length) {
        await pool.execute(
          `ALTER TABLE challenge_workouts
             ADD COLUMN race_distance_miles   DECIMAL(6,2) NULL DEFAULT NULL AFTER is_race,
             ADD COLUMN race_chip_time_seconds INT UNSIGNED NULL DEFAULT NULL AFTER race_distance_miles,
             ADD COLUMN race_overall_place    INT UNSIGNED NULL DEFAULT NULL AFTER race_chip_time_seconds`
        );
        console.log('[startup] Migration 698 applied: race result columns added to challenge_workouts');
      }
    } catch (err) {
      console.warn('[startup] Migration 698 check skipped:', err.message);
    }
  })();

  // Migration 699 – manager_edited flag on challenge_workouts
  (async () => {
    try {
      const { default: pool } = await import('./config/database.js');
      const [cols] = await pool.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'challenge_workouts'
           AND COLUMN_NAME = 'manager_edited'`
      );
      if (!cols.length) {
        await pool.execute(
          `ALTER TABLE challenge_workouts
             ADD COLUMN manager_edited TINYINT(1) NOT NULL DEFAULT 0 AFTER proof_reviewed_at`
        );
        console.log('[startup] Migration 699 applied: manager_edited added to challenge_workouts');
      }
    } catch (err) {
      console.warn('[startup] Migration 699 check skipped:', err.message);
    }
  })();

  // Set up periodic processing of terminated and completed users
  // Run every hour to check for users that need to be marked inactive or archived
  setInterval(async () => {
    try {
      const { processAllUserStatuses } = await import('./services/userStatusProcessor.service.js');
      await processAllUserStatuses();
    } catch (error) {
      console.error('Error in periodic user status processing:', error);
    }
  }, 60 * 60 * 1000); // Every hour
  
  // Also run immediately on startup
  (async () => {
    try {
      const { processAllUserStatuses } = await import('./services/userStatusProcessor.service.js');
      await processAllUserStatuses();
    } catch (error) {
      console.error('Error in initial user status processing:', error);
    }
  })();

  // Set up periodic processing of scheduled branding templates
  // Run daily at midnight to check and apply scheduled templates
  const scheduleBrandingTemplates = async () => {
    try {
      const BrandingTemplateService = (await import('./services/brandingTemplate.service.js')).default;
      await BrandingTemplateService.checkScheduledTemplates();
    } catch (error) {
      // Don't crash if tables don't exist yet (migration not run)
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Branding templates tables not found. Run migration 069_create_branding_templates.sql');
      } else {
        console.error('Error in scheduled branding template processing:', error);
      }
    }
  };

  // Calculate milliseconds until next midnight
  const getMsUntilMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  };

  // Run immediately on startup
  scheduleBrandingTemplates();

  // Schedule to run daily at midnight
  setTimeout(() => {
    scheduleBrandingTemplates();
    // Then run every 24 hours
    setInterval(scheduleBrandingTemplates, 24 * 60 * 60 * 1000);
  }, getMsUntilMidnight());

  // Clinical Note Generator drafts cleanup (hard delete >7 days)
  // Run daily at 2:00 AM (best-effort; safe if table doesn't exist yet).
  const scheduleClinicalNoteDraftCleanup = async () => {
    try {
      const ClinicalNoteDraftCleanupService = (await import('./services/clinicalNoteDraftCleanup.service.js')).default;
      const result = await ClinicalNoteDraftCleanupService.run({ days: 7 });
      const n = Number(result?.deleted || 0);
      if (n > 0) console.log(`[clinical_note_drafts] hard-deleted ${n} records older than 7 days`);
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('clinical_note_drafts table not found. Run migration 333_create_clinical_note_drafts.sql');
      } else {
        console.error('Error in clinical note drafts cleanup:', error);
      }
    }
  };

  // Run immediately on startup (best-effort)
  scheduleClinicalNoteDraftCleanup();

  // Schedule daily at 2:00 AM using the midnight helper
  setTimeout(() => {
    scheduleClinicalNoteDraftCleanup();
    setInterval(scheduleClinicalNoteDraftCleanup, 24 * 60 * 60 * 1000);
  }, getMsUntilMidnight() + (2 * 60 * 60 * 1000));

  const scheduleSkillBuildersClinicalRetention = async () => {
    try {
      const { runSkillBuildersClinicalRetention } = await import(
        './services/skillBuildersSessionClinical.service.js'
      );
      const result = await runSkillBuildersClinicalRetention({ limitRows: 800 });
      const n = Number(result?.deletedNotes || 0);
      const c = Number(result?.deletedCurriculumRows || 0);
      if (n > 0 || c > 0) {
        console.log(`[skill_builders_clinical_retention] deleted notes=${n}, curriculum rows=${c}`);
      }
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('skill_builders_session_clinical_notes not found. Run migration 589.');
      } else {
        console.error('Error in Skill Builders clinical retention:', error);
      }
    }
  };
  scheduleSkillBuildersClinicalRetention();
  setTimeout(() => {
    scheduleSkillBuildersClinicalRetention();
    setInterval(scheduleSkillBuildersClinicalRetention, 24 * 60 * 60 * 1000);
  }, getMsUntilMidnight() + (3 * 60 * 60 * 1000));

  // Public intake retention cleanup (hard delete expired submissions)
  // Run daily at 2:30 AM (best-effort; safe if tables don't exist yet).
  const scheduleIntakeRetentionCleanup = async () => {
    try {
      const IntakeRetentionCleanupService = (await import('./services/intakeRetentionCleanup.service.js')).default;
      const result = await IntakeRetentionCleanupService.run({ limit: 300 });
      const n = Number(result?.deletedSubmissions || 0);
      if (n > 0) {
        console.log(`[intake_retention] purged ${n} submissions, ${result?.deletedPhiDocs || 0} phi docs`);
      }
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Intake retention tables not found. Run migration 362_intake_retention_policies.sql');
      } else {
        console.error('Error in intake retention cleanup:', error);
      }
    }
  };

  // Run immediately on startup (best-effort)
  scheduleIntakeRetentionCleanup();

  // Schedule daily at 2:30 AM using the midnight helper
  setTimeout(() => {
    scheduleIntakeRetentionCleanup();
    setInterval(scheduleIntakeRetentionCleanup, 24 * 60 * 60 * 1000);
  }, getMsUntilMidnight() + (2.5 * 60 * 60 * 1000));

  // Client compliance: promote pending clients to "current" when first_service_at has passed.
  // Runs daily at 5:00 AM so clients are promoted even if nobody saves the checklist again.
  const scheduleClientCompliancePromotion = async () => {
    try {
      const ClientCompliancePromotionService = (await import('./services/clientCompliancePromotion.service.js')).default;
      const result = await ClientCompliancePromotionService.run();
      const n = Number(result?.promoted || 0);
      if (n > 0) console.log(`[client_compliance] promoted ${n} pending client(s) to current`);
    } catch (error) {
      console.error('Error in client compliance promotion:', error);
    }
  };
  scheduleClientCompliancePromotion();
  setTimeout(() => {
    scheduleClientCompliancePromotion();
    setInterval(scheduleClientCompliancePromotion, 24 * 60 * 60 * 1000);
  }, getMsUntilMidnight() + (5 * 60 * 60 * 1000));

  // SMS/Voice retention cleanup (message_logs, call_logs, call_voicemails, notification_sms_logs)
  // Runs daily at 3:00 AM. Set SMS_VOICE_RETENTION_DAYS=365 (default) or 0 to keep indefinitely.
  const scheduleSmsVoiceRetentionCleanup = async () => {
    try {
      const SmsVoiceRetentionCleanupService = (await import('./services/smsVoiceRetentionCleanup.service.js')).default;
      const result = await SmsVoiceRetentionCleanupService.run({ limit: 500 });
      if (result?.skipped) return;
      const total = Number(result?.total || 0);
      if (total > 0) {
        console.log(
          `[sms_voice_retention] purged ${total} rows (voicemails: ${result?.deletedVoicemails || 0}, calls: ${result?.deletedCallLogs || 0}, messages: ${result?.deletedMessageLogs || 0}, notifications: ${result?.deletedNotificationSms || 0})`
        );
      }
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('SMS/voice retention tables not found. Run migrations.');
      } else {
        console.error('Error in SMS/voice retention cleanup:', error);
      }
    }
  };

  scheduleSmsVoiceRetentionCleanup();
  setTimeout(() => {
    scheduleSmsVoiceRetentionCleanup();
    setInterval(scheduleSmsVoiceRetentionCleanup, 24 * 60 * 60 * 1000);
  }, getMsUntilMidnight() + (3 * 60 * 60 * 1000));

  // Audit cold-storage lifecycle: export older rows to object storage and prune hot tables.
  // Runs daily at 3:15 AM; exports are chunked by source table.
  const scheduleAuditColdStorage = async () => {
    try {
      const AuditColdStorageService = (await import('./services/auditColdStorage.service.js')).default;
      const result = await AuditColdStorageService.run();
      if (result?.enabled && Number(result?.exported || 0) > 0) {
        console.log(`[audit_cold_storage] exported ${result.exported} rows, deleted ${result.deleted || 0} rows from hot tables`);
      }
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Audit cold-storage metadata table not found. Run migration 439_create_audit_cold_storage_exports.sql');
      } else {
        console.error('Error in audit cold-storage scheduler:', error);
      }
    }
  };

  // Run once on startup (best-effort)
  scheduleAuditColdStorage();

  // Schedule daily at 3:15 AM
  setTimeout(() => {
    scheduleAuditColdStorage();
    setInterval(scheduleAuditColdStorage, 24 * 60 * 60 * 1000);
  }, getMsUntilMidnight() + (3.25 * 60 * 60 * 1000));

  // Set up periodic processing of pending user auto-completion
  // Run every hour to check for pending users who should be auto-completed
  setInterval(async () => {
    try {
      const PendingCompletionService = (await import('./services/pendingCompletion.service.js')).default;
      await PendingCompletionService.checkAndAutoCompletePendingUsers();
    } catch (error) {
      // Don't crash if tables don't exist yet (migration not run)
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Pending completion tables not found. Run migrations 071 and 072.');
      } else {
        console.error('Error in pending user auto-completion processing:', error);
      }
    }
  }, 60 * 60 * 1000); // Every hour
  
  // Also run immediately on startup
  (async () => {
    try {
      const PendingCompletionService = (await import('./services/pendingCompletion.service.js')).default;
      await PendingCompletionService.checkAndAutoCompletePendingUsers();
    } catch (error) {
      if (error.code !== 'ER_NO_SUCH_TABLE') {
        console.error('Error in initial pending user auto-completion processing:', error);
      }
    }
  })();

  // Set up daily credential expiration watchdog (documents compliance)
  const scheduleCredentialWatchdog = async () => {
    try {
      const CredentialWatchdogService = (await import('./services/credentialWatchdog.service.js')).default;
      await CredentialWatchdogService.run({ expiringWithinDays: 30 });
    } catch (error) {
      // Don't crash if table doesn't exist yet (migration not run)
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('User compliance documents table not found. Run migration 110_create_user_compliance_documents.sql');
      } else {
        console.error('Error in scheduled credential watchdog:', error);
      }
    }
  };

  // Run immediately on startup (best-effort)
  scheduleCredentialWatchdog();

  // Schedule daily at midnight (reuse same helper)
  setTimeout(() => {
    scheduleCredentialWatchdog();
    setInterval(scheduleCredentialWatchdog, 24 * 60 * 60 * 1000);
  }, getMsUntilMidnight());

  // Background check automation watchdog (reimbursement + renewal reminders)
  const scheduleBackgroundCheckWatchdog = async () => {
    try {
      const BackgroundCheckWatchdogService = (await import('./services/backgroundCheckWatchdog.service.js')).default;
      await BackgroundCheckWatchdogService.run({ reimbursementAfterMonths: 6, renewalWithinDays: 30 });
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('User compliance documents/notifications tables not found. Run migration 110_create_user_compliance_documents.sql');
      } else {
        console.error('Error in scheduled background check watchdog:', error);
      }
    }
  };

  // Run immediately on startup (best-effort)
  scheduleBackgroundCheckWatchdog();

  // Schedule daily at midnight (reuse same helper)
  setTimeout(() => {
    scheduleBackgroundCheckWatchdog();
    setInterval(scheduleBackgroundCheckWatchdog, 24 * 60 * 60 * 1000);
  }, getMsUntilMidnight());

  // Office scheduling watchdog (auto-forfeit + booking confirmations in future)
  const scheduleOfficeScheduleWatchdog = async () => {
    try {
      const { OfficeScheduleWatchdogService } = await import('./services/officeScheduleWatchdog.service.js');
      await OfficeScheduleWatchdogService.run();
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Office schedule tables not found. Run office scheduling migrations.');
      } else {
        console.error('Error in office scheduling watchdog:', error);
      }
    }
  };

  const scheduleSkillBuildersSessionCloseout = async () => {
    try {
      const { runSkillBuildersSessionCloseout } = await import('./services/skillBuildersSessionCloseout.service.js');
      const r = await runSkillBuildersSessionCloseout();
      if (r?.ok && (Number(r.missedMarked) > 0 || Number(r.autoCheckouts) > 0)) {
        console.log('[skill_builders_session_closeout]', r);
      }
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') {
        console.warn('Skill Builders session closeout skipped. Run migration 606_skill_builders_session_closeout.sql');
      } else {
        console.error('Error in Skill Builders session closeout:', error);
      }
    }
  };

  // Run immediately on startup (best-effort)
  scheduleOfficeScheduleWatchdog();
  scheduleSkillBuildersSessionCloseout();

  // Program reminder schedules (runs every 5 minutes)
  const scheduleProgramReminders = async () => {
    try {
      const { processProgramReminderSchedules } = await import('./controllers/programReminderSchedule.controller.js');
      await processProgramReminderSchedules();
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Program reminder schedules table not found. Run migration 357_create_program_reminder_schedules.sql');
      } else {
        console.error('Error in program reminder scheduler:', error);
      }
    }
  };

  scheduleProgramReminders();
  setInterval(scheduleProgramReminders, 5 * 60 * 1000);

  // SMS support escalations (runs every 10 minutes)
  const scheduleSmsSupportEscalations = async () => {
    try {
      const SmsSupportEscalationService = (await import('./services/smsSupportEscalation.service.js')).default;
      await SmsSupportEscalationService.runTick();
    } catch (error) {
      const msg = String(error?.message || '');
      const missing =
        error?.code === 'ER_NO_SUCH_TABLE' ||
        msg.includes('sms_thread_escalations');
      if (missing) {
        console.warn('SMS support escalation tables not found. Run migration 427_create_sms_thread_escalations.sql');
      } else {
        console.error('Error in SMS support escalation scheduler:', error);
      }
    }
  };

  scheduleSmsSupportEscalations();
  setInterval(scheduleSmsSupportEscalations, 10 * 60 * 1000);

  // SMS unanswered auto-replies (runs every 5 minutes)
  const scheduleSmsAutoReplies = async () => {
    try {
      const SmsAutoReplyRuleService = (await import('./services/smsAutoReplyRule.service.js')).default;
      await SmsAutoReplyRuleService.runTick();
      await SmsAutoReplyRuleService.runOooDigestCheck();
    } catch (error) {
      console.error('Error in SMS auto-reply scheduler:', error);
    }
  };

  scheduleSmsAutoReplies();
  setInterval(scheduleSmsAutoReplies, 5 * 60 * 1000);

  // Company event RSVP reminders (runs every 10 minutes)
  const scheduleCompanyEventReminders = async () => {
    try {
      const { processCompanyEventResponseReminders } = await import('./controllers/companyEvents.controller.js');
      await processCompanyEventResponseReminders();
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        console.warn('Company event reminder tables not found. Run migrations 414, 415, and 416.');
      } else {
        console.error('Error in company event reminder scheduler:', error);
      }
    }
  };

  scheduleCompanyEventReminders();
  setInterval(scheduleCompanyEventReminders, 10 * 60 * 1000);

  // Hiring reference reminders + expiry (hourly)
  const scheduleHiringReferenceReminders = async () => {
    try {
      const { runHiringReferenceReminderTick } = await import('./services/hiringReferenceReminder.service.js');
      await runHiringReferenceReminderTick();
    } catch (error) {
      const msg = String(error?.message || '');
      const missing = error?.code === 'ER_NO_SUCH_TABLE' || msg.includes('hiring_reference_requests');
      if (missing) {
        console.warn('Hiring reference requests table not found. Run migration 707_hiring_reference_digital_forms.sql');
      } else {
        console.error('Error in hiring reference reminder scheduler:', error);
      }
    }
  };
  scheduleHiringReferenceReminders();
  setInterval(scheduleHiringReferenceReminders, 60 * 60 * 1000);

  // Daily digest emails (runs every 15 minutes; respects per-user time + opt-in)
  const scheduleDailyDigest = async () => {
    try {
      const DailyDigestService = (await import('./services/dailyDigest.service.js')).default;
      await DailyDigestService.runDailyDigestTick();
    } catch (error) {
      const msg = String(error?.message || '');
      const missing =
        error?.code === 'ER_NO_SUCH_TABLE'
        || msg.includes('daily_digest')
        || msg.includes('user_preferences');
      if (missing) {
        console.warn('Daily digest preferences not found. Run migration 368_add_daily_digest_preferences.sql');
      } else {
        console.error('Error in daily digest scheduler:', error);
      }
    }
  };

  scheduleDailyDigest();
  setInterval(scheduleDailyDigest, 15 * 60 * 1000);

  // Join reminder (email/SMS 5 min before supervision + team meetings)
  const scheduleJoinReminder = async () => {
    try {
      const { runJoinReminderTick } = await import('./services/joinReminder.service.js');
      await runJoinReminderTick();
    } catch (error) {
      const msg = String(error?.message || '');
      const missing =
        error?.code === 'ER_NO_SUCH_TABLE' ||
        error?.code === 'ER_BAD_FIELD_ERROR' ||
        msg.includes('join_reminder');
      if (missing) {
        console.warn('Join reminder tables not found. Run migration 522_meeting_join_reminder_trigger.sql');
      } else {
        console.error('Error in join reminder scheduler:', error);
      }
    }
  };

  scheduleJoinReminder();
  setInterval(scheduleJoinReminder, 5 * 60 * 1000);

  // Agency birthday/anniversary automation (runs hourly; deduped per agency/day/type)
  const scheduleAgencyAnnouncementAutomation = async () => {
    try {
      const AgencyAnnouncementAutomationService = (await import('./services/agencyAnnouncementAutomation.service.js')).default;
      await AgencyAnnouncementAutomationService.runDailyTick();
    } catch (error) {
      const msg = String(error?.message || '');
      const missing =
        error?.code === 'ER_NO_SUCH_TABLE' ||
        error?.code === 'ER_BAD_FIELD_ERROR' ||
        msg.includes('agency_announcements') ||
        msg.includes('agency_announcement_automation_runs');
      if (missing) {
        console.warn('Agency announcement automation tables not found. Run migrations 421 and 422.');
      } else {
        console.error('Error in agency announcement automation scheduler:', error);
      }
    }
  };

  scheduleAgencyAnnouncementAutomation();
  setInterval(scheduleAgencyAnnouncementAutomation, 60 * 60 * 1000);

  // Schedule daily at midnight
  setTimeout(() => {
    scheduleOfficeScheduleWatchdog();
    setInterval(scheduleOfficeScheduleWatchdog, 24 * 60 * 60 * 1000);
    scheduleSkillBuildersSessionCloseout();
    setInterval(scheduleSkillBuildersSessionCloseout, 24 * 60 * 60 * 1000);
  }, getMsUntilMidnight());
