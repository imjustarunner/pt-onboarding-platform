import { expect, it } from 'vitest';
import { clientChangeIsNoop, clientChangeValue } from '../../utils/clientChangeValue.js';
import { consolidateSchoolEnrollmentNotifications } from '../schoolNotificationPresentation.service.js';

it.each([
  ['organization_id', 451, '451'],
  ['agency_id', '450', 450],
  ['submission_date', new Date('2026-11-12T00:00:00Z'), '2026-11-12'],
  ['submission_date', '2026-11-12T00:00:00.000Z', '2026-11-12'],
  ['submission_date', 'Thu Nov 12 2026 00:00:00 GMT+0000', '2026-11-12'],
  ['source', ' school_upload ', 'school_upload'],
  ['organization_id', null, '']
])('does not report an unchanged %s as a new school update', (field, before, after) => {
  expect(clientChangeIsNoop(field, before, after)).toBe(true);
});
it('retains genuine changes and canonicalizes changed calendar values for the audit', () => {
  expect(clientChangeIsNoop('organization_id', 451, 452)).toBe(false);
  expect(clientChangeIsNoop('submission_date', '2026-11-11', '2026-11-12')).toBe(false);
  expect(clientChangeValue('submission_date', new Date('2026-11-12T00:00:00Z'))).toBe('2026-11-12');
});
it('serializes a driver DATE as the stored ROI day instead of truncating its weekday text', () => {
  const stored = new Date('2029-11-09T00:00:00.000Z');
  expect(clientChangeValue('roi_expires_at', stored)).toBe('2029-11-09');
  expect(clientChangeValue('roi_expires_at', '2029-11-09')).toBe('2029-11-09');
  expect(clientChangeValue('roi_expires_at', null)).toBeNull();
  expect(stored.toISOString()).toBe('2029-11-09T00:00:00.000Z');
});
it('keeps one enrollment notice instead of initial metadata bursts without hiding later real changes', () => {
  const at = '2026-11-12T12:00:00Z';
  const items = [
    { id: 'enrolled:1', kind: 'intake_packet_submitted', client_id: 1, created_at: at },
    { id: 'created:1', kind: 'client_created', client_id: 1, created_at: at, _digitalEnrollmentCreated: true },
    { id: 'initial:1', kind: 'client_event', client_id: 1, created_at: at, _initialEnrollmentDetail: true },
    { id: 'later:1', kind: 'client_event', client_id: 1, created_at: '2026-11-12T13:00:00Z', _initialEnrollmentDetail: true },
    { id: 'transfer:1', kind: 'client_event', client_id: 1, created_at: at, _initialEnrollmentDetail: false },
    { id: 'assignment:1', kind: 'assignment', client_id: 1, created_at: at },
    { id: 'manual:2', kind: 'client_created', client_id: 2, created_at: at }
  ];
  const before = JSON.stringify(items);
  const result = consolidateSchoolEnrollmentNotifications(items);
  expect(result.map(row => row.id)).toEqual(['enrolled:1', 'later:1', 'transfer:1', 'assignment:1', 'manual:2']);
  expect(JSON.stringify(items)).toBe(before);
  expect(result.some(row => '_initialEnrollmentDetail' in row || '_digitalEnrollmentCreated' in row)).toBe(false);
});
it('does not hide another child or updates when enrollment notifications are not visible', () => {
  const row = { id: 'initial:2', kind: 'client_event', client_id: 2, created_at: '2026-11-12T12:00:00Z', _initialEnrollmentDetail: true };
  expect(consolidateSchoolEnrollmentNotifications([row]).map(item => item.id)).toEqual(['initial:2']);
});
