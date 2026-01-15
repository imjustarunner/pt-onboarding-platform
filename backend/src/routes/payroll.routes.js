import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  createPayrollPeriod,
  listPayrollPeriods,
  getPayrollPeriod,
  importPayrollCsv,
  upsertRate,
  listRatesForUser,
  listUserPayroll,
  requestAdpExport
} from '../controllers/payroll.controller.js';

const router = express.Router();

router.use(authenticate);

// Pay periods
router.post('/periods', createPayrollPeriod);
router.get('/periods', listPayrollPeriods);
router.get('/periods/:id', getPayrollPeriod);

// Rates
router.post('/rates', upsertRate);
router.get('/rates', listRatesForUser);

// CSV import into a period
router.post('/periods/:id/import', ...importPayrollCsv);

// User payroll history
router.get('/users/:userId/periods', listUserPayroll);

// ADP export (stub/job log)
router.post('/periods/:id/adp/export', requestAdpExport);

export default router;

