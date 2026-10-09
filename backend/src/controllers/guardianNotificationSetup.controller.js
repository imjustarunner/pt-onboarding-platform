import { guardianNotificationSetup, beginGuardianSmsConsent } from '../services/guardianNotificationSetup.service.js';
const handle = fn => async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) return res.status(403).json({ error: { message: 'Notification setup is unavailable in staff preview.' } });
    res.json(await fn({ userId: req.user.id, clientId: Number(req.params.clientId) }));
  } catch (error) { next(error); }
};
export const getSetup = handle(guardianNotificationSetup);
export const beginConsent = handle(beginGuardianSmsConsent);
