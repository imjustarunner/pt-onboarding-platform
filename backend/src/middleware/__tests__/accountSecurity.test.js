vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(() => { throw new Error('Unexpected database access in unit test'); }), getConnection: vi.fn(() => { throw new Error('Unexpected database access in unit test'); }) } }));
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../services/accountSecurity.service.js', () => ({ accountSecurityState: vi.fn() }));
import { accountSecurityState } from '../../services/accountSecurity.service.js';
import { enforceAccountSecurity, accountSecurityRouteKind } from '../accountSecurity.middleware.js';
function fixture(path) { const req = { method: 'GET', originalUrl: path, user: { id: 1 } }; const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }; return { req, res, next: vi.fn() }; }
describe('server-side MFA access boundary', () => {
  it('allows only the signed-in user’s security/settings paths without verification', () => {
    expect(accountSecurityRouteKind(fixture('/api/users/1/preferences').req)).toBe('account');
    expect(accountSecurityRouteKind(fixture('/api/users/2/preferences').req)).toBe('protected');
    expect(accountSecurityRouteKind(fixture('/api/account-security/sessions').req)).toBe('account');
  });
  it('blocks direct clinical document, export and unknown API requests when a factor is only enrolled', async () => {
    accountSecurityState.mockResolvedValue({ required: true, enabled: true, verified: false });
    for (const path of ['/api/phi-documents/7/download', '/api/clients/7', '/api/clients/export', '/api/new-sensitive-feature']) {
      const { req,res,next } = fixture(path); await enforceAccountSecurity(req,res,next);
      expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled(); expect(res.json.mock.calls[0][0].error.code).toBe('MFA_REQUIRED');
    }
  });
  it('sanitizes the limited roster on the server and cannot be bypassed with query parameters', async () => {
    accountSecurityState.mockResolvedValue({ required: true, enabled: false, verified: false });
    const {req,res,next}=fixture('/api/school-portal/8/clients?showFullNames=true'); const json=res.json;
    await enforceAccountSecurity(req,res,next); res.json([{id:8,initials:'AB',full_name:'Private Name',search_terms:'Private Name'}]);
    expect(next).toHaveBeenCalled(); expect(JSON.stringify(json.mock.calls)).not.toContain('Private Name');
  });
  it('allows optional users, including enrolled users and Google SSO, without an app code or roster redaction', async () => {
    for (const enabled of [false,true]) {
      accountSecurityState.mockResolvedValue({required:false,enabled,verified:false});
      for(const path of ['/api/clients/7','/api/school-portal/8/clients?showFullNames=true']) {
        const {req,res,next}=fixture(path);req.authClaims={authMethod:'google'};
        const json=res.json;await enforceAccountSecurity(req,res,next);
        expect(next).toHaveBeenCalledWith();expect(res.status).not.toHaveBeenCalled();expect(res.json).toBe(json);
      }
    }
  });
  it('fails closed when verification storage cannot be read', async () => {
    const error=new Error('database unavailable'); accountSecurityState.mockRejectedValue(error);
    const {req,res,next}=fixture('/api/clients/8'); await enforceAccountSecurity(req,res,next);
    expect(next).toHaveBeenCalledWith(error); expect(res.json).not.toHaveBeenCalled();
  });
});
