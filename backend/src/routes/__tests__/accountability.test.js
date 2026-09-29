import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), send: vi.fn(), read: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => m } }));
vi.mock('../../middleware/auth.middleware.js', () => ({ authenticate: (_req, _res, next) => next() }));
vi.mock('../../services/storage.service.js', () => ({ default: { readObject: m.read } }));
vi.mock('../../services/email.service.js', () => ({ default: { sendEmail: m.send } }));
vi.mock('../../services/emailSenderIdentityResolver.service.js', () => ({ resolveSenderIdentityForSend: async () => ({ identity: null }) }));
import router from '../accountability.routes.js';
const settings = { recipient: 'melissa@plottwistco.com', officeAddress: 'Office', policy: 'Plan', attestation: 'Certify', mileageRate: 0.7, categories: [{ key: 'phone', label: 'Phone', percent: 50 }] };
let grant, membership, row, actor;
async function request(path, method = 'get', body = {}, params = {}) {
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
  const req = { params: { agencyId: '2', reportId: '7', userId: '507', ...params }, user: actor, body };
  const res = { json: vi.fn(), set: vi.fn().mockReturnThis(), send: vi.fn() }; const next = vi.fn();
  await route.stack.at(-1).handle(req, res, next); return { res, next };
}
beforeEach(() => {
  vi.clearAllMocks(); actor = { id: 507, role: 'provider' }; grant = { enabled: 1, settings_json: settings }; membership = { has_payroll_access: 0 };
  row = { id: 7, agency_id: 2, user_id: 507, report_month: '2026-09', version: 3, status: 'draft', data_json: { expenses: [], mileage: [] }, snapshot_json: { settings, agencyName: 'ITSCO', userName: 'Participant', month: '2026-09' }, pdf_key: 'private-key' };
  m.read.mockResolvedValue(Buffer.from('PDF')); m.send.mockResolvedValue({ id: 'message-1' });
  m.execute.mockImplementation(async (sql) => {
    if (sql.includes('SELECT id, name FROM agencies')) return [[{ id: 2, name: 'ITSCO' }]];
    if (sql.includes('SELECT has_payroll_access')) return [membership ? [membership] : []];
    if (sql.includes('SELECT * FROM accountability_grants')) return [grant ? [grant] : []];
    if (sql.includes('SELECT * FROM accountability_reports')) return [row ? [row] : []];
    if (sql.includes('SELECT first_name,last_name')) return [[{ first_name: 'Rachel', last_name: 'Finch' }]];
    if (sql.includes('SELECT * FROM accountability_receipts')) return [[]];
    return [{ affectedRows: 1 }];
  });
});
describe('accountability authorization and submission', () => {
  it('rejects all other accounts, including other super admins and duplicate personal accounts', async () => {
    for (const id of [123, 999, 1000]) {
      actor = { id, role: 'super_admin' };
      const { next } = await request('/:agencyId/access');
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    }
    expect(m.execute).not.toHaveBeenCalled();
  });
  it('rejects granting permission to a fourth account or to Michael for PlotTwistCo reports', async () => {
    actor = { id: 501, role: 'super_admin' };
    for (const params of [{ userId: '999' }, { userId: '501', agencyId: '1' }]) {
      const { next } = await request('/:agencyId/settings/:userId', 'put', { enabled: true, settings }, params);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    }
    expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  });
  it('allows all three work accounts for ITSCO and only Melissa as a PlotTwistCo participant', async () => {
    for (const id of [501, 507, 538]) {
      actor = { id, role: 'provider' };
      const itsco = await request('/:agencyId/access');
      expect(itsco.res.json).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
      const plot = await request('/:agencyId/access', 'get', {}, { agencyId: '1' });
      expect(plot.res.json).toHaveBeenCalledWith(expect.objectContaining({ enabled: id === 538 }));
    }
  });
  it('keeps printed drafts editable and never signs or emails while generating a working copy', async () => {
    row.pdf_key = null;
    const printed = await request('/:agencyId/reports/:reportId/pdf');
    expect(printed.next).not.toHaveBeenCalled();
    expect(printed.res.send.mock.calls[0][0].subarray(0, 5).toString()).toBe('%PDF-');
    expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(m.send).not.toHaveBeenCalled();
    const edited = await request('/:agencyId/reports/:reportId', 'put', { version: 3, data: { expenses: [], mileage: [{ id: 'trip', date: '', start: '', end: '', purpose: '', miles: '', notes: '' }] } });
    expect(edited.next).not.toHaveBeenCalled();
    expect(edited.res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', version: 4 }));
  });
  it('denies unrelated organization membership', async () => {
    membership = null; const { next } = await request('/:agencyId/access'); expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });
  it('does not grant access by name or general membership', async () => {
    grant = null; const { res } = await request('/:agencyId/access'); expect(res.json).toHaveBeenCalledWith({ enabled: false, manager: false, settings: null });
    const { next } = await request('/:agencyId/reports'); expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });
  it('prevents participants from changing their own parameters', async () => {
    const { next } = await request('/:agencyId/settings/:userId', 'put', { enabled: true, settings }); expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });
  it('scopes report reads to both organization and signed-in account', async () => {
    row = null; const { next } = await request('/:agencyId/reports/:reportId/pdf');
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('id = ? AND agency_id = ? AND user_id = ?'), [7, 2, 507]); expect(m.read).not.toHaveBeenCalled();
  });
  it('rejects revoked grants even for an existing report', async () => {
    grant.enabled = 0; const { next } = await request('/:agencyId/reports/:reportId/pdf'); expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });
  it('locks signed reports and rejects stale draft versions', async () => {
    for (const state of [{ status: 'signed', version: 3 }, { status: 'draft', version: 4 }]) {
      Object.assign(row, state); const { next } = await request('/:agencyId/reports/:reportId', 'put', { version: 3, data: row.data_json }); expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
    }
    expect(m.rollback).toHaveBeenCalledTimes(2); expect(m.commit).not.toHaveBeenCalled();
  });
  it('requires review of changed parameters before signing', async () => {
    const { next } = await request('/:agencyId/reports/:reportId/sign', 'post', { version: 3, settings: { ...settings, mileageRate: 1 }, attested: true });
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
  });
  it('reports failed, queued, redirected and unknown email outcomes honestly', async () => {
    row.status = 'signed';
    for (const [result, status] of [[{ skipped: true }, 'failed'], [{ blocked: true }, 'failed'], [{ queued: true }, 'queued'], [{ redirected: true }, 'redirected'], [{ id: 'mail' }, 'sent']]) {
      m.send.mockResolvedValueOnce(result); const { res, next } = await request('/:agencyId/reports/:reportId/send', 'post'); expect(next).not.toHaveBeenCalled(); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ deliveryStatus: status }));
    }
    m.send.mockRejectedValueOnce(new Error('timeout')); const { res } = await request('/:agencyId/reports/:reportId/send', 'post'); expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ deliveryStatus: 'unknown' }));
    expect(m.send.mock.calls[0][0]).toMatchObject({ to: 'melissa@plottwistco.com', attachments: [{ filename: 'accountability-2026-09.pdf', contentType: 'application/pdf', contentBase64: Buffer.from('PDF').toString('base64') }] });
  });
  it('does not send another email if a concurrent request already claimed delivery', async () => {
    row.status = 'signed'; const original = m.execute.getMockImplementation();
    m.execute.mockImplementation((sql, params) => sql.includes("SET delivery_status='sending'") ? [{ affectedRows: 0 }] : original(sql, params));
    const { next } = await request('/:agencyId/reports/:reportId/send', 'post'); expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 })); expect(m.send).not.toHaveBeenCalled();
  });
});
