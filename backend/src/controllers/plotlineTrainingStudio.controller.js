import { createPlotlineTrainingStudio } from '../services/plotlineTrainingStudio.service.js';

const studio = createPlotlineTrainingStudio();

function scopedLesson(action) {
  return async (req, res, next) => {
    const company = Number(req.plotlineCompanyId);
    const lesson = Number(req.params.id);
    if (!Number.isSafeInteger(company) || company < 1) {
      return res.status(403).json({ error: { message: 'Open this lesson from its Plotline company.' } });
    }
    if (!Number.isSafeInteger(lesson) || lesson < 1) {
      return res.status(400).json({ error: { message: 'Choose a lesson.' } });
    }
    try {
      res.set('Cache-Control', 'private, no-store').json(await action(company, lesson, req.body || {}));
    } catch (error) { next(error); }
  };
}

export const readStudioLesson = scopedLesson(studio.read);
export const saveStudioLesson = scopedLesson(studio.save);
