import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  listBusinessTypeCatalog,
  listAgencyBusinessTypes,
  putAgencyBusinessTypes,
  listTenantServices,
  createTenantService,
  updateTenantService,
  deleteTenantService,
  listServiceStaff,
  putServiceStaff,
  getBookingOptions
} from '../controllers/tenantServices.controller.js';
import {
  listPackages,
  createPackage,
  updatePackage,
  listClientEntitlements,
  activateEntitlement,
  getAgencyCapabilities
} from '../controllers/bookingPackages.controller.js';
import {
  listCancellationPolicies,
  createCancellationPolicy,
  updateCancellationPolicy,
  resolvePolicyPreview,
  runReminderCron
} from '../controllers/bookingPolicies.controller.js';
import {
  getTenantSessionNotifications,
  putTenantSessionNotifications,
  getClientSessionNotificationPrefs,
  putClientSessionNotificationPrefs,
  runSessionNotificationCron
} from '../controllers/sessionNotification.controller.js';

const router = express.Router({ mergeParams: true });

// Cron before auth — uses x-cron-secret
router.post('/cron/reminders', runReminderCron);
router.post('/cron/session-notifications', runSessionNotificationCron);

router.use(authenticate, requireActiveStatus);

router.get('/business-type-catalog', listBusinessTypeCatalog);
router.get('/agencies/:agencyId/business-types', listAgencyBusinessTypes);
router.put('/agencies/:agencyId/business-types', putAgencyBusinessTypes);
router.get('/agencies/:agencyId/capabilities', getAgencyCapabilities);
router.get('/agencies/:agencyId/tenant-services', listTenantServices);
router.post('/agencies/:agencyId/tenant-services', createTenantService);
router.patch('/agencies/:agencyId/tenant-services/:serviceId', updateTenantService);
router.delete('/agencies/:agencyId/tenant-services/:serviceId', deleteTenantService);
router.get('/agencies/:agencyId/tenant-services/:serviceId/staff', listServiceStaff);
router.put('/agencies/:agencyId/tenant-services/:serviceId/staff', putServiceStaff);
router.get('/agencies/:agencyId/booking-options', getBookingOptions);
router.get('/agencies/:agencyId/packages', listPackages);
router.post('/agencies/:agencyId/packages', createPackage);
router.patch('/agencies/:agencyId/packages/:packageId', updatePackage);
router.get('/agencies/:agencyId/clients/:clientId/entitlements', listClientEntitlements);
router.post('/agencies/:agencyId/entitlements', activateEntitlement);
router.get('/agencies/:agencyId/cancellation-policies', listCancellationPolicies);
router.post('/agencies/:agencyId/cancellation-policies', createCancellationPolicy);
router.patch('/agencies/:agencyId/cancellation-policies/:policyId', updateCancellationPolicy);
router.get('/agencies/:agencyId/cancellation-policy-preview', resolvePolicyPreview);
router.get('/agencies/:agencyId/session-notifications', getTenantSessionNotifications);
router.put('/agencies/:agencyId/session-notifications', putTenantSessionNotifications);
router.get('/agencies/:agencyId/clients/:clientId/session-notification-preferences', getClientSessionNotificationPrefs);
router.put('/agencies/:agencyId/clients/:clientId/session-notification-preferences', putClientSessionNotificationPrefs);

export default router;
