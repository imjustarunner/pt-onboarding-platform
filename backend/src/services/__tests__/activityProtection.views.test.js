import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ append: vi.fn(), getConnection: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: mocks.getConnection } }));
vi.mock('../securityEvidence.service.js', () => ({ appendSecurityEvidence: mocks.append, mirrorSecurityEvidence: vi.fn() }));
import { authorizeProtectedActivity, protectStorageResource } from '../activityProtection.service.js';
import { evidenceRequestContext } from '../../utils/evidenceRequestContext.js';
import { hasUnlimitedFileViews, isClientFileView } from '../../utils/fileAccessPolicy.js';
import { responseEvidence } from '../../utils/securityEvidence.js';

const request = (role = 'admin', originalUrl = '/api/phi-documents/1/view') => ({
  user: { id: 1, role, sessionId: 'session-1' }, authClaims: { authMethod: 'google' },
  method: 'GET', originalUrl, headers: {}, socket: { remoteAddress: '192.0.2.1' }
});
const view = req => authorizeProtectedActivity(req, { kind: 'client_file', resource: req.originalUrl });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getConnection.mockRejectedValue(new Error('Limited activity reached reservation boundary'));
});
describe('audited staff document viewing', () => {
  it.each(['admin', 'support', 'super_admin'])('logs more than 25 views for %s without reserving download allowance', async role => {
    for (let id = 1; id <= 30; id++) await view(request(role, `/api/phi-documents/${id}/view`));
    expect(mocks.append).toHaveBeenCalledTimes(30);
    expect(mocks.append).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1, role, action: 'file_view_requested', details: expect.objectContaining({ fileAccessIntent: 'view' })
    }));
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
  it('audits every storage object in a viewed packet without triggering the bundle download rule', async () => {
    await evidenceRequestContext.run(request(), async () => {
      await protectStorageResource('intake_signed/bundle/one.pdf');
      await protectStorageResource('intake_signed/bundle/two.pdf');
    });
    expect(mocks.append).toHaveBeenCalledTimes(2);
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });
  it('refuses to serve a view when its durable audit cannot be recorded', async () => {
    mocks.append.mockRejectedValue(new Error('Audit unavailable'));
    await expect(view(request())).rejects.toThrow('Audit unavailable');
  });
  it.each(['provider', 'school_staff', 'staff', 'agency_admin'])('preserves existing limits for %s', async role => {
    await expect(view(request(role))).rejects.toThrow('reservation boundary');
  });
  it('does not exempt switched accounts or let effective roles grant an exemption', () => {
    expect(hasUnlimitedFileViews({ user: { id: 2, role: 'admin', switchedFromUserId: 1 } })).toBe(false);
    expect(hasUnlimitedFileViews({ user: { id: 2, role: 'provider', effectiveRole: 'admin' } })).toBe(false);
  });
  it.each([
    '/api/phi-documents/1/download', '/api/medical-billing/reports/export.csv',
    '/api/clients/1/pdf', '/api/clients/bundle.zip', '/uploads/intake_signed/a.pdf',
    '/api/phi-documents/1/view?download=true', '/api/phi-documents/1/view?attachment=1',
    '/api/account-security/print-intent'
  ])('keeps download/print reservation controls on %s', async url => {
    await expect(view(request('admin', url))).rejects.toThrow('reservation boundary');
  });
  it.each(['/api/phi-documents/12/view?theme=dark', '/api/phi-documents/signed-school-packets/3', '/api/phi-documents/clients/1/chart-artifacts/clinical-summary/view'])('recognizes established view endpoint %s', url => {
    expect(isClientFileView(request('admin', url))).toBe(true);
    expect(isClientFileView({ ...request('admin', url), method: 'POST' })).toBe(false);
    expect(responseEvidence(request('admin', url), { statusCode: 200 })).toMatchObject({ fileAccessIntent: 'view' });
  });
  it('keeps email reservations even when initiated while viewing a document', async () => {
    await expect(authorizeProtectedActivity(request(), { kind: 'email', resource: 'email' })).rejects.toThrow('reservation boundary');
  });
});
