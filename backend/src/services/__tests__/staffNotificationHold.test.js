import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ prefs: [], permissions: [], holds: [], events: [] }));
const db = vi.hoisted(() => ({
  execute: vi.fn(async (sql, args) => {
    if (sql.includes('FROM users WHERE id')) return [[{ id: args[0], personal_phone: '+17195550111', work_phone: null, phone_number: null }]];
    if (sql.includes('FROM staff_notification_holds WHERE user_id = ? AND restored_at IS NULL') && sql.startsWith('SELECT user_id')) {
      return [state.holds.filter(h => h.user_id === args[0] && !h.restored_at)];
    }
    if (sql.includes('FROM staff_notification_holds WHERE user_id = ? AND restored_at IS NULL')) {
      return [state.holds.filter(h => h.user_id === args[0] && !h.restored_at)];
    }
    if (sql.includes('FROM user_communication_prefs')) return [state.prefs.filter(p => p.user_id === args[0]).map(p => ({ personal_email_notify: p.personal_email_notify }))];
    if (sql.includes('FROM user_preferences')) return [state.prefs.filter(p => p.user_id === args[0]).map(p => ({ sms_enabled: p.sms_enabled }))];
    if (sql.includes('FROM sms_recipient_permissions') && sql.includes('status = \'opted_in\'')) return [state.permissions.filter(p => p.phone === args[0] && p.status === 'opted_in')];
    if (sql.startsWith('INSERT INTO staff_notification_holds')) {
      state.holds.push({ user_id: args[0], personal_email_notify: args[1], had_personal_email_pref: args[2], sms_enabled: args[3], had_user_preferences: args[4], permissions_json: args[5], restored_at: null });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE user_communication_prefs SET personal_email_notify = 0')) {
      state.prefs.forEach(p => { if (p.user_id === args[0]) p.personal_email_notify = 0; });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE user_preferences SET sms_enabled = 0')) {
      state.prefs.forEach(p => { if (p.user_id === args[0]) p.sms_enabled = 0; });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE sms_recipient_permissions') && sql.includes("status = 'opted_out'")) {
      const permission = state.permissions.find(p => p.scope_key === args[1] && p.phone === args[2] && p.purpose === args[3] && p.status === 'opted_in');
      if (permission) { permission.status = 'opted_out'; permission.evidence_json = args[0]; }
      return [{ affectedRows: permission ? 1 : 0 }];
    }
    if (sql.startsWith('INSERT INTO sms_permission_events')) { state.events.push(args); return [{ affectedRows: 1 }]; }
    if (sql.includes('SELECT status, evidence_json FROM sms_recipient_permissions')) {
      return [state.permissions.filter(p => p.scope_key === args[0] && p.phone === args[1] && p.purpose === args[2])];
    }
    if (sql.startsWith('UPDATE user_communication_prefs SET personal_email_notify = ?')) {
      state.prefs.forEach(p => { if (p.user_id === args[1]) p.personal_email_notify = args[0]; });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE user_preferences SET sms_enabled = ?')) {
      state.prefs.forEach(p => { if (p.user_id === args[1]) p.sms_enabled = args[0]; });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE sms_recipient_permissions') && sql.includes("status = 'opted_in'")) {
      const permission = state.permissions.find(p => p.scope_key === args[1] && p.phone === args[2] && p.purpose === args[3]);
      if (permission) { permission.status = 'opted_in'; permission.evidence_json = args[0]; }
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE staff_notification_holds SET restored_at')) {
      state.holds.forEach(h => { if (h.user_id === args[0] && !h.restored_at) h.restored_at = 'now'; });
      return [{ affectedRows: 1 }];
    }
    return [[]];
  })
}));
vi.mock('../../config/database.js', () => ({ default: db }));
import { holdStaffPersonalNotifications, restoreStaffPersonalNotifications } from '../staffNotificationHold.service.js';

describe('inactive employee notification enrollment', () => {
  beforeEach(() => {
    state.prefs = [{ user_id: 7, personal_email_notify: 1, sms_enabled: 1 }];
    state.permissions = [{ scope_key: 'campaign:WORK', phone: '+17195550111', purpose: 'workforce', status: 'opted_in', evidence_json: JSON.stringify({ source: 'web_form', reference: 'signed' }) }];
    state.holds = [];
    state.events = [];
  });
  it('turns off personal email and staff texting, then restores the same enrollment', async () => {
    expect(await holdStaffPersonalNotifications(7, db)).toMatchObject({ held: true, permissions: 1 });
    expect(state.prefs[0]).toMatchObject({ personal_email_notify: 0, sms_enabled: 0 });
    expect(state.permissions[0].status).toBe('opted_out');
    expect(JSON.parse(state.permissions[0].evidence_json).source).toBe('employment_inactive');
    expect(await holdStaffPersonalNotifications(7, db)).toMatchObject({ held: false, reason: 'already_held' });
    expect(await restoreStaffPersonalNotifications(7, db)).toEqual({ restored: true });
    expect(state.prefs[0]).toMatchObject({ personal_email_notify: 1, sms_enabled: 1 });
    expect(state.permissions[0].status).toBe('opted_in');
    expect(JSON.parse(state.permissions[0].evidence_json).reference).toBe('signed');
    expect(state.holds[0].restored_at).toBe('now');
  });
  it('does not restore a text choice the person changed after leaving', async () => {
    await holdStaffPersonalNotifications(7, db);
    state.permissions[0].evidence_json = JSON.stringify({ source: 'inbound_stop' });
    await restoreStaffPersonalNotifications(7, db);
    expect(state.permissions[0].status).toBe('opted_out');
    expect(state.prefs[0].personal_email_notify).toBe(1);
  });
});
