/**
 * Aggregated summaries for employee Messages Dashboard and admin Communications Center.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { countMultiAgencyCommunicationQualityIssues } from '../services/outboundEmailQuality.service.js';
import { appendSupportTicketKindFilter } from '../utils/supportTicketKindFilter.js';

const isCommsCenterRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'support' || r === 'super_admin';
};

async function resolveAgencyIds(req) {
  const role = String(req.user?.role || '').toLowerCase();
  const qAgency = req.query?.agencyId ? parseInt(String(req.query.agencyId), 10) : null;
  if (Number.isFinite(qAgency) && qAgency > 0) {
    if (role === 'super_admin') return [qAgency];
    const agencies = await User.getAgencies(req.user.id);
    if ((agencies || []).some((a) => Number(a.id) === qAgency)) return [qAgency];
    return [];
  }
  if (role === 'super_admin') {
    const [rows] = await pool.execute(
      `SELECT id FROM agencies
       WHERE organization_type IN ('agency', 'school') OR organization_type IS NULL
       LIMIT 500`
    );
    return (rows || []).map((r) => r.id);
  }
  const agencies = await User.getAgencies(req.user.id);
  return (agencies || []).map((a) => a.id).filter(Boolean);
}

/**
 * GET /api/messages/dashboard-summary
 * Personal messaging metrics (no tickets / org ops).
 */
export const getMessagesDashboardSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const agencyIds = await resolveAgencyIds(req);
    // Login briefing and other personal rollups may intentionally combine every
    // tenant the viewer can access. The default remains single-tenant for existing callers.
    const combineAllAgencies = ['1', 'true'].includes(String(req.query?.allAgencies || '').toLowerCase());
    const agencyId = combineAllAgencies ? null : (agencyIds[0] || null);

    let dmUnread = 0;
    let channelUnread = 0;
    let mentionsUnread = 0;
    let filesCount = 0;
    let smsUnread = 0;
    let missedCalls = 0;
    let unheardVoicemail = 0;
    const priority = [];

    try {
      const agencyClause = agencyId ? 'AND t.agency_id = ?' : '';
      const [sumRows] = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN t.thread_type = 'direct' THEN (
             SELECT COUNT(*) FROM chat_messages m2
             WHERE m2.thread_id = t.id
               AND (r.last_read_message_id IS NULL OR m2.id > r.last_read_message_id)
               AND m2.sender_user_id <> ?
               AND NOT EXISTS (
                 SELECT 1 FROM chat_message_deletes d
                 WHERE d.user_id = ? AND d.message_id = m2.id
               )
           ) ELSE 0 END), 0) AS dm_unread,
           COALESCE(SUM(CASE WHEN t.thread_type IN ('channel', 'group', 'team', 'club', 'skill_builders_event') THEN (
             SELECT COUNT(*) FROM chat_messages m2
             WHERE m2.thread_id = t.id
               AND (r.last_read_message_id IS NULL OR m2.id > r.last_read_message_id)
               AND m2.sender_user_id <> ?
               AND NOT EXISTS (
                 SELECT 1 FROM chat_message_deletes d
                 WHERE d.user_id = ? AND d.message_id = m2.id
               )
           ) ELSE 0 END), 0) AS channel_unread
         FROM chat_threads t
         JOIN chat_thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
         LEFT JOIN chat_thread_reads r ON r.thread_id = t.id AND r.user_id = ?
         WHERE 1=1 ${agencyClause}`,
        agencyId
          ? [userId, userId, userId, userId, userId, userId, agencyId]
          : [userId, userId, userId, userId, userId, userId]
      );
      dmUnread = Number(sumRows?.[0]?.dm_unread || 0);
      channelUnread = Number(sumRows?.[0]?.channel_unread || 0);
    } catch {
      dmUnread = 0;
      channelUnread = 0;
    }

    try {
      const [mRows] = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM chat_message_mentions mn
         JOIN chat_messages m ON m.id = mn.message_id
         JOIN chat_threads t ON t.id = m.thread_id
         JOIN chat_thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?
         LEFT JOIN chat_thread_reads tr ON tr.thread_id = t.id AND tr.user_id = ?
         WHERE mn.mentioned_user_id = ?
           AND (tr.last_read_message_id IS NULL OR tr.last_read_message_id < m.id)`,
        [userId, userId, userId]
      );
      mentionsUnread = Number(mRows?.[0]?.cnt || 0);
    } catch {
      mentionsUnread = 0;
    }

    try {
      const [fRows] = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM chat_message_attachments a
         INNER JOIN chat_messages m ON m.id = a.message_id
         INNER JOIN chat_thread_participants p ON p.thread_id = m.thread_id AND p.user_id = ?
         WHERE m.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [userId]
      );
      filesCount = Number(fRows?.[0]?.cnt || 0);
    } catch {
      filesCount = 0;
    }

    try {
      const params = [userId];
      let agencyClause = '';
      if (agencyId) {
        agencyClause = 'AND ml.agency_id = ?';
        params.push(agencyId);
      }
      const [smsRows] = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM message_logs ml
         WHERE ml.direction = 'INBOUND'
           AND ml.assigned_user_id = ?
           ${agencyClause}
           AND ml.created_at > COALESCE(
             (SELECT MAX(r.created_at) FROM message_logs r
              WHERE r.client_id = ml.client_id
                AND r.direction = 'OUTBOUND'
                AND r.assigned_user_id = ml.assigned_user_id),
             '1970-01-01'
           )`,
        params
      );
      // Fallback: sum unread from a simpler heuristic — inbound in last 7d without outbound after
      smsUnread = Number(smsRows?.[0]?.cnt || 0);
    } catch {
      smsUnread = 0;
    }

    try {
      if (agencyId) {
        const [cRows] = await pool.query(
          `SELECT
             SUM(CASE WHEN status IN ('no-answer', 'busy', 'failed', 'canceled') THEN 1 ELSE 0 END) AS missed,
             SUM(CASE WHEN voicemail_url IS NOT NULL AND (listened_at IS NULL) THEN 1 ELSE 0 END) AS unheard
           FROM call_logs
           WHERE agency_id = ?
             AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)`,
          [agencyId]
        );
        missedCalls = Number(cRows?.[0]?.missed || 0);
        unheardVoicemail = Number(cRows?.[0]?.unheard || 0);
      }
    } catch {
      missedCalls = 0;
      unheardVoicemail = 0;
    }

    // Priority conversation previews (recent threads with unread — direct + group/event)
    try {
      const agencyClausePreview = agencyId ? 'AND t.agency_id = ?' : '';
      const previewParams = agencyId
        ? [userId, userId, userId, userId, agencyId]
        : [userId, userId, userId, userId];
      const [preview] = await pool.query(
        `SELECT t.id AS thread_id, t.thread_type, t.agency_id, t.company_event_id,
                a.name AS agency_name,
                ce.title AS event_title,
                t.name AS channel_name,
                u.first_name, u.last_name,
                lm.body AS last_body,
                lm.created_at AS last_at,
                (
                  SELECT COUNT(*) FROM chat_messages m
                  WHERE m.thread_id = t.id
                    AND m.sender_user_id <> ?
                    AND (r.last_read_message_id IS NULL OR m.id > r.last_read_message_id)
                    AND NOT EXISTS (
                      SELECT 1 FROM chat_message_deletes d
                      WHERE d.user_id = ? AND d.message_id = m.id
                    )
                ) AS unread_count
         FROM chat_threads t
         LEFT JOIN agencies a ON a.id = t.agency_id
         LEFT JOIN company_events ce ON ce.id = t.company_event_id
         INNER JOIN chat_thread_participants me ON me.thread_id = t.id AND me.user_id = ?
         LEFT JOIN chat_thread_reads r ON r.thread_id = t.id AND r.user_id = ?
         LEFT JOIN chat_thread_participants other
           ON other.thread_id = t.id AND other.user_id <> ? AND t.thread_type = 'direct'
         LEFT JOIN users u ON u.id = other.user_id
         LEFT JOIN chat_messages lm ON lm.id = (
           SELECT m.id FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1
         )
         WHERE 1=1 ${agencyClausePreview}
         HAVING unread_count > 0
         ORDER BY last_at DESC
         LIMIT 12`,
        previewParams
      );
      for (const row of preview || []) {
        const tType = String(row.thread_type || 'direct').toLowerCase();
        const isDirect = tType === 'direct';
        let label = 'Conversation';
        if (isDirect) {
          label = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Conversation';
        } else if (tType === 'skill_builders_event') {
          label = String(row.event_title || '').trim() || 'Event chat';
        } else if (tType === 'channel') {
          label = String(row.channel_name || '').trim() || 'Channel';
        } else {
          label = 'Group chat';
        }
        priority.push({
          id: `chat-${row.thread_id}`,
          kind: isDirect ? 'secure' : 'team',
          label,
          snippet: String(row.last_body || '').slice(0, 120),
          unread: Number(row.unread_count || 0),
          occurredAt: row.last_at,
          threadId: row.thread_id,
          threadType: tType,
          agencyId: row.agency_id,
          agencyName: row.agency_name || null
        });
      }
    } catch {
      // ignore preview failures
    }

    const totalUnread = dmUnread + channelUnread + smsUnread + mentionsUnread;

    res.json({
      cards: {
        unread: totalUnread,
        clientMessages: smsUnread,
        teamDiscussions: channelUnread + dmUnread,
        calls: missedCalls,
        voicemail: unheardVoicemail,
        mentions: mentionsUnread,
        sharedFiles: filesCount
      },
      priority,
      agencyId,
      combinedAgencies: combineAllAgencies
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/communications/center-summary
 * Admin/support Support Hub + ops Messages Dashboard metrics.
 */
export const getCommunicationsCenterSummary = async (req, res, next) => {
  try {
    if (!isCommsCenterRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin or support access required' } });
    }

    const agencyIds = await resolveAgencyIds(req);
    if (!agencyIds.length) {
      return res.json({
        kpis: {
          openTickets: 0,
          messagesSent: 0,
          deliveryRate: 100,
          pendingInQueues: 0,
          activeAlerts: 0,
          complianceScore: null
        },
        tickets: { open: 0, in_progress: 0, waiting: 0, closed_today: 0, recent: [] },
        queues: { sms: 0, emailPending: 0, emailFailed: 0, voicemail: 0 },
        messagesMode: { unread: 0, unassigned: 0, queued: 0, recentlySent: 0, newInbound: 0 },
        engagement: { pendingCount: 0, failedCount: 0, qualityIssuesCount: 0, sentTotalCount: 0, pending: [], recentlySent: [] },
        recentActivity: []
      });
    }

    const placeholders = agencyIds.map(() => '?').join(',');

    let openTickets = 0;
    let inProgress = 0;
    let waiting = 0;
    let closedToday = 0;
    let recentTickets = [];
    try {
      const ticketKindWhere = [];
      await appendSupportTicketKindFilter(ticketKindWhere, { alias: '', ticketKind: 'support' });
      const ticketKindSql = ticketKindWhere.length ? ` AND ${ticketKindWhere[0]}` : '';

      // Match desk metrics: open = unclaimed open; in_progress = claimed open
      const [tRows] = await pool.query(
        `SELECT
           SUM(CASE WHEN LOWER(status) = 'open' AND (claimed_by_user_id IS NULL) THEN 1 ELSE 0 END) AS open_cnt,
           SUM(CASE WHEN LOWER(status) = 'open' AND claimed_by_user_id IS NOT NULL THEN 1 ELSE 0 END) AS ip_cnt,
           SUM(CASE WHEN LOWER(status) IN ('waiting', 'pending') THEN 1 ELSE 0 END) AS wait_cnt,
           SUM(CASE WHEN LOWER(status) = 'closed' AND DATE(updated_at) = CURDATE() THEN 1 ELSE 0 END) AS closed_today
         FROM support_tickets
         WHERE (agency_id IN (${placeholders}) OR (agency_id IS NULL AND ? = 1))
           ${ticketKindSql}`,
        [...agencyIds, req.user?.role === 'super_admin' ? 1 : 0]
      );
      openTickets = Number(tRows?.[0]?.open_cnt || 0);
      inProgress = Number(tRows?.[0]?.ip_cnt || 0);
      waiting = Number(tRows?.[0]?.wait_cnt || 0);
      closedToday = Number(tRows?.[0]?.closed_today || 0);

      const [list] = await pool.query(
        `SELECT id, subject, status, priority, claimed_by_user_id, updated_at, created_at,
                question, question_ciphertext
         FROM support_tickets
         WHERE (agency_id IN (${placeholders}) OR (agency_id IS NULL AND ? = 1))
           ${ticketKindSql}
           AND (
             LOWER(status) = 'open'
             OR LOWER(status) IN ('waiting', 'pending', 'in_progress')
           )
         ORDER BY updated_at DESC
         LIMIT 10`,
        [...agencyIds, req.user?.role === 'super_admin' ? 1 : 0]
      );
      let resolveTicketPlaintext = null;
      try {
        resolveTicketPlaintext = (await import('../utils/supportTicketCrypto.js')).resolveTicketPlaintext;
      } catch {
        resolveTicketPlaintext = null;
      }
      recentTickets = (list || []).map((r) => {
        let subject = r.subject || null;
        if (!subject && resolveTicketPlaintext) {
          try {
            subject = resolveTicketPlaintext(r, {
              plainKey: 'question',
              cipherKey: 'question_ciphertext',
              ivKey: 'question_iv',
              tagKey: 'question_auth_tag',
              keyIdKey: 'question_encryption_key_id'
            });
          } catch {
            subject = null;
          }
        }
        const isClaimed = !!r.claimed_by_user_id;
        return {
          id: r.id,
          subject: subject || `Support #${r.id}`,
          status: String(r.status || 'open').toLowerCase() === 'open' && isClaimed ? 'in_progress' : r.status,
          priority: r.priority || 'medium',
          updatedAt: r.updated_at
        };
      });
    } catch {
      // support_tickets may differ — retry simpler query
      try {
        const fallbackKindWhere = [];
        await appendSupportTicketKindFilter(fallbackKindWhere, { alias: '', ticketKind: 'support' });
        const fallbackKindSql = fallbackKindWhere.length ? ` AND ${fallbackKindWhere[0]}` : '';
        const [list] = await pool.query(
          `SELECT id, subject, status, priority, updated_at
           FROM support_tickets
           WHERE agency_id IN (${placeholders})
             AND LOWER(status) = 'open'
             ${fallbackKindSql}
           ORDER BY updated_at DESC
           LIMIT 10`,
          agencyIds
        );
        openTickets = (list || []).length;
        recentTickets = (list || []).map((r) => ({
          id: r.id,
          subject: r.subject || `Support #${r.id}`,
          status: r.status,
          priority: r.priority || 'medium',
          updatedAt: r.updated_at
        }));
      } catch {
        // ignore
      }
    }

    let pendingInQueues = 0;
    let emailFailed = 0;
    let messagesSent = 0;
    let sentTotalCount = 0;
    let delivered = 0;
    let engagementPending = [];
    let engagementRecent = [];
    try {
      const [pRows] = await pool.query(
        `SELECT
           SUM(CASE WHEN delivery_status IN ('pending') THEN 1 ELSE 0 END) AS pending_cnt,
           SUM(CASE WHEN delivery_status IN ('failed', 'bounced', 'undelivered', 'skipped') THEN 1 ELSE 0 END) AS failed_cnt,
           SUM(CASE WHEN delivery_status IN ('sent', 'delivered')
                      AND generated_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS sent_cnt,
           SUM(CASE WHEN delivery_status IN ('sent', 'delivered') THEN 1 ELSE 0 END) AS sent_total_cnt,
           SUM(CASE WHEN channel = 'email'
                      AND delivery_status IN ('sent', 'delivered') THEN 1 ELSE 0 END) AS sent_email_total_cnt,
           SUM(CASE WHEN delivery_status = 'delivered'
                      AND generated_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS delivered_cnt
         FROM user_communications
         WHERE agency_id IN (${placeholders})`,
        agencyIds
      );
      pendingInQueues = Number(pRows?.[0]?.pending_cnt || 0);
      emailFailed = Number(pRows?.[0]?.failed_cnt || 0);
      messagesSent = Number(pRows?.[0]?.sent_cnt || 0);
      sentTotalCount = Number(pRows?.[0]?.sent_email_total_cnt || pRows?.[0]?.sent_total_cnt || 0);
      delivered = Number(pRows?.[0]?.delivered_cnt || 0);

      const mapEngagementRow = (r) => ({
        id: r.id,
        subject: r.subject || r.template_type || 'Message',
        recipient: r.recipient_address || null,
        status: r.delivery_status,
        channel: r.channel || 'email',
        templateType: r.template_type || null,
        userId: r.user_id || null,
        clientId: r.client_id || null,
        occurredAt: r.sent_at || r.generated_at
      });

      const [pendList] = await pool.query(
        `SELECT id, user_id, client_id, subject, recipient_address, delivery_status, channel, template_type, generated_at, sent_at
         FROM user_communications
         WHERE agency_id IN (${placeholders})
           AND delivery_status IN ('pending', 'failed', 'bounced', 'undelivered', 'skipped')
         ORDER BY generated_at DESC
         LIMIT 8`,
        agencyIds
      );
      engagementPending = (pendList || []).map(mapEngagementRow);

      const [sentList] = await pool.query(
        `SELECT id, user_id, client_id, subject, recipient_address, delivery_status, channel, template_type, generated_at, sent_at
         FROM user_communications
         WHERE agency_id IN (${placeholders})
           AND delivery_status IN ('sent', 'delivered')
         ORDER BY COALESCE(sent_at, generated_at) DESC
         LIMIT 8`,
        agencyIds
      );
      engagementRecent = (sentList || []).map(mapEngagementRow);
    } catch {
      pendingInQueues = 0;
    }

    let qualityIssuesCount = 0;
    try {
      qualityIssuesCount = await countMultiAgencyCommunicationQualityIssues(agencyIds.slice(0, 5), { pool });
    } catch {
      qualityIssuesCount = 0;
    }

    const deliveryRate =
      messagesSent > 0 ? Math.round((delivered / messagesSent) * 1000) / 10 : 100;

    let smsUnread = 0;
    let smsUnassigned = 0;
    let recentlySentSms = 0;
    let newInbound = 0;
    try {
      const [sRows] = await pool.query(
        `SELECT
           SUM(CASE WHEN direction = 'INBOUND' AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS inbound_week,
           SUM(CASE WHEN direction = 'OUTBOUND' AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS outbound_week,
           SUM(CASE WHEN direction = 'INBOUND' AND (assigned_user_id IS NULL OR assigned_user_id = 0)
                      AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS unassigned
         FROM message_logs
         WHERE agency_id IN (${placeholders})`,
        agencyIds
      );
      newInbound = Number(sRows?.[0]?.inbound_week || 0);
      recentlySentSms = Number(sRows?.[0]?.outbound_week || 0);
      smsUnassigned = Number(sRows?.[0]?.unassigned || 0);
      smsUnread = newInbound;
    } catch {
      // ignore
    }

    let voicemail = 0;
    try {
      const [vRows] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM call_logs
         WHERE agency_id IN (${placeholders})
           AND voicemail_url IS NOT NULL
           AND listened_at IS NULL
           AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        agencyIds
      );
      voicemail = Number(vRows?.[0]?.cnt || 0);
    } catch {
      voicemail = 0;
    }

    const openTicketTotal = openTickets + inProgress;

    res.json({
      kpis: {
        openTickets: openTicketTotal,
        messagesSent,
        deliveryRate,
        pendingInQueues: pendingInQueues + emailFailed,
        activeAlerts: emailFailed > 0 ? Math.min(emailFailed, 99) : 0,
        complianceScore: null
      },
      tickets: {
        open: openTickets,
        in_progress: inProgress,
        waiting,
        closed_today: closedToday,
        recent: recentTickets
      },
      queues: {
        sms: smsUnread,
        emailPending: pendingInQueues,
        emailFailed,
        voicemail
      },
      messagesMode: {
        unread: smsUnread,
        unassigned: smsUnassigned,
        queued: pendingInQueues,
        recentlySent: recentlySentSms + messagesSent,
        newInbound
      },
      engagement: {
        pendingCount: pendingInQueues,
        failedCount: emailFailed,
        qualityIssuesCount,
        sentTotalCount,
        pending: engagementPending,
        recentlySent: engagementRecent
      },
      recentActivity: [
        ...recentTickets.slice(0, 3).map((t) => ({
          id: `ticket-${t.id}`,
          kind: 'ticket',
          text: `Ticket #${t.id}: ${t.subject}`,
          occurredAt: t.updatedAt
        })),
        ...engagementPending.slice(0, 2).map((e) => ({
          id: `eng-p-${e.id}`,
          kind: 'automation',
          text: `${e.status}: ${e.subject}`,
          occurredAt: e.occurredAt
        })),
        ...engagementRecent.slice(0, 2).map((e) => ({
          id: `eng-s-${e.id}`,
          kind: 'sent',
          text: `Sent: ${e.subject}`,
          occurredAt: e.occurredAt
        }))
      ].slice(0, 8)
    });
  } catch (e) {
    next(e);
  }
};

export default {
  getMessagesDashboardSummary,
  getCommunicationsCenterSummary
};
