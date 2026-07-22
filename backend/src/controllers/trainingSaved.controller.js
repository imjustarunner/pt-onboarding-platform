import TrainingSavedCourse from '../models/TrainingSavedCourse.model.js';

export const listSaved = async (req, res, next) => {
  try {
    const items = await TrainingSavedCourse.listByUser(req.user.id);
    res.json(items);
  } catch (error) {
    next(error);
  }
};

export const saveCourse = async (req, res, next) => {
  try {
    const itemType = req.body.itemType === 'focus' ? 'focus' : 'module';
    const itemId = parseInt(req.body.itemId, 10);
    if (!itemId) {
      return res.status(400).json({ error: { message: 'itemId is required' } });
    }
    const items = await TrainingSavedCourse.save(req.user.id, itemType, itemId);
    res.status(201).json({ ok: true, items });
  } catch (error) {
    next(error);
  }
};

export const unsaveCourse = async (req, res, next) => {
  try {
    const itemType = req.params.itemType === 'focus' ? 'focus' : 'module';
    const itemId = parseInt(req.params.itemId, 10);
    await TrainingSavedCourse.remove(req.user.id, itemType, itemId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};
