import LearningGoal from '../models/LearningGoal.model.js';
import { assertLearningClientAccess } from '../utils/learningAccess.js';

const asInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
};

export const createLearningGoal = async (req, res, next) => {
  try {
    const clientId = asInt(req.body.clientId);
    const domainId = asInt(req.body.domainId);
    const skillId = asInt(req.body.skillId);
    const measurementType = String(req.body.measurementType || '').trim();
    const startDate = req.body.startDate;
    const targetDate = req.body.targetDate;

    if (!clientId || !domainId || !skillId || !measurementType || !startDate || !targetDate) {
      return res.status(400).json({
        error: { message: 'clientId, domainId, skillId, measurementType, startDate, and targetDate are required' }
      });
    }

    if (!['numeric', 'rubric'].includes(measurementType)) {
      return res.status(400).json({ error: { message: 'measurementType must be numeric or rubric' } });
    }
    await assertLearningClientAccess(req, clientId);

    const goal = await LearningGoal.create(
      {
        ...req.body,
        clientId,
        domainId,
        subdomainId: asInt(req.body.subdomainId),
        standardId: asInt(req.body.standardId),
        skillId,
        measurementType
      },
      req.user?.id
    );
    res.status(201).json(goal);
  } catch (error) {
    next(error);
  }
};

export const patchLearningGoal = async (req, res, next) => {
  try {
    const goalId = asInt(req.params.goalId);
    if (!goalId) return res.status(400).json({ error: { message: 'Invalid goalId' } });
    const existing = await LearningGoal.findById(goalId);
    if (!existing) return res.status(404).json({ error: { message: 'Goal not found' } });
    await assertLearningClientAccess(req, existing.client_id);

    const payload = { ...req.body };
    ['programContextId', 'domainId', 'subdomainId', 'standardId', 'skillId'].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        payload[key] = payload[key] == null ? null : asInt(payload[key]);
      }
    });

    const updated = await LearningGoal.update(goalId, payload, req.user?.id);
    if (!updated) return res.status(404).json({ error: { message: 'Goal not found' } });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const activateLearningGoal = async (req, res, next) => {
  try {
    const goalId = asInt(req.params.goalId);
    if (!goalId) return res.status(400).json({ error: { message: 'Invalid goalId' } });
    const existing = await LearningGoal.findById(goalId);
    if (!existing) return res.status(404).json({ error: { message: 'Goal not found' } });
    await assertLearningClientAccess(req, existing.client_id);
    const updated = await LearningGoal.activate(goalId, req.user?.id);
    if (!updated) return res.status(404).json({ error: { message: 'Goal not found' } });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const archiveLearningGoal = async (req, res, next) => {
  try {
    const goalId = asInt(req.params.goalId);
    if (!goalId) return res.status(400).json({ error: { message: 'Invalid goalId' } });
    const existing = await LearningGoal.findById(goalId);
    if (!existing) return res.status(404).json({ error: { message: 'Goal not found' } });
    await assertLearningClientAccess(req, existing.client_id);
    const updated = await LearningGoal.archive(goalId, req.user?.id);
    if (!updated) return res.status(404).json({ error: { message: 'Goal not found' } });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const listLearningGoalSuggestions = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    await assertLearningClientAccess(req, clientId);
    const days = asInt(req.query.days) || 30;
    const suggestions = await LearningGoal.suggestFromRecentEvidence(clientId, { days });
    res.json({ suggestions });
  } catch (error) {
    next(error);
  }
};
