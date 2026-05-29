import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_DAY_KIOSK_ABSENCE_REASONS,
  resolveAbsenceReasonText
} from '../eventDayKioskAbsent.service.js';

test('resolveAbsenceReasonText uses preset label and optional notes', () => {
  assert.equal(
    resolveAbsenceReasonText('family_confirmed'),
    'Family confirmed not attending'
  );
  assert.equal(
    resolveAbsenceReasonText('sick', 'Called this morning'),
    'Sick / not feeling well — Called this morning'
  );
});

test('resolveAbsenceReasonText requires details for other', () => {
  assert.equal(resolveAbsenceReasonText('other', ''), null);
  assert.equal(resolveAbsenceReasonText('other', 'Family emergency'), 'Family emergency');
});

test('EVENT_DAY_KIOSK_ABSENCE_REASONS includes family confirmed option', () => {
  assert.ok(EVENT_DAY_KIOSK_ABSENCE_REASONS.some((r) => r.code === 'family_confirmed'));
});
