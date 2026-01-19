import { validationResult } from 'express-validator';
import NotificationTrigger from '../models/NotificationTrigger.model.js';

export const listNotificationTriggers = async (req, res, next) => {
  try {
    const triggers = await NotificationTrigger.listAll();
    res.json(triggers);
  } catch (e) {
    next(e);
  }
};

export const updateTriggerDefaultSenderIdentity = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const triggerKey = String(req.params.triggerKey || '').trim();
    if (!triggerKey) return res.status(400).json({ error: { message: 'Invalid triggerKey' } });

    const senderIdentityId =
      req.body?.defaultSenderIdentityId === null || req.body?.defaultSenderIdentityId === undefined || req.body?.defaultSenderIdentityId === ''
        ? null
        : Number(req.body.defaultSenderIdentityId);

    const updated = await NotificationTrigger.updateDefaultSenderIdentity(triggerKey, senderIdentityId);
    if (!updated) return res.status(404).json({ error: { message: 'Trigger not found' } });
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

