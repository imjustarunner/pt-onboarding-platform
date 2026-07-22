import axios from 'axios';
import crypto from 'crypto';

// Cache raw ICS text by URL (not expanded occurrences) so RRULE expansion always
// uses the caller's time window. key -> { exp, text }
const icsTextCache = new Map();
// Legacy busy-array cache (kept for getCached/setCached callers during transition)
const cache = new Map();

function nowMs() {
  return Date.now();
}

function sha1HexShort(input) {
  try {
    return crypto.createHash('sha1').update(String(input || '')).digest('hex').slice(0, 16);
  } catch {
    return 'nohash';
  }
}

function sanitizeIcsSummary(raw) {
  if (raw == null) return '';
  const s = String(raw)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s.slice(0, 200);
}

function clampBusyToWindow(busy, timeMinIso, timeMaxIso) {
  const min = new Date(timeMinIso);
  const max = new Date(timeMaxIso);
  if (Number.isNaN(min.getTime()) || Number.isNaN(max.getTime())) return [];

  const out = [];
  for (const b of busy || []) {
    const s = new Date(b.startAt);
    const e = new Date(b.endAt);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
    if (e <= min || s >= max) continue;
    const start = s < min ? min : s;
    const end = e > max ? max : e;
    if (end > start) {
      const row = { startAt: start.toISOString(), endAt: end.toISOString() };
      const summ = sanitizeIcsSummary(b.summary);
      if (summ) row.summary = summ;
      out.push(row);
    }
  }
  return out;
}

function mergeBusyIntervals(busy) {
  const items = (busy || [])
    .map((b) => ({ startAt: b.startAt, endAt: b.endAt }))
    .filter((b) => b.startAt && b.endAt)
    .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
  if (items.length <= 1) return items;

  const merged = [];
  for (const cur of items) {
    if (!merged.length) {
      merged.push(cur);
      continue;
    }
    const prev = merged[merged.length - 1];
    const prevEnd = new Date(prev.endAt);
    const curStart = new Date(cur.startAt);
    const curEnd = new Date(cur.endAt);
    if (Number.isNaN(prevEnd.getTime()) || Number.isNaN(curStart.getTime()) || Number.isNaN(curEnd.getTime())) continue;

    // Overlap or touching -> merge
    if (curStart.getTime() <= prevEnd.getTime()) {
      if (curEnd.getTime() > prevEnd.getTime()) prev.endAt = cur.endAt;
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

/** Collect EXDATE timestamps from a node-ical VEVENT. */
function exdateTimeSet(ev) {
  const out = new Set();
  const raw = ev?.exdate;
  if (!raw) return out;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    out.add(raw.getTime());
    return out;
  }
  if (typeof raw === 'object') {
    for (const v of Object.values(raw)) {
      const d = v instanceof Date ? v : (v ? new Date(v) : null);
      if (d && !Number.isNaN(d.getTime())) out.add(d.getTime());
    }
  }
  return out;
}

/**
 * Expand a parsed VEVENT into busy intervals.
 * Therapy Notes weekly appointments are RRULE masters (DTSTART = first occurrence only).
 * Without expansion, upcoming office audits see zero ICS overlap and false-flag everything.
 */
function veventToBusyRows(ev, timeMinIso, timeMaxIso) {
  const start = ev.start instanceof Date ? ev.start : (ev.start ? new Date(ev.start) : null);
  const end = ev.end instanceof Date ? ev.end : (ev.end ? new Date(ev.end) : null);
  if (!start || !end) return [];
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (end <= start) return [];

  const durationMs = end.getTime() - start.getTime();
  const summ = sanitizeIcsSummary(ev.summary ?? ev.SUMMARY);
  const rows = [];
  const pushOcc = (occStart) => {
    if (!(occStart instanceof Date) || Number.isNaN(occStart.getTime())) return;
    const occEnd = new Date(occStart.getTime() + durationMs);
    const row = { startAt: occStart.toISOString(), endAt: occEnd.toISOString() };
    if (summ) row.summary = summ;
    rows.push(row);
  };

  const rangeMin = timeMinIso ? new Date(timeMinIso) : null;
  const rangeMax = timeMaxIso ? new Date(timeMaxIso) : null;
  const canExpand = ev.rrule
    && typeof ev.rrule.between === 'function'
    && rangeMin
    && rangeMax
    && !Number.isNaN(rangeMin.getTime())
    && !Number.isNaN(rangeMax.getTime());

  if (canExpand) {
    // Include occurrences that start before the window but still overlap it.
    const betweenStart = new Date(rangeMin.getTime() - durationMs);
    let occurrences = [];
    try {
      occurrences = ev.rrule.between(betweenStart, rangeMax, true) || [];
    } catch {
      occurrences = [];
    }
    const excluded = exdateTimeSet(ev);
    for (const occ of occurrences) {
      const t = occ instanceof Date ? occ.getTime() : NaN;
      if (!Number.isFinite(t) || excluded.has(t)) continue;
      pushOcc(occ instanceof Date ? occ : new Date(occ));
    }
    // If RRULE expansion yielded nothing, still keep the DTSTART instance when in range.
    if (!rows.length) pushOcc(start);
    return rows;
  }

  pushOcc(start);
  return rows;
}

export class ExternalBusyCalendarService {
  static normalizeIcsFetchUrl(icsUrl) {
    const raw = String(icsUrl || '').trim();
    if (!raw) return '';
    // Therapy Notes and similar systems provide `webcal://` links intended for calendar clients.
    // Our server fetcher must use http(s).
    if (raw.startsWith('webcal://')) return `https://${raw.slice('webcal://'.length)}`;
    if (raw.startsWith('webcals://')) return `https://${raw.slice('webcals://'.length)}`;
    return raw;
  }

  static cacheKey({ userId, weekStart }) {
    return `busy:${userId}:${String(weekStart || '')}`;
  }

  static cacheKeyForFeed({ userId, weekStart, icsUrl }) {
    return `busy:${userId}:${String(weekStart || '')}:feed:${sha1HexShort(icsUrl)}`;
  }

  static icsTextCacheKey(icsUrl) {
    return `ics-text:${sha1HexShort(this.normalizeIcsFetchUrl(icsUrl))}`;
  }

  static getCached(key) {
    const v = cache.get(key);
    if (!v) return null;
    if (v.exp <= nowMs()) {
      cache.delete(key);
      return null;
    }
    return v.busy || [];
  }

  static setCached(key, busy, ttlMs) {
    cache.set(key, { exp: nowMs() + ttlMs, busy: busy || [] });
  }

  static getCachedIcsText(key) {
    const v = icsTextCache.get(key);
    if (!v) return null;
    if (v.exp <= nowMs()) {
      icsTextCache.delete(key);
      return null;
    }
    return v.text || '';
  }

  static setCachedIcsText(key, text, ttlMs) {
    icsTextCache.set(key, { exp: nowMs() + ttlMs, text: String(text || '') });
  }

  static async fetchIcsText({ icsUrl, ttlMs = 10 * 60 * 1000 }) {
    const url = this.normalizeIcsFetchUrl(icsUrl);
    if (!url) return '';
    const key = this.icsTextCacheKey(url);
    const cached = this.getCachedIcsText(key);
    if (cached != null && cached !== '') return cached;

    const resp = await axios.get(url, { responseType: 'text', timeout: 12000, maxContentLength: 2_000_000 });
    const text = String(resp?.data || '');
    if (text) this.setCachedIcsText(key, text, ttlMs);
    return text;
  }

  /**
   * Parse ICS into busy intervals, expanding RRULE weekly/monthly masters into the
   * requested window. Critical for Therapy Notes coverage audits.
   */
  static async fetchAndParseIcsBusy({ icsUrl, timeMinIso = null, timeMaxIso = null, ttlMs = 10 * 60 * 1000 }) {
    const url = this.normalizeIcsFetchUrl(icsUrl);
    if (!url) return [];

    // node-ical is CommonJS; in ESM we load it dynamically.
    const icalMod = await import('node-ical');
    const ical = icalMod?.default || icalMod;

    const text = await this.fetchIcsText({ icsUrl: url, ttlMs });
    if (!text) return [];

    let parsed = null;
    try {
      if (ical?.sync?.parseICS) parsed = ical.sync.parseICS(text);
      else if (typeof ical?.parseICS === 'function') parsed = ical.parseICS(text);
      else parsed = null;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') return [];

    // Default expansion window when callers omit bounds (schedule overlays often pass them).
    const minIso = timeMinIso || new Date(Date.now() - 7 * 86400000).toISOString();
    const maxIso = timeMaxIso || new Date(Date.now() + 70 * 86400000).toISOString();

    const busy = [];
    for (const k of Object.keys(parsed)) {
      const ev = parsed[k];
      if (!ev || ev.type !== 'VEVENT') continue;
      // Skip cancelled instances when marked.
      const status = String(ev.status || '').toUpperCase();
      if (status === 'CANCELLED') continue;
      busy.push(...veventToBusyRows(ev, minIso, maxIso));
    }

    busy.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
    return busy;
  }

  static async getBusyForWeek({ userId, weekStart, icsUrl, timeMinIso, timeMaxIso, ttlMs = 10 * 60 * 1000 }) {
    const uid = Number(userId || 0);
    if (!uid) return { ok: false, reason: 'invalid_user_id', busy: [], events: [] };
    const url = String(icsUrl || '').trim();
    if (!url) return { ok: true, busy: [], events: [] };

    try {
      // Expand RRULEs for the requested window, then clamp (idempotent).
      const rawBusy = await this.fetchAndParseIcsBusy({
        icsUrl: url,
        timeMinIso,
        timeMaxIso,
        ttlMs
      });
      const clamped = clampBusyToWindow(rawBusy, timeMinIso, timeMaxIso);
      return { ok: true, busy: clamped, events: clamped };
    } catch (e) {
      return { ok: false, reason: 'fetch_or_parse_failed', error: String(e?.message || e), busy: [], events: [] };
    }
  }

  static async getBusyForFeeds({ userId, weekStart, feeds, timeMinIso, timeMaxIso, ttlMs = 10 * 60 * 1000 }) {
    const uid = Number(userId || 0);
    if (!uid) return { ok: false, reason: 'invalid_user_id', busy: [], events: [] };
    const list = Array.isArray(feeds) ? feeds : [];
    const urls = list
      .map((f) => String(f?.url || f?.icsUrl || '').trim())
      .filter(Boolean)
      .slice(0, 20); // hard cap to protect server
    if (urls.length === 0) return { ok: true, busy: [], events: [] };

    const all = [];
    const errors = [];
    for (const url of urls) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const rawBusy = await this.fetchAndParseIcsBusy({
          icsUrl: url,
          timeMinIso,
          timeMaxIso,
          ttlMs
        });
        all.push(...rawBusy);
      } catch (e) {
        errors.push(String(e?.message || e));
      }
    }

    const clamped = clampBusyToWindow(all, timeMinIso, timeMaxIso);
    clamped.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
    const merged = mergeBusyIntervals(clamped);
    if (merged.length === 0 && errors.length === urls.length) {
      return {
        ok: false,
        reason: 'all_feeds_failed',
        error: errors[0] || 'Failed to fetch feeds',
        busy: [],
        events: []
      };
    }
    return { ok: true, busy: merged, events: clamped };
  }
}

export default ExternalBusyCalendarService;
