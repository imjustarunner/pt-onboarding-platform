import path from 'path';
import Agency from '../models/Agency.model.js';
import StorageService from './storage.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { canEditPublicAgencySupport } from './publicAgencySupport.service.js';

export const SHARE_IMAGE_SPEC = {
  width: 1200,
  height: 630,
  minWidth: 600,
  minHeight: 315,
  ratio: '1.91:1',
  formats: ['image/png', 'image/jpeg', 'image/webp'],
  maxBytes: 5 * 1024 * 1024,
  tips: 'Use 1200×630 PNG or JPG. Keep the logo and page name in the center; iMessage crops the edges.'
};

const PAGE_KEYS = new Set(['support', 'join', 'careers', 'login', 'book', 'home']);

const DEFAULT_IMAGES = {
  'app.itsco.health': '/assets/careers/heroes/itsco-framed.png',
  'app.nextleveluplcc.com': '/assets/careers/heroes/nlu-framed.png'
};
const FALLBACK_IMAGE = '/branding/plottwisthq-platform-bg.png';

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normHost(host) {
  return String(host || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

export function pathToSharePage(pathname) {
  const p = String(pathname || '/').split('?')[0].toLowerCase();
  if (p === '/support' || p.endsWith('/support')) return 'support';
  if (p.includes('/join') || p.includes('/office-intake') || p.includes('/intake')) return 'join';
  if (p.includes('/careers')) return 'careers';
  if (p.includes('/login')) return 'login';
  if (p.includes('/book')) return 'book';
  if (p === '/' || p === '') return 'home';
  return 'home';
}

export function normalizeSharePage(page, pathname = '') {
  const key = String(page || pathToSharePage(pathname) || '').trim().toLowerCase();
  return PAGE_KEYS.has(key) ? key : pathToSharePage(pathname);
}

function parsePublicShare(themeSettings) {
  const theme = parseJson(themeSettings, {});
  const raw = theme.publicShare && typeof theme.publicShare === 'object' ? theme.publicShare : {};
  const pages = raw.pages && typeof raw.pages === 'object' ? raw.pages : {};
  const out = {};
  for (const key of PAGE_KEYS) {
    const row = pages[key] && typeof pages[key] === 'object' ? pages[key] : {};
    const imagePath = String(row.imagePath || row.url || '').trim();
    if (!imagePath) continue;
    out[key] = {
      imagePath,
      updatedAt: String(row.updatedAt || '').trim() || null
    };
  }
  return out;
}

function publicUrlFromStored(imagePath) {
  if (!imagePath) return null;
  if (imagePath.startsWith('/assets/') || imagePath.startsWith('/branding/')) return imagePath;
  if (imagePath.startsWith('/api/')) return imagePath;
  const url = publicUploadsUrlFromStoredPath(imagePath);
  if (!url) return imagePath;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/uploads/')) return `/api${url}`;
  return url;
}

async function resolveAgencyFromHostOrSlug({ host, agencySlug }) {
  const slug = String(agencySlug || '').trim();
  if (slug) {
    return (await Agency.findByPortalUrl(slug)) || (await Agency.findBySlug(slug));
  }
  const hostname = normHost(host);
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return null;
  return Agency.findByCustomDomain(hostname);
}

function defaultImageForHost(host) {
  const hostname = normHost(host);
  return DEFAULT_IMAGES[hostname] || FALLBACK_IMAGE;
}

function requestOrigin(req) {
  const forwarded = String(req?.get?.('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = forwarded || (req?.protocol === 'http' ? 'http' : 'https');
  const host = normHost(req?.get?.('x-forwarded-host') || req?.get?.('host') || req?.query?.host);
  if (!host) return '';
  return `${proto}://${host}`;
}

export function absoluteShareImageUrl(req, pathname = '/') {
  const origin = requestOrigin(req);
  const pathPart = String(pathname || '/').startsWith('/') ? pathname : `/${pathname || ''}`;
  return origin
    ? `${origin}/api/public/share-preview/image?path=${encodeURIComponent(pathPart)}`
    : `/api/public/share-preview/image?path=${encodeURIComponent(pathPart)}`;
}

export async function getSharePreviewState({ host, agencySlug, page, pathname } = {}) {
  const agency = await resolveAgencyFromHostOrSlug({ host, agencySlug });
  const pageKey = normalizeSharePage(page, pathname);
  const pages = agency ? parsePublicShare(agency.theme_settings) : {};
  const custom = pages[pageKey] || null;
  const imagePath = custom?.imagePath || defaultImageForHost(host);
  return {
    page: pageKey,
    imageUrl: publicUrlFromStored(imagePath) || imagePath,
    custom: Boolean(custom?.imagePath),
    updatedAt: custom?.updatedAt || null,
    spec: SHARE_IMAGE_SPEC
  };
}

export async function resolveSharePreviewRedirect(req) {
  const host = req.query?.host || req.get?.('x-forwarded-host') || req.get?.('host');
  const pathname = String(req.query?.path || '/');
  const state = await getSharePreviewState({ host, pathname });
  const origin = requestOrigin(req);
  const url = state.imageUrl || defaultImageForHost(host);
  if (/^https?:\/\//i.test(url)) return url;
  const bust = state.updatedAt ? `?v=${encodeURIComponent(state.updatedAt)}` : '';
  return `${origin}${url}${bust}`;
}

export async function saveSharePreviewImage({ agencySlug, page, pathname, file, user, host }) {
  if (!canEditPublicAgencySupport(user)) {
    const err = new Error('Not allowed to edit this page.');
    err.status = 403;
    throw err;
  }
  const agency = await resolveAgencyFromHostOrSlug({ host, agencySlug });
  if (!agency) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  if (!file?.buffer) {
    const err = new Error('Choose a PNG, JPG, or WebP image.');
    err.status = 400;
    throw err;
  }
  if (!SHARE_IMAGE_SPEC.formats.includes(String(file.mimetype || '').toLowerCase())) {
    const err = new Error('Use a PNG, JPG, or WebP file.');
    err.status = 400;
    throw err;
  }
  if (file.size && file.size > SHARE_IMAGE_SPEC.maxBytes) {
    const err = new Error('Keep the image under 5 MB.');
    err.status = 400;
    throw err;
  }
  const pageKey = normalizeSharePage(page, pathname);
  const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
  const filename = `share-${pageKey}-${Date.now()}${ext}`;
  const stored = await StorageService.saveLogo(file.buffer, filename, file.mimetype);
  const theme = parseJson(agency.theme_settings, {});
  const current = parsePublicShare(theme);
  current[pageKey] = {
    imagePath: stored.relativePath || stored.path || stored.key,
    updatedAt: new Date().toISOString()
  };
  theme.publicShare = { pages: current };
  await Agency.update(agency.id, { themeSettings: theme });
  return getSharePreviewState({ host, agencySlug: agency.portal_url || agency.slug, page: pageKey });
}

export async function clearSharePreviewImage({ agencySlug, page, pathname, user, host }) {
  if (!canEditPublicAgencySupport(user)) {
    const err = new Error('Not allowed to edit this page.');
    err.status = 403;
    throw err;
  }
  const agency = await resolveAgencyFromHostOrSlug({ host, agencySlug });
  if (!agency) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  const pageKey = normalizeSharePage(page, pathname);
  const theme = parseJson(agency.theme_settings, {});
  const current = parsePublicShare(theme);
  delete current[pageKey];
  theme.publicShare = { pages: current };
  await Agency.update(agency.id, { themeSettings: theme });
  return getSharePreviewState({ host, agencySlug: agency.portal_url || agency.slug, page: pageKey });
}
