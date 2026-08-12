import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listCompanyCars,
  createCompanyCar,
  updateCompanyCar,
  uploadCompanyCarPhoto,
  listCompanyCarTrips,
  createCompanyCarTrip,
  updateCompanyCarTrip,
  deleteCompanyCarTrip,
  getCompanyCarTrip,
  exportCompanyCarTripsCsv,
  listCompanyCarUsualPlaces,
  listCompanyCarStartLocations,
  listCompanyCarDestinationOptions,
  listAgencyUsersForCompanyCar,
  calculateCompanyCarMileage,
  getLatestTripEndOdometer,
  importCompanyCarTrips,
  undoLastImport,
  previewTimelineImport,
  commitTimelineImport,
  bulkUpdateCompanyCarTrips,
  bulkEditCompanyCarTrips,
  rechainCompanyCarTrips,
  deleteAllCompanyCarTrips,
  recalculateCompanyCarMiles
} from '../controllers/companyCar.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/company-cars', listCompanyCars);
router.post('/company-cars', createCompanyCar);
router.patch('/company-cars/:id', updateCompanyCar);
router.post('/company-cars/:id/photo', ...uploadCompanyCarPhoto);

router.get('/latest-trip-end-odometer', getLatestTripEndOdometer);
router.get('/company-car-trips', listCompanyCarTrips);
router.get('/company-car-trips/export.csv', exportCompanyCarTripsCsv);
router.get('/company-car-trips/:id', getCompanyCarTrip);
router.post('/company-car-trips', createCompanyCarTrip);
router.patch('/company-car-trips/:id', updateCompanyCarTrip);
router.delete('/company-car-trips/:id', deleteCompanyCarTrip);

router.get('/company-car-usual-places', listCompanyCarUsualPlaces);
router.get('/start-locations', listCompanyCarStartLocations);
router.get('/destination-options', listCompanyCarDestinationOptions);

router.get('/mileage/calculate', calculateCompanyCarMileage);

router.get('/agency-users', listAgencyUsersForCompanyCar);

router.post('/import', ...importCompanyCarTrips);
router.post('/import/timeline/preview', ...previewTimelineImport);
router.post('/import/timeline/commit', commitTimelineImport);
router.post('/import/undo', undoLastImport);
router.patch('/company-car-trips/bulk', bulkUpdateCompanyCarTrips);
router.post('/company-car-trips/bulk-edit', bulkEditCompanyCarTrips);
router.post('/company-car-trips/rechain', rechainCompanyCarTrips);
router.post('/company-car-trips/delete-all', deleteAllCompanyCarTrips);
router.post('/company-car-trips/recalculate-miles', recalculateCompanyCarMiles);

export default router;
