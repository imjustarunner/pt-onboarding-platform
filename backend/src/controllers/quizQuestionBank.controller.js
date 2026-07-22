import { validationResult } from 'express-validator';
import QuizQuestionBank from '../models/QuizQuestionBank.model.js';

export const listBanks = async (req, res, next) => {
  try {
    const banks = await QuizQuestionBank.findAll({
      agencyId: req.query.agencyId != null && req.query.agencyId !== '' ? req.query.agencyId : null
    });
    res.json(banks);
  } catch (error) {
    next(error);
  }
};

export const getBank = async (req, res, next) => {
  try {
    const bank = await QuizQuestionBank.findById(parseInt(req.params.id, 10));
    if (!bank) {
      return res.status(404).json({ error: { message: 'Question bank not found' } });
    }
    const questions = await QuizQuestionBank.listQuestions(bank.id);
    res.json({ ...bank, questions });
  } catch (error) {
    next(error);
  }
};

export const createBank = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    const bank = await QuizQuestionBank.create({
      agencyId: req.body.agencyId ?? null,
      title: req.body.title,
      description: req.body.description ?? null,
      createdByUserId: req.user.id
    });
    res.status(201).json(bank);
  } catch (error) {
    next(error);
  }
};

export const updateBank = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await QuizQuestionBank.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Question bank not found' } });
    }
    const bank = await QuizQuestionBank.update(id, {
      title: req.body.title,
      description: req.body.description,
      agencyId: req.body.agencyId
    });
    res.json(bank);
  } catch (error) {
    next(error);
  }
};

export const deleteBank = async (req, res, next) => {
  try {
    const ok = await QuizQuestionBank.delete(parseInt(req.params.id, 10));
    if (!ok) {
      return res.status(404).json({ error: { message: 'Question bank not found' } });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const listQuestions = async (req, res, next) => {
  try {
    const bankId = parseInt(req.params.id, 10);
    const bank = await QuizQuestionBank.findById(bankId);
    if (!bank) {
      return res.status(404).json({ error: { message: 'Question bank not found' } });
    }
    const questions = await QuizQuestionBank.listQuestions(bankId);
    res.json(questions);
  } catch (error) {
    next(error);
  }
};

export const addQuestion = async (req, res, next) => {
  try {
    const bankId = parseInt(req.params.id, 10);
    const bank = await QuizQuestionBank.findById(bankId);
    if (!bank) {
      return res.status(404).json({ error: { message: 'Question bank not found' } });
    }
    const question = await QuizQuestionBank.addQuestion(bankId, {
      questionText: req.body.questionText || req.body.question,
      questionType: req.body.questionType || req.body.type || 'multiple_choice',
      options: req.body.options,
      correctAnswer: req.body.correctAnswer,
      explanation: req.body.explanation,
      remediationHtml: req.body.remediationHtml,
      orderIndex: req.body.orderIndex
    });
    res.status(201).json(question);
  } catch (error) {
    next(error);
  }
};

export const updateQuestion = async (req, res, next) => {
  try {
    const bankId = parseInt(req.params.id, 10);
    const questionId = parseInt(req.params.qid, 10);
    const existing = await QuizQuestionBank.findQuestionById(questionId);
    if (!existing || existing.bankId !== bankId) {
      return res.status(404).json({ error: { message: 'Question not found' } });
    }
    const question = await QuizQuestionBank.updateQuestion(questionId, {
      questionText: req.body.questionText ?? req.body.question,
      questionType: req.body.questionType ?? req.body.type,
      options: req.body.options,
      correctAnswer: req.body.correctAnswer,
      explanation: req.body.explanation,
      remediationHtml: req.body.remediationHtml,
      orderIndex: req.body.orderIndex
    });
    res.json(question);
  } catch (error) {
    next(error);
  }
};

export const deleteQuestion = async (req, res, next) => {
  try {
    const bankId = parseInt(req.params.id, 10);
    const questionId = parseInt(req.params.qid, 10);
    const existing = await QuizQuestionBank.findQuestionById(questionId);
    if (!existing || existing.bankId !== bankId) {
      return res.status(404).json({ error: { message: 'Question not found' } });
    }
    await QuizQuestionBank.deleteQuestion(questionId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

/** Return questions shaped for QuizBuilder import */
export const exportBankAsQuizQuestions = async (req, res, next) => {
  try {
    const bankId = parseInt(req.params.id, 10);
    const bank = await QuizQuestionBank.findById(bankId);
    if (!bank) {
      return res.status(404).json({ error: { message: 'Question bank not found' } });
    }
    const questions = await QuizQuestionBank.listQuestions(bankId);
    res.json({
      bankId: bank.id,
      title: bank.title,
      questions: QuizQuestionBank.toQuizQuestions(questions)
    });
  } catch (error) {
    next(error);
  }
};
