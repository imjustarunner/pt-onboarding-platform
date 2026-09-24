import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
import { touchSession, verifyPasscodeForTenantAndStartSession } from '../quickViewAuth.service.js';
const row={id:1,user_id:4,agency_id:2,expires_at:'2026-09-24T18:10:00Z'};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-24T18:05:00Z'));mocks.execute.mockReset();mocks.execute.mockResolvedValue([[row]]);});
afterEach(()=>vi.useRealTimers());
describe('Quick View expiry',()=>{
  it('does not renew the deadline when data or heartbeat polls verify the session',async()=>{
    expect((await touchSession('test')).expiresAt.toISOString()).toBe(row.expires_at.replace('Z','.000Z'));
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
  it('renews only for explicit activity',async()=>{
    expect((await touchSession('test',{activity:true})).expiresAt.toISOString()).toBe('2026-09-24T18:15:00.000Z');
    expect(mocks.execute.mock.calls[1][0]).toContain('UPDATE quick_view_sessions');
  });
  it('cannot renew an expired session after a suspended tab wakes',async()=>{
    vi.setSystemTime(new Date('2026-09-24T18:11:00Z'));
    expect(await touchSession('test',{activity:true})).toBeNull();
    expect(mocks.execute.mock.calls.some(([sql])=>sql.includes('UPDATE quick_view_sessions'))).toBe(false);
  });
  it('preserves an existing meeting deadline',async()=>{
    mocks.execute.mockResolvedValue([[{...row,expires_at:'2026-09-24T19:10:00Z'}]]);
    expect((await touchSession('test',{activity:true})).expiresAt.toISOString()).toBe('2026-09-24T19:10:00.000Z');
  });
  it('binds a saved username to the account within the tenant',async()=>{
    mocks.execute.mockResolvedValue([[]]);
    await verifyPasscodeForTenantAndStartSession({agencyId:2,passcode:'123456',email:' Parent@Example.com '});
    expect(mocks.execute.mock.calls[0][0]).toContain('LOWER(u.email)=?');
    expect(mocks.execute.mock.calls[0][1]).toEqual(['parent@example.com',2,2]);
  });
});
