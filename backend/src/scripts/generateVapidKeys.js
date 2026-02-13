#!/usr/bin/env node
/**
 * Generate VAPID keys for Web Push notifications.
 * Add these to your .env:
 *   VAPID_PUBLIC_KEY=<public key>
 *   VAPID_PRIVATE_KEY=<private key>
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('Add these to your .env file:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
