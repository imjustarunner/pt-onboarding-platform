import LearningProgress from '../models/LearningProgress.model.js';
import { assertLearningClientAccess } from '../utils/learningAccess.js';

const asInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
};

export const getLearningRecommendations = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    await assertLearningClientAccess(req, clientId);
    const recommendations = await LearningProgress.getRecommendations(clientId);
    res.json({ recommendations });
  } catch (error) {
    next(error);
  }
};
