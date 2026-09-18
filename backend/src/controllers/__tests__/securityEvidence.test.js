import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), append: vi.fn(), mirror: vi.fn(), connection: { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() } }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute, getConnection: async () => mocks.connection } }));
vi.mock('../../services/securityEvidence.service.js', () => ({ appendSecurityEvidence: mocks.append, mirrorSecurityEvidence: mocks.mirror }));
import { evidenceFilters, requireEvidenceInvestigator, revokeUserSessions, exportEvidence, listEvidence } from '../securityEvidence.controller.js';
const response = () => { const r = { statusCode: 200, headers: {} }; r.status = n => { r.statusCode = n; return r; }; r.json = vi.fn(); r.send = vi.fn(); r.setHeader = (k,v) => { r.headers[k] = v; }; return r; };
beforeEach(() => { vi.resetAllMocks(); mocks.execute.mockResolvedValue([[]]); mocks.connection.execute.mockResolvedValue([{ affectedRows: 2 }]); mocks.append.mockResolvedValue('event-id'); });
describe('investigation authorization and filters', () => {
  it('rejects tenant admins, demo roles, and stale superadmin claims', async () => {
    for (const user of [{id:1,role:'admin'}, {id:1,role:'super_admin',demoMode:true}, {id:1,role:'super_admin',effectiveRole:'provider'}, {id:1,role:'super_admin'}]) {
      const res = response(), next = vi.fn(); await requireEvidenceInvestigator({user},res,next); expect(res.statusCode).toBe(403); expect(next).not.toHaveBeenCalled();
    }
  });
  it('permits current platform security administrators', async () => {
    mocks.execute.mockResolvedValue([[{role:'super_admin'}]]); const next=vi.fn(); await requireEvidenceInvestigator({user:{id:1,role:'super_admin'}},response(),next); expect(next).toHaveBeenCalledWith();
  });
  it('bounds dates, validates exact filters, and uses SQL parameters', () => {
    expect(() => evidenceFilters({ start:'2020-01-01',end:'2026-01-01' })).toThrow();
    expect(() => evidenceFilters({ userId:"1 OR 1=1" })).toThrow();
    expect(() => evidenceFilters({ session:'raw-token' })).toThrow();
    const f=evidenceFilters({userId:'507',ip:'192.3.22.175',email:'rachel@example.com'}); expect(f.where).not.toContain('rachel'); expect(f.params).toContain('rachel@example.com'); expect(f.where).toContain('NOT EXISTS');
  });
  it('surfaces unavailable storage as an error instead of empty evidence', async () => {
    const error=Object.assign(new Error('missing'),{code:'ER_NO_SUCH_TABLE'}); mocks.execute.mockRejectedValue(error); const next=vi.fn(),res=response(); await listEvidence({query:{}},res,next); expect(next).toHaveBeenCalledWith(error); expect(res.json).not.toHaveBeenCalled();
  });
});
describe('incident export and containment', () => {
  it('rejects an over-limit export rather than silently truncating', async () => {
    mocks.execute.mockResolvedValue([Array(10001).fill({})]); const res=response(); await exportEvidence({query:{}},res,vi.fn()); expect(res.statusCode).toBe(422); expect(res.send).not.toHaveBeenCalled();
  });
  it('escapes untrusted CSV cells and includes a checksum', async () => {
    mocks.execute.mockResolvedValue([[{user_agent:'=CMD()',occurred_at:new Date('2026-09-16T12:00:00Z')}]]); const res=response(); await exportEvidence({query:{}},res,vi.fn()); expect(res.send.mock.calls[0][0]).toContain("'=CMD()"); expect(res.headers['X-Evidence-SHA256']).toMatch(/^[0-9a-f]{64}$/);
  });
  it('requires exact confirmation and does not permit accidental self revocation', async () => {
    for (const req of [{params:{userId:'507'},body:{confirmUserId:'508'},user:{id:1}}, {params:{userId:'1'},body:{confirmUserId:'1'},user:{id:1}}]) { const res=response(); await revokeUserSessions(req,res,vi.fn()); expect(res.statusCode).toBe(400); }
    expect(mocks.connection.beginTransaction).not.toHaveBeenCalled();
  });
  it('atomically records revocation and blocks old uninitialized sessions through a cutoff', async () => {
    mocks.execute.mockResolvedValue([[{id:507,email:'rachel@example.com'}]]); const res=response(),next=vi.fn();
    await revokeUserSessions({params:{userId:'507'},body:{confirmUserId:507},user:{id:1,email:'it@example.com',role:'super_admin'},method:'POST',headers:{}},res,next);
    expect(next).not.toHaveBeenCalled(); expect(mocks.connection.execute.mock.calls[0][0]).toContain('user_auth_revocations'); expect(mocks.append).toHaveBeenCalledWith(expect.objectContaining({action:'sessions_revoked',details:{targetUserId:507,revokedSessionRows:2}}),mocks.connection,{mirror:false}); expect(mocks.connection.commit).toHaveBeenCalled(); expect(mocks.mirror).toHaveBeenCalled();
  });
  it('rolls back revocation if its evidence cannot be persisted', async () => {
    mocks.execute.mockResolvedValue([[{id:507,email:'rachel@example.com'}]]); mocks.append.mockRejectedValue(new Error('audit unavailable')); const next=vi.fn();
    await revokeUserSessions({params:{userId:'507'},body:{confirmUserId:507},user:{id:1},method:'POST',headers:{}},response(),next);
    expect(mocks.connection.rollback).toHaveBeenCalled(); expect(mocks.connection.commit).not.toHaveBeenCalled(); expect(mocks.mirror).not.toHaveBeenCalled(); expect(next).toHaveBeenCalled();
  });
});
