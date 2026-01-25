import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listLocations,
  getLocation,
  listRooms,
  getAvailability,
  getWeeklyGrid,
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
router.get('/locations/:locationId/availability', getAvailability);
router.get('/locations/:locationId/weekly-grid', getWeeklyGrid);

// User booking request
router.post('/requests', createBookingRequest);

// Approvals (CPA/Admin)
router.get('/requests/pending', listPendingRequests);
router.post('/requests/:id/approve', approveRequest);
router.post('/requests/:id/deny', denyRequest);

// Admin utilities
router.post('/locations', createLocation);
router.put('/locations/:id', updateLocation);
router.post('/locations/:locationId/rooms', createRoom);

export default router;

