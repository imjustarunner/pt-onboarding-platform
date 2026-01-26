import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/config.js';
import requestLoggingMiddleware from './middleware/requestLogging.middleware.js';
import authRoutes from './routes/auth.routes.js';
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
import approvedEmployeeRoutes from './routes/approvedEmployee.routes.js';
import publicTrainingRoutes from './routes/publicTraining.routes.js';
import agencyOnDemandTrainingRoutes from './routes/agencyOnDemandTraining.routes.js';
import certificateRoutes from './routes/certificate.routes.js';
import iconRoutes from './routes/icon.routes.js';
import logoRoutes from './routes/logo.routes.js';
import iconTemplateRoutes from './routes/iconTemplate.routes.js';
import platformBrandingRoutes from './routes/platformBranding.routes.js';
import onboardingPackageRoutes from './routes/onboardingPackage.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import emailTemplateRoutes from './routes/emailTemplate.routes.js';
import emailSenderIdentityRoutes from './routes/emailSenderIdentity.routes.js';
import notificationTriggerAdminRoutes from './routes/notificationTriggerAdmin.routes.js';
import userCommunicationRoutes from './routes/userCommunication.routes.js';
import userAdminDocsRoutes from './routes/userAdminDocs.routes.js';
import brandingTemplateRoutes from './routes/brandingTemplate.routes.js';
import fontRoutes from './routes/font.routes.js';
import activityLogRoutes from './routes/activityLog.routes.js';
import supervisorAssignmentRoutes from './routes/supervisorAssignment.routes.js';
import healthCheckRoutes from './routes/healthCheck.routes.js';
import referralUploadRoutes from './routes/referralUpload.routes.js';
import schoolPortalRoutes from './routes/schoolPortal.routes.js';
import referralRoutes from './routes/referral.routes.js';
import bulkImportRoutes from './routes/bulkImport.routes.js';
import userPreferencesRoutes from './routes/userPreferences.routes.js';
import officeScheduleRoutes from './routes/officeSchedule.routes.js';
import twilioRoutes from './routes/twilio.routes.js';
import messageRoutes from './routes/message.routes.js';
import presenceRoutes from './routes/presence.routes.js';
import chatRoutes from './routes/chat.routes.js';
import kioskRoutes from './routes/kiosk.routes.js';
import emergencyBroadcastRoutes from './routes/emergencyBroadcast.routes.js';
import payrollRoutes from './routes/payroll.routes.js';
import billingRoutes from './routes/billing.routes.js';
import clientSettingsRoutes from './routes/clientSettings.routes.js';
import providerSettingsRoutes from './routes/providerSettings.routes.js';
import providerSearchRoutes from './routes/providerSearch.routes.js';
import providerImportRoutes from './routes/providerImport.routes.js';
import agencyCredentialingRoutes from './routes/agencyCredentialing.routes.js';
import schoolSettingsRoutes from './routes/schoolSettings.routes.js';
import bulkClientUploadRoutes from './routes/bulkClientUpload.routes.js';
import bulkSchoolUploadRoutes from './routes/bulkSchoolUpload.routes.js';
import providerSchedulingRoutes from './routes/providerScheduling.routes.js';
import phiDocumentsRoutes from './routes/phiDocuments.routes.js';
import agencySchoolsRoutes from './routes/agencySchools.routes.js';
import clientRoutes from './routes/client.routes.js';
import guardianPortalRoutes from './routes/guardianPortal.routes.js';
import providerSelfRoutes from './routes/providerSelf.routes.js';
import supportTicketsRoutes from './routes/supportTickets.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import officeSettingsRoutes from './routes/officeSettings.routes.js';
import officeSlotActionsRoutes from './routes/officeSlotActions.routes.js';
import officeReviewRoutes from './routes/officeReview.routes.js';
import availabilityRoutes from './routes/availability.routes.js';

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
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  // Explicitly set allowed headers for mobile browser compatibility
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  // Explicitly set exposed headers (cookies are automatically exposed)
  exposedHeaders: ['Set-Cookie'],
  // Ensure preflight requests work correctly on mobile
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
}));
app.use(cookieParser());
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
app.use('/uploads', async (req, res, next) => {
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
      if (config.nodeEnv !== 'development') return false;
      try {
        const fs = (await import('fs/promises')).default;
        const ext = path.extname(storageKey).toLowerCase();
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

        // In local dev, files live under backend/uploads/* (no leading "uploads/" prefix).
        let rel = storageKey || '';
        if (rel.startsWith('uploads/')) rel = rel.substring('uploads/'.length);
        const localPath = path.join(__dirname, '../uploads', rel);
        const buffer = await fs.readFile(localPath);

        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(buffer);
        console.log(`[File Request] Served local file (dev): ${localPath}`);
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
          res.setHeader('Access-Control-Allow-Origin', config.cors.origin || '*');
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
          res.setHeader('Access-Control-Allow-Origin', config.cors.origin || '*');
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
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Health check routes (must be before authentication middleware)
app.use('/api/health-check', healthCheckRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/modules', contentRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/signatures', signatureRoutes);
app.use('/api/agencies', agencyRoutes);
app.use('/api/agencies', agencyDashboardRoutes);
app.use('/api/agencies', agencySchoolsRoutes);
app.use('/api/tracks', trackRoutes);
app.use('/api/training-focuses', trackRoutes); // Alias for new terminology
app.use('/api/acknowledgments', acknowledgmentRoutes);
app.use('/api/admin-actions', adminActionsRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/document-templates', documentTemplateRoutes);
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
app.use('/api/approved-employees', approvedEmployeeRoutes);
app.use('/api/on-demand-training', publicTrainingRoutes);
app.use('/api/agency-on-demand-training', agencyOnDemandTrainingRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/icons', iconRoutes);
app.use('/api/logos', logoRoutes);
app.use('/api/icon-templates', iconTemplateRoutes);
app.use('/api/platform-branding', platformBrandingRoutes);
app.use('/api/onboarding-packages', onboardingPackageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/email-senders', emailSenderIdentityRoutes);
app.use('/api/notification-triggers', notificationTriggerAdminRoutes);
app.use('/api', userCommunicationRoutes);
app.use('/api', userAdminDocsRoutes);
app.use('/api/users', userPreferencesRoutes);
app.use('/api/branding-templates', brandingTemplateRoutes);
app.use('/api/fonts', fontRoutes);
app.use('/api/activity-log', activityLogRoutes);
app.use('/api/supervisor-assignments', supervisorAssignmentRoutes);
app.use('/api/organizations', referralUploadRoutes); // Organization routes (referral upload, etc.)
app.use('/api/school-portal', schoolPortalRoutes); // School portal routes (restricted client views)
app.use('/api/referrals', referralRoutes); // Referral pipeline routes
app.use('/api/clients', clientRoutes); // Client management routes
app.use('/api/guardian-portal', guardianPortalRoutes); // Guardian portal routes
app.use('/api/bulk-import', bulkImportRoutes); // Bulk import routes (legacy migration tool)
app.use('/api/office-schedule', officeScheduleRoutes);
app.use('/api/offices', officeSettingsRoutes);
app.use('/api/office-slots', officeSlotActionsRoutes);
app.use('/api/office-review', officeReviewRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/twilio', twilioRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/presence', presenceRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/kiosk', kioskRoutes);
app.use('/api/emergency-broadcasts', emergencyBroadcastRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/client-settings', clientSettingsRoutes);
app.use('/api/provider-settings', providerSettingsRoutes);
app.use('/api/provider-search', providerSearchRoutes);
app.use('/api/provider-import', providerImportRoutes);
app.use('/api/school-settings', schoolSettingsRoutes);
app.use('/api/bulk-client-upload', bulkClientUploadRoutes);
app.use('/api/bulk-school-upload', bulkSchoolUploadRoutes);
app.use('/api/provider-scheduling', providerSchedulingRoutes);
app.use('/api/provider-self', providerSelfRoutes);
app.use('/api/support-tickets', supportTicketsRoutes);
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
          'Invalid reference value (foreign key constraint). Please verify the selected agency/icon still exists.',
        ...(config.nodeEnv === 'development' && {
          code: err.code,
          sqlMessage: err.sqlMessage,
          sqlState: err.sqlState
        })
      }
    });
  }

  if (!err.status && isEnumTruncation) {
    return res.status(400).json({
      error: {
        message:
          'Invalid enum value provided. If this is a document action type like "acroform", run the latest DB migrations to expand supported values.',
        ...(config.nodeEnv === 'development' && {
          code: err.code,
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

// Cloud Run sets PORT automatically - use it or default to 8080
const PORT = process.env.PORT || 8080; // Fixed for Cloud Run deployment

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${config.nodeEnv}`);
});

  
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

  // Run immediately on startup (best-effort)
  scheduleOfficeScheduleWatchdog();

  // Schedule daily at midnight
  setTimeout(() => {
    scheduleOfficeScheduleWatchdog();
    setInterval(scheduleOfficeScheduleWatchdog, 24 * 60 * 60 * 1000);
  }, getMsUntilMidnight());
