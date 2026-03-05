import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  uploadReceivablesReport,
  listReceivablesUploads,
  listOutstandingReceivables,
  patchReceivableRowManagement,
  bulkManageReceivableRows,
  patchReceivableRowReimbursement,
  createReceivableEmailDraft,
  listReceivableEmailDrafts,
  listReceivableRowComments,
  createReceivableRowComment,
  exportReceivableEvidenceCsv,
  createReceivablesDraftInvoice,
  listReceivablesInvoices,
  patchReceivablesInvoice
} from '../controllers/receivables.controller.js';

const router = express.Router();

router.use(authenticate);

router.post('/uploads', ...uploadReceivablesReport);
router.get('/uploads', listReceivablesUploads);
router.get('/outstanding', listOutstandingReceivables);
router.patch('/rows/:id/manage', patchReceivableRowManagement);
router.post('/rows/bulk-manage', bulkManageReceivableRows);
router.patch('/rows/:id/reimbursement', patchReceivableRowReimbursement);
router.get('/rows/:id/comments', listReceivableRowComments);
router.post('/rows/:id/comments', createReceivableRowComment);
router.post('/rows/export-evidence.csv', exportReceivableEvidenceCsv);
router.post('/rows/:id/email-drafts', createReceivableEmailDraft);
router.get('/rows/:id/email-drafts', listReceivableEmailDrafts);

router.post('/invoices/draft', createReceivablesDraftInvoice);
router.get('/invoices', listReceivablesInvoices);
router.patch('/invoices/:id', patchReceivablesInvoice);

export default router;

