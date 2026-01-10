import QuizAttempt from '../models/QuizAttempt.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import { validationResult } from 'express-validator';

const calculateScore = (questions, answers) => {
  let correct = 0;
  const total = questions.length;

  questions.forEach((question, index) => {
    const userAnswer = answers[index];
    const correctAnswer = question.correctAnswer;

    if (question.type === 'multiple_choice' || question.type === 'true_false') {
      if (userAnswer === correctAnswer) {
        correct++;
      }
    } else if (question.type === 'text') {
      // For text questions, do case-insensitive comparison
      if (userAnswer && correctAnswer && 
          userAnswer.toLowerCase().trim() === correctAnswer.toLowerCase().trim()) {
        correct++;
      }
    }
  });

  return total > 0 ? Math.round((correct / total) * 100 * 100) / 100 : 0;
};

export const submitQuiz = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const userId = req.user.id;
    const { moduleId } = req.params;
    const { answers } = req.body;

    // Get quiz content for this module
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

    // Calculate score
    const score = calculateScore(quizData.questions, answers);

    // Save attempt
    const attempt = await QuizAttempt.create({
      userId,
      moduleId: parseInt(moduleId),
      score,
      answers
    });

    res.json({
      attempt: {
        id: attempt.id,
        score,
        completedAt: attempt.completed_at
      },
      passed: quizData.minimumScore ? score >= quizData.minimumScore : true
    });
  } catch (error) {
    next(error);
  }
};

export const getQuizAttempts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { moduleId } = req.params;

    const attempts = await QuizAttempt.findByUserAndModule(userId, parseInt(moduleId));
    
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

