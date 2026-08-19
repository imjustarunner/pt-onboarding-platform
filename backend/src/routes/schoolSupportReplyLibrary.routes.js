import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAgencyAccess } from '../middleware/agencyAccess.middleware.js';
import {
  listSchoolSupportReplyLibrary,
  createSchoolSupportReplyLibraryEntry,
  updateSchoolSupportReplyLibraryEntry,
  deactivateSchoolSupportReplyLibraryEntry,
  matchSchoolSupportReplyLibraryForTicket,
  promoteSchoolSupportReplyFromTicket,
  listSchoolSupportReplyProposals,
  countSchoolSupportReplyProposals,
  approveSchoolSupportReplyProposal,
  dismissSchoolSupportReplyProposal,
  reindexSchoolSupportReplyEmbeddings,
  backfillSchoolSupportReplyGmailHistory
} from '../controllers/schoolSupportReplyLibrary.controller.js';

const router = express.Router();

router.use(authenticate);
router.use(requireAgencyAccess);

router.get('/', listSchoolSupportReplyLibrary);
router.post('/', createSchoolSupportReplyLibraryEntry);
router.get('/proposals/count', countSchoolSupportReplyProposals);
router.get('/proposals', listSchoolSupportReplyProposals);
router.post('/proposals/:proposalId/approve', approveSchoolSupportReplyProposal);
router.post('/proposals/:proposalId/dismiss', dismissSchoolSupportReplyProposal);
router.post('/reindex-embeddings', reindexSchoolSupportReplyEmbeddings);
router.post('/backfill-gmail-history', backfillSchoolSupportReplyGmailHistory);
router.get('/match/ticket/:ticketId', matchSchoolSupportReplyLibraryForTicket);
router.post('/from-ticket/:ticketId', promoteSchoolSupportReplyFromTicket);
router.put('/:id', updateSchoolSupportReplyLibraryEntry);
router.delete('/:id', deactivateSchoolSupportReplyLibraryEntry);

export default router;
