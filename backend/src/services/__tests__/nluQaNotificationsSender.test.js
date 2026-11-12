import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ execute: vi.fn(), find: vi.fn(), create: vi.fn(), update: vi.fn(), routes: vi.fn(), send: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: {
  findByAgencyAndIdentityKey: m.find, create: m.create, update: m.update, replaceInboundRoutes: m.routes
} }));
vi.mock('../../models/CommunicationInbox.model.js', () => ({ default: {} }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
import { ensureTenantNotificationsMailbox } from '../tenantMessageMailboxes.service.js';
import { sendClientPortalEmail } from '../clientPortalEmail.service.js';

let agency, source, qaIdentity, inboundOwner;
beforeEach(() => {
  vi.clearAllMocks();
  agency = { id: 453, slug: 'nlu-qa-demo', is_active: 1, feature_flags: { qaSandbox: { syntheticOnly: true, program: 'tutoring', sourceAgencyId: 6 } } };
  source = Object.freeze({ id: 52, agency_id: 6, identity_key: 'notifications', from_email: 'Notifications@nextleveluplcc.com',
    display_name: 'Next Level Up Notifications', reply_to: 'PO@nextleveluplcc.com', is_active: 1 });
  qaIdentity = null;
  inboundOwner = 52;
  m.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT id,slug')) return [[agency]];
    throw new Error('Unexpected database mutation or read');
  });
  m.find.mockImplementation(async id => Number(id) === 6 ? source : qaIdentity);
  m.create.mockImplementation(async values => {
    if (values.inboundAddresses?.length) inboundOwner = 99;
    qaIdentity = { id: 99, agency_id: Number(values.agencyId), identity_key: values.identityKey, is_active: 1,
      from_email: values.fromEmail, reply_to: values.replyTo, display_name: values.displayName };
    return qaIdentity;
  });
  m.update.mockImplementation(async (id, values) => {
    if (values.inboundAddresses?.length) inboundOwner = id;
    qaIdentity = { ...qaIdentity, from_email: values.fromEmail, reply_to: values.replyTo, display_name: values.displayName };
    return qaIdentity;
  });
  m.routes.mockImplementation(async id => { inboundOwner = id; });
  m.send.mockResolvedValue({ id: 'accepted-test-message', redirected: true });
});

it.each([[453, 'nlu-qa-demo'], [454, 'nlu-qa-learning']])('reuses NLU notifications for exact QA %s without taking its inbound route', async (id, slug) => {
  agency = { ...agency, id, slug };
  const result = await ensureTenantNotificationsMailbox(id);
  expect(result).toMatchObject({ domain: 'nextleveluplcc.com', notifications: { id: 99, agency_id: id,
    from_email: source.from_email, reply_to: source.reply_to, qaSenderSource: { agencyId: 6, identityId: 52, identityKey: 'notifications' } } });
  expect(m.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ agencyId: id, identityKey: 'notifications',
    fromEmail: source.from_email, replyTo: source.reply_to, inboundAddresses: [] }));
  expect(m.routes).not.toHaveBeenCalled();
  expect(inboundOwner).toBe(52);
  expect(source.agency_id).toBe(6);
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});

it('reuses the QA identity on repeated resolution, retaining source ownership', async () => {
  await ensureTenantNotificationsMailbox(453);
  await ensureTenantNotificationsMailbox(453);
  expect(m.create).toHaveBeenCalledTimes(1);
  expect(m.update).not.toHaveBeenCalled();
  expect(m.routes).not.toHaveBeenCalled();
  expect(inboundOwner).toBe(52);
});

it('updates only QA sender headers without changing any inbound route', async () => {
  qaIdentity = { id: 99, agency_id: 453, is_active: 1, from_email: 'old@example.com', reply_to: 'old@example.com' };
  await ensureTenantNotificationsMailbox(453);
  expect(m.update).toHaveBeenCalledExactlyOnceWith(99, { displayName: source.display_name, fromEmail: source.from_email, replyTo: source.reply_to });
  expect(m.create).not.toHaveBeenCalled();
  expect(m.routes).not.toHaveBeenCalled();
  expect(inboundOwner).toBe(52);
});

it.each([null, { is_active: 0 }, { agency_id: 99 }, { from_email: 'notifications@elsewhere.example' }, { reply_to: 'someone@elsewhere.example' }])('keeps missing or invalid source readiness actionable: %j', async override => {
  source = override === null ? null : { ...source, ...override };
  await expect(ensureTenantNotificationsMailbox(453)).rejects.toMatchObject({ code: 'NLU_QA_NOTIFICATIONS_SENDER_NOT_READY', status: 503 });
  expect(m.create).not.toHaveBeenCalled();
  expect(m.update).not.toHaveBeenCalled();
  expect(m.routes).not.toHaveBeenCalled();
  expect(m.send).not.toHaveBeenCalled();
  expect(inboundOwner).toBe(52);
});

it('preserves an explicitly disabled QA sender', async () => {
  qaIdentity = { id: 99, agency_id: 453, is_active: 0 };
  await expect(ensureTenantNotificationsMailbox(453)).rejects.toMatchObject({ code: 'NLU_QA_NOTIFICATIONS_SENDER_NOT_READY' });
  expect(m.create).not.toHaveBeenCalled();
  expect(m.update).not.toHaveBeenCalled();
  expect(m.routes).not.toHaveBeenCalled();
});

it('does not allow a domain override to redirect the approved QA sender', async () => {
  await expect(ensureTenantNotificationsMailbox(453, 'another.example')).rejects.toMatchObject({ code: 'NLU_QA_NOTIFICATIONS_SENDER_NOT_READY' });
  expect(m.create).not.toHaveBeenCalled();
});

it.each([{ slug: 'other' }, { is_active: 0 }, { is_archived: 1 },
  { feature_flags: { qaSandbox: { syntheticOnly: true, program: 'tutoring', sourceAgencyId: 99 } } },
  { feature_flags: { qaSandbox: { syntheticOnly: false, program: 'tutoring', sourceAgencyId: 6 } } }])('fails closed when the retained QA policy does not match: %j', async override => {
  agency = { ...agency, ...override };
  await expect(ensureTenantNotificationsMailbox(453)).rejects.toMatchObject({ code: 'NLU_QA_NOTIFICATIONS_SENDER_NOT_READY' });
  expect(m.find).not.toHaveBeenCalled();
  expect(m.create).not.toHaveBeenCalled();
  expect(m.update).not.toHaveBeenCalled();
  expect(m.routes).not.toHaveBeenCalled();
  expect(inboundOwner).toBe(52);
});

it('preserves ordinary tenant notifications behavior instead of granting a similarly named tenant the QA source', async () => {
  qaIdentity = { id: 80, agency_id: 999, from_email: 'notifications@ordinary.example', is_active: 1 };
  const result = await ensureTenantNotificationsMailbox(999, 'ordinary.example');
  expect(result.notifications).toBe(qaIdentity);
  expect(m.find).not.toHaveBeenCalledWith(6, 'notifications');
  expect(m.routes).toHaveBeenCalledExactlyOnceWith(80, ['notifications@ordinary.example']);
  expect(m.execute).not.toHaveBeenCalled();
});

const message = () => ({ agencyId: 453, clientId: 2545, to: 'qa.nlu.parent@example.com', userId: 1759,
  subject: 'Portal invitation', text: 'Set up your account', templateType: 'hub_portal_invite',
  context: { tenant: { id: 453, name: 'NLU QA' }, clinical: false,
    brand: { clinical: false, name: 'NLU QA', displayName: 'NLU QA Portal', replyTo: 'support@nextleveluplcc.com', products: [] } } });

it('sends the normal client portal invitation through the real guarded transport with actual NLU headers and source trace', async () => {
  const result = await sendClientPortalEmail(message());
  expect(m.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ senderIdentityId: 99, userId: 1759,
    clientId: 2545, to: 'qa.nlu.parent@example.com', templateType: 'hub_portal_invite',
    replyToOverride: 'PO@nextleveluplcc.com', usedFallbackSender: false,
    portalEmailBrand: expect.objectContaining({ replyTo: 'PO@nextleveluplcc.com' }), html: expect.stringContaining('NLU QA') }));
  expect(result).toMatchObject({ id: 'accepted-test-message', redirected: true,
    qaSenderSource: { agencyId: 6, identityId: 52, identityKey: 'notifications' } });
  expect(m.routes).not.toHaveBeenCalled();
  expect(inboundOwner).toBe(52);
});

it('propagates transport sender-verification failure without claiming a successful invitation', async () => {
  m.send.mockRejectedValue(Object.assign(new Error('Sender not verified'), { code: 'EMAIL_SENDER_UNVERIFIED' }));
  await expect(sendClientPortalEmail(message())).rejects.toMatchObject({ code: 'EMAIL_SENDER_UNVERIFIED' });
  expect(m.routes).not.toHaveBeenCalled();
  expect(inboundOwner).toBe(52);
});
