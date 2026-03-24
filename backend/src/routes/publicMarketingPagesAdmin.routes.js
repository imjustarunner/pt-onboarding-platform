import express from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import {
  createMarketingPageAdmin,
  deleteMarketingPageAdmin,
  listMarketingPagesAdmin,
  updateMarketingPageAdmin
} from '../controllers/publicMarketingPages.controller.js';

const router = express.Router();

router.use(authenticate, requireSuperAdmin);
router.get('/', listMarketingPagesAdmin);
router.post('/', createMarketingPageAdmin);
router.put('/:id', updateMarketingPageAdmin);
router.delete('/:id', deleteMarketingPageAdmin);

export default router;
