import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clientScheduleInstantToUtcMysql,
  normalizeUtcMysqlScheduleInstant,
  scheduleInstantToWallMysql,
  utcMysqlToZonedWallMysql
} from '../zonedWallTime.util.js';

test('clientScheduleInstantToUtcMysql converts wall clock in Denver to UTC mysql digits', () => {
  assert.equal(
    clientScheduleInstantToUtcMysql('2026-08-12T12:00:00', 'America/Denver'),
    '2026-08-12 18:00:00'
  );
});

test('clientScheduleInstantToUtcMysql stores ISO-Z without re-projecting through timeZone', () => {
  assert.equal(
    clientScheduleInstantToUtcMysql('2026-08-12T18:00:00.000Z', 'America/Denver'),
    '2026-08-12 18:00:00'
  );
});

test('normalizeUtcMysqlScheduleInstant treats naked mysql digits as UTC storage', () => {
  assert.equal(
    normalizeUtcMysqlScheduleInstant('2026-08-12 18:00:00'),
    '2026-08-12 18:00:00'
  );
});

test('scheduleInstantToWallMysql returns client wall digits for datetime-local payloads', () => {
  assert.equal(
    scheduleInstantToWallMysql('2026-08-12T12:00:00', 'America/Denver'),
    '2026-08-12 12:00:00'
  );
});

test('scheduleInstantToWallMysql converts stored UTC mysql to office wall for Google', () => {
  assert.equal(
    scheduleInstantToWallMysql('2026-08-12 18:00:00', 'America/Denver', { fromStorage: true }),
    '2026-08-12 12:00:00'
  );
});

test('utcMysqlToZonedWallMysql formats UTC instant in Chicago', () => {
  assert.equal(
    utcMysqlToZonedWallMysql('2026-08-13 22:00:00', 'America/Chicago'),
    '2026-08-13 17:00:00'
  );
});
