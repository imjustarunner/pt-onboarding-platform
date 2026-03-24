import axios from 'axios';
import crypto from 'crypto';

// Simple in-memory cache: key -> { exp: msEpoch, busy: [{startAt,endAt}] }
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
    return `${userId}:${String(weekStart || '')}`;
  }

  static cacheKeyForFeed({ userId, weekStart, icsUrl }) {
    return `${userId}:${String(weekStart || '')}:feed:${sha1HexShort(icsUrl)}`;
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

  static async fetchAndParseIcsBusy({ icsUrl }) {
    const url = this.normalizeIcsFetchUrl(icsUrl);
    if (!url) return [];

    // node-ical is CommonJS; in ESM we load it dynamically.
    const icalMod = await import('node-ical');
    const ical = icalMod?.default || icalMod;

    const resp = await axios.get(url, { responseType: 'text', timeout: 12000, maxContentLength: 2_000_000 });
    const text = String(resp?.data || '');
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

    const busy = [];
    for (const k of Object.keys(parsed)) {
      const ev = parsed[k];
      if (!ev || ev.type !== 'VEVENT') continue;
      // node-ical uses JS Date objects for start/end.
      const start = ev.start instanceof Date ? ev.start : (ev.start ? new Date(ev.start) : null);
      const end = ev.end instanceof Date ? ev.end : (ev.end ? new Date(ev.end) : null);
      if (!start || !end) continue;
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      if (end <= start) continue;
      const summ = sanitizeIcsSummary(ev.summary ?? ev.SUMMARY);
      const row = { startAt: start.toISOString(), endAt: end.toISOString() };
      if (summ) row.summary = summ;
      busy.push(row);
    }

    // Sort for stability
    busy.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
    return busy;
  }

  static async getBusyForWeek({ userId, weekStart, icsUrl, timeMinIso, timeMaxIso, ttlMs = 10 * 60 * 1000 }) {
    const uid = Number(userId || 0);
    if (!uid) return { ok: false, reason: 'invalid_user_id', busy: [], events: [] };
    const url = String(icsUrl || '').trim();
    if (!url) return { ok: true, busy: [], events: [] };

    const key = this.cacheKey({ userId: uid, weekStart });
    const cached = this.getCached(key);
    if (cached) {
      const clamped = clampBusyToWindow(cached, timeMinIso, timeMaxIso);
      return { ok: true, busy: clamped, events: clamped };
    }

    try {
      const rawBusy = await this.fetchAndParseIcsBusy({ icsUrl: url });
      this.setCached(key, rawBusy, ttlMs);
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
      const key = this.cacheKeyForFeed({ userId: uid, weekStart, icsUrl: url });
      const cached = this.getCached(key);
      if (cached) {
        all.push(...cached);
        continue;
      }
      try {
        const rawBusy = await this.fetchAndParseIcsBusy({ icsUrl: url });
        this.setCached(key, rawBusy, ttlMs);
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

