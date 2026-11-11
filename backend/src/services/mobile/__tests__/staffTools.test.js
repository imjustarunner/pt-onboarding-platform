import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../session.service.js', () => ({ mobileSessions: { access: vi.fn() } }));
vi.mock('../agencyScope.service.js', () => ({ listMobileAgencies: vi.fn() }));
vi.mock('../../agencyAccessProfiles.service.js', () => ({ readAgencyAccess: vi.fn() }));
vi.mock('../../../utils/agencyAccessPolicy.js', () => ({ applyAgencyAccess: (user, access) => ({ ...user, role: access.role }) }));
vi.mock('../../../utils/agencyAccessContext.js', () => ({ runWithAgencyAccess: (_id, fn) => fn() }));
vi.mock('../../communicationAccess.service.js', () => ({ requireConversationAccess: vi.fn() }));
vi.mock('../../../models/UserCommunication.model.js', () => ({ default: { hydrateBody: value => value } }));
vi.mock('../../../controllers/presence.controller.js', () => ({ heartbeat: vi.fn() }));
vi.mock('../../publicWebsiteChat.service.js', () => ({ websiteChat: {}, validChatMessageId: id => /^[a-f0-9-]{36}$/.test(id) }));
import { createMobileSupportContext, qaStaffToolsRouteAllowed, supportFailure } from '../supportContext.service.js';
import { createMobileSupportMessages, supportFeedFilters } from '../supportMessages.service.js';
import { createMobileLiveChat } from '../liveChat.service.js';

const agency = { id: 450, name: 'Synthetic QA' }, actor = { id: 7, role: 'support' };
const makeContext = () => ({ user: actor, allowed: [{ agency, user: actor, profile: { role: 'support' } }],
  require(id) { if (Number(id) !== 450) throw supportFailure(403, 'Agency unavailable'); return this.allowed[0]; },
  run(_id, fn) { return fn(this.allowed[0]); } });
const response = () => ({ set: vi.fn(), status: vi.fn(function (code) { this.statusCode = code; return this; }), json: vi.fn() });
let req, res, next;
beforeEach(() => { req = { quickView: { mobileDeviceSessionId: 4, userId: 7, agencyId: 450 }, params: {}, query: {}, body: {} }; res = response(); next = vi.fn(); });

describe('fresh staff support scope', () => {
  it('rejects PIN-only and guardian access before reading agencies', async () => {
    const deps = { access: vi.fn(async () => ({ surface: 'family', user: actor })), agencies: vi.fn() };
    const context = createMobileSupportContext(deps);
    await expect(context({ quickView: {} })).rejects.toMatchObject({ status: 403 });
    await expect(context(req)).rejects.toMatchObject({ status: 403 }); expect(deps.agencies).not.toHaveBeenCalled();
  });
  it('uses fresh local roles and honors QA membership restrictions for global administrators', async () => {
    const context = createMobileSupportContext({ access: async () => ({ surface: 'staff', user: { id: 7, role: 'admin' } }),
      agencies: async () => ({ agencies: [agency, { id: 451 }, { id: 20 }] }),
      agencyAccess: async (_user, id) => ({ role: id === 451 ? 'provider' : 'support' }) });
    req.quickView.qaAgencyIds = [450, 451]; const result = await context(req);
    expect(result.allowed.map(a => a.agency.id)).toEqual([450]); expect(() => result.require(20)).toThrow('outside');
  });
  it('allows only reviewed numeric QA support routes; public website chats stay closed', () => {
    expect(qaStaffToolsRouteAllowed('GET', '/staff-tools/support/feed')).toBe(true);
    expect(qaStaffToolsRouteAllowed('POST', '/staff-tools/support/ticket/1/reply')).toBe(true);
    for (const path of ['/staff-tools/live-chat', '/staff-tools/support/ticket/01/reply', '/staff-tools/support/anything/3/reply', '/staff-tools/support/communication/3/reply']) expect(qaStaffToolsRouteAllowed('POST', path)).toBe(false);
  });
});

describe('Support Messages canonical operations', () => {
  it('extracts ticket preview content without exposing email stylesheet or script text', async () => {
    req.mobileSupportOperation = 'feed'; req.query.type = 'ticket';
    const question = '<style>@media(max-width:600px){.email-card{padding:0}}</style><script>alert("bad")</script><p>First &amp; second request</p>';
    const handlers = { listSupportTicketsQueue: async (_req, out) => out.json([{ id: 3, subject: 'Synthetic', question }]) };
    await createMobileSupportMessages({ db: { execute: async () => [[]] }, context: async () => makeContext(), handlers })(req, res, next);
    expect(res.json.mock.calls[0][0].items[0].preview).toBe('First & second request');
  });
  it('binds direct ticket ID to its stored agency and preserves canonical denial', async () => {
    const handler = vi.fn(async (_req, out) => out.status(403).json({ error: { message: 'Topic access denied' } }));
    const db = { execute: vi.fn(async () => [[{ id: 3, agency_id: 20 }]]) };
    req.params = { kind: 'ticket', id: '3' }; req.mobileSupportOperation = 'reply'; req.body.body = 'Synthetic reply';
    const run = createMobileSupportMessages({ db, context: async () => makeContext(), handlers: { createSupportTicketMessage: handler } });
    await run(req, res, next); expect(res.statusCode).toBe(403); expect(handler).not.toHaveBeenCalled();
    db.execute.mockResolvedValue([[{ id: 3, agency_id: 450 }]]); await run(req, res, next);
    expect(res.statusCode).toBe(403); expect(res.json).toHaveBeenLastCalledWith({ error: { message: 'Topic access denied' } });
  });
  it('forwards a small allowlist to the normal ticket reply, preserving conflict metadata', async () => {
    const handler = vi.fn(async (forwarded, out) => out.status(409).json({ error: { message: 'Thread changed', code: 'TICKET_CHANGED' } }));
    req.params = { kind: 'ticket', id: '3' }; req.mobileSupportOperation = 'reply';
    req.body = { body: 'Synthetic reply', expectedLastMessageId: 8, clientRequestId: 'retry-key', senderIdentityId: 4, userId: 99, force: true };
    await createMobileSupportMessages({ db: { execute: async () => [[{ id: 3, agency_id: 450 }]] }, context: async () => makeContext(), handlers: { createSupportTicketMessage: handler } })(req, res, next);
    expect(handler.mock.calls[0][0].body).toEqual({ body: 'Synthetic reply', isInternal: false, expectedLastMessageId: 8, clientRequestId: 'retry-key', senderIdentityId: 4, senderMode: 'staff' });
    expect(res.statusCode).toBe(409); expect(res.json.mock.calls[0][0].error.code).toBe('TICKET_CHANGED');
  });
  it('cannot reply to immutable app delivery records or arbitrary SMS threads', async () => {
    const handlers = { createSupportTicketMessage: vi.fn(), postUnifiedReply: vi.fn() };
    const db = { execute: vi.fn(async sql => sql.includes('FROM communication_conversations c') ? [[]] : [[{ id: 3, agency_id: 450 }]]) };
    const run = createMobileSupportMessages({ db, context: async () => makeContext(), handlers }); req.mobileSupportOperation = 'reply'; req.body.body = 'Synthetic';
    req.params = { kind: 'communication', id: '3' }; await run(req, res, next); expect(res.statusCode).toBe(409);
    req.params = { kind: 'sms', id: '3' }; await run(req, res, next); expect(res.statusCode).toBe(404); expect(handlers.postUnifiedReply).not.toHaveBeenCalled();
  });
  it('keeps successful sources visible and reports a failed source, with scoped delivery search', async () => {
    const handler = vi.fn(async (_req, out) => out.status(503).json({ error: { message: 'Ticket service unavailable' } }));
    const db = { execute: vi.fn(async sql => sql.includes('FROM user_communications') ? [[{ id: 8, agency_id: 450, subject: 'Synthetic reminder', channel: 'email', template_type: 'appointment_reminder', delivery_status: 'sent', generated_at: '2026-11-11T10:00:00Z' }]] : [[]]) };
    req.mobileSupportOperation = 'feed'; req.query = { q: 'Synthetic', dateFrom: '2026-11-10' };
    await createMobileSupportMessages({ db, context: async () => makeContext(), handlers: { listSupportTicketsQueue: handler, getUnifiedConversations: async (_req, out) => out.json({ conversations: [] }) } })(req, res, next);
    const data = res.json.mock.calls[0][0]; expect(data.items[0]).toMatchObject({ kind: 'communication', agencyId: 450 }); expect(data.errors).toEqual([{ type: 'ticket', message: 'Ticket service unavailable', agencyId: 450 }]);
    const query = db.execute.mock.calls.find(([sql]) => sql.includes('FROM user_communications')); expect(query[0]).toContain('uc.agency_id=?'); expect(query[1]).toContain('%Synthetic%');
    expect(supportFeedFilters({ limit: 999999, dateFrom: 'bad', type: 'private' })).toMatchObject({ limit: 200, dateFrom: '', kind: 'all' });
  });
});

describe('Live Chat is an adapter over encrypted website sessions', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  function fixture({ online = true, agencyId = 450 } = {}) {
    const db = { execute: vi.fn(async sql => {
      if (sql.includes('SELECT slug,name')) return [[{ slug: 'synthetic', name: 'Synthetic site', agencyId }]];
      if (sql.includes('SELECT id,site_slug')) return [[{ id, site_slug: 'synthetic' }]];
      if (sql.includes('SELECT 1 FROM public_website_chat_staff')) return [online ? [{ 1: 1 }] : []];
      return [[]];
    }) };
    const chat = { staffAvailability:vi.fn(async()=>({available:online,backgroundReady:online})), authorize: vi.fn(async () => ({ logoUrl: '/synthetic.png' })), staffHeartbeat: vi.fn(), staffSend: vi.fn(async () => ({ messages: [] })),
      staffRead: vi.fn(async () => ({ messages: [{ id: 19 }] })), close: vi.fn(), queue: vi.fn(async () => []) };
    return { db, chat, context: async () => makeContext(), presence: async (_req, out) => out.json({ ok: true }) };
  }
  it('does not broaden a direct chat to an unauthorized website', async () => {
    const deps = fixture({ agencyId: 20 }); req.mobileLiveChatOperation = 'detail'; req.params.chatId = id;
    await createMobileLiveChat(deps)(req, res, next); expect(res.statusCode).toBe(403); expect(deps.chat.staffRead).not.toHaveBeenCalled();
  });
  it('requires explicit online presence before sending and keeps canonical send semantics', async () => {
    const deps = fixture({ online: false }); req.mobileLiveChatOperation = 'send'; req.params.chatId = id; req.body = { body: 'Synthetic', clientMessageId: id };
    await createMobileLiveChat(deps)(req, res, next); expect(res.statusCode).toBe(409); expect(deps.chat.staffSend).not.toHaveBeenCalled();
    const allowed = fixture(); await createMobileLiveChat(allowed)(req, res, next); expect(allowed.chat.staffSend).toHaveBeenCalledWith(actor, id, { body: 'Synthetic', clientMessageId: id });
  });
  it('requires confirmation and removes only the employee list entry, retaining the transcript', async () => {
    const deps = fixture(); req.mobileLiveChatOperation = 'dismiss'; req.params.chatId = id;
    const run = createMobileLiveChat(deps); await run(req, res, next); expect(res.statusCode).toBe(400); expect(deps.chat.close).not.toHaveBeenCalled();
    req.body.confirmed = true; await run(req, res, next); expect(deps.chat.close).toHaveBeenCalledWith(actor, id);
    expect(deps.db.execute.mock.calls.some(([sql]) => /DELETE FROM public_website_chat_(sessions|messages)/.test(sql))).toBe(false);
    expect(res.json).toHaveBeenLastCalledWith({ removedFromMyList: true, transcriptRetained: true });
  });
});

it('honors Open and Unread main-number text filters without broadening agency access',async()=>{
 const getUnifiedConversations=vi.fn(async(_req,out)=>out.json({conversations:[{id:3,status:'open',is_unread:true},{id:4,status:'closed',is_unread:false}]}));
 const db={execute:vi.fn(async sql=>sql.includes('FROM communication_conversations c')?[[{id:3},{id:4}]]:[[]])};
 const run=createMobileSupportMessages({db,context:async()=>makeContext(),conversationAccess:async()=>{},handlers:{getUnifiedConversations}});req.mobileSupportOperation='feed';req.query={type:'sms',status:'unread'};
 await run(req,res,next);expect(res.json.mock.calls.at(-1)[0].items.map(item=>item.id)).toEqual([3]);expect(getUnifiedConversations.mock.calls[0][0].query).toMatchObject({channel:'sms',filter:'unread',agencyId:'450'});
 req.query={type:'sms',status:'open'};await run(req,res,next);expect(res.json.mock.calls.at(-1)[0].items.map(item=>item.id)).toEqual([3]);expect(getUnifiedConversations.mock.calls.at(-1)[0].query.status).toBe('open');
});
