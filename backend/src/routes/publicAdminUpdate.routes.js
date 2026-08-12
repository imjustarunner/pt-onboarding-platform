import express from 'express';
import {
  getPublicAdminUpdate,
  postPublicAdminUpdateActivity,
  trackPublicAdminUpdateOpen,
  trackPublicAdminUpdateClick
} from '../controllers/adminUpdate.controller.js';

const router = express.Router();

router.get('/open/:token', trackPublicAdminUpdateOpen);
router.get('/click/:token', trackPublicAdminUpdateClick);
router.get('/:token', getPublicAdminUpdate);
router.post('/:token/activity', postPublicAdminUpdateActivity);

export default router;
