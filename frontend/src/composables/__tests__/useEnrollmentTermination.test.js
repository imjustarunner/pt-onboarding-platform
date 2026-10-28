import { describe, expect, it, vi } from 'vitest';
import { useEnrollmentTermination } from '../useEnrollmentTermination.js';
function setup(stopSession = vi.fn().mockResolvedValue({ ok: true, sessionEnded: true, remindersStopped: true })) {
  const onStopped = vi.fn();
  return { flow: useEnrollmentTermination({ getSessionToken: () => 'private-session', stopSession, onStopped }), stopSession, onStopped };
}
describe('enrollment termination', () => {
  it('leaves enrollment and reminders untouched when the parent keeps completing it', async () => {
    const { flow, stopSession, onStopped } = setup(); flow.open(); flow.cancel(); await flow.confirm();
    expect(stopSession).not.toHaveBeenCalled(); expect(onStopped).not.toHaveBeenCalled(); expect(flow.stopped.value).toBe(false);
  });
  it('waits for server confirmation before clearing the form and showing stopped', async () => {
    let finish; const stop = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const { flow, onStopped } = setup(stop); flow.open(); const pending = flow.confirm(); await flow.confirm();
    flow.cancel(); expect(flow.isOpen.value).toBe(true); expect(onStopped).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledOnce();
    finish({ ok: true, sessionEnded: true, remindersStopped: true }); await pending;
    expect(onStopped).toHaveBeenCalledOnce(); expect(flow.stopped.value).toBe(true); expect(flow.isOpen.value).toBe(false);
  });
  it.each([new Error('offline'), { ok: true, sessionEnded: true, remindersStopped: false }])('preserves the form and permits retry when termination is unconfirmed: %j', async result => {
    const stop = vi.fn().mockImplementationOnce(() => result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).mockResolvedValue({ ok: true, sessionEnded: true, remindersStopped: true });
    const { flow, onStopped } = setup(stop); flow.open(); await flow.confirm();
    expect(flow.failed.value).toBe(true); expect(flow.isOpen.value).toBe(true); expect(flow.stopped.value).toBe(false); expect(onStopped).not.toHaveBeenCalled();
    await flow.confirm(); expect(flow.stopped.value).toBe(true); expect(onStopped).toHaveBeenCalledOnce();
  });
});
