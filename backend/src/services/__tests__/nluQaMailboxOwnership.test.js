import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ execute: vi.fn(), agency: vi.fn(), user: vi.fn(), memberships: vi.fn(), find: vi.fn(),
  findId: vi.fn(), create: vi.fn(), update: vi.fn(), routes: vi.fn(), ensureInboxes: vi.fn(), inbox: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: m.agency } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: m.user, getAgencies: m.memberships } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: {
  findByAgencyAndIdentityKey: m.find, findById: m.findId, create: m.create, update: m.update, replaceInboundRoutes: m.routes
} }));
vi.mock('../../models/CommunicationInbox.model.js', () => ({ default: { ensureFromSenderIdentities: m.ensureInboxes, findById: m.inbox } }));
import { ensureTenantMessageMailboxes, listMessageAliasesForAgency, resolveMessagesSendMailbox } from '../tenantMessageMailboxes.service.js';
import { ensureStaffTenantSendAlias, ensurePersonalMailbox, ensurePersonalMailboxForAddress } from '../personalMailbox.service.js';

let agency, sources, identities, boxes, personal, owner, foreign, inboundOwners;
beforeEach(() => {
  vi.clearAllMocks();
  agency = { id: 453, slug: 'nlu-qa-demo', name: 'NLU QA', is_active: 1,
    feature_flags: { qaSandbox: { syntheticOnly: true, program: 'tutoring', sourceAgencyId: 6 } } };
  sources = new Map(); identities = new Map(); boxes = new Map(); inboundOwners = new Map();
  for (const [index, key, local] of [[0, 'messages', 'messages'], [1, 'secure_message', 'securemessage'], [2, 'noreply', 'noreply'], [3, 'notifications', 'notifications']]) {
    const source = Object.freeze({ id: 50 + index, agency_id: 6, identity_key: key, from_email: `${local}@nextleveluplcc.com`,
      reply_to: 'PO@nextleveluplcc.com', display_name: key, is_active: 1 });
    sources.set(key, source);
    identities.set(key, { ...source, id: 200 + index, agency_id: 453 });
    boxes.set(200 + index, { id: 1000 + index, agency_id: 453, sender_identity_id: 200 + index,
      kind: 'shared', identity_key: key, from_email: source.from_email, is_active: 1 });
    inboundOwners.set(source.from_email, source.id);
  }
  personal = null; owner = null; foreign = [];
  m.agency.mockResolvedValue(agency);
  m.user.mockResolvedValue({ id: 1800, role: 'provider', first_name: 'Finley', email: 'qa.nlu.tutor@example.com' });
  m.memberships.mockResolvedValue([agency]);
  m.find.mockImplementation(async (id, key) => Number(id) === 6 ? sources.get(key) || null
    : key === 'personal_1800' ? personal : identities.get(key) || null);
  m.findId.mockImplementation(async id => [...identities.values()].find(row => row.id === Number(id)) || null);
  m.inbox.mockImplementation(async id => [...boxes.values()].find(row => row.id === Number(id)) || null);
  m.execute.mockImplementation(async (sql, params) => {
    if (sql.startsWith('SELECT id,slug')) return [[agency]];
    if (sql.includes('FROM communication_inboxes') && sql.includes("kind = 'personal'")) return [[...boxes.values()].filter(row => row.kind === 'personal')];
    if (sql.includes('FROM communication_inboxes') && sql.includes('sender_identity_id = ?')) return [[boxes.get(Number(params[1]))].filter(Boolean)];
    if (sql.includes('FROM email_inbound_routes')) return [[owner].filter(Boolean)];
    if (sql.includes('FROM email_sender_identities') && sql.includes('agency_id<>?')) return [foreign];
    throw new Error(`Unexpected database operation: ${sql}`);
  });
  m.create.mockImplementation(async values => {
    if (values.inboundAddresses?.length) inboundOwners.set(values.fromEmail, 999);
    const row = { id: 300 + identities.size, agency_id: values.agencyId, identity_key: values.identityKey,
      from_email: values.fromEmail, reply_to: values.replyTo, display_name: values.displayName, is_active: 1 };
    identities.set(values.identityKey, row);
    return row;
  });
  m.routes.mockImplementation(async (id, addresses) => { for (const address of addresses) inboundOwners.set(address, id); });
});

it('opening the ordinary QA composer retains shared senders and reports unavailable personal aliases without taking a live route', async () => {
  agency.feature_flags.googleSsoEnabled = true;
  const aliases = await listMessageAliasesForAgency(453, { userId: 1800 });
  expect(aliases.map(row => row.kind)).toEqual(['messages', 'secure_message']);
  expect(aliases[0]).toMatchObject({ fromEmail: 'messages@nextleveluplcc.com', replyTo: 'PO@nextleveluplcc.com', routing: 'shared_team',
    personalAliasUnavailableReason: expect.stringContaining('Use the shared NLU messages sender') });
  expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.routes).not.toHaveBeenCalled();
  expect([...inboundOwners.values()]).toEqual([50, 51, 52, 53]);
  expect(m.ensureInboxes.mock.calls.every(([id]) => id === 453)).toBe(true);
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});

it('creates only QA identity records with empty inbound routes when reusable shared sources exist', async () => {
  identities.clear();
  // Existing inboxes are not needed to prove sender creation safety.
  m.execute.mockImplementation(async sql => sql.startsWith('SELECT id,slug') ? [[agency]] : [[]]);
  const result = await ensureTenantMessageMailboxes(453);
  expect(result.messages.qaSenderSource).toEqual({ agencyId: 6, identityId: 50, identityKey: 'messages' });
  expect(m.create).toHaveBeenCalledTimes(4);
  for (const [values] of m.create.mock.calls) expect(values).toMatchObject({ agencyId: 453, inboundAddresses: [], isActive: true });
  expect(m.routes).not.toHaveBeenCalled();
  expect([...inboundOwners.values()]).toEqual([50, 51, 52, 53]);
});

it.each(['messages', 'secure_message', 'noreply', 'notifications'])('preflights all shared source readiness before configuring QA when %s is missing', async key => {
  sources.delete(key); identities.clear();
  await expect(ensureTenantMessageMailboxes(453)).rejects.toMatchObject({ code: 'NLU_QA_MESSAGE_SENDERS_NOT_READY', status: 503 });
  expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.routes).not.toHaveBeenCalled();
  expect(m.ensureInboxes).not.toHaveBeenCalled();
});

it('resolves the shared QA sender without changing its live inbound owner', async () => {
  const result = await resolveMessagesSendMailbox(453);
  expect(result).toMatchObject({ fromEmail: 'messages@nextleveluplcc.com', replyTo: 'PO@nextleveluplcc.com',
    identity: { agency_id: 453, qaSenderSource: { agencyId: 6, identityId: 50, identityKey: 'messages' } } });
  expect(m.routes).not.toHaveBeenCalled();
  expect(inboundOwners.get(result.fromEmail)).toBe(50);
});

it.each([
  () => ensureStaffTenantSendAlias({ agencyId: 453, userId: 1800 }),
  () => ensurePersonalMailbox({ agencyId: 453, userId: 1800 }),
  () => ensurePersonalMailboxForAddress({ agencyId: 453, userId: 1800, fromEmail: 'finley@nextleveluplcc.com' })
])('never provisions a guessed QA personal alias through any supported helper', async invoke => {
  await expect(invoke()).rejects.toMatchObject({ code: 'NLU_QA_PERSONAL_ALIAS_UNAVAILABLE', status: 409 });
  expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.routes).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});

function existingPersonal() {
  personal = { id: 700, agency_id: 453, identity_key: 'personal_1800', from_email: 'qa.nlu.tutor.personal@example.com', is_active: 1 };
  boxes.set(700, { id: 1700, agency_id: 453, sender_identity_id: 700, owner_user_id: 1800,
    kind: 'personal', from_email: personal.from_email, is_active: 1 });
  owner = { sender_identity_id: 700, agency_id: 453 };
}

it('reuses only an already owned QA alias without creating, reactivating or replacing its routes', async () => {
  existingPersonal();
  const alias = await ensureStaffTenantSendAlias({ agencyId: 453, userId: 1800 });
  expect(alias).toMatchObject({ id: 700, inboxId: 1700, email: personal.from_email, kind: 'personal' });
  expect(await ensurePersonalMailbox({ agencyId: 453, userId: 1800 })).toMatchObject({ id: 1700 });
  expect(await ensurePersonalMailboxForAddress({ agencyId: 453, userId: 1800, fromEmail: personal.from_email })).toMatchObject({ id: 1700 });
  expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.routes).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});

it.each(['live_owner', 'foreign_sender', 'wrong_owner', 'disabled', 'not_a_member'])('rejects a retained personal alias with unsafe ownership: %s', async variant => {
  existingPersonal();
  if (variant === 'live_owner') owner = { sender_identity_id: 50, agency_id: 6 };
  if (variant === 'foreign_sender') foreign = [{ id: 50 }];
  if (variant === 'wrong_owner') boxes.get(700).owner_user_id = 1801;
  if (variant === 'disabled') personal.is_active = 0;
  if (variant === 'not_a_member') m.memberships.mockResolvedValue([]);
  await expect(ensureStaffTenantSendAlias({ agencyId: 453, userId: 1800 })).rejects.toMatchObject({ code: 'NLU_QA_PERSONAL_ALIAS_UNAVAILABLE' });
  expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled(); expect(m.routes).not.toHaveBeenCalled();
});

it('does not turn an explicit address change into ownership of a different mailbox', async () => {
  existingPersonal();
  await expect(ensurePersonalMailboxForAddress({ agencyId: 453, userId: 1800, fromEmail: 'another@nextleveluplcc.com' }))
    .rejects.toMatchObject({ code: 'NLU_QA_PERSONAL_ALIAS_UNAVAILABLE' });
  expect(m.update).not.toHaveBeenCalled(); expect(m.routes).not.toHaveBeenCalled();
});
