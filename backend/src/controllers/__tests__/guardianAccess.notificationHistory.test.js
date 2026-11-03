import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), link: vi.fn(), access: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { getLink: mocks.link } }));
vi.mock('../../services/clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: mocks.access }));
vi.mock('../../services/guardianContactSharing.service.js',()=>({guardianContactRows:vi.fn(async()=>[]),sharedHistoryRecipient:vi.fn(value=>value)}));
import { listClientNotificationHistory } from '../clientNotificationHistory.controller.js';
import { maybeEncryptNotePayload } from '../../services/clinicalNoteCrypto.service.js';
import { sharedHistoryRecipient } from '../../services/guardianContactSharing.service.js';

const response = () => ({ status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), json: vi.fn() });
const request = (overrides = {}) => ({ params: { clientId: '24' }, query: {}, user: { id: 14, role: 'client_guardian' }, ...overrides });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.link.mockResolvedValue({ access_enabled: 1, permissions_json: {} });
  mocks.access.mockResolvedValue({ ok: true });
  mocks.execute.mockResolvedValue([[]]);
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 9).toString('base64'));
});
afterEach(() => vi.unstubAllEnvs());

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
  expect(sql.match(/COLLATE utf8mb4_unicode_ci/g)).toHaveLength(35);
  expect(sql).toContain('CONVERT(n.type USING utf8mb4) COLLATE utf8mb4_unicode_ci');
  expect(sql).toContain("CONVERT(CONCAT_WS(' ', u.first_name, u.last_name) USING utf8mb4) COLLATE utf8mb4_unicode_ci");
  expect(sql).toContain('CONVERT(ac.metadata_json USING utf8mb4) COLLATE utf8mb4_unicode_ci');
  expect(sql).not.toContain("'sent')");
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

it('shows an encrypted opt-out audit as skipped and keeps its private content out of shared history', async () => {
  const metadata = { scheduleNotice: true, clientId: 24, deliveryStatus: 'skipped', recipient: '+15555550111',
    body: 'private session details', portalUrl: 'https://private.example/token', reason: 'Current contact permission does not allow this channel.' };
  const envelope = JSON.parse(maybeEncryptNotePayload(JSON.stringify(metadata)));
  mocks.execute.mockResolvedValue([[{ id: 'session-18', channel: 'sms', notification_type: 'other',
    appointment_metadata: envelope, occurred_at: '2026-11-02 18:49:00', organization_name: 'Demo' }]]);
  const res = response(), next = vi.fn();
  await listClientNotificationHistory(request(), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(sharedHistoryRecipient).toHaveBeenCalledWith('+15555550111', 'sms', [], 14);
  expect(res.json).toHaveBeenCalledWith({ notifications: [{ id: 'session-18', channel: 'sms', type: 'session_change',
    recipient: '+15555550111', status: 'skipped', occurredAt: '2026-11-02 18:49:00', organization: 'Demo' }], hasMore: false, nextOffset: 1 });
  const json = JSON.stringify(res.json.mock.calls);
  for (const privateValue of ['private session details', 'private.example', 'ciphertext', 'Current contact permission']) expect(json).not.toContain(privateValue);
});

it.each(['deliveryStatus', 'status'])('reads an explicit legacy %s without guessing a transport result', async field => {
  mocks.execute.mockResolvedValue([[{ id: 'session-19', channel: 'email', notification_type: 'reminder',
    appointment_metadata: JSON.stringify({ [field]: 'sent', recipient: 'parent@example.com' }) }]]);
  const res = response();
  await listClientNotificationHistory(request({ user: { id: 7, role: 'admin' } }), res, vi.fn());
  expect(res.json.mock.calls[0][0].notifications[0]).toMatchObject({ status: 'sent', recipient: 'parent@example.com' });
});

it.each([null, 'not JSON', '{}', '{"deliveryStatus":""}', '{"status":"unexpected"}', '{"_enc":true,"ciphertext":"corrupt"}'])
  ('never treats absent, invalid or unreadable appointment metadata as sent: %s', async metadata => {
    mocks.execute.mockResolvedValue([[{ id: 'session-20', channel: 'sms', notification_type: 'other', appointment_metadata: metadata }]]);
    const res = response(), next = vi.fn();
    await listClientNotificationHistory(request(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].notifications[0]).toMatchObject({ status: 'unknown', recipient: null });
  });

it('does not expose another client’s recipient from a group appointment audit', async () => {
  mocks.execute.mockResolvedValue([[{ id: 'session-21', channel: 'sms', notification_type: 'other',
    appointment_metadata: maybeEncryptNotePayload(JSON.stringify({ clientId: 25, deliveryStatus: 'sent', recipient: '+15555550122' })) }]]);
  const res = response();
  await listClientNotificationHistory(request(), res, vi.fn());
  expect(res.json).toHaveBeenCalledWith({ notifications: [], hasMore: false, nextOffset: 1 });
  expect(sharedHistoryRecipient).not.toHaveBeenCalled();
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
