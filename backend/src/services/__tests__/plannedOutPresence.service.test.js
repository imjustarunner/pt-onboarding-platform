import test from 'node:test';
import assert from 'node:assert/strict';
import {
  overlayPlannedOutsOnPresenceRows,
  plannedOutStatusLabel
} from '../plannedOutPresence.service.js';
import { isPlannedOutActiveNow } from '../../models/PlannedOut.model.js';

test('plannedOutStatusLabel uses out-for-planned-out copy', () => {
  assert.equal(plannedOutStatusLabel({ availability: 'unavailable' }), 'Out for planned out');
  assert.equal(plannedOutStatusLabel({ availability: 'available' }), 'Planned out · available');
});

test('overlayPlannedOutsOnPresenceRows marks offline users on active approved planned outs', () => {
  const now = new Date('2026-08-10T15:00:00');
  const plannedOut = {
    id: 42,
    user_id: 7,
    status: 'approved',
    all_day: 0,
    start_at: '2026-08-10T14:00:00',
    end_at: '2026-08-10T18:00:00',
    availability: 'unavailable'
  };
  assert.equal(isPlannedOutActiveNow(plannedOut, now), true);
  const [person] = overlayPlannedOutsOnPresenceRows(
    [{ id: 7, status: 'offline', availability_band: 'offline' }],
    [plannedOut]
  );
  assert.equal(person.planned_out_active, true);
  assert.equal(person.availability_band, 'unavailable');
  assert.equal(person.status_label, 'Out for planned out');
});
