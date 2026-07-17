import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import catalog, {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  getNotificationCatalogEntry
} from '../notificationCatalog.service.js';
import { resolveNotificationTypePreference } from '../notificationPreferences.service.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendSrc = path.resolve(here, '../..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  ));
}

test('catalog contains every literal Notification producer type', () => {
  const missing = [];
  for (const filename of walk(backendSrc).filter((name) => name.endsWith('.js'))) {
    const source = fs.readFileSync(filename, 'utf8');
    const producer = /(?:Notification\.create|createNotificationAndDispatch)\s*\(\s*\{/g;
    let match;
    while ((match = producer.exec(source))) {
      const typeMatch = source.slice(match.index, match.index + 900).match(/\btype\s*:\s*['"]([^'"]+)['"]/);
      if (typeMatch && !catalog[typeMatch[1]]) missing.push(`${typeMatch[1]} (${path.relative(backendSrc, filename)})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every canonical type has one valid category and complete capabilities', () => {
  assert.equal(new Set(NOTIFICATION_TYPES).size, NOTIFICATION_TYPES.length);
  assert.ok(NOTIFICATION_TYPES.length >= 97);
  for (const type of NOTIFICATION_TYPES) {
    const entry = getNotificationCatalogEntry(type);
    assert.ok(type.length <= 128, `${type} exceeds the notifications.type column`);
    assert.ok(entry.label, `${type} needs a label`);
    assert.ok(NOTIFICATION_CATEGORIES[entry.category], `${type} has an unknown category`);
    for (const channel of ['inApp', 'toast', 'sound', 'digest', 'push', 'email', 'sms']) {
      assert.equal(typeof entry.capabilities[channel], 'boolean', `${type}.${channel} capability`);
    }
  }
});

test('recommended policy keeps critical notifications and digests login activity', () => {
  const context = {
    userRole: 'admin', globalPreferences: { email_enabled: true, sms_enabled: true, push_notifications_enabled: true },
    legacyCategories: {}, typePreferences: new Map(), agencyPreferences: null
  };
  const emergency = resolveNotificationTypePreference('emergency_broadcast', context);
  assert.equal(emergency.effective.inApp, true);
  assert.equal(emergency.locked, true);
  const login = resolveNotificationTypePreference('user_login', context);
  assert.equal(login.effective.inApp, false);
  assert.equal(login.effective.toast, false);
  assert.equal(login.effective.digest, true);
});

test('master channel switches and unsupported capabilities cannot be bypassed', () => {
  const context = {
    userRole: 'provider', globalPreferences: { email_enabled: false, sms_enabled: false, push_notifications_enabled: false },
    legacyCategories: {},
    typePreferences: new Map([['client_assigned', { email: true, sms: true, push: true }]]),
    agencyPreferences: null
  };
  const resolved = resolveNotificationTypePreference('client_assigned', context);
  assert.equal(resolved.effective.email, false);
  assert.equal(resolved.effective.sms, false);
  assert.equal(resolved.effective.push, false);
});
