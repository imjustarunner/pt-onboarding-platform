import LearningGoal from '../models/LearningGoal.model.js';
import LearningProgress from '../models/LearningProgress.model.js';
import { assertLearningClientAccess } from '../utils/learningAccess.js';

const asInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
};

export const getStudentDomainProgress = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    await assertLearningClientAccess(req, clientId);
    const domains = await LearningProgress.listDomainProgress(clientId);
    res.json({ domains });
  } catch (error) {
    next(error);
  }
};

export const getStudentGoalsProgress = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    await assertLearningClientAccess(req, clientId);
    const goals = await LearningGoal.listByClient(clientId);
    res.json({ goals });
  } catch (error) {
    next(error);
  }
};

export const getStudentEvidenceTimeline = async (req, res, next) => {
  try {
    const clientId = asInt(req.params.studentId);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid studentId' } });
    await assertLearningClientAccess(req, clientId);
    const domainId = asInt(req.query.domainId);
    const limit = asInt(req.query.limit) || 100;
    const timeline = await LearningProgress.listEvidenceTimeline(clientId, { domainId, limit });
    res.json({ timeline });
  } catch (error) {
    next(error);
  }
};

export const createLearningEvidence = async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      clientId: asInt(req.body.clientId),
      domainId: asInt(req.body.domainId),
      subdomainId: asInt(req.body.subdomainId),
      standardId: asInt(req.body.standardId),
      skillId: asInt(req.body.skillId),
      sourceId: req.body.sourceId == null ? null : Number(req.body.sourceId),
      goalIds: Array.isArray(req.body.goalIds) ? req.body.goalIds.map((v) => asInt(v)).filter(Boolean) : []
    };

    if (!payload.clientId || !payload.domainId || !payload.skillId || !payload.sourceType) {
      return res.status(400).json({
        error: { message: 'clientId, sourceType, domainId, and skillId are required' }
      });
    }
    await assertLearningClientAccess(req, payload.clientId);

    const evidence = await LearningProgress.createEvidence(payload, req.user?.id);
    res.status(201).json(evidence);
  } catch (error) {
    next(error);
  }
};
