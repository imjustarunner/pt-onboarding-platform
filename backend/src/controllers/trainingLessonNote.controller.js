import TrainingLessonNote from '../models/TrainingLessonNote.model.js';
import Module from '../models/Module.model.js';

export const getLessonNotes = async (req, res, next) => {
  try {
    const moduleId = parseInt(req.params.moduleId, 10);
    const mod = await Module.findById(moduleId);
    if (!mod) {
      return res.status(404).json({ error: { message: 'Module not found' } });
    }
    const row = await TrainingLessonNote.findByUserAndModule(req.user.id, moduleId);
    res.json({
      notes: row?.notes || '',
      updatedAt: row?.updated_at || null
    });
  } catch (error) {
    next(error);
  }
};

export const saveLessonNotes = async (req, res, next) => {
  try {
    const moduleId = parseInt(req.params.moduleId, 10);
    const mod = await Module.findById(moduleId);
    if (!mod) {
      return res.status(404).json({ error: { message: 'Module not found' } });
    }
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : '';
    const row = await TrainingLessonNote.upsert(req.user.id, moduleId, notes);
    res.json({
      notes: row?.notes || '',
      updatedAt: row?.updated_at || null
    });
  } catch (error) {
    next(error);
  }
};
