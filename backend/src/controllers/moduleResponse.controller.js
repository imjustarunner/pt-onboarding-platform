import ModuleResponseAnswer from '../models/ModuleResponseAnswer.model.js';
import { validationResult } from 'express-validator';

export const saveResponse = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const userId = req.user.id;
    const { moduleId } = req.params;
    const { contentId, responseText } = req.body;

    if (!contentId || !responseText || responseText.trim() === '') {
      return res.status(400).json({ error: { message: 'Content ID and response text are required' } });
    }

    const response = await ModuleResponseAnswer.createOrUpdate(
      userId,
      parseInt(moduleId),
      parseInt(contentId),
      responseText.trim()
    );

    res.json({
      success: true,
      response
    });
  } catch (error) {
    next(error);
  }
};

export const getResponses = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { moduleId } = req.params;

    const responses = await ModuleResponseAnswer.findByUserAndModule(userId, parseInt(moduleId));

    res.json(responses);
  } catch (error) {
    next(error);
  }
};

