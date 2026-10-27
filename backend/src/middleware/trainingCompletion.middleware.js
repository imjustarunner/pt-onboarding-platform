import ModuleContent from '../models/ModuleContent.model.js';
import QuizAttempt from '../models/QuizAttempt.model.js';

// The legacy quiz API grades the first quiz block in a module. Use that same
// block and persisted scores, never a score supplied by the completion request.
export async function requirePassingTrainingQuiz(req, res, next) {
  try {
    const moduleId = Number(req.body.moduleId);
    const blocks = await ModuleContent.findByModuleId(moduleId);
    const quiz = blocks.find(block => block.content_type === 'quiz');
    if (!quiz) return next();
    const data = typeof quiz.content_data === 'string' ? JSON.parse(quiz.content_data) : quiz.content_data;
    const minimum = data?.minimumScore == null ? 0 : Number(data.minimumScore);
    if (!Array.isArray(data?.questions) || !data.questions.length || !Number.isFinite(minimum) || minimum < 0 || minimum > 100) {
      return res.status(409).json({ error: { message: 'This lesson’s quiz configuration needs review before it can be completed.' } });
    }
    const attempts = await QuizAttempt.findByUserAndModule(req.user.id, moduleId);
    if (!attempts.some(attempt => attempt.score != null && Number.isFinite(Number(attempt.score)) && Number(attempt.score) >= minimum)) {
      return res.status(400).json({ error: { message: 'Pass this lesson’s quiz before marking the lesson complete.' } });
    }
    next();
  } catch (error) { next(error); }
}
