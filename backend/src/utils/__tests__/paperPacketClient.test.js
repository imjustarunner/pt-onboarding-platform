import { describe, expect, it } from 'vitest';
import { isPaperPacketClient } from '../paperPacketClient.js';

describe('isPaperPacketClient', () => {
  it('returns true for school upload sources', () => {
    expect(isPaperPacketClient({ source: 'SCHOOL_UPLOAD' })).toBe(true);
    expect(isPaperPacketClient({ source: 'SCHOOL_UPLOAD_INTERNAL' })).toBe(true);
  });

  it('returns false for digital and admin intakes', () => {
    expect(isPaperPacketClient({ source: 'DIGITAL_FORM' })).toBe(false);
    expect(isPaperPacketClient({ source: 'ADMIN_CREATED' })).toBe(false);
  });

  it('returns true for legacy PACKET workflow rows', () => {
    expect(isPaperPacketClient({ source: 'ADMIN_CREATED', status: 'PACKET' })).toBe(true);
  });
});
