import QuizAttempt from '../models/QuizAttempt.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import { validationResult } from 'express-validator';

const optionText = (option) => {
  if (option == null) return '';
  if (typeof option === 'string' || typeof option === 'number') return String(option);
  return String(option.text ?? option.label ?? '');
};

const answersMatch = (userAnswer, correctAnswer) => {
  if (userAnswer == null || correctAnswer == null) return false;
  return String(userAnswer).toLowerCase().trim() === String(correctAnswer).toLowerCase().trim();
};

const calculateScore = (questions, answers) => {
  let correct = 0;
  const total = questions.length;

  questions.forEach((question, index) => {
    const userAnswer = answers[index];
    let correctAnswer = question.correctAnswer;

    if (question.type === 'multiple_choice') {
      if (typeof correctAnswer === 'number' && Array.isArray(question.options)) {
        correctAnswer = optionText(question.options[correctAnswer]);
      } else {
        correctAnswer = optionText(correctAnswer);
      }
      if (answersMatch(userAnswer, correctAnswer)) correct++;
    } else if (question.type === 'true_false') {
      const expected = correctAnswer === true || correctAnswer === 'true' || correctAnswer === 1 || correctAnswer === '1';
      const given = userAnswer === true || userAnswer === 'true' || userAnswer === 1 || userAnswer === '1';
      if (expected === given) correct++;
    } else if (question.type === 'text') {
      if (answersMatch(userAnswer, correctAnswer)) correct++;
    }
  });

  return total > 0 ? Math.round((correct / total) * 100 * 100) / 100 : 0;
};

function isQuestionCorrect(question, userAnswer) {
  if (question.type === 'multiple_choice') {
    let correctAnswer = question.correctAnswer;
    if (typeof correctAnswer === 'number' && Array.isArray(question.options)) {
      correctAnswer = optionText(question.options[correctAnswer]);
    } else {
      correctAnswer = optionText(correctAnswer);
    }
    return answersMatch(userAnswer, correctAnswer);
  }
  if (question.type === 'true_false') {
    const expected = question.correctAnswer === true || question.correctAnswer === 'true'
      || question.correctAnswer === 1 || question.correctAnswer === '1';
    const given = userAnswer === true || userAnswer === 'true' || userAnswer === 1 || userAnswer === '1';
    return expected === given;
  }
  if (question.type === 'text') {
    return answersMatch(userAnswer, question.correctAnswer);
  }
  return false;
}

function buildRemediation(questions, answers, passed) {
  if (passed) return [];
  return (questions || []).map((q, index) => {
    if (isQuestionCorrect(q, answers?.[index])) return null;
    return {
      questionIndex: index,
      question: q.question || q.question_text || '',
      explanation: q.explanation || '',
      remediationHtml: q.remediationHtml || q.remediation_html || '',
      remediationContentId: q.remediationContentId || null
    };
  }).filter(Boolean);
}

export const submitQuiz = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const userId = req.user.id;
    const { moduleId } = req.params;
    const { answers } = req.body;

    const contentItems = await ModuleContent.findByModuleId(moduleId);
    const quizContent = contentItems.find(item => item.content_type === 'quiz');

    if (!quizContent) {
      return res.status(404).json({ error: { message: 'Quiz not found for this module' } });
    }

    const quizData = typeof quizContent.content_data === 'string'
      ? JSON.parse(quizContent.content_data)
      : quizContent.content_data;

    if (!quizData.questions || !Array.isArray(quizData.questions)) {
      return res.status(400).json({ error: { message: 'Invalid quiz format' } });
    }

    const allowRetake = quizData.allowRetake !== false;
    const maxAttempts = Number(quizData.maxAttempts);
    const attemptCount = await QuizAttempt.getAttemptCount(userId, parseInt(moduleId, 10));

    if (!allowRetake && attemptCount > 0) {
      return res.status(403).json({
        error: { message: 'Retakes are not allowed for this quiz' },
        attemptCount
      });
    }
    if (Number.isFinite(maxAttempts) && maxAttempts > 0 && attemptCount >= maxAttempts) {
      return res.status(403).json({
        error: { message: `Maximum attempts (${maxAttempts}) reached` },
        attemptCount,
        maxAttempts
      });
    }

    const score = calculateScore(quizData.questions, answers);
    const minimumScore = quizData.minimumScore != null ? Number(quizData.minimumScore) : null;
    const passed = minimumScore != null ? score >= minimumScore : true;

    const attempt = await QuizAttempt.create({
      userId,
      moduleId: parseInt(moduleId, 10),
      score,
      answers
    });

    const remediation = buildRemediation(quizData.questions, answers, passed);

    res.json({
      attempt: {
        id: attempt.id,
        score,
        completedAt: attempt.completed_at
      },
      passed,
      minimumScore,
      attemptCount: attemptCount + 1,
      maxAttempts: Number.isFinite(maxAttempts) && maxAttempts > 0 ? maxAttempts : null,
      allowRetake: allowRetake && !(Number.isFinite(maxAttempts) && maxAttempts > 0 && attemptCount + 1 >= maxAttempts),
      remediation
    });
  } catch (error) {
    next(error);
  }
};

export const getQuizAttempts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { moduleId } = req.params;

    const attempts = await QuizAttempt.findByUserAndModule(userId, parseInt(moduleId, 10));

    const parsedAttempts = attempts.map(attempt => ({
      ...attempt,
      answers: typeof attempt.answers === 'string'
        ? JSON.parse(attempt.answers)
        : attempt.answers
    }));

    res.json(parsedAttempts);
  } catch (error) {
    next(error);
  }
};
