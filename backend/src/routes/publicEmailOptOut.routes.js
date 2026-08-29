import express from 'express';
import {
  getEmailOptOutPreview,
  postEmailOptOutConfirm
} from '../controllers/publicEmailOptOut.controller.js';

const router = express.Router();

router.get('/:token', getEmailOptOutPreview);
router.post('/:token', postEmailOptOutConfirm);

export default router;
