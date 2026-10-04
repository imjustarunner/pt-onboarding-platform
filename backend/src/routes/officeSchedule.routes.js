import { bookOfficeToday } from '../services/officeSameDayBooking.service.js';
import express from 'express';
import * as officePolicy from '../controllers/officeSchedulingPolicy.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listLocations,
  getLocation,
  listRooms,
  listLocationProviders,
  getBookingMetadata,
  getAvailability,
  getWeeklyGrid,
  refreshEhrAssignedRoomBookings,
  getMyMandatoryOfficeReview,
  getMyOpenForBookingReview,
  createOfficeBookingRequest,
  listPendingOfficeBookingRequests,
  getPendingOfficeQueueSummary,
  listPendingIntakeOfficeRequests,
  getOfficeBookingRequestContext,
  approveOfficeBookingRequest,
  denyOfficeBookingRequest,
  createBookingRequest,
  listPendingRequests,
  approveRequest,
  denyRequest,
  publicBoard,
  createLocation,
  updateLocation,
  createRoom,
  getOfficeScheduleIntegrityDiagnostics,
  autoResolveOfficeScheduleIntegrity,
  resolveIntegrityConflict,
  cleanupInactiveProviderBookings,
  availableRoomsForSlot,
  withdrawOfficeBookingRequest,
  rebookEvent,
  getSlotConflicts,
  resolveSlotConflict,
  getScheduleAudit,
  getCoverageFlags,
  keepCoverageFlag,
  releaseCoverageFlag,
  bulkCoverageFlags,
  getEhrSyncHealthEndpoint,
  runCoverageAudit,
  runAllLocationsCoverageAudit,
  debugEventsForWeek,
  getProviderScheduleList
} from '../controllers/officeSchedule.controller.js';

const router = express.Router();

// Public board (no login) - requires ?key=
router.get('/board/:locationId', publicBoard);

// Authenticated routes
router.use(authenticate);
router.get('/scheduling-policies', officePolicy.listPolicies);
router.get('/scheduling-policies/:agencyId/preview', officePolicy.previewPolicy);
router.put('/scheduling-policies/:agencyId', officePolicy.savePolicy);
router.get('/usage-reviews', officePolicy.listUsageReviews);
router.post('/usage-reviews/:assignmentId/request', officePolicy.requestKeepOffice);
router.post('/usage-reviews/:assignmentId/decision', officePolicy.decideKeepOffice);

// Retired provider blocking gate — endpoint kept for compatibility; always returns empty.
router.get('/me/mandatory-review', getMyMandatoryOfficeReview);
// Non-blocking review list for Provider Update / office schedule check-ins.
router.get('/me/open-for-booking-review', getMyOpenForBookingReview);

// Locations + rooms (read)
router.get('/locations', listLocations);
router.get('/locations/:id', getLocation);
router.get('/locations/:locationId/rooms', listRooms);
router.get('/locations/:locationId/providers', listLocationProviders);
router.get('/booking-metadata', getBookingMetadata);
router.get('/locations/:locationId/availability', getAvailability);
router.get('/locations/:locationId/weekly-grid', getWeeklyGrid);
router.post('/locations/:locationId/refresh-ehr-assigned-bookings', refreshEhrAssignedRoomBookings);

// Authenticated self-booking: same office-local day only, no approval queue.
router.post('/locations/:locationId/same-day-booking', async (req,res,next) => {
  try {
    const locationId = Number(req.params.locationId), roomId = Number(req.body?.roomId);
    if (!Number.isSafeInteger(locationId) || locationId <= 0 || !Number.isSafeInteger(roomId) || roomId <= 0) return res.status(400).json({error:{message:'Choose a building and room.'}});
    res.status(201).json(await bookOfficeToday({user:req.user,locationId,roomId,date:req.body?.date,time:req.body?.time,endTime:req.body?.endTime}));
  } catch(error) { if (error.status) return res.status(error.status).json({error:{message:error.message}}); next(error); }
});

// User booking request
router.post('/requests', createBookingRequest);

// Office booking requests (frequency-aware, supports kiosk auto-book for same-day open slots)
router.post('/booking-requests', createOfficeBookingRequest);

// Approvals (CPA/Admin)
router.get('/requests/pending', listPendingRequests);
router.post('/requests/:id/approve', approveRequest);
router.post('/requests/:id/deny', denyRequest);

router.get('/booking-requests/pending', listPendingOfficeBookingRequests);
router.get('/admin/pending-queue-summary', getPendingOfficeQueueSummary);
router.get('/admin/pending-intake-requests', listPendingIntakeOfficeRequests);
router.get('/booking-requests/:id/context', getOfficeBookingRequestContext);
router.post('/booking-requests/:id/approve', approveOfficeBookingRequest);
router.post('/booking-requests/:id/deny', denyOfficeBookingRequest);
router.post('/booking-requests/:id/withdraw', withdrawOfficeBookingRequest);

// Admin utilities
router.post('/locations', createLocation);
router.put('/locations/:id', updateLocation);
router.post('/locations/:locationId/rooms', createRoom);

// Booking conflict resolver (post-reinstatement triage)
router.get('/admin/integrity-diagnostics', getOfficeScheduleIntegrityDiagnostics);
router.post('/admin/integrity-diagnostics/auto-resolve', autoResolveOfficeScheduleIntegrity);
router.post('/admin/integrity-diagnostics/resolve', resolveIntegrityConflict);
router.post('/admin/cleanup-inactive-providers', cleanupInactiveProviderBookings);
router.get('/admin/available-rooms-for-slot', availableRoomsForSlot);
// Staff-facing alias (same handler) for appointment office requests
router.get('/available-rooms-for-slot', availableRoomsForSlot);
router.post('/admin/rebook-event', rebookEvent);
router.get('/admin/slot-conflicts', getSlotConflicts);
router.post('/admin/slot-conflicts/resolve', resolveSlotConflict);

// Full schedule audit / print report
router.get('/admin/schedule-audit', getScheduleAudit);

// ICS coverage flags (6-week audit results)
router.get('/admin/coverage-flags', getCoverageFlags);
router.post('/admin/coverage-flags/bulk', bulkCoverageFlags);
router.post('/admin/coverage-flags/:eventId/keep', keepCoverageFlag);
router.post('/admin/coverage-flags/:eventId/release', releaseCoverageFlag);
router.get('/admin/ehr-sync-health', getEhrSyncHealthEndpoint);
router.post('/locations/:locationId/run-coverage-audit', runCoverageAudit);
router.get('/locations/:locationId/debug-events', debugEventsForWeek);
// Provider schedule list: all active standing assignments for a given user (used by Schedule List card)
router.get('/provider-schedule-list', getProviderScheduleList);
// Trigger all-locations coverage audit manually (used by admin Coverage Flags page)
router.post('/watchdog/run-coverage-audit', runAllLocationsCoverageAudit);

export default router;

