import * as PushService from '../services/pushNotification.service.js';
import UserPreferences from '../models/UserPreferences.model.js';

/**
 * POST /api/users/:userId/push-subscription
 * Register a push subscription (call when user enables push in preferences).
 */
export const registerPushSubscription = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;
    if (Number(userId) !== Number(requestingUserId)) {
      return res.status(403).json({ error: { message: 'Can only register push for your own account' } });
    }

    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({
        error: { message: 'Invalid subscription: endpoint, keys.p256dh, and keys.auth required' }
      });
    }

    const userAgent = req.get('User-Agent') || null;
    await PushService.registerSubscription(Number(userId), subscription, userAgent);

    await UserPreferences.update(Number(userId), { push_notifications_enabled: true });

    res.status(204).send();
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/users/:userId/push-subscription
 * Unregister push subscription (call when user disables push).
 */
export const unregisterPushSubscription = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user?.id;
    if (Number(userId) !== Number(requestingUserId)) {
      return res.status(403).json({ error: { message: 'Can only unregister push for your own account' } });
    }

    const endpoint = req.body?.endpoint;
    if (endpoint) {
      await PushService.unregisterSubscription(Number(userId), endpoint);
    } else {
      await PushService.unregisterAllForUser(Number(userId));
    }

    await UserPreferences.update(Number(userId), { push_notifications_enabled: false });

    res.status(204).send();
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/push/vapid-public
 * Return the VAPID public key for the frontend to subscribe.
 */
export const getVapidPublicKey = async (req, res, next) => {
  try {
    const key = process.env.VAPID_PUBLIC_KEY || '';
    res.json({ vapidPublicKey: key });
  } catch (e) {
    next(e);
  }
};
