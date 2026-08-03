import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseFile } from 'music-metadata';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const MUSIC_DIRS = [
  path.join(REPO_ROOT, 'assets', 'Focus Music'),
  path.join(REPO_ROOT, 'frontend', 'public', 'assets', 'focus-music')
];

let catalogCache = { scannedAt: 0, tracks: [], fingerprint: '' };

function catalogFingerprint(files) {
  if (!files.length) return 'empty';
  return files.map((f) => `${f.filename}:${Math.round(f.mtimeMs)}`).join('|');
}

function slugFromFilename(filename) {
  const base = String(filename || '').replace(/\.mp3$/i, '');
  return Buffer.from(base, 'utf8').toString('base64url');
}

function decodeSlug(slug) {
  try {
    return Buffer.from(String(slug || ''), 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

async function listMp3Files() {
  const seen = new Map();
  for (const dir of MUSIC_DIRS) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !/\.mp3$/i.test(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      const stat = await fs.stat(fullPath);
      const existing = seen.get(entry.name);
      if (!existing || stat.mtimeMs > existing.mtimeMs) {
        seen.set(entry.name, { filename: entry.name, fullPath, mtimeMs: stat.mtimeMs });
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.filename.localeCompare(b.filename));
}

function hashString(input) {
  let h = 0;
  const s = String(input || '');
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function gradientArtDataUrl(seed) {
  const text = String(seed || 'focus').trim() || 'focus';
  const initial = text.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'FM';
  const hue = hashString(text) % 360;
  const hue2 = (hue + 55 + (hashString(`${text}-b`) % 80)) % 360;
  const hue3 = (hue + 130) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hue} 46% 38%)"/>
        <stop offset="55%" stop-color="hsl(${hue2} 42% 28%)"/>
        <stop offset="100%" stop-color="hsl(${hue3} 50% 18%)"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="16" fill="url(#g)"/>
    <text x="60" y="68" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="700" fill="rgba(255,255,255,0.92)">${initial}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function pickCommentText(comment) {
  if (!comment) return '';
  if (Array.isArray(comment)) {
    return comment.map((c) => (typeof c === 'string' ? c : c?.text || '')).filter(Boolean).join(' · ');
  }
  if (typeof comment === 'object' && comment.text) return String(comment.text);
  return String(comment);
}

function deriveDescriptionFromTitle(title) {
  const t = String(title || '').toLowerCase();
  const parts = [];
  if (/(trap|glitch)/.test(t)) parts.push('Electronic');
  if (/string/.test(t)) parts.push('Strings');
  if (/marimba|nylon|guitar|hammer-on|baroque|prelude/.test(t)) parts.push('Acoustic');
  if (/ethereal|ambient|mist|echo|hollow/.test(t)) parts.push('Ambient');
  if (/pulse|flow|kinetic|steel/.test(t)) parts.push('Rhythmic');
  if (/study|focus|mindset|solitude/.test(t)) parts.push('Deep focus');
  if (/loop|remix|edit|slowed/.test(t)) parts.push('Loop');
  if (/vocal/.test(t)) parts.push('With vocals');
  if (/mountain|canyon|pine|ridge|horizon/.test(t)) parts.push('Cinematic');
  if (/somber|shadow|midnight|melanchol/.test(t)) parts.push('Melancholic');
  const unique = [...new Set(parts)];
  return unique.length ? unique.join(' · ') : 'Instrumental focus';
}

async function readTrackMeta(file) {
  const titleFromName = file.filename.replace(/\.mp3$/i, '');
  const trackId = slugFromFilename(file.filename);
  let title = titleFromName;
  let artist = '';
  let album = '';
  let genre = [];
  let description = '';
  let durationSec = null;

  try {
    const meta = await parseFile(file.fullPath, { duration: true });
    const common = meta.common || {};
    if (common.title) title = String(common.title).trim();
    if (common.originaltitle) title = String(common.originaltitle).trim();
    artist = String(common.artist || common.artists?.[0] || common.albumartist || '').trim();
    album = String(common.album || '').trim();
    genre = Array.isArray(common.genre) ? common.genre.filter(Boolean) : [];
    const commentText = pickCommentText(common.comment);
    const descField = Array.isArray(common.description)
      ? common.description.filter(Boolean).join(' · ')
      : String(common.description || '').trim();
    description = commentText || descField || album || genre.join(' · ');
    if (Number.isFinite(meta.format?.duration)) {
      durationSec = Math.round(meta.format.duration);
    }
  } catch {
    /* filename + gradient fallback */
  }

  if (!description) {
    description = deriveDescriptionFromTitle(title);
  }

  return {
    id: trackId,
    filename: file.filename,
    title,
    artist,
    album,
    genre,
    description,
    durationSec,
    artDataUrl: gradientArtDataUrl(trackId),
    artSource: 'gradient'
  };
}

export async function getFocusMusicCatalog({ force = false } = {}) {
  const now = Date.now();
  const files = await listMp3Files();
  const fingerprint = catalogFingerprint(files);
  if (!force && catalogCache.tracks.length && catalogCache.fingerprint === fingerprint) {
    return catalogCache.tracks;
  }
  const tracks = await Promise.all(files.map(readTrackMeta));
  catalogCache = { scannedAt: now, tracks, fingerprint };
  return tracks;
}

export async function resolveFocusMusicFile(slug) {
  const decoded = decodeSlug(slug);
  if (!decoded) return null;
  const files = await listMp3Files();
  const match = files.find((f) => slugFromFilename(f.filename) === slug || f.filename.replace(/\.mp3$/i, '') === decoded);
  return match || null;
}

export function invalidateFocusMusicCatalogCache() {
  catalogCache = { scannedAt: 0, tracks: [], fingerprint: '' };
}
