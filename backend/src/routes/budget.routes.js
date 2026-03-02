import express from 'express';
import multer from 'multer';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import {
  getBudgetStatus,
  listFiscalYears,
  createFiscalYear,
  updateFiscalYear,
  listBudgetAllocations,
  upsertBudgetAllocations,
  listExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
  listDepartmentAccounts,
  createDepartmentAccount,
  updateDepartmentAccount,
  deleteDepartmentAccount,
  listBudgetEvents,
  createBudgetEvent,
  updateBudgetEvent,
  deleteBudgetEvent,
  getBudgetEventBySlug,
  listBudgetEventExpenses,
  listBusinessPurposes,
  createBusinessPurpose,
  updateBusinessPurpose,
  deleteBusinessPurpose,
  extractReceiptOcr,
  createBudgetExpenses,
  calculateMileage,
  listBudgetExpenses,
  getBudgetExpenseReport,
  exportBudgetExpensesCsv,
  analyzeBudgetExpenses,
  getMyDepartments,
  updateBudgetExpenseStatus
} from '../controllers/budget.controller.js';

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/i.test(file.mimetype);
    cb(null, !!ok);
  }
});

const router = express.Router();

router.use(authenticate);
router.use(requireCapability('canAccessBudgetManagement'));

router.get('/status', getBudgetStatus);

router.get('/agencies/:agencyId/fiscal-years', listFiscalYears);
router.post('/agencies/:agencyId/fiscal-years', createFiscalYear);
router.put('/agencies/:agencyId/fiscal-years/:id', updateFiscalYear);

router.get('/fiscal-years/:fiscalYearId/allocations', listBudgetAllocations);
router.put('/fiscal-years/:fiscalYearId/allocations', upsertBudgetAllocations);

router.get('/agencies/:agencyId/expense-categories', listExpenseCategories);
router.post('/agencies/:agencyId/expense-categories', createExpenseCategory);
router.put('/agencies/:agencyId/expense-categories/:id', updateExpenseCategory);
router.delete('/agencies/:agencyId/expense-categories/:id', deleteExpenseCategory);

router.get('/departments/:departmentId/accounts', listDepartmentAccounts);
router.post('/departments/:departmentId/accounts', createDepartmentAccount);
router.put('/departments/:departmentId/accounts/:id', updateDepartmentAccount);
router.delete('/departments/:departmentId/accounts/:id', deleteDepartmentAccount);

router.get('/agencies/:agencyId/events', listBudgetEvents);
router.get('/agencies/:agencyId/events/by-slug/:eventSlug', getBudgetEventBySlug);
router.get('/agencies/:agencyId/events/:eventId/expenses', listBudgetEventExpenses);
router.post('/agencies/:agencyId/events', createBudgetEvent);
router.put('/agencies/:agencyId/events/:id', updateBudgetEvent);
router.delete('/agencies/:agencyId/events/:id', deleteBudgetEvent);

router.get('/agencies/:agencyId/business-purposes', listBusinessPurposes);
router.post('/agencies/:agencyId/business-purposes', createBusinessPurpose);
router.put('/agencies/:agencyId/business-purposes/:id', updateBusinessPurpose);
router.delete('/agencies/:agencyId/business-purposes/:id', deleteBusinessPurpose);

router.get('/mileage/calculate', calculateMileage);
router.get('/agencies/:agencyId/my-departments', getMyDepartments);
router.get('/agencies/:agencyId/expenses', listBudgetExpenses);
router.get('/agencies/:agencyId/expenses/report', getBudgetExpenseReport);
router.put('/agencies/:agencyId/expenses/:id', updateBudgetExpenseStatus);
router.get('/agencies/:agencyId/expenses/export.csv', exportBudgetExpensesCsv);
router.post('/agencies/:agencyId/expenses/analyze', analyzeBudgetExpenses);
router.post('/expenses/ocr', receiptUpload.single('receipt'), extractReceiptOcr);
router.post('/agencies/:agencyId/expenses', createBudgetExpenses);

export default router;
