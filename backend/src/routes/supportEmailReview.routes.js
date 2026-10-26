import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getDailySupportEmailReview, getSupportEmailReviewConfig, updateSupportEmailReviewConfig } from '../controllers/supportEmailReview.controller.js';

const router = express.Router();
router.use(authenticate);
// The controller independently verifies actual agency membership and the
// configured reviewer/admin role. A query-supplied tenant is not authorization.
router.get('/config', getSupportEmailReviewConfig);
router.put('/config', updateSupportEmailReviewConfig);
router.get('/', getDailySupportEmailReview);
export default router;
