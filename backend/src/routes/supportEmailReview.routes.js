import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getDailySupportEmailReview, getSupportEmailReviewConfig, updateSupportEmailReviewConfig, supportReplyFeedbackController } from '../controllers/supportEmailReview.controller.js';

const router = express.Router();
router.use(authenticate);
router.get('/batches/:batchId', supportReplyFeedbackController.getBatch);
router.put('/batches/:batchId/entries/:entryId', supportReplyFeedbackController.saveFeedback);
router.post('/batches/:batchId/complete', supportReplyFeedbackController.completeBatch);
// The controller independently verifies actual agency membership and the
// configured reviewer/admin role. A query-supplied tenant is not authorization.
router.get('/config', getSupportEmailReviewConfig);
router.put('/config', updateSupportEmailReviewConfig);
router.get('/', getDailySupportEmailReview);
export default router;
