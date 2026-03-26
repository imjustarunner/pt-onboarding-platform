import LearningStandards from '../models/LearningStandards.model.js';

export const getLearningStandardsCatalog = async (req, res, next) => {
  try {
    const catalog = await LearningStandards.getCatalog();
    res.json({ catalog });
  } catch (error) {
    next(error);
  }
};
