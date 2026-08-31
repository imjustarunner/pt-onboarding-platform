import test from 'node:test';
import assert from 'node:assert/strict';
import {
  overlayPlannedOutsOnPresenceRows,
  plannedOutStatusLabel,
  availabilityBandFromPlannedOut
} from '../plannedOutPresence.service.js';
import { isPlannedOutActiveNow, ymdFromStoredDate } from '../../models/PlannedOut.model.js';

test('plannedOutStatusLabel uses out-for-planned-out copy', () => {
  assert.equal(plannedOutStatusLabel({ availability: 'unavailable' }), 'Out for planned out');
  assert.equal(plannedOutStatusLabel({ availability: 'available' }), 'Planned out · available');
});

test('availabilityBandFromPlannedOut maps available to away_reachable', () => {
  assert.equal(availabilityBandFromPlannedOut({ availability: 'unavailable' }), 'unavailable');
  assert.equal(availabilityBandFromPlannedOut({ availability: 'available' }), 'away_reachable');
});

test('ymdFromStoredDate handles mysql2 Date at UTC midnight without local shift', () => {
  // MDT would turn this into Aug 30 evening if String(date).slice(0,10) were used.
  const d = new Date('2026-08-31T00:00:00.000Z');
  assert.equal(ymdFromStoredDate(d), '2026-08-31');
  assert.equal(ymdFromStoredDate('2026-08-31'), '2026-08-31');
  assert.equal(ymdFromStoredDate('2026-08-31T00:00:00.000Z'), '2026-08-31');
});

test('isPlannedOutActiveNow works for all-day rows returned as Date objects', () => {
  const now = new Date('2026-08-31T15:00:00-06:00');
  const plannedOut = {
    id: 23,
    user_id: 501,
    status: 'approved',
    all_day: 1,
    start_date: new Date('2026-08-31T00:00:00.000Z'),
    end_date: new Date('2026-09-03T00:00:00.000Z'),
    availability: 'unavailable'
  };
  assert.equal(isPlannedOutActiveNow(plannedOut, now, 'America/Denver'), true);
  assert.equal(
    isPlannedOutActiveNow(plannedOut, new Date('2026-08-30T12:00:00-06:00'), 'America/Denver'),
    false
  );
  assert.equal(
    isPlannedOutActiveNow(plannedOut, new Date('2026-09-03T08:00:00-06:00'), 'America/Denver'),
    false
  );
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
    [plannedOut],
    now
  );
  assert.equal(person.planned_out_active, true);
  assert.equal(person.availability_band, 'unavailable');
  assert.equal(person.status_label, 'Out for planned out');
});

test('overlay keeps unavailable planned out when user is online / Active', () => {
  const now = new Date('2026-08-31T15:00:00-06:00');
  const plannedOut = {
    id: 23,
    user_id: 501,
    status: 'approved',
    all_day: true,
    start_date: new Date('2026-08-31T00:00:00.000Z'),
    end_date: new Date('2026-09-03T00:00:00.000Z'),
    availability: 'unavailable'
  };
  assert.equal(isPlannedOutActiveNow(plannedOut, now, 'America/Denver'), true);
  const [person] = overlayPlannedOutsOnPresenceRows(
    [{ id: 501, status: 'online', availability_band: 'available', presence_display_label: 'Active' }],
    [plannedOut],
    now
  );
  assert.equal(person.planned_out_active, true);
  assert.equal(person.availability_band, 'unavailable');
  assert.equal(person.status_label, 'Out for planned out');
});
