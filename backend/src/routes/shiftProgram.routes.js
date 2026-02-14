import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { requireAgencyShiftProgramsEnabled, requireProgramAgencyShiftProgramsEnabled } from '../middleware/shiftPrograms.middleware.js';
import {
  listPrograms,
  getProgram,
  createSite,
  updateSite,
  updateSettings,
  addStaff,
  updateStaff,
  removeStaff,
  listShiftSlots,
  createShiftSlot,
  deleteShiftSlot,
  listMySignups,
  listMyPrograms,
  listSignupsForSite,
  listMyCoverageOpportunities,
  createSignup,
  createCalloff,
  coverCalloff,
  listProgramChecklistItems,
  toggleProgramChecklistItem
} from '../controllers/shiftProgram.controller.js';

const router = express.Router();

router.use(authenticate);

// Staff-accessible: my signups, my programs, coverage opportunities (no admin required)
router.get('/my-signups', listMySignups);
router.get('/my-programs', listMyPrograms);
router.get('/my-coverage-opportunities', listMyCoverageOpportunities);

// Staff sign-up (controller checks program staff access)
router.post(
  '/:programId/sites/:siteId/signups',
  requireProgramAgencyShiftProgramsEnabled,
  [
    body('slotDate').isDate().withMessage('slotDate is required'),
    body('shiftSlotId').optional().isInt({ min: 1 }),
    body('startTime').optional().isString(),
    body('endTime').optional().isString(),
    body('signupType').optional().isIn(['scheduled', 'on_call']),
    body('userId').optional().isInt({ min: 1 })
  ],
  createSignup
);

// Call-offs (staff can create for their own shifts)
router.post(
  '/:programId/calloffs',
  requireProgramAgencyShiftProgramsEnabled,
  [
    body('shiftSignupId').isInt({ min: 1 }).withMessage('shiftSignupId is required'),
    body('reason').optional().isString().trim()
  ],
  createCalloff
);
// Cover a call-off (on-call staff accepts)
router.post('/:programId/calloffs/:calloffId/cover', requireProgramAgencyShiftProgramsEnabled, coverCalloff);

// Admin-only routes
router.use(requireBackofficeAdmin);

// List programs for agency - must be before /:programId to avoid param collision
router.get('/agencies/:agencyId/programs', requireAgencyShiftProgramsEnabled, listPrograms);

// Program detail with sites, settings, staff
router.get('/:programId', requireProgramAgencyShiftProgramsEnabled, getProgram);

// Sites
router.post(
  '/:programId/sites',
  requireProgramAgencyShiftProgramsEnabled,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('address').optional().trim(),
    body('officeLocationId').optional().isInt({ min: 1 })
  ],
  createSite
);
router.patch('/:programId/sites/:siteId', requireProgramAgencyShiftProgramsEnabled, updateSite);

// Shift slots
router.get('/:programId/sites/:siteId/slots', requireProgramAgencyShiftProgramsEnabled, listShiftSlots);
router.get('/:programId/sites/:siteId/signups', requireProgramAgencyShiftProgramsEnabled, listSignupsForSite);
router.post('/:programId/sites/:siteId/slots', requireProgramAgencyShiftProgramsEnabled, createShiftSlot);
router.delete('/:programId/sites/:siteId/slots/:slotId', requireProgramAgencyShiftProgramsEnabled, deleteShiftSlot);

// Settings
router.put('/:programId/settings', requireProgramAgencyShiftProgramsEnabled, updateSettings);

// Checklist items (program-scoped)
router.get('/:programId/checklist-items', requireProgramAgencyShiftProgramsEnabled, listProgramChecklistItems);
router.put('/:programId/checklist-items/:itemId', requireProgramAgencyShiftProgramsEnabled, toggleProgramChecklistItem);

// Staff
router.post(
  '/:programId/staff',
  requireProgramAgencyShiftProgramsEnabled,
  [
    body('userId').isInt({ min: 1 }).withMessage('userId is required'),
    body('role').optional().isString().trim(),
    body('minScheduledHoursPerWeek').optional().isFloat({ min: 0 }),
    body('minOnCallHoursPerWeek').optional().isFloat({ min: 0 })
  ],
  addStaff
);
router.patch('/:programId/staff/:assignmentId', requireProgramAgencyShiftProgramsEnabled, updateStaff);
router.delete('/:programId/staff/:userId', requireProgramAgencyShiftProgramsEnabled, removeStaff);

export default router;
