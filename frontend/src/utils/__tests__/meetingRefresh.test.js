import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMeetingRefresh } from '../meetingRefresh';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it('keeps one request in flight even when several poll ticks and signals arrive', async () => {
  const refresh = createMeetingRefresh();
  let finish;
  const read = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  const first = refresh.run(read);
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(20000);
  expect(refresh.run(read)).toBe(first);
  expect(refresh.run(read)).toBe(first);
  expect(read).toHaveBeenCalledTimes(1);
  finish('state');
  expect(await first).toBe('state');
});

it('honors Retry-After and resumes after the server cooldown', async () => {
  const refresh = createMeetingRefresh();
  const error = { response: { status: 429, headers: { 'retry-after': '60' } } };
  const read = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('recovered');
  await expect(refresh.run(read)).rejects.toBe(error);
  await vi.advanceTimersByTimeAsync(59000);
  await refresh.run(read);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await refresh.run(read)).toBe('recovered');
});

it('backs off transient failures instead of repeatedly fetching a failing service', async () => {
  const refresh = createMeetingRefresh();
  const read = vi.fn().mockRejectedValue(new Error('Unavailable'));
  await expect(refresh.run(read)).rejects.toThrow('Unavailable');
  await refresh.run(read);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  await expect(refresh.run(read)).rejects.toThrow('Unavailable');
  await vi.advanceTimersByTimeAsync(5000);
  await refresh.run(read);
  expect(read).toHaveBeenCalledTimes(2);
});

it('fetches fresh permissions after a save even when an older read is still pending', async () => {
  const refresh = createMeetingRefresh();
  let finish;
  const first = refresh.run(() => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  const readSaved = vi.fn().mockResolvedValue({ videoAllowed: true });
  const saved = refresh.afterChange(readSaved);
  expect(readSaved).not.toHaveBeenCalled();
  finish({ videoAllowed: false });
  await first;
  expect(await saved).toEqual({ videoAllowed: true });
  expect(readSaved).toHaveBeenCalledTimes(1);
});
