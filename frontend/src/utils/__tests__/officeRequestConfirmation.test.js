import { describe, it, expect, vi } from 'vitest';
import { confirmOneTimeRoom, roomPreferenceContext, ANY_ROOM_NOTE } from '../officeRequestConfirmation';
describe('office request intent', () => {
  it('requires confirmation only for a one-time room request', () => {
    const confirm=vi.fn(()=>false);
    expect(confirmOneTimeRoom('ONCE',confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Recurring'));
    expect(confirmOneTimeRoom('WEEKLY',confirm)).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });
  it('distinguishes no saved preference from explicitly accepting any room', () => {
    expect(roomPreferenceContext({})).toContain('No room');
    expect(roomPreferenceContext({notes:ANY_ROOM_NOTE})).toContain('Any available');
  });
});
