import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import express from 'express';

const guest = vi.hoisted(() => ({ calendarMeeting: vi.fn(), createCalendarGuest: vi.fn() }));
vi.mock('../meetingCalendarGuest.service.js', () => guest);
import calendarRoutes from '../../routes/meetingCalendar.routes.js';

let server;
beforeEach(() => {
  vi.clearAllMocks();
  guest.calendarMeeting.mockResolvedValue({ title: 'Interview', meeting_subtype: 'interview' });
  guest.createCalendarGuest.mockResolvedValue({ id: 1, status: 'waiting' });
});
afterEach(async () => {
  if (server) {
    const closed = once(server, 'close');
    server.close();
    server.closeAllConnections();
    await closed;
    server = null;
  }
});

async function appUrl() {
  const app = express();
  app.use(express.json());
  // Replay the production ordering with the real public router and the same
  // catch-all authentication behavior that blocked signed-out candidates.
  const source = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
  const mounts = [...source.matchAll(/app\.use\('(\/api(?:\/meeting-calendar)?)', (meetingCalendarRoutes|userCommunicationRoutes)\);/g)];
  expect(mounts).toHaveLength(2);
  for (const [, path, name] of mounts) {
    app.use(path, name === 'meetingCalendarRoutes' ? calendarRoutes
      : (_req, res) => res.status(401).json({ error: { message: 'No token provided' } }));
  }
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

it('lets a signed-out candidate resolve a personal interview invitation', async () => {
  const base = await appUrl();
  const response = await fetch(`${base}/api/meeting-calendar/team-meeting/${'p'.repeat(32)}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ title: 'Interview', interview: true });
});

it('lets shared-calendar visitors request admission without an account', async () => {
  const base = await appUrl();
  const response = await fetch(`${base}/api/meeting-calendar/team-meeting/shared/guests`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Visitor' })
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'waiting' });
});

it.each([404, 410])('preserves guest-link validation errors (%s)', async status => {
  guest.calendarMeeting.mockRejectedValue(Object.assign(new Error('Meeting unavailable'), { status }));
  const response = await fetch(`${await appUrl()}/api/meeting-calendar/team-meeting/${'p'.repeat(32)}`);
  expect(response.status).toBe(status);
});

it('still requires authentication for private APIs', async () => {
  const response = await fetch(`${await appUrl()}/api/users/1/communications`);
  expect(response.status).toBe(401);
});
