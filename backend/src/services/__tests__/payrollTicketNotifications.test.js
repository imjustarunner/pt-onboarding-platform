import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { notifyPayrollTicket } from '../payrollTicketNotifications.service.js';

it('notifies only current, authorized Payroll members, honoring aliases and keeping No email unchanged', async () => {
  const members = [{ email: 'current@example.test', type: 'USER', delivery_settings: 'NONE' },
    { email: 'alias@example.test', type: 'USER', delivery_settings: 'NONE' },
    { email: 'permission-off@example.test', type: 'USER', delivery_settings: 'ALL_MAIL' }];
  const directory = { listGroupMembers: vi.fn(async () => members), getUser: vi.fn(async ({ primaryEmail }) => ({
    primaryEmail: primaryEmail === 'alias@example.test' ? 'canonical@example.test' : primaryEmail, aliases: [primaryEmail] })) };
  const staff = [{ id: 1, email: 'current@example.test' }, { id: 2, email: 'removed@example.test' },
    { id: 3, email: 'canonical@example.test' }, { id: 4, email: 'permission-off@example.test' }];
  const notified = new Set();
  const db = { execute: vi.fn(async (sql, values) => sql.includes('FROM users u') ? [staff]
    : [notified.has(values[1]) ? [{ id: 90 }] : []]) };
  const createNotification = vi.fn(async value => { notified.add(value.userId); });
  const dependencies = { db, directory, createNotification, access: async id => id === 4 ? [] : ['payroll'] };
  const input = { agencyId: 2, ticketId: 70, mailbox: 'payroll@example.test', actorUserId: 55 };
  expect(await notifyPayrollTicket(input, dependencies)).toEqual({ notified: 2 });
  expect(createNotification.mock.calls.map(([value]) => value.userId)).toEqual([1, 3]);
  expect(createNotification.mock.calls.every(([value]) => value.agencyId === 2 && value.actorUserId === 55)).toBe(true);
  expect(await notifyPayrollTicket(input, dependencies)).toEqual({ notified: 0 });
  expect(members.map(member => member.delivery_settings)).toEqual(['NONE', 'NONE', 'ALL_MAIL']);
});
