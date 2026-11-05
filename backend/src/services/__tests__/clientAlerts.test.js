import { expect, it, vi } from 'vitest';
import { readClientAlertText, visibleClientAlerts, clientAlertLine, prependClientAlertText, canSeeClientMessagesWindow } from '../../utils/clientAlertText.js';
import { saveClientAlert, listPendingClientAlerts, dismissClientAlert } from '../clientAlerts.service.js';
import { composeClientAssignedAssigneeEmail } from '../brandedNotificationEmail.service.js';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));

const alerts = [
  { id: 1, body: 'no contact info' },
  { id: 2, body: 'updated referral note' }
];

it('saves an assignment alert with the client, author, and assignment', async () => {
  const calls = [];
  const db = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return [{ insertId: 41 }];
    }
  };
  const saved = await saveClientAlert(db, {
    clientId: 4,
    body: '  no contact info, please inquire with school client or referral contact for contact info.  ',
    createdByUserId: 8,
    assignmentId: 15
  });
  expect(saved).toMatchObject({ id: 41, clientId: 4, createdByUserId: 8, assignmentId: 15 });
  expect(calls[0].sql).toContain('INSERT INTO client_alerts');
  expect(calls[0].params).toEqual([
    4,
    'no contact info, please inquire with school client or referral contact for contact info.',
    8,
    15
  ]);
});

it('does not save a blank assignment alert', async () => {
  const db = { execute: async () => { throw new Error('should not insert'); } };
  expect(await saveClientAlert(db, { clientId: 4, body: '   ', createdByUserId: 8 })).toBeNull();
  expect(readClientAlertText({ client_alert: '   ' }).text).toBe('');
});

it('hides a dismissed alert for that person only and shows a later alert again', () => {
  const dismissals = [{ alert_id: 1, user_id: 5 }];
  expect(visibleClientAlerts(alerts, dismissals, 5).map((row) => row.id)).toEqual([2]);
  expect(visibleClientAlerts(alerts, dismissals, 9).map((row) => row.id)).toEqual([2, 1]);
  expect(visibleClientAlerts(alerts, [...dismissals, { alert_id: 2, user_id: 5 }], 5)).toEqual([]);
});

it('loads pending alerts with a per-user dismissal filter', async () => {
  const calls = [];
  const db = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return [[{ id: 2, body: 'updated referral note' }]];
    }
  };
  const rows = await listPendingClientAlerts(db, { clientId: 4, userId: 5 });
  expect(rows.map((row) => row.id)).toEqual([2]);
  expect(calls[0].sql).toContain('d.user_id = ?');
  expect(calls[0].sql).toContain('d.alert_id IS NULL');
  expect(calls[0].params).toEqual([5, 4]);
});

it('records dismissal for the viewer without deleting the alert', async () => {
  const calls = [];
  const db = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT id FROM client_alerts')) return [[{ id: 2 }]];
      return [{ affectedRows: 1 }];
    }
  };
  expect(await dismissClientAlert(db, { clientId: 4, alertId: 2, userId: 5 })).toEqual({ ok: true });
  expect(calls[1].sql).toContain('INSERT INTO client_alert_dismissals');
  expect(calls[1].params).toEqual([2, 5]);
  expect(calls.some((call) => /DELETE FROM client_alerts/i.test(call.sql))).toBe(false);
});

it('starts the assignment email with the client alert only when text exists', () => {
  const withAlert = composeClientAssignedAssigneeEmail({
    agencyName: 'North',
    serviceDay: 'Monday',
    appUrl: 'https://app.example/login',
    clientAlert: 'SSSSSSS'
  });
  expect(withAlert.text.startsWith('Client Alert: SSSSSSS')).toBe(true);
  expect(withAlert.html.indexOf('Client Alert: SSSSSSS')).toBeGreaterThan(-1);
  expect(withAlert.html.indexOf('Client Alert: SSSSSSS')).toBeLessThan(withAlert.html.indexOf('Hello'));
  expect(clientAlertLine('SSSSSSS')).toBe('Client Alert: SSSSSSS');

  const withoutAlert = composeClientAssignedAssigneeEmail({
    agencyName: 'North',
    serviceDay: 'Monday',
    appUrl: 'https://app.example/login',
    clientAlert: '   '
  });
  expect(withoutAlert.text.includes('Client Alert')).toBe(false);
  expect(withoutAlert.html.includes('Client Alert')).toBe(false);
  expect(withoutAlert.text.startsWith('A new client has been added')).toBe(true);
  expect(prependClientAlertText('Body', '')).toBe('Body');
});

it('keeps client alerts off the school staff, guardian, and client messages window', () => {
  expect(canSeeClientMessagesWindow('school_staff')).toBe(false);
  expect(canSeeClientMessagesWindow('client_guardian')).toBe(false);
  expect(canSeeClientMessagesWindow('client')).toBe(false);
  for (const role of ['provider', 'provider_plus', 'support', 'admin', 'clinical_practice_assistant', 'supervisor', 'intern', 'staff', 'super_admin']) {
    expect(canSeeClientMessagesWindow(role)).toBe(true);
  }
});
