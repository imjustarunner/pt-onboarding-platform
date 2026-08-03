import pool from '../config/database.js';
import UserCommunication from '../models/UserCommunication.model.js';
import EmailTemplate from '../models/EmailTemplate.model.js';
import EmailTemplateService from '../services/emailTemplate.service.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import EmailService from '../services/email.service.js';
import StorageService from '../services/storage.service.js';
import { sendEmailFromIdentity } from '../services/unifiedEmail/unifiedEmailSender.service.js';
import {
  countMultiAgencyCommunicationQualityIssues,
  buildCommunicationListFilters,
  COMMUNICATION_MESSAGE_CATEGORIES,
  isCommunicationQualityResolved,
  getActiveQualityFlags,
  getDisplayQualityFlags,
  formatQualityFlags,
  validateOutboundEmailQuality
} from '../services/outboundEmailQuality.service.js';

const isAdminLike = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'support' || r === 'staff' || r === 'super_admin';
};

const ensureAgencyAccess = async (req, agencyId) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin') return { ok: true };
  const agencies = await User.getAgencies(req.user.id);
  const ok = (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
  return ok ? { ok: true } : { ok: false, status: 403, message: 'Access denied' };
};

const isProviderOrSchoolStaff = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'provider' || r === 'school_staff';
};

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const COMMUNICATION_DETAIL_SELECT = `
  uc.*,
  u.email as user_email, u.first_name as user_first_name, u.last_name as user_last_name,
  a.name as agency_name,
  gb.first_name as generated_by_first_name, gb.last_name as generated_by_last_name,
  gb.email as generated_by_email,
  c.full_name as client_name, c.initials as client_initials, c.identifier_code as client_identifier,
  esi.display_name as sender_display_name,
  esi.from_email as sender_from_email,
  esi.reply_to as sender_reply_to
`;

const COMMUNICATION_DETAIL_JOINS = `
  LEFT JOIN users u ON uc.user_id = u.id
  LEFT JOIN agencies a ON uc.agency_id = a.id
  LEFT JOIN users gb ON uc.generated_by_user_id = gb.id
  LEFT JOIN clients c ON uc.client_id = c.id
  LEFT JOIN email_sender_identities esi ON esi.id = NULLIF(
    CAST(JSON_UNQUOTE(JSON_EXTRACT(uc.metadata, '$.senderIdentityId')) AS UNSIGNED),
    0
  )
`;

function enrichCommunicationRow(row) {
  const meta = parseMetadata(row?.metadata);
  const fromEmail = meta.fromEmail || meta.from_email || row?.sender_from_email || null;
  const fromDisplayName = row?.sender_display_name || meta.fromDisplayName || meta.from_display_name || null;
  const replyTo = meta.replyTo || meta.reply_to || row?.sender_reply_to || null;
  const rowForScan = { ...row, metadata: meta };
  const activeFlags = getActiveQualityFlags(rowForScan, meta);
  const displayFlags = getDisplayQualityFlags(rowForScan, meta);
  const deliveryStatus = String(row?.delivery_status || '').toLowerCase();
  const blockedBeforeSend = !!(
    meta.qualityBlockedAt
    || meta.quality_blocked_at
    || (deliveryStatus === 'failed' && String(row?.error_message || '').startsWith('Blocked —'))
  );
  return {
    ...row,
    meta,
    from_email: fromEmail,
    from_display_name: fromDisplayName,
    reply_to: replyTo,
    trigger_key: meta.triggerKey || meta.trigger_key || null,
    email_source: meta.source || null,
    gmail_thread_id: meta.threadId || meta.thread_id || null,
    approved_by_user_id: meta.approvedByUserId || null,
    quality_flags: displayFlags,
    active_quality_flags: activeFlags,
    has_quality_issues: activeFlags.length > 0,
    is_quality_resolved: isCommunicationQualityResolved(meta),
    quality_resolved_at: meta.qualityResolvedAt || meta.quality_resolved_at || null,
    quality_resolved_note: meta.qualityResolvedNote || meta.quality_resolved_note || null,
    quality_blocked_before_send: blockedBeforeSend,
    can_edit_and_resend: ['pending', 'failed'].includes(deliveryStatus)
      && String(row?.channel || 'email').toLowerCase() === 'email'
      && (activeFlags.length > 0 || blockedBeforeSend),
    link_url: meta.linkUrl || meta.link_url || null,
    from_label: fromDisplayName && fromEmail
      ? `${fromDisplayName} <${fromEmail}>`
      : (fromEmail || fromDisplayName || null)
  };
}

function sortEnrichedCommunications(items, sort = 'newest', { reviewedLast = false } = {}) {
  const list = [...items];
  list.sort((a, b) => {
    if (reviewedLast && a.is_quality_resolved !== b.is_quality_resolved) {
      return a.is_quality_resolved ? 1 : -1;
    }
    if (sort === 'oldest') {
      const da = new Date(a.generated_at || a.sent_at || 0).getTime();
      const db = new Date(b.generated_at || b.sent_at || 0).getTime();
      return da - db || Number(a.id) - Number(b.id);
    }
    if (sort === 'subject') {
      return String(a.subject || '').localeCompare(String(b.subject || '')) || Number(b.id) - Number(a.id);
    }
    if (sort === 'recipient') {
      return String(a.recipient_address || '').localeCompare(String(b.recipient_address || '')) || Number(b.id) - Number(a.id);
    }
    if (sort === 'template') {
      return String(a.template_type || '').localeCompare(String(b.template_type || ''))
        || new Date(b.generated_at || 0) - new Date(a.generated_at || 0);
    }
    const da = new Date(a.generated_at || a.sent_at || 0).getTime();
    const db = new Date(b.generated_at || b.sent_at || 0).getTime();
    return db - da || Number(b.id) - Number(a.id);
  });
  return list;
}

async function sendCommunicationRecord(comm, meta, userId) {
  const subject = String(comm.subject || '').trim();
  const body = String(comm.body || '').trim();
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(body);
  const senderIdentityId = Number(meta.senderIdentityId || meta.sender_identity_id || 0) || null;
  const linkUrl = meta.linkUrl || meta.link_url || null;

  if (senderIdentityId) {
    return sendEmailFromIdentity({
      senderIdentityId,
      to: comm.recipient_address,
      subject: subject || 'Notification',
      text: looksLikeHtml ? null : body,
      html: looksLikeHtml ? body : null,
      source: 'manual',
      clientId: comm.client_id || null,
      userId: comm.user_id || null,
      templateType: comm.template_type || null,
      templateId: comm.template_id || null,
      generatedByUserId: userId || null,
      linkUrl,
      existingCommunicationId: comm.id
    });
  }
  return EmailService.sendEmail({
    to: comm.recipient_address,
    subject: subject || 'Notification',
    text: looksLikeHtml ? null : body,
    html: looksLikeHtml ? body : null,
    source: 'manual',
    agencyId: comm.agency_id,
    clientId: comm.client_id || null,
    userId: comm.user_id || null,
    templateType: comm.template_type || 'manual',
    templateId: comm.template_id || null,
    generatedByUserId: userId || null,
    existingCommunicationId: comm.id,
    linkUrl
  });
}

function isTrackingPixelUrl(url) {
  const u = String(url || '').toLowerCase();
  return u.includes('/api/email/track-open/') || u.includes('track-open') || /\.gif(\?|$)/i.test(u);
}

function buildIntakeUrl(publicKey) {
  const key = String(publicKey || '').trim();
  if (!key) return null;
  const base = String(
    process.env.PUBLIC_INTAKE_BASE_URL
      || process.env.PUBLIC_APP_URL
      || process.env.FRONTEND_URL
      || ''
  ).trim().replace(/\/+$/, '');
  if (!base) return `/intake/${encodeURIComponent(key)}`;
  return `${base}/intake/${encodeURIComponent(key)}`;
}

function extractLinksFromCommunication(row, meta = {}) {
  const links = [];
  const seen = new Set();
  const add = (url, label = null, source = null) => {
    const u = String(url || '').trim();
    if (!u || !/^https?:\/\//i.test(u) || seen.has(u) || isTrackingPixelUrl(u)) return;
    seen.add(u);
    links.push({ url: u, label, source });
  };

  const body = String(row?.body || '');
  let match;
  const hrefRegex = /href=["']([^"']+)["']/gi;
  while ((match = hrefRegex.exec(body))) add(match[1], null, 'body');
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  while ((match = urlRegex.exec(body))) add(match[0], null, 'body');

  for (const [key, value] of Object.entries(meta || {})) {
    if (typeof value !== 'string') continue;
    if (/url|link|href/i.test(key) && /^https?:\/\//i.test(value)) {
      add(value, key.replace(/_/g, ' '), 'metadata');
    }
  }
  return links;
}

function inferPurpose(row, meta = {}) {
  const templateType = String(row?.template_type || '').toLowerCase();
  const subject = String(row?.subject || '').toLowerCase();
  const triggerKey = String(meta.triggerKey || meta.trigger_key || '').trim();

  if (['school_roi_signing', 'school_roi_release', 'smart_school_roi'].includes(templateType)) {
    return 'School ROI signing link sent to guardian/signer';
  }
  if (templateType === 'school_roi_signer_completion') {
    return 'School ROI completion / download email to signer';
  }
  if (templateType === 'job_application_received' || subject.startsWith('application received')) {
    return 'Job application confirmation email to applicant';
  }
  if (['intake', 'intake_packet_completion'].includes(templateType)) {
    return 'Intake / paperwork completion email';
  }
  if (subject.includes('release of information') || bodyMentionsRoiLink(row?.body)) {
    return 'School ROI signing link sent to guardian/signer (inferred from subject/body)';
  }
  if (triggerKey) return `Automated notification trigger: ${triggerKey}`;
  if (templateType.startsWith('trigger:')) return `Automated notification trigger: ${templateType.slice('trigger:'.length)}`;
  if (templateType === 'identity_send') return 'Outbound email via sender identity';
  if (templateType === 'transactional_email') return 'Transactional system email';
  if (String(meta.source || row?.email_source || '').toLowerCase() === 'manual') {
    return 'Manually sent or approved from Communications Center';
  }
  return 'Automated system email';
}

function bodyMentionsRoiLink(body) {
  const text = String(body || '').replace(/<[^>]+>/g, ' ').toLowerCase();
  return text.includes('release of information') || text.includes('private link');
}

function shouldLookupIntakeSubmission(row, meta = {}) {
  if (Number(meta.intakeSubmissionId || meta.intake_submission_id || 0)) return true;
  const templateType = String(row?.template_type || '').toLowerCase();
  const subject = String(row?.subject || '').toLowerCase();
  if (['intake', 'intake_packet_completion', 'job_application_received', 'school_roi_signing'].includes(templateType)) {
    return true;
  }
  if (subject.startsWith('application received')) return true;
  if (subject.includes('release of information')) return true;
  if (bodyMentionsRoiLink(row?.body)) return true;
  return false;
}

async function resolveIntakeSubmissionId(row, meta = {}, relatedClient = null) {
  const fromMeta = Number(meta.intakeSubmissionId || meta.intake_submission_id || 0);
  if (fromMeta) return fromMeta;
  if (!shouldLookupIntakeSubmission(row, meta)) return null;

  const recipient = String(row?.recipient_address || '').trim().toLowerCase();
  const sentAt = row?.sent_at || row?.generated_at || new Date();
  const userId = row?.user_id ? Number(row.user_id) : null;
  const clientId = relatedClient?.id || (row?.client_id ? Number(row.client_id) : null);
  if (!recipient && !userId && !clientId) return null;

  try {
    const [rows] = await pool.execute(
      `SELECT s.id
       FROM intake_submissions s
       LEFT JOIN intake_links il ON il.id = s.intake_link_id
       WHERE (? IS NULL OR il.agency_id = ?)
         AND (
           (? IS NOT NULL AND LOWER(TRIM(s.signer_email)) = ?)
           OR (? IS NOT NULL AND s.guardian_user_id = ?)
           OR (? IS NOT NULL AND s.client_id = ?)
         )
       ORDER BY ABS(TIMESTAMPDIFF(SECOND, COALESCE(s.submitted_at, s.created_at), ?)) ASC
       LIMIT 1`,
      [
        row?.agency_id ? Number(row.agency_id) : null,
        row?.agency_id ? Number(row.agency_id) : null,
        recipient || null, recipient || '',
        userId || null, userId || 0,
        clientId || null, clientId || 0,
        sentAt
      ]
    );
    return rows?.[0]?.id ? Number(rows[0].id) : null;
  } catch {
    return null;
  }
}

async function buildRelatedRecords(row, meta = {}, relatedClient = null) {
  const records = [];
  const userId = row?.user_id ? Number(row.user_id) : null;
  const clientRecord = relatedClient?.id
    ? relatedClient
    : (row?.client_id
      ? {
          id: Number(row.client_id),
          name: row.client_name || null,
          identifier: row.client_identifier || null,
          inferred: false
        }
      : null);

  if (clientRecord?.id) {
    records.push({
      type: 'client',
      label: clientRecord.name || `Client #${clientRecord.id}`,
      clientId: clientRecord.id,
      identifier: clientRecord.identifier || null,
      inferred: !!clientRecord.inferred
    });
  }

  if (userId) {
    try {
      const [hpRows] = await pool.execute(
        `SELECT hp.id, hp.job_description_id, jd.title AS job_title
         FROM hiring_profiles hp
         LEFT JOIN hiring_job_descriptions jd ON jd.id = hp.job_description_id
         WHERE hp.candidate_user_id = ?
         LIMIT 1`,
        [userId]
      );
      if (hpRows?.[0]) {
        records.push({
          type: 'hiring_applicant',
          label: hpRows[0].job_title
            ? `Applicant — ${hpRows[0].job_title}`
            : 'Job applicant profile',
          userId,
          jobDescriptionId: hpRows[0].job_description_id ? Number(hpRows[0].job_description_id) : null,
          jobTitle: hpRows[0].job_title || null
        });
      }
    } catch {
      /* best effort */
    }
  }

  const submissionId = await resolveIntakeSubmissionId(row, meta, clientRecord);
  if (submissionId) {
    try {
      const [subRows] = await pool.execute(
        `SELECT s.id, s.status, s.submitted_at, s.combined_pdf_path, s.signer_name,
                il.title AS intake_link_title, il.form_type
         FROM intake_submissions s
         LEFT JOIN intake_links il ON il.id = s.intake_link_id
         WHERE s.id = ?
         LIMIT 1`,
        [submissionId]
      );
      const sub = subRows?.[0];
      if (sub) {
        const [docRows] = await pool.execute(
          `SELECT COUNT(*) AS cnt FROM intake_submission_documents WHERE intake_submission_id = ?`,
          [submissionId]
        );
        const docCount = Number(docRows?.[0]?.cnt || 0);
        let pdfDownloadUrl = null;
        if (sub.combined_pdf_path) {
          try {
            pdfDownloadUrl = await StorageService.getSignedUrl(sub.combined_pdf_path, 60);
          } catch {
            /* best effort */
          }
        }
        records.push({
          type: 'intake_submission',
          label: sub.intake_link_title || 'Intake submission',
          submissionId: Number(submissionId),
          formType: sub.form_type || null,
          signerName: sub.signer_name || null,
          submittedAt: sub.submitted_at || null,
          status: sub.status || null,
          documentCount: docCount,
          hasPdf: !!sub.combined_pdf_path,
          pdfDownloadUrl,
          inferred: !Number(meta.intakeSubmissionId || meta.intake_submission_id || 0)
        });
      }
    } catch {
      /* best effort */
    }
  }

  return records;
}

async function buildSendContext(row) {
  const meta = parseMetadata(row?.metadata);
  const recipient = String(row?.recipient_address || '').trim().toLowerCase();
  const sentAt = row?.sent_at || row?.generated_at || null;
  const gaps = [];
  const links = extractLinksFromCommunication(row, meta);

  let relatedClient = row?.client_id
    ? {
        id: Number(row.client_id),
        name: row.client_name || null,
        identifier: row.client_identifier || null,
        inferred: false
      }
    : null;

  let triggeredBy = row?.generated_by_user_id
    ? {
        id: Number(row.generated_by_user_id),
        name: [row.generated_by_first_name, row.generated_by_last_name].filter(Boolean).join(' ') || null,
        email: row.generated_by_email || null
      }
    : null;

  if (!relatedClient && recipient && row?.agency_id) {
    try {
      const [guardianRows] = await pool.execute(
        `SELECT c.id, c.full_name, c.identifier_code
         FROM client_guardians cg
         INNER JOIN clients c ON c.id = cg.client_id
         WHERE LOWER(TRIM(cg.email)) = ?
           AND c.agency_id = ?
         LIMIT 5`,
        [recipient, Number(row.agency_id)]
      );
      if (guardianRows.length === 1) {
        relatedClient = {
          id: Number(guardianRows[0].id),
          name: guardianRows[0].full_name || null,
          identifier: guardianRows[0].identifier_code || null,
          inferred: true
        };
      } else if (guardianRows.length > 1) {
        gaps.push(`Recipient matches guardians on ${guardianRows.length} clients — client not linked on this record.`);
      }
    } catch {
      /* best effort */
    }
  }

  if (!triggeredBy) gaps.push('No staff member was recorded as having sent or approved this email.');

  let auditEvent = null;
  if (row?.agency_id && sentAt) {
    try {
      const [auditRows] = await pool.execute(
        `SELECT aal.action_type, aal.created_at, aal.metadata, aal.actor_user_id,
                actor.first_name AS actor_first_name, actor.last_name AS actor_last_name, actor.email AS actor_email
         FROM admin_audit_log aal
         LEFT JOIN users actor ON actor.id = aal.actor_user_id
         WHERE aal.agency_id = ?
           AND aal.created_at BETWEEN DATE_SUB(?, INTERVAL 5 MINUTE) AND DATE_ADD(?, INTERVAL 5 MINUTE)
           AND (
             aal.action_type LIKE '%email%'
             OR aal.action_type LIKE '%roi%'
             OR aal.action_type LIKE '%communication%'
           )
         ORDER BY ABS(TIMESTAMPDIFF(SECOND, aal.created_at, ?)) ASC
         LIMIT 10`,
        [Number(row.agency_id), sentAt, sentAt, sentAt]
      );
      const match = (auditRows || []).find((a) => {
        const m = parseMetadata(a.metadata);
        const toEmail = String(m?.toEmail || m?.to_email || m?.email || '').trim().toLowerCase();
        if (toEmail && recipient && toEmail === recipient) return true;
        if (relatedClient?.id && Number(m?.clientId || m?.client_id || 0) === Number(relatedClient.id)) return true;
        return false;
      }) || auditRows?.[0] || null;
      if (match) {
        auditEvent = {
          actionType: match.action_type,
          at: match.created_at,
          actorName: [match.actor_first_name, match.actor_last_name].filter(Boolean).join(' ') || null,
          actorEmail: match.actor_email || null,
          metadata: parseMetadata(match.metadata)
        };
        if (!triggeredBy && match.actor_user_id) {
          triggeredBy = {
            id: Number(match.actor_user_id),
            name: auditEvent.actorName,
            email: auditEvent.actorEmail,
            inferred: true
          };
        }
      }
    } catch {
      /* best effort */
    }
  }

  if (relatedClient?.id && !links.some((l) => /\/intake\//i.test(l.url))) {
    try {
      const [roiRows] = await pool.execute(
        `SELECT public_key, last_email_sent_to, last_email_sent_at
         FROM client_school_roi_signing_links
         WHERE client_id = ?
         ORDER BY
           CASE WHEN LOWER(TRIM(last_email_sent_to)) = ? THEN 0 ELSE 1 END,
           ABS(TIMESTAMPDIFF(SECOND, COALESCE(last_email_sent_at, '1970-01-01'), ?)) ASC
         LIMIT 1`,
        [relatedClient.id, recipient || '', sentAt || new Date()]
      );
      const roi = roiRows?.[0];
      const url = buildIntakeUrl(roi?.public_key);
      if (url && roi?.last_email_sent_at) {
        const diffSec = Math.abs(new Date(roi.last_email_sent_at).getTime() - new Date(sentAt || 0).getTime());
        if (diffSec <= 10 * 60) {
          links.push({ url, label: 'ROI signing link (from signing link record)', source: 'roi_signing_link' });
        }
      }
    } catch {
      /* best effort */
    }
  }

  if (!relatedClient) gaps.push('No client was linked to this communication record.');
  if (!links.length && bodyMentionsRoiLink(row?.body)) {
    gaps.push('Message text references a private link, but no signing URL was stored on this record.');
  } else if (!links.length) {
    gaps.push('No clickable links were stored on this message record.');
  }

  const purpose = inferPurpose(row, meta);
  let summary = purpose;
  if (relatedClient?.name) {
    summary += ` for ${relatedClient.name}${relatedClient.identifier ? ` (${relatedClient.identifier})` : ''}`;
  }
  if (recipient) summary += ` → ${recipient}`;
  if (triggeredBy?.name) summary += `. Sent by ${triggeredBy.name}.`;
  else if (auditEvent?.actionType) summary += `. Matched audit action: ${auditEvent.actionType.replace(/_/g, ' ')}.`;

  const relatedRecords = await buildRelatedRecords(row, meta, relatedClient);

  return {
    purpose,
    summary,
    links,
    relatedClient,
    triggeredBy,
    auditEvent,
    relatedRecords,
    gaps
  };
}

export const getUserCommunications = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { agencyId, templateType, limit, offset } = req.query;
    const currentUserId = req.user.id;
    const userRole = req.user.role;
    const targetUserId = parseInt(userId, 10);

    // Providers and school staff may only view their own communications.
    if (isProviderOrSchoolStaff(userRole)) {
      if (targetUserId !== currentUserId) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    // Verify access - user can view communications for users in their agencies
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(currentUserId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      // Get target user's agencies
      const targetUserAgencies = await User.getAgencies(targetUserId);
      const targetUserAgencyIds = targetUserAgencies.map(a => a.id);
      
      // Check if there's any overlap
      const hasAccess = targetUserAgencyIds.some(id => userAgencyIds.includes(id));
      
      if (!hasAccess && userRole !== 'supervisor' && userRole !== 'clinical_practice_assistant' && userRole !== 'support') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const communications = await UserCommunication.findByUser(targetUserId, {
      agencyId: agencyId ? parseInt(agencyId) : undefined,
      templateType,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    res.json(communications);
  } catch (error) {
    next(error);
  }
};

export const getCommunication = async (req, res, next) => {
  try {
    const { userId, id } = req.params;
    const currentUserId = req.user.id;
    const userRole = req.user.role;

    const communication = await UserCommunication.findById(parseInt(id));
    
    if (!communication) {
      return res.status(404).json({ error: { message: 'Communication not found' } });
    }

    // Verify it belongs to the specified user
    if (communication.user_id !== parseInt(userId)) {
      return res.status(404).json({ error: { message: 'Communication not found' } });
    }

    // Verify access
    if (userRole !== 'super_admin') {
      const userAgencies = await User.getAgencies(currentUserId);
      const userAgencyIds = userAgencies.map(a => a.id);
      
      if (!userAgencyIds.includes(communication.agency_id) && 
          userRole !== 'supervisor' && 
          userRole !== 'support') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    res.json(communication);
  } catch (error) {
    next(error);
  }
};

export const regenerateEmail = async (req, res, next) => {
  try {
    const { userId, id } = req.params;
    const currentUserId = req.user.id;
    const userRole = req.user.role;

    const communication = await UserCommunication.findById(parseInt(id));
    
    if (!communication) {
      return res.status(404).json({ error: { message: 'Communication not found' } });
    }

    // Verify it belongs to the specified user
    if (communication.user_id !== parseInt(userId)) {
      return res.status(404).json({ error: { message: 'Communication not found' } });
    }

    // Verify access
    if (userRole !== 'super_admin' && userRole !== 'admin' && userRole !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Check if template still exists
    if (!communication.template_id) {
      return res.status(400).json({ error: { message: 'Original template no longer exists' } });
    }

    const template = await EmailTemplate.findById(communication.template_id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Template no longer exists' } });
    }

    // Get user and agency
    const user = await User.findById(communication.user_id);
    const agency = await Agency.findById(communication.agency_id);

    if (!user || !agency) {
      return res.status(404).json({ error: { message: 'User or agency not found' } });
    }

    // Get current user for sender name
    const sender = await User.findById(currentUserId);
    const senderName = sender ? `${sender.first_name} ${sender.last_name}` : 'System';

    // Regenerate email (note: we don't have the original temp password or token, so some params will be missing)
    const parameters = await EmailTemplateService.collectParameters(user, agency, {
      senderName
    });

    const rendered = EmailTemplateService.renderTemplate(template, parameters);

    res.json({
      rendered,
      parameters,
      note: 'Some parameters (like TEMP_PASSWORD and RESET_TOKEN_LINK) may be missing as they are not stored for security reasons.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get total pending communications count across user's agencies (for nav badge).
 * GET /api/communications/pending-count
 */
export const getPendingCommunicationsCount = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const role = String(req.user?.role || '').toLowerCase();
    let agencyIds = [];
    if (role === 'super_admin') {
      const [rows] = await pool.execute(
        'SELECT id FROM agencies WHERE organization_type IN (\'agency\', \'school\') OR organization_type IS NULL'
      );
      agencyIds = (rows || []).map((r) => r.id);
    } else {
      const agencies = await User.getAgencies(req.user.id);
      agencyIds = (agencies || []).map((a) => a.id);
    }

    if (agencyIds.length === 0) {
      return res.json({ count: 0 });
    }

    const placeholders = agencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM user_communications uc
       WHERE uc.agency_id IN (${placeholders})
         AND uc.delivery_status IN ('pending', 'failed', 'bounced', 'undelivered')`,
      agencyIds
    );
    const count = Number(rows?.[0]?.cnt || 0);
    let qualityIssuesCount = 0;
    try {
      qualityIssuesCount = await countMultiAgencyCommunicationQualityIssues(agencyIds, { pool });
    } catch {
      qualityIssuesCount = 0;
    }
    res.json({ count, qualityIssuesCount });
  } catch (error) {
    next(error);
  }
};

export const listCommunicationCategories = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const channel = req.query?.channel ? String(req.query.channel).trim().toLowerCase() : null;
    const status = req.query?.status ? String(req.query.status).trim().toLowerCase() : 'sent';

    const categories = [];
    for (const meta of COMMUNICATION_MESSAGE_CATEGORIES) {
      let count = 0;
      if (meta.key === 'quality') {
        count = await countMultiAgencyCommunicationQualityIssues([agencyId], { pool, channel: channel || 'email' });
      } else {
        const { where, params } = buildCommunicationListFilters({
          agencyId,
          channel,
          status: meta.key === 'quality' ? 'all' : status,
          category: meta.key
        });
        const [countRows] = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM user_communications uc
           LEFT JOIN users u ON uc.user_id = u.id
           LEFT JOIN clients c ON uc.client_id = c.id
           WHERE ${where.join(' AND ')}`,
          params
        );
        count = Number(countRows?.[0]?.cnt || 0);
      }
      categories.push({
        key: meta.key,
        label: meta.label,
        group: meta.group,
        count
      });
    }

    res.json(categories);
  } catch (error) {
    next(error);
  }
};

export const listPendingCommunications = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const access = await ensureAgencyAccess(req, agencyId);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const channel = req.query?.channel ? String(req.query.channel).trim().toLowerCase() : null;
    const status = req.query?.status ? String(req.query.status).trim().toLowerCase() : null;
    const q = req.query?.q ? String(req.query.q).trim() : '';
    const sort = String(req.query?.sort || 'newest').trim().toLowerCase();
    const category = req.query?.category ? String(req.query.category).trim().toLowerCase() : '';
    const limitRaw = req.query?.limit ? parseInt(String(req.query.limit), 10) : null;
    const offsetRaw = req.query?.offset ? parseInt(String(req.query.offset), 10) : 0;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const { where, params } = buildCommunicationListFilters({
      agencyId,
      channel,
      status,
      category: category === 'quality' ? '' : category,
      q
    });

    let orderBy = 'uc.generated_at DESC, uc.id DESC';
    if (sort === 'oldest') orderBy = 'uc.generated_at ASC, uc.id ASC';
    else if (sort === 'subject') orderBy = 'uc.subject ASC, uc.id DESC';
    else if (sort === 'recipient') orderBy = 'uc.recipient_address ASC, uc.id DESC';
    else if (sort === 'template') orderBy = 'uc.template_type ASC, uc.generated_at DESC';

    const fromClause = `
      FROM user_communications uc
      ${COMMUNICATION_DETAIL_JOINS}
      WHERE ${where.join(' AND ')}
    `;

    if (category === 'quality') {
      const [rows] = await pool.execute(
        `SELECT ${COMMUNICATION_DETAIL_SELECT}
         ${fromClause}
         ORDER BY ${orderBy}
         LIMIT 5000`,
        params
      );
      const filtered = sortEnrichedCommunications(
        (rows || []).map(enrichCommunicationRow).filter((r) => r.has_quality_issues || r.is_quality_resolved),
        sort,
        { reviewedLast: true }
      );
      const openOnly = filtered.filter((r) => r.has_quality_issues);
      const total = openOnly.length;
      const items = openOnly.slice(offset, offset + limit);
      return res.json({
        items,
        total,
        offset,
        limit,
        hasMore: offset + items.length < total
      });
    }

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt ${fromClause}`,
      params
    );
    const total = Number(countRows?.[0]?.cnt || 0);

    const [rows] = await pool.execute(
      `SELECT ${COMMUNICATION_DETAIL_SELECT}
       ${fromClause}
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const items = (rows || []).map(enrichCommunicationRow);
    res.json({
      items,
      total,
      offset,
      limit,
      hasMore: offset + items.length < total
    });
  } catch (error) {
    next(error);
  }
};

export const getCommunicationDetail = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid communication id' } });

    const [rows] = await pool.execute(
      `SELECT ${COMMUNICATION_DETAIL_SELECT}
       FROM user_communications uc
       ${COMMUNICATION_DETAIL_JOINS}
       WHERE uc.id = ?
       LIMIT 1`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: { message: 'Communication not found' } });

    const access = await ensureAgencyAccess(req, row.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const enriched = enrichCommunicationRow(row);
    const sendContext = await buildSendContext(row);
    res.json({
      ...enriched,
      send_context: sendContext,
      links: sendContext.links || []
    });
  } catch (error) {
    next(error);
  }
};

export const approveCommunication = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid communication id' } });

    const comm = await UserCommunication.findById(id);
    if (!comm) return res.status(404).json({ error: { message: 'Communication not found' } });

    const access = await ensureAgencyAccess(req, comm.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (String(comm.channel || '').toLowerCase() !== 'email') {
      return res.status(409).json({ error: { message: 'Only email approvals are supported right now' } });
    }

    const status = String(comm.delivery_status || '').toLowerCase();
    if (status !== 'pending') {
      return res.status(409).json({ error: { message: `Communication is ${status || 'unknown'}, not pending approval` } });
    }

    const subject = String(comm.subject || '').trim();
    const body = String(comm.body || '').trim();
    if (!comm.recipient_address || !body) {
      return res.status(400).json({ error: { message: 'Missing recipient or body' } });
    }

    const meta = parseMetadata(comm.metadata);
    const senderIdentityId = Number(meta.senderIdentityId || meta.sender_identity_id || 0) || null;
    const looksLikeHtml = /<[a-z][\s\S]*>/i.test(body);

    let result;
    if (senderIdentityId) {
      result = await sendEmailFromIdentity({
        senderIdentityId,
        to: comm.recipient_address,
        subject: subject || 'Notification',
        text: looksLikeHtml ? null : body,
        html: looksLikeHtml ? body : null,
        source: 'manual',
        clientId: comm.client_id || null,
        userId: comm.user_id || null,
        templateType: comm.template_type || null,
        templateId: comm.template_id || null,
        generatedByUserId: req.user?.id || null,
        linkUrl: meta.linkUrl || null,
        existingCommunicationId: comm.id
      });
      if (result?.pendingApproval) {
        return res.status(409).json({ error: { message: 'Approval send was blocked by email settings' } });
      }
    } else {
      result = await EmailService.sendEmail({
        to: comm.recipient_address,
        subject: subject || 'Notification',
        text: looksLikeHtml ? null : body,
        html: looksLikeHtml ? body : null,
        source: 'manual',
        agencyId: comm.agency_id,
        clientId: comm.client_id || null,
        userId: comm.user_id || null,
        templateType: comm.template_type || 'manual',
        templateId: comm.template_id || null,
        generatedByUserId: req.user?.id || null,
        existingCommunicationId: comm.id
      });
    }

    if (result?.skipped) {
      return res.status(409).json({ error: { message: `Email send blocked: ${result.reason}` } });
    }
    if (result?.blocked) {
      const flagText = (result.qualityFlags || []).map((f) => f.message).filter(Boolean).join(' ');
      return res.status(409).json({
        error: {
          message: flagText || 'Email blocked — quality checks failed. Fix the message before approving.',
          qualityFlags: result.qualityFlags || []
        }
      });
    }

    const providerMessageId = result?.id || result?.messageId || null;
    const updated = await UserCommunication.updateDeliveryStatus(
      comm.id,
      'sent',
      providerMessageId,
      result?.threadId || null,
      null,
      { approvedByUserId: req.user.id }
    );
    res.json(updated || null);
  } catch (error) {
    next(error);
  }
};

export const cancelCommunication = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid communication id' } });

    const comm = await UserCommunication.findById(id);
    if (!comm) return res.status(404).json({ error: { message: 'Communication not found' } });

    const access = await ensureAgencyAccess(req, comm.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const updated = await UserCommunication.updateDeliveryStatus(
      comm.id,
      'cancelled',
      null,
      null,
      'cancelled',
      { cancelledByUserId: req.user.id }
    );
    res.json(updated || null);
  } catch (error) {
    next(error);
  }
};

async function applyCommunicationDraftUpdates(comm, body = {}) {
  const updates = [];
  const values = [];
  const meta = parseMetadata(comm.metadata);

  if (body.subject !== undefined) {
    updates.push('subject = ?');
    values.push(String(body.subject || '').trim() || null);
  }
  if (body.body !== undefined) {
    updates.push('body = ?');
    values.push(String(body.body || ''));
  }
  if (body.recipient_address !== undefined) {
    updates.push('recipient_address = ?');
    values.push(String(body.recipient_address || '').trim() || null);
  }
  if (body.client_id !== undefined) {
    const cid = Number(body.client_id);
    updates.push('client_id = ?');
    values.push(Number.isFinite(cid) && cid > 0 ? cid : null);
  }
  if (body.linkUrl !== undefined) {
    const link = String(body.linkUrl || '').trim();
    if (link) meta.linkUrl = link;
    else delete meta.linkUrl;
    delete meta.qualityResolvedAt;
    delete meta.qualityResolvedByUserId;
    delete meta.qualityResolvedFlags;
    delete meta.qualityResolvedNote;
  }
  if (body.subject !== undefined || body.body !== undefined) {
    delete meta.qualityResolvedAt;
    delete meta.qualityResolvedByUserId;
    delete meta.qualityResolvedFlags;
    delete meta.qualityResolvedNote;
  }

  if (updates.length) {
    values.push(comm.id);
    await pool.execute(
      `UPDATE user_communications SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }
  if (body.linkUrl !== undefined || body.subject !== undefined || body.body !== undefined) {
    await pool.execute(
      'UPDATE user_communications SET metadata = ? WHERE id = ?',
      [JSON.stringify(meta), comm.id]
    );
  }
  return UserCommunication.findById(comm.id);
}

async function fetchEnrichedCommunicationById(id) {
  const [rows] = await pool.execute(
    `SELECT ${COMMUNICATION_DETAIL_SELECT}
     FROM user_communications uc
     ${COMMUNICATION_DETAIL_JOINS}
     WHERE uc.id = ?
     LIMIT 1`,
    [id]
  );
  const row = rows?.[0];
  return row ? enrichCommunicationRow(row) : null;
}

export const updateCommunicationDraft = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid communication id' } });

    const comm = await UserCommunication.findById(id);
    if (!comm) return res.status(404).json({ error: { message: 'Communication not found' } });

    const access = await ensureAgencyAccess(req, comm.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (String(comm.channel || '').toLowerCase() !== 'email') {
      return res.status(409).json({ error: { message: 'Only email messages can be edited' } });
    }

    const status = String(comm.delivery_status || '').toLowerCase();
    if (!['pending', 'failed'].includes(status)) {
      return res.status(409).json({ error: { message: 'Only pending or failed messages can be edited' } });
    }

    const updated = await applyCommunicationDraftUpdates(comm, req.body || {});
    const enriched = await fetchEnrichedCommunicationById(updated.id);
    res.json(enriched);
  } catch (error) {
    next(error);
  }
};

export const resolveCommunicationQuality = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid communication id' } });

    const comm = await UserCommunication.findById(id);
    if (!comm) return res.status(404).json({ error: { message: 'Communication not found' } });

    const access = await ensureAgencyAccess(req, comm.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const meta = parseMetadata(comm.metadata);
    if (isCommunicationQualityResolved(meta)) {
      return res.status(409).json({ error: { message: 'Quality issue already marked resolved' } });
    }

    const activeFlags = getActiveQualityFlags(comm, meta);
    if (!activeFlags.length) {
      return res.status(400).json({ error: { message: 'No open quality issues on this message' } });
    }

    meta.qualityResolvedFlags = activeFlags;
    meta.qualityResolvedAt = new Date().toISOString();
    meta.qualityResolvedByUserId = req.user.id;
    const note = String(req.body?.note || '').trim();
    if (note) meta.qualityResolvedNote = note.slice(0, 500);

    await pool.execute(
      'UPDATE user_communications SET metadata = ? WHERE id = ?',
      [JSON.stringify(meta), comm.id]
    );

    const enriched = await fetchEnrichedCommunicationById(comm.id);
    res.json(enriched);
  } catch (error) {
    next(error);
  }
};

export const resolveCommunicationsQualityBulk = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((v) => parseInt(v, 10)).filter(Boolean) : [];
    if (!ids.length) {
      return res.status(400).json({ error: { message: 'ids array is required' } });
    }

    const note = String(req.body?.note || '').trim();
    let resolved = 0;
    const skipped = [];

    for (const id of ids) {
      const comm = await UserCommunication.findById(id);
      if (!comm) {
        skipped.push({ id, reason: 'not_found' });
        continue;
      }
      const access = await ensureAgencyAccess(req, comm.agency_id);
      if (!access.ok) {
        skipped.push({ id, reason: 'access_denied' });
        continue;
      }
      const meta = parseMetadata(comm.metadata);
      if (isCommunicationQualityResolved(meta)) {
        skipped.push({ id, reason: 'already_resolved' });
        continue;
      }
      const activeFlags = getActiveQualityFlags(comm, meta);
      if (!activeFlags.length) {
        skipped.push({ id, reason: 'no_issues' });
        continue;
      }
      meta.qualityResolvedFlags = activeFlags;
      meta.qualityResolvedAt = new Date().toISOString();
      meta.qualityResolvedByUserId = req.user.id;
      if (note) meta.qualityResolvedNote = note.slice(0, 500);
      await pool.execute(
        'UPDATE user_communications SET metadata = ? WHERE id = ?',
        [JSON.stringify(meta), comm.id]
      );
      resolved++;
    }

    res.json({ resolved, skipped });
  } catch (error) {
    next(error);
  }
};

export const retryCommunicationSend = async (req, res, next) => {
  try {
    if (!isAdminLike(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid communication id' } });

    let comm = await UserCommunication.findById(id);
    if (!comm) return res.status(404).json({ error: { message: 'Communication not found' } });

    const access = await ensureAgencyAccess(req, comm.agency_id);
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    if (String(comm.channel || '').toLowerCase() !== 'email') {
      return res.status(409).json({ error: { message: 'Only email retries are supported right now' } });
    }

    const status = String(comm.delivery_status || '').toLowerCase();
    if (!['pending', 'failed'].includes(status)) {
      return res.status(409).json({ error: { message: `Cannot resend — message is ${status || 'unknown'}` } });
    }

    if (req.body && Object.keys(req.body).length) {
      comm = await applyCommunicationDraftUpdates(comm, req.body);
    }

    const subject = String(comm.subject || '').trim();
    const body = String(comm.body || '').trim();
    if (!comm.recipient_address || !body) {
      return res.status(400).json({ error: { message: 'Missing recipient or body' } });
    }

    const meta = parseMetadata(comm.metadata);
    const linkUrl = meta.linkUrl || meta.link_url || null;
    const looksLikeHtml = /<[a-z][\s\S]*>/i.test(body);
    const previewQuality = validateOutboundEmailQuality({
      subject,
      text: looksLikeHtml ? null : body,
      html: looksLikeHtml ? body : null,
      linkUrl,
      templateType: comm.template_type,
      clientId: comm.client_id
    });
    if (!previewQuality.ok) {
      return res.status(409).json({
        error: {
          message: formatQualityFlags(previewQuality.flags) || 'Quality checks still failing — fix the message first.',
          qualityFlags: previewQuality.flags
        }
      });
    }

    const result = await sendCommunicationRecord(comm, meta, req.user?.id);

    if (result?.pendingApproval) {
      return res.status(409).json({ error: { message: 'Send was blocked by email settings' } });
    }
    if (result?.skipped) {
      return res.status(409).json({ error: { message: `Email send blocked: ${result.reason}` } });
    }
    if (result?.blocked) {
      const flagText = (result.qualityFlags || []).map((f) => f.message).filter(Boolean).join(' ');
      return res.status(409).json({
        error: {
          message: flagText || 'Email blocked — quality checks failed.',
          qualityFlags: result.qualityFlags || []
        }
      });
    }

    const providerMessageId = result?.id || result?.messageId || null;
    const sentMeta = {
      ...meta,
      retriedByUserId: req.user.id,
      retriedAt: new Date().toISOString()
    };
    delete sentMeta.qualityFlags;
    delete sentMeta.qualityBlockedAt;

    await UserCommunication.updateDeliveryStatus(
      comm.id,
      'sent',
      providerMessageId,
      result?.threadId || null,
      null,
      sentMeta
    );

    const enriched = await fetchEnrichedCommunicationById(comm.id);
    res.json(enriched);
  } catch (error) {
    next(error);
  }
};
