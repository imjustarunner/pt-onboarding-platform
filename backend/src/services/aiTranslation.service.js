import crypto from 'crypto';
import axios from 'axios';
import pool from '../config/database.js';
import { callGeminiText } from './geminiText.service.js';

/**
 * AI translation service.
 *
 * Public pages that render dynamic DB content (event titles, descriptions,
 * program names, etc.) call this module when the visitor's locale is 'es'.
 * We keep a translations cache keyed by (source_type, source_id, field, lang)
 * so the upstream AI provider is called at most once per piece of content.
 *
 * Engine priority:
 *   1) Google Gemini (Vertex AI with GCP project creds OR the GEMINI_API_KEY
 *      fallback) — this is the same model the rest of the app already uses
 *      for AI features, so no new secret is required.
 *   2) OpenAI, if OPENAI_API_KEY is set (optional override).
 *   3) DeepL, if DEEPL_API_KEY is set (optional fallback).
 *
 * If every provider fails or nothing is configured, translation functions
 * return the original text unchanged so pages still render cleanly.
 *
 * The admin/staff portal is intentionally NOT translated — only public
 * surfaces (marketing hub, event listings, program pages, intake forms).
 */

const OPENAI_MODEL = process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const DEEPL_API_KEY = process.env.DEEPL_API_KEY || '';
const DEEPL_API_URL = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';

const hashText = (text) => crypto.createHash('md5').update(String(text || ''), 'utf8').digest('hex');

// Gemini is considered configured whenever either a GCP project is available
// (Vertex path) or a GEMINI_API_KEY is set (generativelanguage.googleapis.com
// path). We don't want a missing OpenAI key to flip the feature off when the
// rest of the app can already call Gemini successfully.
const isGeminiConfigured = () =>
  !!(
    process.env.GCP_PROJECT_ID
    || process.env.GCS_PROJECT_ID
    || process.env.PROJECT_ID
    || process.env.GEMINI_API_KEY
  );

const isConfigured = () => !!(isGeminiConfigured() || OPENAI_API_KEY || DEEPL_API_KEY);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const LANGUAGE_LABELS = {
  es: 'Spanish',
  en: 'English'
};

function languageLabel(code) {
  const key = String(code || '').toLowerCase();
  return LANGUAGE_LABELS[key] || key.toUpperCase() || 'Spanish';
}

function buildGeminiPrompt(text, targetLang) {
  const targetLabel = languageLabel(targetLang);
  return [
    `You are a professional translator for a mental-health and education services platform in the United States.`,
    `Translate the TEXT below into natural, culturally appropriate ${targetLabel} suitable for parents, students, and clients.`,
    `Rules:`,
    `- Keep any HTML tags, URLs, email addresses, phone numbers, numeric values, and placeholders like {name} or {{variable}} EXACTLY as they are.`,
    `- Do not add quotes around the translation.`,
    `- Do not add a preamble, explanation, or trailing notes.`,
    `- If the text is already in ${targetLabel}, return it unchanged.`,
    `- Return ONLY the translated text.`,
    ``,
    `TEXT:`,
    String(text || '')
  ].join('\n');
}

function stripWrappingQuotes(out) {
  const s = String(out || '').trim();
  if (!s) return s;
  const first = s[0];
  const last = s[s.length - 1];
  if ((first === '"' && last === '"') || (first === '\u201C' && last === '\u201D')) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Call the selected AI engine to translate a single piece of text.
 * Returns `{ translated, engine }`. On failure returns `{ translated: text, engine: 'fallback' }`.
 */
async function callProviderTranslate(text, targetLang) {
  const src = String(text || '').trim();
  if (!src) return { translated: '', engine: 'noop' };
  const lang = String(targetLang || 'es').toLowerCase();
  if (lang === 'en') return { translated: src, engine: 'noop' };

  if (isGeminiConfigured()) {
    try {
      const prompt = buildGeminiPrompt(src, lang);
      // Translations are deterministic-ish; keep temperature low. Token budget
      // scales generously with input length so long descriptions don't get
      // truncated mid-sentence.
      const maxOutputTokens = Math.min(4096, Math.max(512, Math.ceil(src.length * 2.5)));
      const { text: out, modelName, provider } = await callGeminiText({
        prompt,
        temperature: 0.2,
        maxOutputTokens
      });
      const cleaned = stripWrappingQuotes(out);
      if (cleaned) {
        return { translated: cleaned, engine: `gemini:${provider}:${modelName}` };
      }
    } catch (err) {
      console.warn('[aiTranslation] Gemini failed, falling back', {
        message: err?.message,
        status: err?.status,
        details: String(err?.details || '').slice(0, 300)
      });
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const resp = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: OPENAI_MODEL,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'You are a professional translator for a mental-health and education services platform. '
                + `Translate the user message into natural, culturally appropriate ${languageLabel(lang)} `
                + 'suitable for parents, students, and clients. Keep any HTML tags, placeholders like '
                + '{name}, and URLs unchanged. Return ONLY the translation, with no preamble or explanation.'
            },
            { role: 'user', content: src }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000
        }
      );
      const out = resp?.data?.choices?.[0]?.message?.content;
      if (typeof out === 'string' && out.trim()) {
        return { translated: stripWrappingQuotes(out), engine: `openai:${OPENAI_MODEL}` };
      }
    } catch (err) {
      console.warn('[aiTranslation] OpenAI failed, falling back', { message: err?.message });
    }
  }

  if (DEEPL_API_KEY) {
    try {
      const resp = await axios.post(
        DEEPL_API_URL,
        new URLSearchParams({
          auth_key: DEEPL_API_KEY,
          text: src,
          target_lang: lang.toUpperCase(),
          preserve_formatting: '1'
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 20000
        }
      );
      const out = resp?.data?.translations?.[0]?.text;
      if (typeof out === 'string' && out.trim()) {
        return { translated: out.trim(), engine: 'deepl' };
      }
    } catch (err) {
      console.warn('[aiTranslation] DeepL failed, falling back', { message: err?.message });
    }
  }

  return { translated: src, engine: 'fallback' };
}

/**
 * Translate one piece of text without any DB caching.
 * Prefer `getOrCreateTranslation` unless you have a one-off use case.
 */
export async function translateText(text, targetLang = 'es') {
  const { translated } = await callProviderTranslate(text, targetLang);
  return translated;
}

/**
 * Look up a cached translation or create one on cache miss.
 *
 * @param {{ sourceType: string, sourceId: number|string, field: string, originalText: string, targetLang?: string }} args
 * @returns {Promise<string>} translated text (or original on fallback)
 */
export async function getOrCreateTranslation(args) {
  const sourceType = String(args.sourceType || '').trim();
  const sourceIdRaw = args.sourceId;
  const sourceId = Number(sourceIdRaw);
  const field = String(args.field || '').trim();
  const original = String(args.originalText || '');
  const targetLang = String(args.targetLang || 'es').toLowerCase();

  // inline_string entries use sourceId=0 and are keyed uniquely by MD5 field hash — allow them through.
  const isInlineString = sourceType === 'inline_string';
  if (!sourceType || !field || !Number.isFinite(sourceId) || (sourceId <= 0 && !isInlineString)) return original;
  if (!original.trim()) return original;
  if (targetLang === 'en') return original;

  const hash = hashText(original);

  try {
    const [rows] = await pool.execute(
      `SELECT translated_text, source_hash FROM translations
       WHERE source_type = ? AND source_id = ? AND source_field = ? AND language_code = ?
       LIMIT 1`,
      [sourceType, sourceId, field, targetLang]
    );
    if (rows?.length && rows[0].source_hash === hash) {
      return rows[0].translated_text || original;
    }
  } catch (err) {
    console.warn('[aiTranslation] cache read failed', { message: err?.message });
  }

  if (!isConfigured()) return original;

  const { translated, engine } = await callProviderTranslate(original, targetLang);
  if (engine === 'fallback' || engine === 'noop') return translated || original;

  try {
    await pool.execute(
      `INSERT INTO translations (source_type, source_id, source_field, source_hash, language_code, translated_text, translation_engine)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         source_hash = VALUES(source_hash),
         translated_text = VALUES(translated_text),
         translation_engine = VALUES(translation_engine),
         updated_at = CURRENT_TIMESTAMP`,
      [sourceType, sourceId, field, hash, targetLang, translated, engine]
    );
  } catch (err) {
    console.warn('[aiTranslation] cache write failed', { message: err?.message });
  }

  return translated;
}

/**
 * Batch form of `getOrCreateTranslation`. Calls the AI sequentially with a
 * small delay between misses to stay well under rate limits.
 *
 * @param {{ sourceType: string, sourceId: number, field: string, originalText: string }[]} items
 * @param {string} targetLang
 * @returns {Promise<Record<string,string>>} keyed by `${sourceId}:${field}`
 */
export async function batchTranslate(items, targetLang = 'es') {
  const out = {};
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    const key = `${Number(item?.sourceId) || 0}:${String(item?.field || '')}`;
    try {
      out[key] = await getOrCreateTranslation({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        field: item.field,
        originalText: item.originalText,
        targetLang
      });
    } catch (err) {
      out[key] = String(item?.originalText || '');
    }
    await sleep(50);
  }
  return out;
}

export function isTranslationConfigured() {
  return isConfigured();
}
