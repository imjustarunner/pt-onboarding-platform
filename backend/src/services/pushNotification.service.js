/**
 * Web Push notification service.
 * Sends browser push notifications to users who have opted in.
 */
import pool from '../config/database.js';
import webpush from 'web-push';

const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';

if (vapidPublic && vapidPrivate && vapidPublic.trim() && vapidPrivate.trim()) {
  webpush.setVapidDetails('mailto:support@plottwistco.com', vapidPublic.trim(), vapidPrivate.trim());
}

/**
 * Get all push subscriptions for a user.
 */
export async function getSubscriptionsByUserId(userId) {
  const [rows] = await pool.execute(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
    [Number(userId)]
  );
  return rows || [];
}

/**
 * Register a push subscription for a user.
 */
export async function registerSubscription(userId, subscription, userAgent = null) {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new Error('Invalid subscription: endpoint, keys.p256dh, and keys.auth required');
  }
  await pool.execute(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
    [userId, endpoint, keys.p256dh, keys.auth, userAgent]
  );
}

/**
 * Unregister a push subscription (by endpoint).
 */
export async function unregisterSubscription(userId, endpoint) {
  await pool.execute(
    'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?',
    [userId, endpoint]
  );
}

/**
 * Unregister all push subscriptions for a user.
 */
export async function unregisterAllForUser(userId) {
  await pool.execute('DELETE FROM push_subscriptions WHERE user_id = ?', [userId]);
}

/**
 * Send a push notification to a user.
 * @param {number} userId - User ID
 * @param {Object} payload - { title, body, url?, tag? }
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function sendPushToUser(userId, payload) {
  if (!vapidPublic || !vapidPrivate) {
    return { sent: 0, failed: 0, reason: 'vapid_not_configured' };
  }

  const subs = await getSubscriptionsByUserId(userId);
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const pushPayload = JSON.stringify({
    title: payload.title || 'Notification',
    body: payload.body || '',
    url: payload.url || '/notifications',
    tag: payload.tag || 'notification'
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      await webpush.sendNotification(pushSub, pushPayload);
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 410 || err.statusCode === 404) {
        await pool.execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
      }
    }
  }

  return { sent, failed };
}
