import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listQuotes,
  randomQuote,
  streamQuoteImage,
  hideQuote,
  unhideQuote,
  uploadQuote,
  deleteQuote
} from '../controllers/focusQuotes.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/', listQuotes);
router.get('/random', randomQuote);
router.get('/:id/image', streamQuoteImage);
router.post('/:id/hide', hideQuote);
router.delete('/:id/hide', unhideQuote);
router.post('/', uploadQuote);
router.delete('/:id', deleteQuote);

export default router;
