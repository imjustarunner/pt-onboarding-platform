import pool from '../../config/database.js';
import { websiteChat, validChatMessageId } from '../publicWebsiteChat.service.js';
import { heartbeat } from '../../controllers/presence.controller.js';
import { mobileSupportContext, supportAgencies, supportFailure, supportId,
  invokeSupportHandler, requireSupportResult } from './supportContext.service.js';

export function createMobileLiveChat({ db = pool, context = mobileSupportContext, chat = websiteChat, presence = heartbeat } = {}) {
  async function sitesFor(ctx) {
    const [sites] = await db.execute('SELECT slug,name,support_agency_id AS agencyId FROM public_website_support_sites WHERE chat_enabled=1 AND coming_soon=0 ORDER BY name');
    const allowed = [];
    for (const site of sites) {
      if (!ctx.allowed.some(a => Number(a.agency.id) === Number(site.agencyId))) continue;
      try { const identity = await chat.authorize(ctx.user, site.slug); allowed.push({ ...site, logoUrl: identity.logoUrl || identity.logo_url || null }); }
      catch (error) { if (error.status !== 403 && error.status !== 404) throw error; }
    }
    return allowed;
  }
  async function bind(ctx, sites, id) {
    if (!validChatMessageId(id)) throw supportFailure(404, 'Live Chat not found.');
    const [[row]] = await db.execute('SELECT id,site_slug FROM public_website_chat_sessions WHERE id=?', [id]);
    const site = row && sites.find(s => s.slug === row.site_slug);
    if (!site) throw supportFailure(404, 'This Live Chat is outside your support scope.');
    ctx.require(site.agencyId);
    return site;
  }
  return async function liveChat(req, res, next) {
    try {
      const ctx = await context(req), sites = await sitesFor(ctx), operation = req.mobileLiveChatOperation;
      if (!sites.length) throw supportFailure(403, 'No websites are available in your support scope.');
      if (operation === 'queue') {
        const selected = String(req.query.site || ''), agencyId = supportId(req.query.agencyId);
        if (agencyId) ctx.require(agencyId);
        if (selected && !sites.some(s => s.slug === selected)) throw supportFailure(403, 'Website unavailable.');
        const [all, [hidden]] = await Promise.all([chat.queue(ctx.user), db.execute('SELECT session_id,last_message_id FROM public_website_chat_staff_dismissals WHERE user_id=?', [ctx.user.id])]);
        const hiddenAt = new Map(hidden.map(h => [h.session_id, Number(h.last_message_id)]));
        const rows = all.filter(row => {
          const site = sites.find(s => s.slug === row.siteSlug);
          return site && (!selected || selected === site.slug) && (!agencyId || Number(site.agencyId) === agencyId)
            && (!hiddenAt.has(row.id) || Number(row.lastMessageId || 0) > hiddenAt.get(row.id));
        }).map(row => ({ ...row, agencyId: Number(sites.find(s => s.slug === row.siteSlug).agencyId) }));
        res.set('Cache-Control', 'private, no-store');
        return res.json({ sessions: rows, sites, agencies: supportAgencies(ctx) });
      }
      if (operation === 'availability') {
        const available = req.body?.available === true;
        if (available) {
          const agencyId = supportId(req.body.agencyId) || Number(sites[0].agencyId), entry = ctx.require(agencyId);
          requireSupportResult(await invokeSupportHandler(presence, req, { user: entry.user,
            body: { agencyId, lastActivityAt: new Date().toISOString(), sessionPhase: 'active' } }));
        }
        await chat.staffHeartbeat(ctx.user, available);
        if (!available) {
          // Clear only this employee's ephemeral presence and claim. Transcripts stay intact.
          await db.execute('UPDATE public_website_chat_participants SET viewing_at=NULL,typing_at=NULL WHERE user_id=?', [ctx.user.id]);
          await db.execute('UPDATE public_website_chat_sessions SET claimed_by=NULL WHERE claimed_by=?', [ctx.user.id]);
        }
        return res.json({ available });
      }
      const id = String(req.params.chatId || '');
      await bind(ctx, sites, id);
      if (operation === 'detail') return res.json(await chat.staffRead(ctx.user, id));
      if (operation === 'presence') { await chat.staffPresence(ctx.user, id, { viewing: req.body?.viewing !== false, typing: req.body?.typing === true }); return res.json({ ok: true }); }
      if (operation === 'send') {
        // Sending requires this explicit online state, not merely a signed-in browser.
        const [[online]] = await db.execute('SELECT 1 FROM public_website_chat_staff WHERE user_id=? AND last_seen_at>UTC_TIMESTAMP()-INTERVAL 75 SECOND', [ctx.user.id]);
        if (!online) throw supportFailure(409, 'Go online before replying in Live Chat.');
        return res.json(await chat.staffSend(ctx.user, id, { body: String(req.body?.body || ''), clientMessageId: req.body?.clientMessageId }));
      }
      if (operation === 'claim') return res.json(await chat.claim(ctx.user, id, req.body?.release === true));
      if (operation === 'close') { await chat.close(ctx.user, id); return res.json({ ok: true }); }
      if (operation === 'dismiss') {
        if (req.body?.confirmed !== true) throw supportFailure(400, 'Confirm removing this chat from your list.');
        const detail = await chat.staffRead(ctx.user, id);
        await chat.close(ctx.user, id);
        const latest = Math.max(0, ...detail.messages.map(m => Number(m.id) || 0));
        await db.execute(`INSERT INTO public_website_chat_staff_dismissals(user_id,session_id,last_message_id) VALUES(?,?,?)
          ON DUPLICATE KEY UPDATE last_message_id=VALUES(last_message_id),dismissed_at=CURRENT_TIMESTAMP`, [ctx.user.id, id, latest]);
        return res.json({ removedFromMyList: true, transcriptRetained: true });
      }
      if (operation === 'referral') return res.json(await chat.referral(ctx.user, id, String(req.body?.category || '')));
      throw supportFailure(404, 'Live Chat action unavailable.');
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: { message: error.message } });
      next(error);
    }
  };
}
export const mobileLiveChat = createMobileLiveChat();
