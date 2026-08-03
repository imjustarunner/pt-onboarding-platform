/**
 * Outbound email quality checks — block sends that promise attachments or links
 * but do not include them, and flag ROI emails missing required context.
 */

import { buildQualityIssueSqlClause } from './communicationQualitySql.js';
import {
  COMMUNICATION_MESSAGE_CATEGORIES,
  appendCategoryFilter
} from '../constants/communicationMessageCategories.js';

export { buildQualityIssueSqlClause };

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTrackingPixelUrl(url) {
  const u = String(url || '').toLowerCase();
  return u.includes('/api/email/track-open/') || u.includes('track-open') || /\.gif(\?|$)/i.test(u);
}

export function extractRealLinks(content) {
  const links = [];
  const seen = new Set();
  const add = (url) => {
    const u = String(url || '').trim();
    if (!u || !/^https?:\/\//i.test(u) || isTrackingPixelUrl(u) || seen.has(u)) return;
    seen.add(u);
    links.push(u);
  };
  const text = String(content || '');
  let match;
  const hrefRegex = /href=["']([^"']+)["']/gi;
  while ((match = hrefRegex.exec(text))) add(match[1]);
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  while ((match = urlRegex.exec(text))) add(match[0]);
  return links;
}

const ATTACHMENT_RX = /\battach(ed|ment|ments|ing)?\b|included as an attachment|see attached|attached (copy|file|pdf|materials)/i;
const LINK_RX = /private link|secure link|link below|click (here|the link|below)|signing link|release of information/i;
const DOWNLOAD_RX = /download a copy from/i;

export function validateOutboundEmailQuality({
  subject = '',
  text = '',
  html = '',
  attachments = null,
  linkUrl = null,
  templateType = null,
  clientId = null,
  hadAttachments = false
} = {}) {
  const flags = [];
  const combined = `${subject}\n${text}\n${stripHtml(html)}`;
  const hasAttachments = hadAttachments || (Array.isArray(attachments) && attachments.length > 0);

  if (ATTACHMENT_RX.test(combined) && !hasAttachments) {
    flags.push({
      code: 'missing_attachment',
      message: 'Message says something is attached, but no attachment was included.'
    });
  }

  const links = extractRealLinks(html || text);
  const explicitLink = String(linkUrl || '').trim();
  const hasRealLink = links.length > 0 || (explicitLink && /^https?:\/\//i.test(explicitLink));

  if (LINK_RX.test(combined) && !hasRealLink) {
    flags.push({
      code: 'missing_link',
      message: 'Message references a link or download, but no URL was included.'
    });
  }

  if (DOWNLOAD_RX.test(combined) && !hasRealLink && !hasAttachments) {
    flags.push({
      code: 'missing_download',
      message: 'Message references downloading a copy, but no link or attachment was included.'
    });
  }

  const tpl = String(templateType || '').toLowerCase();
  const subj = String(subject || '');
  const isRoi = ['school_roi_signing', 'school_roi_release', 'smart_school_roi'].includes(tpl)
    || /release of information/i.test(subj);
  if (isRoi) {
    if (!clientId) {
      flags.push({
        code: 'roi_missing_client',
        message: 'ROI email is not linked to a client record.'
      });
    }
    if (!explicitLink && !links.some((l) => /\/intake\//i.test(l))) {
      flags.push({
        code: 'roi_missing_signing_link',
        message: 'ROI email has no signing link.'
      });
    }
  }

  return { ok: flags.length === 0, flags };
}

export function parseCommunicationMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function scanStoredCommunicationQuality(row) {
  const meta = parseCommunicationMetadata(row?.metadata ?? row?.meta);
  const hadAttachments = !!(meta.hadAttachments || Number(meta.attachmentCount || 0) > 0);
  const { flags } = validateOutboundEmailQuality({
    subject: row?.subject,
    text: '',
    html: row?.body,
    attachments: null,
    linkUrl: meta.linkUrl || meta.link_url,
    templateType: row?.template_type,
    clientId: row?.client_id,
    hadAttachments
  });
  return flags;
}

export function formatQualityFlags(flags = []) {
  return (flags || []).map((f) => f.message || f.code).filter(Boolean).join('; ');
}

export function isCommunicationQualityResolved(meta) {
  if (!meta) return false;
  return !!(meta.qualityResolvedAt || meta.quality_resolved_at);
}

export function getActiveQualityFlags(row, meta = null) {
  const m = meta || parseCommunicationMetadata(row?.metadata);
  if (isCommunicationQualityResolved(m)) return [];
  const scanned = scanStoredCommunicationQuality({ ...row, metadata: m });
  if (scanned.length) return scanned;
  const stored = m.qualityFlags;
  if (Array.isArray(stored) && stored.length) return stored;
  return [];
}

export function getDisplayQualityFlags(row, meta = null) {
  const m = meta || parseCommunicationMetadata(row?.metadata);
  if (isCommunicationQualityResolved(m)) {
    const resolved = m.qualityResolvedFlags || m.quality_resolved_flags;
    if (Array.isArray(resolved) && resolved.length) return resolved;
  }
  return getActiveQualityFlags(row, m);
}

export function rowHasOpenQualityIssue(row) {
  return getActiveQualityFlags(row).length > 0;
}

async function fetchRowsForQualityScan(agencyId, pool, { channel = 'email', q = '' } = {}) {
  const { where, params } = buildCommunicationListFilters({
    agencyId,
    channel,
    status: 'all',
    category: '',
    q
  });
  const [rows] = await pool.execute(
    `SELECT uc.id, uc.subject, uc.body, uc.template_type, uc.client_id, uc.metadata,
            uc.delivery_status, uc.generated_at
     FROM user_communications uc
     LEFT JOIN users u ON uc.user_id = u.id
     LEFT JOIN clients c ON uc.client_id = c.id
     WHERE ${where.join(' AND ')}
     ORDER BY uc.generated_at DESC
     LIMIT 5000`,
    params
  );
  return rows || [];
}

function buildCommunicationListFilters({
  agencyId,
  channel = null,
  status = null,
  category = '',
  q = ''
} = {}) {
  const cat = String(category || '').trim().toLowerCase();
  const statusNorm = String(status || '').trim().toLowerCase();

  let statusList;
  if (cat === 'quality' || statusNorm === 'all') {
    statusList = ['sent', 'delivered', 'failed', 'pending', 'bounced', 'undelivered'];
  } else if (statusNorm === 'sent') {
    statusList = ['sent', 'delivered'];
  } else if (statusNorm) {
    statusList = [statusNorm];
  } else {
    statusList = ['pending', 'failed', 'bounced', 'undelivered'];
  }

  const statusPlaceholders = statusList.map(() => '?').join(',');
  const where = ['uc.agency_id = ?', `uc.delivery_status IN (${statusPlaceholders})`];
  const params = [Number(agencyId), ...statusList];

  if (channel) {
    where.push('uc.channel = ?');
    params.push(channel);
  }

  const search = String(q || '').trim();
  if (search) {
    const like = `%${search}%`;
    where.push(`(
      uc.subject LIKE ?
      OR uc.recipient_address LIKE ?
      OR uc.body LIKE ?
      OR u.email LIKE ?
      OR u.first_name LIKE ?
      OR u.last_name LIKE ?
      OR c.full_name LIKE ?
      OR c.identifier_code LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like);
  }

  appendCategoryFilter(cat, where);

  return { where, params, statusList, category: cat };
}

export { buildCommunicationListFilters, COMMUNICATION_MESSAGE_CATEGORIES };

export async function countAgencyCommunicationQualityIssues(agencyId, { pool, channel = 'email' } = {}) {
  if (!pool || !agencyId) return 0;
  const rows = await fetchRowsForQualityScan(agencyId, pool, { channel });
  let count = 0;
  for (const row of rows) {
    if (rowHasOpenQualityIssue(row)) count++;
  }
  return count;
}

export async function countMultiAgencyCommunicationQualityIssues(agencyIds, { pool } = {}) {
  if (!pool || !agencyIds?.length) return 0;
  let total = 0;
  for (const agencyId of agencyIds) {
    total += await countAgencyCommunicationQualityIssues(agencyId, { pool });
  }
  return total;
}
