import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(async () => [{ affectedRows: 1 }]) } }));
import pool from '../../config/database.js';
import { markSupportTicketRead, ticketUnreadSql } from '../supportTicketRead.service.js';
beforeEach(() => vi.clearAllMocks());

it('persists a personal read watermark and synchronizes its email without changing ticket status or ownership', async () => {
  const readBefore = new Date('2026-11-18T17:00:00Z');
  await markSupportTicketRead({ ticketId: 101, userId: 5, readBefore });
  expect(pool.execute).toHaveBeenCalledTimes(2);
  for (const [sql, params] of pool.execute.mock.calls) {
    expect(sql).toContain('LEAST(');
    expect(params).toEqual([5, readBefore, 0, 101]);
    expect(sql).not.toMatch(/UPDATE support_tickets|SET status|SET claimed_by/);
  }
});
it('finds newer messages from other people and honors an explicit unread state', () => {
  const sql = ticketUnreadSql(5);
  expect(sql).toContain('rm.author_user_id<>5');
  expect(sql).toContain('COALESCE(rm.is_deleted,0)=0');
  expect(sql).toContain('tr.forced_unread=0');
  expect(sql).toContain('tr.last_read_at>=');
  expect(() => ticketUnreadSql('5 OR 1=1')).toThrow();
});
it('can keep a ticket unread without modifying its work status', async () => {
  await markSupportTicketRead({ ticketId: 101, userId: 5, unread: true });
  expect(pool.execute.mock.calls.every(([, params]) => params[2] === 1)).toBe(true);
});
