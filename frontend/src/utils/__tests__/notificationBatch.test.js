import { describe, expect, it, vi } from 'vitest';
import { updateNotificationBatch } from '../notificationBatch';

describe('explicit notification batches', () => {
  it('updates only the given IDs, deduplicates, and retains failures for retry', async () => {
    const update = vi.fn(async (id) => { if (id === 2) throw new Error('denied'); });
    expect(await updateNotificationBatch([{ id: 1 }, { id: 2 }, { id: 1 }], 'read', update))
      .toEqual({ updated: 1, failedIds: [2] });
    expect(update.mock.calls).toEqual([[1, { read: true }], [2, { read: true }]]);
  });
  it('uses one snooze deadline and caps concurrent requests', async () => {
    let concurrent = 0, peak = 0;
    const update = vi.fn(async () => {
      peak = Math.max(peak, ++concurrent);
      await new Promise(resolve => setTimeout(resolve, 1));
      concurrent--;
    });
    const result = await updateNotificationBatch(Array.from({ length: 25 }, (_, id) => ({ id })), 'snooze24', update, 0);
    expect(result.updated).toBe(25);
    expect(peak).toBe(4);
    expect(update.mock.calls.every(([, payload]) => payload.snoozedUntil === '1970-01-02T00:00:00.000Z')).toBe(true);
  });
  it('clears follow-up on dismiss and supports ending snooze', async () => {
    const update = vi.fn();
    await updateNotificationBatch([{ id: 1, _requires_follow_up_for_viewer: true }], 'dismiss', update);
    expect(update).toHaveBeenCalledWith(1, { dismissed: true, followUp: false });
    await updateNotificationBatch([{ id: 1 }], 'unsnooze', update);
    expect(update).toHaveBeenLastCalledWith(1, { snoozedUntil: null });
  });
});
