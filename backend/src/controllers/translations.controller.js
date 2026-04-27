import crypto from 'crypto';
import {
  getOrCreateTranslation,
  batchTranslate,
  isTranslationConfigured
} from '../services/aiTranslation.service.js';
import pool from '../config/database.js';

const hashText = (text) => crypto.createHash('md5').update(String(text || ''), 'utf8').digest('hex');

/**
 * Public surface-area-only translation fetcher.
 *
 * GET /api/public/translations?sourceType=company_event&ids=1,2,3&fields=title,description&lang=es
 *
 * Returns cached translations for the requested items. For cache misses we
 * load the current English text from the source table and trigger on-demand
 * AI translation (then cache it for next time). If AI isn't configured or a
 * source row is missing, we simply return the original English text.
 *
 * The route is intentionally scoped to a small allowlist of translatable
 * sources so arbitrary callers can't enumerate unrelated data.
 */

const ALLOWED_SOURCES = Object.freeze({
  company_event: {
    table: 'company_events',
    idColumn: 'id',
    fields: {
      title: 'title',
      description: 'description',
      // Note: public_description and description_splash don't exist in this schema.
      // splash_content and public_listing_details are the real columns.
      splash_content: 'splash_content',
      public_listing_details: 'public_listing_details'
    }
  },
  organization: {
    // Orgs are stored in the agencies table in this deployment.
    table: 'agencies',
    idColumn: 'id',
    fields: {
      name: 'name'
    }
  },
  intake_link: {
    table: 'intake_links',
    idColumn: 'id',
    fields: {
      title: 'title',
      description: 'description'
    }
  },
  marketing_page: {
    table: 'public_marketing_pages',
    idColumn: 'id',
    fields: {
      title: 'title',
      heroTitle: 'hero_title',
      heroSubtitle: 'hero_subtitle'
    }
  }
});

function parseIdList(raw) {
  if (raw == null) return [];
  const str = Array.isArray(raw) ? raw.join(',') : String(raw);
  const arr = str.split(',').map((s) => Number(String(s).trim())).filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(arr)];
}

function parseFieldList(raw, allowedMap) {
  if (raw == null) return [];
  const str = Array.isArray(raw) ? raw.join(',') : String(raw);
  return str
    .split(',')
    .map((s) => String(s).trim())
    .filter((f) => !!f && Object.prototype.hasOwnProperty.call(allowedMap, f));
}

async function loadSourceRows(conf, ids) {
  if (!ids.length) return [];
  const fields = Object.values(conf.fields);
  const columns = [conf.idColumn, ...fields].join(', ');
  const placeholders = ids.map(() => '?').join(',');
  try {
    const [rows] = await pool.execute(
      `SELECT ${columns} FROM ${conf.table} WHERE ${conf.idColumn} IN (${placeholders})`,
      ids
    );
    return rows || [];
  } catch (err) {
    console.warn('[translations] source load failed', { table: conf.table, message: err?.message });
    return [];
  }
}

export const getPublicTranslations = async (req, res, next) => {
  try {
    const sourceType = String(req.query.sourceType || '').trim();
    const lang = String(req.query.lang || 'es').toLowerCase();
    const conf = ALLOWED_SOURCES[sourceType];
    if (!conf) return res.status(400).json({ error: { message: 'Unsupported sourceType' } });

    const ids = parseIdList(req.query.ids);
    const fields = parseFieldList(req.query.fields, conf.fields);
    if (!ids.length || !fields.length) {
      return res.json({ translations: {} });
    }
    if (lang === 'en') {
      return res.json({ translations: {} });
    }

    const rows = await loadSourceRows(conf, ids);
    const rowById = new Map(rows.map((r) => [Number(r[conf.idColumn]), r]));

    // Cap batches to keep public requests snappy. Callers can page via `ids`.
    const MAX_ITEMS = 40;
    const items = [];
    for (const id of ids) {
      const row = rowById.get(Number(id));
      if (!row) continue;
      for (const field of fields) {
        if (items.length >= MAX_ITEMS) break;
        const column = conf.fields[field];
        const original = row[column] == null ? '' : String(row[column]);
        if (!original.trim()) continue;
        items.push({ sourceType, sourceId: Number(id), field, originalText: original });
      }
      if (items.length >= MAX_ITEMS) break;
    }

    const translations = await batchTranslate(items, lang);
    res.json({ translations, configured: isTranslationConfigured() });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin trigger: POST /api/admin/translations/precompute
 * Body: { sourceType, sourceId, lang? }
 * Forces a (re)translation of every field defined in ALLOWED_SOURCES for the
 * given record. Useful when an admin marks an event or form as "ready for Spanish."
 */
export const precomputeTranslations = async (req, res, next) => {
  try {
    const sourceType = String(req.body?.sourceType || '').trim();
    const sourceId = Number(req.body?.sourceId);
    const lang = String(req.body?.lang || 'es').toLowerCase();
    const conf = ALLOWED_SOURCES[sourceType];
    if (!conf) return res.status(400).json({ error: { message: 'Unsupported sourceType' } });
    if (!Number.isFinite(sourceId) || sourceId <= 0) {
      return res.status(400).json({ error: { message: 'sourceId is required' } });
    }
    if (lang === 'en') {
      return res.json({ translations: {} });
    }
    const rows = await loadSourceRows(conf, [sourceId]);
    if (!rows.length) {
      return res.status(404).json({ error: { message: 'Source record not found' } });
    }
    const row = rows[0];
    const out = {};
    for (const [field, column] of Object.entries(conf.fields)) {
      const original = row[column] == null ? '' : String(row[column]);
      if (!original.trim()) continue;
      out[field] = await getOrCreateTranslation({
        sourceType,
        sourceId,
        field,
        originalText: original,
        targetLang: lang
      });
    }
    res.json({ translations: out, configured: isTranslationConfigured() });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/public/translate-strings
 * Body: { strings: string[], lang?: string }
 *
 * Translates an arbitrary array of text strings using the AI translation cache.
 * Each string is keyed by its MD5 hash so the same sentence is only sent to the
 * AI provider once. Returns { original: translated } map.
 *
 * Used by the public intake form to translate inline question labels, descriptions,
 * and option text that live as JSON in intake_fields and can't use ALLOWED_SOURCES.
 */
export const translateStrings = async (req, res, next) => {
  try {
    const strings = Array.isArray(req.body?.strings) ? req.body.strings : [];
    const lang = String(req.body?.lang || 'es').toLowerCase();

    if (lang === 'en') return res.json({ translations: {}, configured: isTranslationConfigured() });

    const unique = [...new Set(strings.map((s) => String(s || '').trim()).filter(Boolean))];
    if (!unique.length) return res.json({ translations: {}, configured: isTranslationConfigured() });

    const MAX_STRINGS = 500;
    const batch = unique.slice(0, MAX_STRINGS);

    const items = batch.map((text) => ({
      sourceType: 'inline_string',
      sourceId: 0,
      field: hashText(text),
      originalText: text
    }));

    const raw = await batchTranslate(items, lang);

    // Re-map from internal batchTranslate key (`${sourceId}:${field}`) back to original → translated.
    const translations = {};
    for (const text of batch) {
      const key = `0:${hashText(text)}`;
      if (raw[key]) translations[text] = raw[key];
    }

    res.json({ translations, configured: isTranslationConfigured() });
  } catch (error) {
    next(error);
  }
};
