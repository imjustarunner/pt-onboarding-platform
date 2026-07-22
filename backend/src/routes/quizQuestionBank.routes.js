import express from 'express';
import { body } from 'express-validator';
import {
  listBanks,
  getBank,
  createBank,
  updateBank,
  deleteBank,
  listQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  exportBankAsQuizQuestions
} from '../controllers/quizQuestionBank.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticate, requireBackofficeAdmin, listBanks);
router.post('/', authenticate, requireBackofficeAdmin, [
  body('title').trim().notEmpty()
], createBank);
router.get('/:id', authenticate, requireBackofficeAdmin, getBank);
router.put('/:id', authenticate, requireBackofficeAdmin, updateBank);
router.delete('/:id', authenticate, requireBackofficeAdmin, deleteBank);
router.get('/:id/questions', authenticate, requireBackofficeAdmin, listQuestions);
router.get('/:id/export', authenticate, requireBackofficeAdmin, exportBankAsQuizQuestions);
router.post('/:id/questions', authenticate, requireBackofficeAdmin, [
  body('questionText').optional().trim().notEmpty(),
  body('question').optional().trim().notEmpty()
], addQuestion);
router.put('/:id/questions/:qid', authenticate, requireBackofficeAdmin, updateQuestion);
router.delete('/:id/questions/:qid', authenticate, requireBackofficeAdmin, deleteQuestion);

export default router;
