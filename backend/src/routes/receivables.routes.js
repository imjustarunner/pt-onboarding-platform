import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  uploadReceivablesReport,
  listReceivablesUploads,
  listOutstandingReceivables,
  createReceivablesDraftInvoice,
  listReceivablesInvoices,
  patchReceivablesInvoice
} from '../controllers/receivables.controller.js';

const router = express.Router();

router.use(authenticate);

router.post('/uploads', ...uploadReceivablesReport);
router.get('/uploads', listReceivablesUploads);
router.get('/outstanding', listOutstandingReceivables);

router.post('/invoices/draft', createReceivablesDraftInvoice);
router.get('/invoices', listReceivablesInvoices);
router.patch('/invoices/:id', patchReceivablesInvoice);

export default router;

