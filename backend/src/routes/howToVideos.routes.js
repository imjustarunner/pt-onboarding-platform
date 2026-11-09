import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { schoolScheduleTrainingForUser } from '../services/schoolScheduleTraining.service.js';

const router = express.Router();
router.get('/', authenticate, async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.json({ videos: await schoolScheduleTrainingForUser({ userId: req.user.id, agencyId: req.query.agencyId }) });
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return res.json({ videos: [] });
    next(error);
  }
});
export default router;
