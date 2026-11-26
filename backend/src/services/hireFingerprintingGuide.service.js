import { createHash } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import pool from '../config/database.js';
import { denverFingerprintingDefaultInstructions, denverFingerprintingInstructionsLimit, denverFingerprintingStep } from '../../../frontend/src/navigation/hireDocuments.js';
import { jsonObject, safePortalUrl } from '../utils/hirePortalWorkflow.js';
import { addFingerprintingScreenshots, FINGERPRINTING_SCREENSHOTS } from '../../../frontend/src/navigation/hireFingerprintingScreenshots.js';

function safeGuideHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ['p', 'h2', 'h3', 'h4', 'ol', 'ul', 'li', 'strong', 'b', 'em', 'i', 'br', 'a', 'figure', 'figcaption', 'img'],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'data-fingerprinting-screenshot'] },
    allowedSchemes: ['https'],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => {
        const href = safePortalUrl(attributes.href);
        return href
          ? { tagName: 'a', attribs: { href, target: '_blank', rel: 'noopener noreferrer' } }
          : { tagName: 'span', attribs: {} };
      },
      img: (_tag, attributes) => {
        const screenshot = FINGERPRINTING_SCREENSHOTS.find(item => item.sha256 === attributes['data-fingerprinting-screenshot']);
        if (screenshot) return { tagName: 'img', attribs: { 'data-fingerprinting-screenshot': screenshot.sha256, alt: screenshot.caption } };
        const src = safePortalUrl(attributes.src);
        return src ? { tagName: 'img', attribs: { src, alt: String(attributes.alt || '') } } : { tagName: 'span', attribs: {} };
      }
    }
  }).trim();
}

export async function loadHireFingerprintingGuide(agencyId, db = pool) {
  const [rows] = await db.execute(
    `SELECT m.id AS module_id, mc.content_type, mc.content_data
     FROM agencies a
     JOIN modules m ON m.agency_id = a.id
     JOIN agency_public_modules apm ON apm.agency_id = a.id AND apm.module_id = m.id
     JOIN module_content mc ON mc.module_id = m.id AND mc.content_type IN ('text', 'image')
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
    if (row.content_type === 'image') {
      const src = safePortalUrl(content.imageUrl);
      if (!src) return '';
      const escape = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
      return safeGuideHtml('<figure><img src="' + escape(src) + '" alt="' + escape(content.alt || content.title) + '" /></figure>');
    }
    return safeGuideHtml(addFingerprintingScreenshots(safeGuideHtml(content.content || content.textContent)));
  }).filter(Boolean).join('\n');
  if (!html || !sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim()) return null;
  return { html, revision: createHash('sha256').update(html).digest('hex') };
}

export async function assertHireFingerprintingAvailable(agencyId, db = pool) {
  if (!await loadHireFingerprintingGuide(agencyId, db)) {
    throw Object.assign(new Error('The ITSCO Denver fingerprinting lesson must be available in On-Demand Training before you can attach it.'), { status: 400 });
  }
}

export function fingerprintingDefaultInstructions(settings) {
  return typeof settings?.denver_fingerprinting_instructions === 'string'
    ? settings.denver_fingerprinting_instructions : denverFingerprintingDefaultInstructions;
}

export async function saveFingerprintingDefaultInstructions({ agencyId, instructions, previousInstructions }) {
  if (typeof instructions !== 'string' || instructions.length > denverFingerprintingInstructionsLimit ||
      typeof previousInstructions !== 'string' || previousInstructions.length > denverFingerprintingInstructionsLimit) {
    throw Object.assign(new Error(`Use up to ${denverFingerprintingInstructionsLimit} characters for these instructions.`), { status: 400 });
  }
  const savedInstructions = instructions.trim();
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[agency]] = await db.execute(
      `SELECT prehire_settings FROM agencies
       WHERE id = ? AND slug = 'itsco' AND organization_type = 'agency'
         AND is_active = 1 AND COALESCE(is_archived, 0) = 0 FOR UPDATE`,
      [agencyId]
    );
    if (!agency) throw Object.assign(new Error('This fingerprinting step belongs to ITSCO.'), { status: 404 });
    const settings = jsonObject(agency.prehire_settings);
    const current = fingerprintingDefaultInstructions(settings);
    if (current !== previousInstructions && current !== savedInstructions) {
      throw Object.assign(new Error('The default instructions changed. Refresh before saving your edits.'), { status: 409 });
    }
    if (settings.denver_fingerprinting_instructions !== savedInstructions) {
      await db.execute(
        "UPDATE agencies SET prehire_settings = JSON_SET(COALESCE(prehire_settings, JSON_OBJECT()), '$.denver_fingerprinting_instructions', ?) WHERE id = ?",
        [savedInstructions, agencyId]
      );
    }
    await db.commit();
    return { instructions: savedInstructions };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}

export async function readHireFingerprintingScreenshot(agencyId, screenshotId, { db = pool, bucket } = {}) {
  const screenshot = FINGERPRINTING_SCREENSHOTS.find(item => item.sha256 === screenshotId);
  if (!screenshot) throw Object.assign(new Error('Screenshot not found.'), { status: 404 });
  const [[agency]] = await db.execute('SELECT id FROM agencies WHERE id = ? AND slug = ? AND organization_type = ? AND is_active = 1 AND COALESCE(is_archived, 0) = 0', [Number(agencyId), 'itsco', 'agency']);
  if (!agency) throw Object.assign(new Error('This lesson belongs to ITSCO.'), { status: 403 });
  try {
    const storage = bucket || await (await import('./storage.service.js')).default.getGCSBucket();
    const [bytes] = await storage.file('training-assets/itsco-denver-fingerprinting/' + screenshot.sha256 + '.png').download();
    if (createHash('sha256').update(bytes).digest('hex') !== screenshot.sha256) throw new Error('Screenshot integrity check failed');
    return bytes;
  } catch (error) {
    throw Object.assign(new Error('The screenshot could not be loaded. Please retry.', { cause: error }), { status: 503 });
  }
}
