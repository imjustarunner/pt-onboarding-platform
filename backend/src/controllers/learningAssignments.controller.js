import LearningAssignment from '../models/LearningAssignment.model.js';
import LearningProgress from '../models/LearningProgress.model.js';
import { assertLearningClientAccess } from '../utils/learningAccess.js';

const asInt = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
};

export const createLearningAssignment = async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      clientId: asInt(req.body.clientId),
      domainId: asInt(req.body.domainId),
      subdomainId: asInt(req.body.subdomainId),
      standardId: asInt(req.body.standardId),
      skillId: asInt(req.body.skillId),
      goalIds: Array.isArray(req.body.goalIds) ? req.body.goalIds.map((v) => asInt(v)).filter(Boolean) : []
    };

    if (!payload.clientId || !payload.title || !payload.domainId || !payload.skillId) {
      return res.status(400).json({
        error: { message: 'clientId, title, domainId, and skillId are required' }
      });
    }
    await assertLearningClientAccess(req, payload.clientId);

    const assignment = await LearningAssignment.create(payload, req.user?.id);
    res.status(201).json(assignment);
  } catch (error) {
    next(error);
  }
};

export const createLearningAssignmentSubmission = async (req, res, next) => {
  try {
    const assignmentId = asInt(req.params.assignmentId);
    if (!assignmentId) return res.status(400).json({ error: { message: 'Invalid assignmentId' } });
    const existing = await LearningAssignment.findById(assignmentId);
    if (!existing) return res.status(404).json({ error: { message: 'Assignment not found' } });
    await assertLearningClientAccess(req, existing.client_id);

    const submissionMode = String(req.body.submissionMode || '').trim();
    if (!['image', 'typed', 'instructor_entered'].includes(submissionMode)) {
      return res.status(400).json({ error: { message: 'submissionMode must be image, typed, or instructor_entered' } });
    }

    const submission = await LearningAssignment.createSubmission(
      assignmentId,
      { ...req.body, submissionMode },
      req.user?.id
    );
    res.status(201).json(submission);
  } catch (error) {
    next(error);
  }
};

export const createLearningAssignmentEvaluation = async (req, res, next) => {
  try {
    const assignmentId = asInt(req.params.assignmentId);
    if (!assignmentId) return res.status(400).json({ error: { message: 'Invalid assignmentId' } });
    const existing = await LearningAssignment.findById(assignmentId);
    if (!existing) return res.status(404).json({ error: { message: 'Assignment not found' } });
    await assertLearningClientAccess(req, existing.client_id);

    const evaluation = await LearningAssignment.createEvaluation(
      assignmentId,
      {
        ...req.body,
        submissionId: asInt(req.body.submissionId)
      },
      req.user?.id
    );

    const assignment = existing;
    if (assignment) {
      await LearningProgress.createEvidence(
        {
          clientId: assignment.client_id,
          sourceType: 'evaluation_result',
          sourceId: evaluation?.id || null,
          assessmentType: 'formative',
          observedAt: req.body.evaluatedAt || new Date(),
          domainId: assignment.domain_id,
          subdomainId: assignment.subdomain_id,
          standardId: assignment.standard_id,
          skillId: assignment.skill_id,
          scoreValue: req.body.scoreValue ?? null,
          rubricLevel: req.body.rubricLevel ?? null,
          completionStatus: req.body.completionStatus || 'completed',
          notes: req.body.observationalNotes || null,
          confidenceScore: req.body.confidenceScore ?? null,
          goalIds: assignment.goal_ids || []
        },
        req.user?.id
      );
    }

    res.status(201).json(evaluation);
  } catch (error) {
    next(error);
  }
};
