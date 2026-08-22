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

  it('does not treat digital intake PACKET workflow as paper', () => {
    expect(isPaperPacketClient({
      source: 'PUBLIC_INTAKE_LINK',
      status: 'PACKET',
      document_status: 'UPLOADED'
    })).toBe(false);
  });

  it('returns true for legacy PACKET rows with no source', () => {
    expect(isPaperPacketClient({ source: '', status: 'PACKET' })).toBe(true);
    expect(isPaperPacketClient({ status: 'PACKET', document_status: 'PACKET' })).toBe(true);
  });

  it('does not treat admin-created PACKET rows as paper when source is known', () => {
    expect(isPaperPacketClient({ source: 'ADMIN_CREATED', status: 'PACKET' })).toBe(false);
  });
});
