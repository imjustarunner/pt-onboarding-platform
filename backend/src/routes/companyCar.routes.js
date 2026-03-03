import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listCompanyCars,
  createCompanyCar,
  updateCompanyCar,
  uploadCompanyCarPhoto,
  listCompanyCarTrips,
  createCompanyCarTrip,
  deleteCompanyCarTrip,
  listCompanyCarUsualPlaces,
  listCompanyCarStartLocations,
  listCompanyCarDestinationOptions,
  listAgencyUsersForCompanyCar,
  calculateCompanyCarMileage,
  importCompanyCarTrips
} from '../controllers/companyCar.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/company-cars', listCompanyCars);
router.post('/company-cars', createCompanyCar);
router.patch('/company-cars/:id', updateCompanyCar);
router.post('/company-cars/:id/photo', ...uploadCompanyCarPhoto);

router.get('/company-car-trips', listCompanyCarTrips);
router.post('/company-car-trips', createCompanyCarTrip);
router.delete('/company-car-trips/:id', deleteCompanyCarTrip);

router.get('/company-car-usual-places', listCompanyCarUsualPlaces);
router.get('/start-locations', listCompanyCarStartLocations);
router.get('/destination-options', listCompanyCarDestinationOptions);

router.get('/mileage/calculate', calculateCompanyCarMileage);

router.get('/agency-users', listAgencyUsersForCompanyCar);

router.post('/import', ...importCompanyCarTrips);

export default router;
