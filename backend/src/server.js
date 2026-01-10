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
import accountTypeRoutes from './routes/accountType.routes.js';
import userAccountRoutes from './routes/userAccount.routes.js';
import userInfoFieldDefinitionRoutes from './routes/userInfoFieldDefinition.routes.js';
import userInfoValueRoutes from './routes/userInfoValue.routes.js';
import customChecklistItemRoutes from './routes/customChecklistItem.routes.js';
import userChecklistAssignmentRoutes from './routes/userChecklistAssignment.routes.js';
import approvedEmployeeRoutes from './routes/approvedEmployee.routes.js';
import publicTrainingRoutes from './routes/publicTraining.routes.js';
import agencyOnDemandTrainingRoutes from './routes/agencyOnDemandTraining.routes.js';
import certificateRoutes from './routes/certificate.routes.js';
import iconRoutes from './routes/icon.routes.js';
import platformBrandingRoutes from './routes/platformBranding.routes.js';
import onboardingPackageRoutes from './routes/onboardingPackage.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import emailTemplateRoutes from './routes/emailTemplate.routes.js';
import userCommunicationRoutes from './routes/userCommunication.routes.js';
import brandingTemplateRoutes from './routes/brandingTemplate.routes.js';
import fontRoutes from './routes/font.routes.js';
import activityLogRoutes from './routes/activityLog.routes.js';
import supervisorAssignmentRoutes from './routes/supervisorAssignment.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy for accurate IP addresses (important for production behind load balancers/proxies)
// This allows req.ip to use X-Forwarded-For header
app.set('trust proxy', true);

// Middleware
app.use(cors({
  origin: config.cors.origin,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware with body sanitization
// Must be after body parsing middleware (express.json, express.urlencoded)
// This ensures req.body is available for sanitization
app.use(requestLoggingMiddleware);

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
  try {
    const StorageService = (await import('./services/storage.service.js')).default;
    
    // Extract file path from request (e.g., /uploads/icons/filename.png -> icons/filename.png)
    const filePath = req.path.replace(/^\/uploads\//, '');
    
    if (!filePath || filePath === '/') {
      return res.status(404).json({ error: { message: 'File not found' } });
    }
    
    // Generate signed URL for direct GCS access
    // Signed URLs expire after 1 hour by default
    const signedUrl = await StorageService.getSignedUrl(filePath, 60);
    
    // Redirect to signed URL for direct access
    res.redirect(302, signedUrl);
  } catch (error) {
    console.error('Error generating signed URL for file:', error);
    res.status(404).json({ error: { message: 'File not found' } });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

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
app.use('/api/account-types', accountTypeRoutes);
app.use('/api/users', userAccountRoutes);
app.use('/api/user-info-fields', userInfoFieldDefinitionRoutes);
app.use('/api', userInfoValueRoutes);
app.use('/api/custom-checklist-items', customChecklistItemRoutes);
app.use('/api', userChecklistAssignmentRoutes);
app.use('/api/approved-employees', approvedEmployeeRoutes);
app.use('/api/on-demand-training', publicTrainingRoutes);
app.use('/api/agency-on-demand-training', agencyOnDemandTrainingRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/icons', iconRoutes);
app.use('/api/platform-branding', platformBrandingRoutes);
app.use('/api/onboarding-packages', onboardingPackageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api', userCommunicationRoutes);
app.use('/api/branding-templates', brandingTemplateRoutes);
app.use('/api/fonts', fontRoutes);
app.use('/api/activity-log', activityLogRoutes);
app.use('/api/supervisor-assignments', supervisorAssignmentRoutes);

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

// Serve built frontend
app.use(express.static(path.join(__dirname, '../public')));

// SPA fallback for frontend routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Route not found' } });
});

const PORT = process.env.PORT || config.port || 3000;

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

