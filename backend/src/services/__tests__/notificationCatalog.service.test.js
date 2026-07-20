import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import catalog, {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_TYPES,
  getNotificationCatalogEntry,
  isNotificationEssentialForRole,
  isNotificationRecommendedForRole,
  notificationRoleProfile
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
    assert.ok(entry.categoryDescription, `${type} needs a category description`);
    for (const channel of ['inApp', 'toast', 'sound', 'digest', 'push', 'email', 'sms']) {
      assert.equal(typeof entry.capabilities[channel], 'boolean', `${type}.${channel} capability`);
    }
  }
});

test('role profiles keep administrative noise out of regular employee defaults', () => {
  assert.equal(notificationRoleProfile('super_admin'), 'administrative');
  assert.equal(notificationRoleProfile('clinical_practice_assistant'), 'manager');
  assert.equal(notificationRoleProfile('provider'), 'provider');
  assert.equal(notificationRoleProfile('school_staff'), 'school');

  assert.equal(isNotificationRecommendedForRole('status_expired', 'provider'), false);
  assert.equal(isNotificationRecommendedForRole('new_job_application_submitted', 'provider'), false);
  assert.equal(isNotificationRecommendedForRole('client_assigned', 'provider'), true);
  assert.equal(isNotificationRecommendedForRole('office_availability_request_approved', 'provider'), true);
  assert.equal(isNotificationRecommendedForRole('client_assigned', 'approved_employee'), false);
  assert.equal(isNotificationRecommendedForRole('status_expired', 'admin'), true);
  assert.equal(isNotificationRecommendedForRole('support_safety_net_alert', 'support'), true);
  assert.equal(isNotificationEssentialForRole('client_assigned', 'provider'), true);
  assert.equal(isNotificationEssentialForRole('birthday_announcement', 'provider'), false);
  assert.equal(isNotificationEssentialForRole('status_expired', 'provider'), false);
  assert.equal(isNotificationEssentialForRole('support_safety_net_alert', 'support'), true);
  assert.equal(getNotificationCatalogEntry('user_activity_digest').category, 'user_activity');

  for (const role of ['admin', 'support', 'clinical_practice_assistant', 'staff', 'provider', 'school_staff', 'guardian', 'approved_employee']) {
    for (const type of NOTIFICATION_TYPES) {
      if (isNotificationEssentialForRole(type, role)) {
        assert.equal(isNotificationRecommendedForRole(type, role), true, `${type} must be available to ${role}`);
      }
    }
  }
});

test('only essentials start enabled while optional role types remain user-selectable', () => {
  const context = {
    userRole: 'provider', globalPreferences: { email_enabled: true, sms_enabled: true, push_notifications_enabled: true },
    legacyCategories: { clients_checklist_updates: true },
    typePreferences: new Map(), agencyPreferences: null
  };
  const optional = resolveNotificationTypePreference('client_became_current', context);
  assert.equal(optional.recommendedForRole, true);
  assert.equal(optional.essentialForRole, false);
  assert.equal(optional.locked, false);
  assert.equal(optional.effective.inApp, false);
  assert.equal(optional.effective.email, false);
  assert.equal(optional.effective.digest, false);

  const enabledByUser = resolveNotificationTypePreference('client_became_current', {
    ...context,
    typePreferences: new Map([['client_became_current', { inApp: true, email: true }]])
  });
  assert.equal(enabledByUser.effective.inApp, true);
  assert.equal(enabledByUser.effective.email, true);
});

test('role-aware policy suppresses unrelated channels even when a stale override exists', () => {
  const baseContext = {
    userRole: 'provider',
    globalPreferences: { email_enabled: true, sms_enabled: true, push_notifications_enabled: true },
    legacyCategories: {}, typePreferences: new Map(), agencyPreferences: null
  };
  const administrative = resolveNotificationTypePreference('status_expired', baseContext);
  assert.equal(administrative.recommendedForRole, false);
  assert.equal(administrative.effective.inApp, false);
  assert.equal(administrative.effective.email, false);
  assert.equal(administrative.effective.digest, false);

  const explicit = resolveNotificationTypePreference('status_expired', {
    ...baseContext,
    typePreferences: new Map([['status_expired', { inApp: true, email: true }]])
  });
  assert.equal(explicit.effective.inApp, false);
  assert.equal(explicit.effective.email, false);
  assert.equal(explicit.lockReason, 'Not used for your role');
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
    userRole: 'provider', globalPreferences: { email_enabled: 0, sms_enabled: 0, push_notifications_enabled: 0, notification_sound_enabled: 0 },
    legacyCategories: {},
    typePreferences: new Map([['client_assigned', { email: true, sms: true, push: true }]]),
    agencyPreferences: null
  };
  const resolved = resolveNotificationTypePreference('client_assigned', context);
  assert.equal(resolved.effective.email, false);
  assert.equal(resolved.effective.sms, false);
  assert.equal(resolved.effective.push, false);
  assert.equal(resolved.effective.sound, false);
});
