import express from 'express';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import {
  listSchools,
  geocodeSchoolAddresses,
  lookupSchoolAddress,
  getSummary,
  getSchool,
  patchSchool,
  createSchool,
  createActivity,
  patchActivity,
  getTimeline,
  getTaskList,
  getAssignableUsers,
  listSchoolTasks,
  createSchoolTask,
  listSchoolOnboarding,
  sendSchoolOnboarding,
  addSchoolNote,
  addSchoolContact,
  patchSchoolContact,
  removeSchoolContact,
  previewTrip,
  listTrips,
  getTrip,
  createTrip,
  updateTrip,
  deleteTrip,
  completeTrip,
  patchTripStop,
  previewHistoricalImport,
  runHistoricalImport,
  syncStaffContacts
} from '../controllers/outreachHub.controller.js';

const router = express.Router();

router.use(authenticate, requireCapability('canAccessOutreach'));

router.get('/task-list', getTaskList);
router.get('/assignable-users', getAssignableUsers);
router.get('/schools', listSchools);
router.post('/schools', createSchool);
router.post('/schools/geocode', geocodeSchoolAddresses);
router.post('/schools/:id/lookup-address', lookupSchoolAddress);
router.get('/summary', getSummary);
router.get('/timeline', getTimeline);
router.get('/trips', listTrips);
router.post('/trips/preview', previewTrip);
router.post('/trips', createTrip);
router.get('/trips/:tripId', getTrip);
router.patch('/trips/:tripId', updateTrip);
router.delete('/trips/:tripId', deleteTrip);
router.post('/trips/:tripId/complete', completeTrip);
router.patch('/trips/:tripId/stops/:stopId', patchTripStop);
router.post('/import/preview', previewHistoricalImport);
router.post('/import/historical', runHistoricalImport);
router.post('/contacts/sync-staff', syncStaffContacts);
router.get('/schools/:id/tasks', listSchoolTasks);
router.post('/schools/:id/tasks', createSchoolTask);
router.get('/schools/:id/onboarding', listSchoolOnboarding);
router.post('/schools/:id/onboarding', sendSchoolOnboarding);
router.post('/schools/:id/notes', addSchoolNote);
router.post('/schools/:id/contacts', addSchoolContact);
router.patch('/schools/:id/contacts/:contactId', patchSchoolContact);
router.delete('/schools/:id/contacts/:contactId', removeSchoolContact);
router.get('/schools/:id', getSchool);
router.patch('/schools/:id', patchSchool);
router.post('/schools/:id/activities', createActivity);
router.patch('/schools/:id/activities/:activityId', patchActivity);

export default router;
