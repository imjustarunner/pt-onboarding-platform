import { describe, it, expect, vi } from 'vitest';
import VonageVideoService from '../vonageVideo.service.js';
describe('candidate-only interview end', () => {
  it('disconnects the guest identity without disconnecting similarly numbered staff', async () => {
    vi.spyOn(VonageVideoService, 'isVideoConfigured').mockReturnValue(true);
    vi.spyOn(VonageVideoService, 'sendSignal').mockResolvedValue({});
    vi.spyOn(VonageVideoService, 'listStreams').mockResolvedValue([
      { connection: { id: 'candidate', data: JSON.stringify({ identity: 'guest-iv-opaque' }) } },
      { connection: { id: 'staff', data: JSON.stringify({ identity: 'user-300' }) } },
      { connection: { id: 'host', data: JSON.stringify({ identity: 'user-11' }) } }
    ]);
    const disconnect = vi.spyOn(VonageVideoService, 'disconnectClient').mockResolvedValue({});
    const result = await VonageVideoService.endGuestInterviewAccess('room', { candidateUserId: 30, guestIdentity: 'guest-iv-opaque' });
    expect(result.disconnected).toBe(1); expect(disconnect).toHaveBeenCalledExactlyOnceWith('room', 'candidate');
  });
});
