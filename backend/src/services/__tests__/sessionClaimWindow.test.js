import { describe, expect, it, vi } from 'vitest';
import { sessionShouldOpenClaim, sessionClaimServiceDate, openDueSessionClaims, claimGroupKey, sessionsForSubmission, canJoinOpenClaim, CLAIM_OPEN_LEAD_MS } from '../sessionClaimWindow.service.js';

const now = Date.parse('2026-11-05T18:00:00Z');

describe('session claim window', () => {
  it.each([
    ['2026-11-17 01:30:00','America/Denver','2026-11-16'],
    ['2026-07-17T01:30:00Z','America/Denver','2026-07-16'],
    ['2026-11-17T00:30:00-07:00','America/Denver','2026-11-17'],
    ['2026-11-17T01:30:00Z','America/New_York','2026-11-16'],
    [new Date('2026-11-17T01:30:00Z'),'America/Denver','2026-11-16']
  ])('uses the encounter calendar day for %s in %s',(scheduled_start_at,source_timezone,date)=>{
    expect(sessionClaimServiceDate({scheduled_start_at,source_timezone})).toBe(date);
  });
  it('preserves an explicit recorded service date and interprets mysql schedule values as UTC',()=>{
    expect(sessionClaimServiceDate({scheduled_start_at:'2026-11-17 01:30:00',metadata_json:'{"serviceDate":"2026-11-15"}'})).toBe('2026-11-15');
    expect(sessionShouldOpenClaim('2026-11-17 01:30:00',Date.parse('2026-11-17T01:31:00Z'))).toBe(true);
  });
  it('writes the local service day to both claim and lines and skips unlinked encounters',async()=>{
    const linked={id:1,agency_id:2,client_id:3,provider_user_id:4,service_code:'90834',scheduled_start_at:'2026-11-17 01:30:00',source_timezone:'America/Denver'};
    const db={execute:vi.fn(async sql=>sql.includes('FROM clinical_sessions s')?[[linked,{...linked,id:2,client_id:null}]]:[{insertId:11}])};
    expect(await openDueSessionClaims(db,new Date('2026-11-17T01:31:00Z'))).toEqual({opened:1});
    for(const [sql,args] of db.execute.mock.calls.filter(([sql])=>/INSERT INTO clinical_claims\s|INSERT INTO clinical_claim_lines\s/.test(sql)))expect(args.at(-1)).toBe('2026-11-16');
  });
  it('opens a claim five minutes before the visit and not while it is only booked', () => {
    expect(sessionShouldOpenClaim(new Date(now + 4 * 60 * 1000), now)).toBe(true);
    expect(sessionShouldOpenClaim(new Date(now + CLAIM_OPEN_LEAD_MS + 60 * 1000), now)).toBe(false);
    expect(sessionShouldOpenClaim(new Date(now - 60 * 60 * 1000), now)).toBe(true);
    expect(sessionShouldOpenClaim(new Date(now - 13 * 60 * 60 * 1000), now)).toBe(false);
  });

  it('keeps an unsigned visit off the submission and joins only the same open claim', () => {
    const sessions = [{ id: 1, signed: true, billable: true }, { id: 2, signed: false, billable: true }];
    expect(sessionsForSubmission(sessions).include.map(session => session.id)).toEqual([1]);
    expect(sessionsForSubmission(sessions).hold.map(session => session.id)).toEqual([2]);
    const openClaim = { agencyId: 2, clientId: 9, dateOfService: '2026-11-05', payerId: 'COCHA', billingNpi: '1215615711', renderingNpi: '1033856794', lifecycle: 'draft' };
    expect(canJoinOpenClaim(openClaim, { ...openClaim })).toBe(true);
    expect(canJoinOpenClaim(openClaim, { ...openClaim, renderingNpi: '1033038708' })).toBe(false);
    expect(canJoinOpenClaim({ ...openClaim, lifecycle: 'submitted' }, openClaim)).toBe(false);
    expect(claimGroupKey(openClaim)).toContain('COCHA');
  });
});
