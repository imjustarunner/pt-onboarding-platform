import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), link: vi.fn(), access: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { getLink: mocks.link } }));
vi.mock('../../services/clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: mocks.access }));
import { listClientNotificationHistory } from '../clientNotificationHistory.controller.js';

const response = () => ({ status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), json: vi.fn() });
const request = (overrides = {}) => ({ params: { clientId: '24' }, query: {}, user: { id: 14, role: 'client_guardian' }, ...overrides });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.link.mockResolvedValue({ access_enabled: 1, permissions_json: {} });
  mocks.access.mockResolvedValue({ ok: true });
  mocks.execute.mockResolvedValue([[]]);
});

it('uses one explicit collation across email, SMS, JSON, and in-app history projections', async () => {
  const res = response(), next = vi.fn();
  mocks.execute.mockResolvedValue([[
    { id: 'email-2', channel: 'email', notification_type: 'session_reminder', recipient_address: 'demo@example.com',
      delivery_status: 'sent', occurred_at: '2026-10-20 12:00:00', organization_name: 'Demo agency',
      metadata: { setupToken: 'must-stay-private' }, body: 'must-stay-private' }
  ]]);
  await listClientNotificationHistory(request(), res, next);
  expect(next).not.toHaveBeenCalled();
  const [sql, values] = mocks.execute.mock.calls[0];
  expect(sql.match(/COLLATE utf8mb4_unicode_ci/g)).toHaveLength(30);
  expect(sql).toContain('CONVERT(n.type USING utf8mb4) COLLATE utf8mb4_unicode_ci');
  expect(sql).toContain("CONVERT(CONCAT_WS(' ', u.first_name, u.last_name) USING utf8mb4) COLLATE utf8mb4_unicode_ci");
  expect(sql).toContain("CONVERT(JSON_UNQUOTE(JSON_EXTRACT(ac.metadata_json, '$.recipient')) USING utf8mb4) COLLATE utf8mb4_unicode_ci");
  expect(values).toEqual([24, 24, 24, 24, 24, 24, 24]);
  expect(sql).toContain('guardian_enrollment_reminder');
  expect(sql).toContain('c.agency_id=i.agency_id');
  expect(sql).toContain('d.communication_id=uc.id');
  expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(res.json).toHaveBeenCalledWith({
    notifications: [{ id: 'email-2', channel: 'email', type: 'session_reminder', recipient: 'demo@example.com',
      status: 'sent', occurredAt: '2026-10-20 12:00:00', organization: 'Demo agency' }],
    hasMore: false, nextOffset: 1
  });
});

it.each([null, { access_enabled: 0 }, { access_enabled: 1, permissions_json: { noView: true } },
  { access_enabled: 1, permissions_json: { noViewOtherGuardian: true } }])('does not query history for an unauthorized relationship', async link => {
  mocks.link.mockResolvedValue(link);
  const res = response();
  await listClientNotificationHistory(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it('keeps staff authorization and bounded pagination', async () => {
  const res = response();
  await listClientNotificationHistory(request({ user: { id: 7, role: 'admin' }, query: { offset: '9999999999' } }), res, vi.fn());
  expect(mocks.access).toHaveBeenCalledWith({ userId: 7, role: 'admin', clientId: 24 });
  expect(mocks.execute.mock.calls[0][0]).toMatch(/LIMIT 50 OFFSET 1000000$/);
  expect(res.json).toHaveBeenCalledWith({ notifications: [], hasMore: false, nextOffset: 1000000 });
});
