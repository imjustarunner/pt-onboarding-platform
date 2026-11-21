import { expect, it } from 'vitest';
import { roomBlockForSession, sessionWindowInRoom } from '../officeSessionWindow.js';

it('keeps a 22-minute session across an hour boundary inside two whole room hours', () => {
  const tz = 'America/Denver';
  const start = '2026-11-20 01:45:00';
  const end = '2026-11-20 02:07:00';
  const room = roomBlockForSession(start, end, tz);
  expect(room).toEqual({ startAt: '2026-11-20 01:00:00', endAt: '2026-11-20 03:00:00', offsets: [45, 67] });
  expect(sessionWindowInRoom(room.startAt, room.endAt, room.offsets, tz)).toEqual({ startAt: start, endAt: end });
  expect(() => sessionWindowInRoom(room.startAt, '2026-11-20 02:00:00', room.offsets, tz)).toThrow('cover the entire session');
});

it('uses the same local minutes when a room series crosses a daylight saving change', () => {
  const room = roomBlockForSession('2027-03-04 22:07:00', '2027-03-04 22:39:00', 'America/Denver');
  expect(sessionWindowInRoom('2027-03-18 21:00:00', '2027-03-18 22:00:00', room.offsets, 'America/Denver'))
    .toEqual({ startAt: '2027-03-18 21:07:00', endAt: '2027-03-18 21:39:00' });
});
