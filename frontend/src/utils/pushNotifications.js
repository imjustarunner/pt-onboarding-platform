/**
 * Browser push notification registration.
 * Requests permission, subscribes via PushManager, and persists to backend.
 */
import api from '../services/api';

export async function isPushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getPushPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

export async function requestPushPermission() {
  if (!('Notification' in window)) return 'unsupported';
  const perm = await Notification.requestPermission();
  return perm;
}

export async function registerPushSubscription(userId, vapidPublicKey) {
  if (!(await isPushSupported())) {
    throw new Error('Push notifications are not supported in this browser');
  }
  if (!vapidPublicKey || !vapidPublicKey.trim()) {
    throw new Error('VAPID public key not configured. Contact your administrator.');
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });

  const subscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: uint8ArrayToBase64(sub.getKey('p256dh')),
      auth: uint8ArrayToBase64(sub.getKey('auth'))
    }
  };

  await api.post(`/users/${userId}/push-subscription`, { subscription });
  return subscription;
}

export async function unregisterPushSubscription(userId) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.delete(`/users/${userId}/push-subscription`, {
        data: { endpoint: sub.endpoint }
      });
    } else {
      await api.delete(`/users/${userId}/push-subscription`);
    }
  } catch {
    await api.delete(`/users/${userId}/push-subscription`);
  }
}

export async function ensureServiceWorkerRegistered() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return reg;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function uint8ArrayToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
