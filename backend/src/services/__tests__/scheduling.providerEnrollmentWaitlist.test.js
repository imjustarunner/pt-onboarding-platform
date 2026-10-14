import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { loadEnrollmentWaitlist, resolveAssignedEnrollmentWaitlist, runProviderWaitlistStaffReminders, waitlistWeekKey } from '../providerEnrollmentWaitlist.service.js';
import { isNotificationEssentialForRole } from '../notificationCatalog.service.js';
import { resolveNotificationTypePreference } from '../notificationPreferences.service.js';

const row = { id: 30, agency_id: 2, full_name: 'Test Client', provider_id: 8, provider_name: 'Test Provider', provider_email: 'provider@example.test',
  agency_name: 'Test Agency', agency_slug: 'test', guardian_email: 'caregiver@example.test', guardian_name: 'Test Caregiver', guardian_phone: '555-0100',
  intake_preferences_json: { providerSelection: { providerId: 8, status: 'WAITLIST', modality: 'VIRTUAL', submissionId: 70, requestedAt: '2026-10-01T12:00:00Z' },
    waitlist: { active: true, providerId: 8, addedAt: '2026-10-01T12:00:00Z' }, preferredDays: ['Tuesday'], preferredTimes: ['Evening'], preferredTimeZone: 'America/Denver', preferredSchedulingNotes: 'After 5 PM',
    requestedOpening: { providerId: 8, startAt: '2026-10-20T23:00:00Z', endAt: '2026-10-21T00:00:00Z', timeZone: 'America/Denver', frequency: 'WEEKLY', modality: 'VIRTUAL' },
    clinicalConcern: 'This must not be returned' } };

describe('provider-specific scheduling-only waitlist', () => {
  it('returns contact and appointment preferences without clinical responses or intake JSON', async () => {
    const db = { execute: vi.fn(async () => [[row]]) };
    const result = await loadEnrollmentWaitlist({ agencyId: 2, providerId: 8, clientId: 30 }, db);
    expect(result[0]).toMatchObject({ clientId: 30, providerId: 8, submissionId: 70, status: 'WAITLIST', preferredDays: ['Tuesday'], preferredTimes: ['Evening'], schedulingNotes: 'After 5 PM', timeZone: 'America/Denver', contact: { email: 'caregiver@example.test' }, requestedOpening: { frequency: 'WEEKLY' } });
    expect(JSON.stringify(result)).not.toContain('clinicalConcern');
    expect(result[0]).not.toHaveProperty('intake_preferences_json');
    expect(db.execute.mock.calls[0][1]).toEqual([2, 8, 30]);
  });
  it('filters resolved, archived, inactive, and assigned clients at the database boundary', async () => {
    const db = { execute: vi.fn(async () => [[]]) };
    expect(await loadEnrollmentWaitlist({ agencyId: 2 }, db)).toEqual([]);
    const sql = db.execute.mock.calls[0][0];
    expect(sql).toContain("'$.waitlist.active') = TRUE");
    expect(sql).toContain('cpa.is_active = TRUE');
    expect(sql).toContain("'TERMINATED'");
    expect(sql).toContain('COALESCE(u.is_archived, 0) = 0');
    expect(sql).not.toContain('intakeStatusByFormat'); // Opening intake does not resolve a person's waitlist request.
  });
  it('rejects missing tenant scope instead of listing across agencies', async () => {
    const db = { execute: vi.fn() };
    await expect(loadEnrollmentWaitlist({}, db)).rejects.toMatchObject({ status: 400 });
    expect(db.execute).not.toHaveBeenCalled();
  });
  it('does not expose a revoked guardian through old adaptive contact fallback', async () => {
    const blocked = { ...row, guardian_name: null, guardian_email: null, guardian_phone: null, has_guardian_links: 1,
      email: 'old-guardian@example.test', contact_phone: 'old phone', adaptive_intake_meta_json: { respondent: { email: 'old-guardian@example.test' } } };
    const db = { execute: vi.fn(async () => [[blocked]]) };
    const [result] = await loadEnrollmentWaitlist({ agencyId: 2 }, db);
    expect(result.contact).toMatchObject({ email: null, phone: null });
    expect(db.execute.mock.calls[0][0]).toContain("'$.noViewOtherGuardian'");
    expect(db.execute.mock.calls[0][0]).toContain('g.guardian_user_id = enrollment.guardian_user_id');
  });
  it('includes explicit legacy desired-provider fields and resolves staff-created provider waitlists on real assignment', async () => {
    const db = { execute: vi.fn(async () => [[]]) };
    await loadEnrollmentWaitlist({ agencyId: 2 }, db);
    await resolveAssignedEnrollmentWaitlist(db, 30);
    for (const [sql] of db.execute.mock.calls) {
      expect(sql).toContain("JSON_EXTRACT(c.adaptive_intake_meta_json, '$.preferredProviderUserId')");
      expect(sql).toContain("'$.preferred_office_provider_ids[0]'");
    }
    const [updateSql, params] = db.execute.mock.calls[1];
    expect(updateSql).toContain("'$.waitlist.resolution', 'provider_assigned'");
    expect(updateSql).toContain('cpa.is_active = TRUE');
    expect(updateSql).not.toContain('public_provider_selection');
    expect(params).toEqual([30]);
  });
});

function reminderDatabase({ resolvedBeforeSend = false, failInsert = false } = {}) {
  const notifications = [];
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql, params) => {
    if (sql.includes('FROM clients c')) return [resolvedBeforeSend ? [] : [row]];
    if (sql.startsWith('SELECT id FROM users')) return [[{ id: 8 }]];
    if (sql.startsWith('SELECT id FROM notifications')) return [notifications.length ? [{ id: 10 }] : []];
    if (sql.includes('INSERT INTO notifications')) { if (failInsert) throw new Error('write failed'); notifications.push(params); return [{ insertId: 10 }]; }
    throw new Error(`Unexpected SQL ${sql}`);
  }) };
  return { connection, notifications, getConnection: async () => connection, execute: vi.fn(async sql => {
    if (sql.startsWith('SELECT DISTINCT agency_id')) return [[{ agency_id: 2 }]];
    if (sql.includes('FROM clients c')) return [[row]];
    throw new Error(`Unexpected SQL ${sql}`);
  }) };
}

describe('weekly provider and support inbox check-ins', () => {
  it('enables the reminder in provider and support inboxes by default', () => {
    for (const userRole of ['provider', 'admin', 'support', 'staff']) {
      expect(isNotificationEssentialForRole('provider_waitlist_reminder', userRole)).toBe(true);
      expect(resolveNotificationTypePreference('provider_waitlist_reminder', { userRole, globalPreferences: {}, typePreferences: new Map() }).effective.inApp).toBe(true);
    }
    expect(isNotificationEssentialForRole('provider_waitlist_reminder', 'guardian')).toBe(false);
    expect(isNotificationEssentialForRole('provider_waitlist_reminder', 'school_staff')).toBe(false);
  });
  it('groups the same calendar week under one retry-safe key', () => {
    expect(waitlistWeekKey(new Date('2026-10-14T14:00:00Z'))).toBe('2026-10-12');
    expect(waitlistWeekKey(new Date('2026-10-18T23:59:00Z'))).toBe('2026-10-12');
    expect(waitlistWeekKey(new Date('2026-10-19T00:00:00Z'))).toBe('2026-10-19');
  });
  it('creates one provider reminder and one support reminder, never per-client spam or duplicate retries', async () => {
    const db = reminderDatabase();
    expect(await runProviderWaitlistStaffReminders({ database: db, now: new Date('2026-10-14') })).toEqual({ reminders: 2 });
    expect(await runProviderWaitlistStaffReminders({ database: db, now: new Date('2026-10-15') })).toEqual({ reminders: 0 });
    expect(db.notifications.map(params => params[3])).toEqual([8, null]);
    expect(db.notifications[0][1]).toContain('1 person is waiting');
    expect(db.notifications[1][2]).toContain('"provider":false');
  });
  it('rechecks resolution under the lock before generating a reminder', async () => {
    const db = reminderDatabase({ resolvedBeforeSend: true });
    expect(await runProviderWaitlistStaffReminders({ database: db })).toEqual({ reminders: 0 });
    expect(db.notifications).toHaveLength(0);
  });
  it('rolls back both audience reminders if a notification write fails', async () => {
    const db = reminderDatabase({ failInsert: true });
    await expect(runProviderWaitlistStaffReminders({ database: db })).rejects.toThrow('write failed');
    expect(db.connection.rollback).toHaveBeenCalled();
    expect(db.connection.commit).not.toHaveBeenCalled();
  });
});
