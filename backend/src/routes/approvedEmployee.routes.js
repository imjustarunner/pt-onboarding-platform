import express from 'express';
import {
  getApprovedEmployees,
  addApprovedEmployee,
  bulkAddApprovedEmployees,
  importFromCsv,
  updateApprovedEmployee,
  deleteApprovedEmployee,
  sendVerificationEmail,
  verifyEmail,
  archiveUser,
  updatePassword,
  setCompanyDefaultPassword,
  updateAgencyDefaultPasswordToggle,
  getAgencyPasswordSettings,
  uploadCsv
} from '../controllers/approvedEmployee.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { body } from 'express-validator';

const router = express.Router();

// Public route for email verification
router.get('/verify', verifyEmail);

// All other routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

router.get('/', getApprovedEmployees);

// Specific routes must come before parameterized routes
router.put('/company-default-password',
  [
    body('agencyId').isInt().withMessage('Agency ID is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  setCompanyDefaultPassword
);

router.put('/agency-default-password-toggle',
  [
    body('agencyId').isInt().withMessage('Agency ID is required'),
    body('useDefaultPassword').isBoolean().withMessage('useDefaultPassword must be a boolean')
  ],
  updateAgencyDefaultPasswordToggle
);

router.get('/agency-password-settings', getAgencyPasswordSettings);

router.post(
  '/',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('agencyId').isInt().withMessage('Agency ID is required')
  ],
  addApprovedEmployee
);

router.post(
  '/bulk',
  [
    body('emails').isArray().withMessage('Emails array is required'),
    body('emails.*').isEmail().withMessage('All items must be valid emails'),
    body('agencyId').isInt().withMessage('Agency ID is required')
  ],
  bulkAddApprovedEmployees
);

router.post(
  '/import-csv',
  uploadCsv.single('csvFile'),
  [
    body('agencyId').isInt().withMessage('Agency ID is required')
  ],
  importFromCsv
);

router.put('/:id', updateApprovedEmployee);
router.delete('/:id', deleteApprovedEmployee);
router.post('/:id/send-verification', sendVerificationEmail);
router.post('/:id/archive', archiveUser);
router.put('/:id/password',
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  updatePassword
);

export default router;

