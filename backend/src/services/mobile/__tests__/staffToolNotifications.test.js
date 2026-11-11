import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../../models/Notification.model.js', () => ({ default: { create: vi.fn() } }));
vi.mock('../../notificationDispatcher.service.js', () => ({ default: { dispatchPushForNotification: vi.fn() } }));
vi.mock('../../agencyAccessProfiles.service.js', () => ({ readAgencyAccess: vi.fn() }));
vi.mock('../../notificationPreferences.service.js', () => ({ isNotificationChannelEnabled: vi.fn() }));
vi.mock('../session.service.js', () => ({ mobileSessions: { access: vi.fn() } }));
vi.mock('../../communicationAccess.service.js', () => ({ requireConversationAccess: vi.fn() }));
vi.mock('../../clientSecureConversation.service.js', () => ({ refreshClientSecureAccess: vi.fn() }));
vi.mock('../../../utils/capabilities.js', () => ({ getUserCapabilities: user => ({ canManageHiring: user.has_hiring_access === true }) }));
vi.mock('../../clientExchangeDemo.service.js', () => ({ isDemoExchangeListing: vi.fn() }));
import { createWebsiteChatNotifications } from '../../websiteChatNotifications.service.js';
import { createMobilePushWorker, mobilePushPayload } from '../push.service.js';

const chatId = '11111111-2222-4333-8444-555555555555';
describe('durable online Live Chat notifications', () => {
  it('queues only available staff with fresh agency support access and includes no transcript or visitor secret', async () => {
    const db = { execute: vi.fn(async sql => {
      if (sql.startsWith('SELECT c.id')) return [[{ id: chatId, agency_id: 450 }]];
      if (sql.startsWith('SELECT DISTINCT')) return [[{ id: 7 }, { id: 8 }]];
      return [[]];
    }) };
    const access = vi.fn(async uid => ({ role: uid === 7 ? 'support' : 'provider' }));
    await createWebsiteChatNotifications({ db, access }).enqueue({ sessionId: chatId, eventKey: 'started' });
    const insert = db.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT IGNORE'));
    expect(insert).toHaveLength(1); expect(insert[0][1]).toEqual([7, 450, chatId, 'started']);
    expect(db.execute.mock.calls.find(([sql]) => sql.startsWith('SELECT DISTINCT'))[0]).toContain('last_heartbeat_at');
  });
  it('reuses an existing notification after an interrupted delivery and enqueues native push once', async () => {
    const event = { id: 10, user_id: 7, agency_id: 450, session_id: chatId };
    const prior = { id: 60, user_id: 7, agency_id: 450, type: 'website_chat_waiting' };
    const db = { execute: vi.fn(async sql => {
      if (sql.startsWith('SELECT * FROM public_website_chat_notification_events')) return [[event]];
      if (sql.startsWith('UPDATE public_website_chat_notification_events SET locked_until')) return [{ affectedRows: 1 }];
      if (sql.startsWith('SELECT 1 FROM public_website_chat_staff')) return [[{}]];
      if (sql.startsWith('SELECT * FROM notifications')) return [[prior]];
      return [{ affectedRows: 1 }];
    }) };
    const create = vi.fn(), dispatch = vi.fn();
    await createWebsiteChatNotifications({ db, access: async () => ({ role: 'support' }), create, dispatch, channelEnabled: async () => true }).drain();
    expect(create).not.toHaveBeenCalled(); expect(dispatch).toHaveBeenCalledWith(prior);
    const insert = db.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT IGNORE INTO mobile_push_deliveries'));
    expect(insert[0]).toContain("'notification'"); expect(insert[1]).toEqual([60, 60, 7]);
    expect(JSON.stringify(db.execute.mock.calls)).not.toContain('Visitor narrative');
  });
  it('does not alert staff after explicit offline or loss of support role', async () => {
    const event = { id: 10, user_id: 7, agency_id: 450, session_id: chatId }, create = vi.fn();
    const db = { execute: vi.fn(async sql => sql.startsWith('SELECT * FROM public_website_chat_notification_events') ? [[event]]
      : sql.startsWith('UPDATE public_website_chat_notification_events SET locked_until') ? [{ affectedRows: 1 }] : [[]]) };
    await createWebsiteChatNotifications({ db, access: async () => ({ role: 'support' }), create }).drain();
    expect(create).not.toHaveBeenCalled(); expect(db.execute.mock.calls.some(([, params]) => params?.includes('offline_or_access_changed'))).toBe(true);
  });
});

describe('native notification scope and new-event cursor', () => {
  let row, db, deps, context;
  beforeEach(() => {
    row = { id: 60, user_id: 7, agency_id: 450, type: 'website_chat_waiting' };
    context = { surface: 'staff', user: { id: 7, role: 'support' }, device: { id: 4, user_id: 7, agency_id: 450 }, agencies: [{ id: 450 }] };
    db = { execute: vi.fn(async sql => sql.startsWith('SELECT n.*') ? [[row]] : sql.startsWith('SELECT 1 FROM public_website_chat_staff') ? [[{}]] : [[]]) };
    deps = { db, sessions: { access: async () => context }, agencyAccess: async () => ({ role: 'support', permissions: { has_hiring_access: true } }), channelEnabled: async () => true, demoListing: async () => false };
  });
  it('checks personal ownership in SQL, current role and online state before allowing a Live Chat push', async () => {
    expect(await createMobilePushWorker(deps).permitted(context.device, 'notification', 60)).toBe(60);
    const query = db.execute.mock.calls.find(([sql]) => sql.startsWith('SELECT n.*')); expect(query[0]).toContain('n.user_id=?'); expect(query[0]).toContain('r.dismissed_at IS NULL');
    deps.agencyAccess = async () => ({ role: 'provider', permissions: {} }); expect(await createMobilePushWorker(deps).permitted(context.device, 'notification', 60)).toBeNull();
  });
  it('opens an already received Live Chat update while offline without resuming delivery or bypassing current authority', async () => {
    db.execute.mockImplementation(async sql => sql.startsWith('SELECT n.*') ? [[row]] : [[]]);
    const enabled = vi.fn(async ({ channel }) => ['push','inApp'].includes(channel)); deps.channelEnabled = enabled;
    const worker = createMobilePushWorker(deps);
    expect(await worker.permitted(context.device, 'notification', 60)).toBeNull();
    expect(await worker.permitted(context.device, 'notification', 60, context, { forDelivery: false })).toBe(60);
    expect(enabled).toHaveBeenLastCalledWith(expect.objectContaining({ channel: 'inApp' }));
    deps.agencyAccess = async () => null;
    expect(await createMobilePushWorker(deps).permitted(context.device, 'notification', 60, context, { forDelivery: false })).toBeNull();
  });
  it('rejects family, removed agency, disabled preferences, or lost hiring permission', async () => {
    context.surface = 'family'; expect(await createMobilePushWorker(deps).permitted(context.device, 'notification', 60)).toBeNull(); context.surface = 'staff';
    context.qaAgencyIds = [451]; expect(await createMobilePushWorker(deps).permitted(context.device, 'notification', 60)).toBeNull(); context.qaAgencyIds = null;
    deps.channelEnabled = async () => false; expect(await createMobilePushWorker(deps).permitted(context.device, 'notification', 60)).toBeNull();
    deps.channelEnabled = async () => true; row.type = 'new_job_application_submitted'; deps.agencyAccess = async () => ({ role: 'staff', permissions: { has_hiring_access: false } });
    expect(await createMobilePushWorker(deps).permitted(context.device, 'notification', 60)).toBeNull();
  });
  it('baselines old devices at the high-water mark instead of replaying historical notifications', async () => {
    await createMobilePushWorker(deps).scan(context.device);
    expect(db.execute.mock.calls.some(([sql]) => sql.includes('SET notification_cursor=(SELECT COALESCE(MAX(id),0)'))).toBe(true);
    expect(db.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT IGNORE INTO mobile_push_deliveries'))).toBe(false);
  });
  it('sends an opaque generic update and routes through the authorized notification resolver', () => {
    const payload = mobilePushPayload({ source_kind: 'notification', source_id: 60, subject: 'PRIVATE CLIENT', body: 'SECRET' });
    expect(payload.url).toBe('/mobile/workspace?kind=notification&id=60'); expect(JSON.stringify(payload)).not.toMatch(/PRIVATE|SECRET/);
  });
});
