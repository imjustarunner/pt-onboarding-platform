import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { listFaqs, createFaq, updateFaq, createFaqFromTicket } from '../controllers/faq.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/', listFaqs);
router.post('/', createFaq);
router.put('/:id', updateFaq);
router.post('/from-ticket', createFaqFromTicket);

export default router;

