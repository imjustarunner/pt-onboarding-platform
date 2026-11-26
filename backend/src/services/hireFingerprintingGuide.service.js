import { createHash } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import pool from '../config/database.js';
import { denverFingerprintingStep } from '../../../frontend/src/navigation/hireDocuments.js';
import { jsonObject, safePortalUrl } from '../utils/hirePortalWorkflow.js';

function safeGuideHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ['p', 'h2', 'h3', 'h4', 'ol', 'ul', 'li', 'strong', 'b', 'em', 'i', 'br', 'a'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['https'],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => {
        const href = safePortalUrl(attributes.href);
        return href
          ? { tagName: 'a', attribs: { href, target: '_blank', rel: 'noopener noreferrer' } }
          : { tagName: 'span', attribs: {} };
      }
    }
  }).trim();
}

export async function loadHireFingerprintingGuide(agencyId, db = pool) {
  const [rows] = await db.execute(
    `SELECT m.id AS module_id, mc.content_data
     FROM agencies a
     JOIN modules m ON m.agency_id = a.id
     JOIN agency_public_modules apm ON apm.agency_id = a.id AND apm.module_id = m.id
     JOIN module_content mc ON mc.module_id = m.id AND mc.content_type = 'text'
     WHERE a.id = ? AND a.slug = 'itsco' AND a.organization_type = 'agency'
       AND a.is_active = 1 AND COALESCE(a.is_archived, 0) = 0
       AND m.title = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci AND m.is_active = 1
       AND m.publish_status = 'published' AND COALESCE(m.is_archived, 0) = 0
     ORDER BY m.id, mc.order_index, mc.id`,
    [agencyId, denverFingerprintingStep.title]
  );
  if (rows.some(row => row.module_id !== rows[0]?.module_id)) return null;
  const html = rows.map(row => {
    const content = jsonObject(row.content_data);
    return safeGuideHtml(content.content || content.textContent);
  }).filter(Boolean).join('\n');
  if (!html || !sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim()) return null;
  return { html, revision: createHash('sha256').update(html).digest('hex') };
}

export async function assertHireFingerprintingAvailable(agencyId, db = pool) {
  if (!await loadHireFingerprintingGuide(agencyId, db)) {
    throw Object.assign(new Error('The ITSCO Denver fingerprinting lesson must be available in On-Demand Training before you can attach it.'), { status: 400 });
  }
}
