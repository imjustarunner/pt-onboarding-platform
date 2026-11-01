import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../models/UserActivityLog.model.js', () => ({ default: { getAgencyActivityLog: vi.fn(), countAgencyActivityLog: vi.fn() } }));
vi.mock('../../models/AdminAuditLog.model.js', () => ({ default: { getAgencyAuditLogPaged: vi.fn(), countAgencyAuditLog: vi.fn() } }));
vi.mock('../../services/auditEvent.service.js', () => ({ logAuditEvent: vi.fn() }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Activity from '../../models/UserActivityLog.model.js';
import Admin from '../../models/AdminAuditLog.model.js';
import { logAuditEvent } from '../../services/auditEvent.service.js';
import { getAgencyActivityLog, exportAgencyActivityLogCsv, getAgencyPlatformSessions, getAgencyActivityData, getUserActivityLog } from '../activityLog.controller.js';

const request = (role = 'support', query = {}, agencyId = '450') => ({ user: { id: 1434, role }, params: { agencyId, userId: '1439' }, query: { source: 'user_activity', ...query }, headers: {} });
const response = () => ({ status: vi.fn().mockReturnThis(), setHeader: vi.fn(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() });
const event = { id: 17, agency_id: 450, created_at: '2026-11-01T20:00:00Z', user_id: 1439, user_first_name: 'Alex', user_last_name: 'QA', user_email: 'private@example.test', ip_address: '192.0.2.1', session_id: 'private-session', action_type: 'clinical_note_viewed', client_full_name: 'Private Client', metadata: { clientId: 2297, noteId: 444, clinicalSessionId: 167, body: 'CONFIDENTIAL NOTE', password: 'SECRET' } };
beforeEach(() => {
  vi.clearAllMocks(); User.getAgencies.mockResolvedValue([{ id: 450 }]);
  Activity.getAgencyActivityLog.mockResolvedValue([event]); Activity.countAgencyActivityLog.mockResolvedValue(1);
  Admin.getAgencyAuditLogPaged.mockResolvedValue([{ ...event, user_id: undefined, actor_user_id: 4, actor_first_name: 'Administrator', action_type: 'supervisor_privileges_toggled', metadata: { targetUserId: 1439, privilegedPolicy: 'SECRET' } }]);
  Admin.countAgencyAuditLog.mockResolvedValue(1); pool.execute.mockResolvedValue([[]]);
});

describe('support audit review boundary', () => {
  it('returns operational IDs with an explicit clinical access requirement, and audits the review', async () => {
    const res = response(), next = vi.fn(); await getAgencyActivityLog(request('support', { clientId: '2297' }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(Activity.getAgencyActivityLog).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 450, clientId: 2297, supportView: true }));
    const result = res.json.mock.calls[0][0];
    expect(result.reviewerScope).toBe('support_metadata');
    expect(result.items[0]).toMatchObject({ user_id: 1439, target_label: 'Note #444', link_access: 'clinical_access_required', link_path: null, metadata: { clientId: 2297, noteId: 444 } });
    expect(JSON.stringify(result)).not.toMatch(/CONFIDENTIAL|SECRET|private@example|192\.0\.2|private-session|Private Client/);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actionType: 'audit_log_viewed', agencyId: 450 }));
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('retains administrator action rows, while redacting their privileged payloads', async () => {
    const res = response(); await getAgencyActivityLog(request('support', { source: 'admin_action' }), res, vi.fn());
    expect(res.json.mock.calls[0][0].items[0]).toMatchObject({ action_type: 'supervisor_privileges_toggled', user_id: 4, metadata: { targetUserId: 1439 }, link_path: null });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('privilegedPolicy');
  });
  it.each(['support', 'admin'])('denies %s access to another agency', async (role) => {
    const res = response(); await getAgencyActivityLog(request(role, {}, '999'), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403); expect(Activity.getAgencyActivityLog).not.toHaveBeenCalled();
  });
  it.each(['provider', 'school_staff', 'client_guardian'])('does not give %s an audit-review role', async (role) => {
    const res = response(); await getAgencyActivityLog(request(role), res, vi.fn()); expect(res.status).toHaveBeenCalledWith(403);
  });
  it('preserves full administrator evidence and direct note references without bypassing the note route', async () => {
    const res = response(); await getAgencyActivityLog(request('admin'), res, vi.fn());
    expect(res.json.mock.calls[0][0].items[0]).toMatchObject({ metadata: event.metadata, link_path: '/admin/clinical-note-generator?noteId=444&clientId=2297&agencyId=450' });
  });
  it('denies support platform-session and surveillance reports', async () => {
    for (const handler of [getAgencyPlatformSessions, getAgencyActivityData]) { const res = response(); await handler(request(), res, vi.fn()); expect(res.status).toHaveBeenCalledWith(403); }
  });
  it('requires and enforces agency scope on the legacy user endpoint', async () => {
    const res = response(); await getUserActivityLog(request(), res, vi.fn()); expect(res.status).toHaveBeenCalledWith(400);
    const scoped = response(); await getUserActivityLog(request('support', { agencyId: '450' }), scoped, vi.fn());
    expect(Activity.getAgencyActivityLog).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 450, userId: 1439, supportView: true }));
    expect(JSON.stringify(scoped.json.mock.calls)).not.toContain('CONFIDENTIAL');
  });
  it('exports the same restricted view and identifies clinical targets instead of exporting their bodies', async () => {
    const res = response(); await exportAgencyActivityLogCsv(request(), res, vi.fn());
    const csv = res.send.mock.calls[0][0];
    expect(csv).toContain('Note #444'); expect(csv).toContain('clinical_access_required'); expect(csv).not.toMatch(/CONFIDENTIAL|SECRET|private@example|192\.0\.2|Private Client/);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actionType: 'audit_log_exported', agencyId: 450 }));
  });
  it('refuses to publish a complete-looking CSV when a source is unavailable', async () => {
    pool.execute.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' }));
    const res = response(); await exportAgencyActivityLogCsv(request('support', { source: 'client_access' }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(503); expect(res.send).not.toHaveBeenCalled();
  });
  it('honors ascending combined order and fetches enough per source for later pages', async () => {
    Activity.getAgencyActivityLog.mockResolvedValue([{ ...event, created_at: '2026-11-02T00:00:00Z' }]);
    const res = response(); await getAgencyActivityLog(request('admin', { source: 'all', sortOrder: 'ASC', offset: '0', limit: '2' }), res, vi.fn());
    expect(res.json.mock.calls[0][0].items.map((row) => row.created_at)).toEqual(['2026-11-01T20:00:00Z', '2026-11-02T00:00:00Z']);
    expect(Activity.getAgencyActivityLog).toHaveBeenCalledWith(expect.objectContaining({ expandedReview: true }));
  });
});
