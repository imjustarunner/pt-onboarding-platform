import PlatformRetentionSettings from '../models/PlatformRetentionSettings.model.js';

export const getPlatformRetentionSettings = async (req, res, next) => {
  try {
    const settings = await PlatformRetentionSettings.get();
    res.json(settings);
  } catch (error) {
    next(error);
  }
};

export const updatePlatformRetentionSettings = async (req, res, next) => {
  try {
    const settings = await PlatformRetentionSettings.upsert({
      defaultIntakeRetentionMode: req.body?.defaultIntakeRetentionMode,
      defaultIntakeRetentionDays: req.body?.defaultIntakeRetentionDays,
      actorUserId: req.user?.id || null
    });
    res.json(settings);
  } catch (error) {
    next(error);
  }
};
