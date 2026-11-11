import pool from '../../config/database.js';
import UserCommunication from '../../models/UserCommunication.model.js';
import { appCommunicationVisibilitySql } from '../../utils/externalTestingEmail.js';
import { requireConversationAccess } from '../communicationAccess.service.js';
import { mobileSupportContext, supportAgencies, supportFailure, supportId,
  invokeSupportHandler, requireSupportResult } from './supportContext.service.js';

const plain = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const mainNumberSql = `EXISTS(SELECT 1 FROM message_logs ml JOIN twilio_numbers n ON n.id=ml.number_id
 JOIN agencies a ON a.id=ml.agency_id WHERE ml.agency_id=c.agency_id
 AND CONVERT(ml.sms_thread_key USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(c.external_thread_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
 AND n.agency_id=c.agency_id AND n.is_active=1 AND n.status='active' AND
 (n.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(a.feature_flags),a.feature_flags,JSON_OBJECT()),'$.smsSharedCareNumberId')) AS UNSIGNED)
 OR (a.phone_number IS NOT NULL AND REGEXP_REPLACE(n.phone_number,'[^0-9]','')=REGEXP_REPLACE(a.phone_number,'[^0-9]',''))))`;
export function supportFeedFilters(query = {}) {
  const kind = ['all', 'ticket', 'sms', 'email', 'text', 'reminder'].includes(query.type) ? query.type : 'all';
  const date = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  return { kind, q: String(query.q || '').trim().slice(0, 120), status: String(query.status || '').trim().slice(0, 30),
    dateFrom: date(query.dateFrom), dateTo: date(query.dateTo), agencyId: supportId(query.agencyId),
    limit: Math.min(200, Math.max(1, supportId(query.limit) || 100)) };
}

export function createMobileSupportMessages({ db = pool, context = mobileSupportContext,
  conversationAccess = requireConversationAccess, handlers = null } = {}) {
  const load = async () => handlers || { ...await import('../../controllers/supportTickets.controller.js'),
    ...await import('../../controllers/unifiedInbox.controller.js'), ...await import('../../controllers/userCommunication.controller.js') };
  const call = async (handler, req, entry, overrides) => requireSupportResult(await invokeSupportHandler(handler, req, { user: entry.user, ...overrides }));
  async function mainSmsIds(agencyId) {
    const [rows] = await db.execute(`SELECT c.id FROM communication_conversations c WHERE c.agency_id=? AND c.channel='sms' AND ${mainNumberSql}`, [agencyId]);
    return new Set(rows.map(r => Number(r.id)));
  }
  async function bind(req, ctx, kind, id) {
    const tables = { ticket: 'support_tickets', communication: 'user_communications', sms: 'communication_conversations' };
    if (!tables[kind] || !supportId(id)) throw supportFailure(404, 'Support item not found.');
    const [[row]] = await db.execute(`SELECT id,agency_id FROM ${tables[kind]} WHERE id=? LIMIT 1`, [id]);
    if (!row) throw supportFailure(404, 'Support item not found.');
    const entry = ctx.require(row.agency_id);
    if (req.body?.agencyId && Number(req.body.agencyId) !== Number(row.agency_id)) throw supportFailure(403, 'This item belongs to a different agency.');
    if (kind === 'sms') {
      if (!(await mainSmsIds(row.agency_id)).has(Number(row.id))) throw supportFailure(404, 'Main-number conversation not found.');
      await conversationAccess(entry.user, row.id);
    }
    return { row, entry };
  }
  return async function supportMessages(req, res, next) {
    try {
      const ctx = await context(req), main = await load(), operation = req.mobileSupportOperation;
      if (operation === 'feed') {
        const filters = supportFeedFilters(req.query), all = supportAgencies(ctx);
        if (filters.agencyId) ctx.require(filters.agencyId);
        const entries = ctx.allowed.filter(a => !filters.agencyId || Number(a.agency.id) === filters.agencyId);
        const results = await Promise.all(entries.map(entry => ctx.run(entry.agency.id, async () => {
          const agencyId = Number(entry.agency.id), items = [], errors = [];
          if (['all', 'ticket'].includes(filters.kind)) {
            try {
              const tickets = await call(main.listSupportTicketsQueue, req, entry, { query: { agencyId: String(agencyId),
                q: filters.q, limit: '500', dateFrom: filters.dateFrom, dateTo: filters.dateTo,
                status: ['open', 'answered', 'closed', 'pending'].includes(filters.status) ? filters.status : undefined } });
              for (const t of tickets) items.push({ key: `ticket:${t.id}`, kind: 'ticket', id: Number(t.id), agencyId,
                title: t.subject || `Ticket ${t.id}`, preview: plain(t.question || t.last_message_body || '').slice(0, 180),
                status: t.status, at: t.updated_at || t.created_at, topic: t.topic || '',
                source: t.source_channel || 'ticket', claimedBy: t.claimed_by_user_id || null });
            } catch (error) { errors.push({ type: 'ticket', message: error.message }); }
          }
          if (['all', 'sms'].includes(filters.kind)) {
            try {
              const result = await call(main.getUnifiedConversations, req, entry, { query: { agencyId: String(agencyId),
                channel: 'sms', filter: 'all', q: filters.q, dateFrom: filters.dateFrom, dateTo: filters.dateTo, limit: '500' } });
              const ids = await mainSmsIds(agencyId);
              for (const c of result.conversations || []) if (ids.has(Number(c.id))) {
                // The canonical folder can be broader than this tool; recheck each shared thread.
                try { await conversationAccess(entry.user, c.id); } catch { continue; }
                items.push({ key: `sms:${c.id}`, kind: 'sms', id: Number(c.id), agencyId,
                  title: c.subject || 'Main-number text', preview: plain(c.last_message_preview).slice(0, 180),
                  status: c.status || '', at: c.last_message_at || c.updated_at, source: 'Main-number SMS' });
              }
            } catch (error) { errors.push({ type: 'sms', message: error.message }); }
          }
          if (['all', 'email', 'text', 'reminder'].includes(filters.kind)) {
            try {
              const where = ['uc.agency_id=?', appCommunicationVisibilitySql('uc')], values = [agencyId];
              if (filters.q) { where.push('(uc.subject LIKE ? OR uc.recipient_address LIKE ? OR uc.template_type LIKE ?)'); values.push(...Array(3).fill(`%${filters.q}%`)); }
              if (filters.dateFrom) { where.push('COALESCE(uc.sent_at,uc.generated_at)>=?'); values.push(`${filters.dateFrom} 00:00:00`); }
              if (filters.dateTo) { where.push('COALESCE(uc.sent_at,uc.generated_at)<DATE_ADD(?,INTERVAL 1 DAY)'); values.push(`${filters.dateTo} 00:00:00`); }
              if (filters.status) { where.push('uc.delivery_status=?'); values.push(filters.status); }
              if (filters.kind === 'email') where.push("uc.channel='email'");
              if (filters.kind === 'text') where.push("uc.channel IN ('sms','text')");
              if (filters.kind === 'reminder') where.push("uc.template_type LIKE '%reminder%'");
              const [rows] = await db.execute(`SELECT uc.id,uc.agency_id,uc.template_type,uc.channel,uc.subject,uc.recipient_address,
                uc.delivery_status,uc.sent_at,uc.generated_at FROM user_communications uc WHERE ${where.join(' AND ')}
                ORDER BY COALESCE(uc.sent_at,uc.generated_at) DESC,uc.id DESC LIMIT 500`, values);
              for (const c of rows) items.push({ key: `communication:${c.id}`, kind: 'communication', id: Number(c.id), agencyId,
                title: c.subject || String(c.template_type || 'App communication').replaceAll('_', ' '),
                preview: c.recipient_address || '', status: c.delivery_status || 'unknown', at: c.sent_at || c.generated_at,
                source: `${c.channel || 'App'} · ${String(c.template_type || '').replaceAll('_', ' ')}` });
            } catch (error) { errors.push({ type: 'communication', message: error.message }); }
          }
          return { items, errors: errors.map(e => ({ ...e, agencyId })) };
        })));
        const from = filters.dateFrom && new Date(`${filters.dateFrom}T00:00:00`).getTime();
        const until = filters.dateTo && new Date(`${filters.dateTo}T23:59:59.999`).getTime();
        const items = results.flatMap(r => r.items).filter(item => {
          const time = new Date(item.at).getTime();
          return (!from || time >= from) && (!until || time <= until) && (!filters.status || item.status === filters.status);
        }).sort((a, b) => new Date(b.at) - new Date(a.at));
        res.set('Cache-Control', 'private, no-store');
        return res.json({ agencies: all, items: items.slice(0, filters.limit), hasMore: items.length > filters.limit,
          errors: results.flatMap(r => r.errors) });
      }
      const kind = req.params.kind, id = supportId(req.params.id), { row, entry } = await bind(req, ctx, kind, id);
      return await ctx.run(row.agency_id, async () => {
        const params = { id: String(id) }, query = { agencyId: String(row.agency_id), markRead: '1' };
        if (operation === 'detail') {
          let detail;
          if (kind === 'ticket') detail = await call(main.listSupportTicketMessages, req, entry, { params, query });
          else if (kind === 'sms') detail = await call(main.getUnifiedConversation, req, entry, { params, query });
          else detail = UserCommunication.hydrateBody(await call(main.getCommunicationDetail, req, entry, { params, query }));
          return res.json({ kind, agencyId: Number(row.agency_id), detail });
        }
        if (operation === 'reply') {
          const text = String(req.body?.body || '').trim();
          if (!text || text.length > 10000) throw supportFailure(400, 'Enter a reply of 1–10,000 characters.');
          if (kind === 'communication') throw supportFailure(409, 'Sent app communications are a delivery record. Open a ticket or text thread to reply.');
          const body = kind === 'ticket' ? { body: text, isInternal: req.body?.isInternal === true,
            expectedLastMessageId: req.body?.expectedLastMessageId, clientRequestId: req.body?.clientRequestId,
            senderIdentityId: req.body?.senderIdentityId, senderMode: 'staff' } : { mode: 'reply', text };
          const result = await call(kind === 'ticket' ? main.createSupportTicketMessage : main.postUnifiedReply, req, entry, { params, query, body });
          return res.json({ kind, result });
        }
        const actions = { claim: main.claimSupportTicket, unclaim: main.unclaimSupportTicket, close: main.closeSupportTicket };
        if (kind !== 'ticket' || !actions[operation]) throw supportFailure(404, 'This action is not available for this item.');
        return res.json(await call(actions[operation], req, entry, { params, query, body: {} }));
      });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: { ...error.details, message: error.message } });
      next(error);
    }
  };
}
export const mobileSupportMessages = createMobileSupportMessages();
