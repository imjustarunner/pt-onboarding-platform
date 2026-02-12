import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listLocations,
  getLocation,
  listRooms,
  listLocationProviders,
  getAvailability,
  getWeeklyGrid,
  refreshEhrAssignedRoomBookings,
  createOfficeBookingRequest,
  listPendingOfficeBookingRequests,
  approveOfficeBookingRequest,
  denyOfficeBookingRequest,
  createBookingRequest,
  listPendingRequests,
  approveRequest,
  denyRequest,
  publicBoard,
  createLocation,
  updateLocation,
  createRoom
} from '../controllers/officeSchedule.controller.js';

const router = express.Router();

// Public board (no login) - requires ?key=
router.get('/board/:locationId', publicBoard);

// Authenticated routes
router.use(authenticate);

// Locations + rooms (read)
router.get('/locations', listLocations);
router.get('/locations/:id', getLocation);
router.get('/locations/:locationId/rooms', listRooms);
router.get('/locations/:locationId/providers', listLocationProviders);
router.get('/locations/:locationId/availability', getAvailability);
router.get('/locations/:locationId/weekly-grid', getWeeklyGrid);
router.post('/locations/:locationId/refresh-ehr-assigned-bookings', refreshEhrAssignedRoomBookings);

// User booking request
router.post('/requests', createBookingRequest);

// Office booking requests (frequency-aware, supports kiosk auto-book for same-day open slots)
router.post('/booking-requests', createOfficeBookingRequest);

// Approvals (CPA/Admin)
router.get('/requests/pending', listPendingRequests);
router.post('/requests/:id/approve', approveRequest);
router.post('/requests/:id/deny', denyRequest);

router.get('/booking-requests/pending', listPendingOfficeBookingRequests);
router.post('/booking-requests/:id/approve', approveOfficeBookingRequest);
router.post('/booking-requests/:id/deny', denyOfficeBookingRequest);

// Admin utilities
router.post('/locations', createLocation);
router.put('/locations/:id', updateLocation);
router.post('/locations/:locationId/rooms', createRoom);

export default router;

