/**
 * Resolve printable-packet chrome (cover / header / footer / body font) per agency.
 * ITSCO (and demo ITSCO) keep legacy Comfortaa/Anton + bundled brand assets.
 * NLU uses bundled Next Level Up print assets (header, logo, footer, watermark).
 * Other tenants use Montserrat body + agency-uploaded assets (no ITSCO inheritance).
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import StorageService from './storage.service.js';
import { OFFICE_PRINTABLE_PACKET_VERSION } from '../constants/officePrintablePacket.js';
import { normalizeTenantBrandKey } from '../content/tenantBrandAssets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BRAND_DIR = path.join(__dirname, '../assets/schoolPrintablePacket/brand');
const BRAND_FALLBACK_ROOT = path.resolve(__dirname, '../../../assets/ITSCO Brand');
const NLU_BRAND_DIR = path.join(BRAND_DIR, 'nlu');
const NLU_PRINTING_DIR = path.resolve(__dirname, '../../../assets/PrintingAssets/NLU Assets');
const FONTS_DIR = path.join(__dirname, '../assets/fonts');

const ITSCO_SLUGS = new Set(['itsco', 'demo', 'itsco-demo']);

const _dataUrlCache = new Map();

function fileToDataUrl(filePath, mime) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  if (_dataUrlCache.has(filePath)) return _dataUrlCache.get(filePath);
  const base64 = fs.readFileSync(filePath).toString('base64');
  const dataUrl = `data:${mime};base64,${base64}`;
  _dataUrlCache.set(filePath, dataUrl);
  return dataUrl;
}

function firstExistingDataUrl(candidates, mime) {
  for (const filePath of candidates) {
    const url = fileToDataUrl(filePath, mime);
    if (url) return url;
  }
  return null;
}

function mimeFromPath(filePath) {
  const ext = String(path.extname(filePath || '')).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/png';
}

function normalizeStorageKey(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      raw = parsed.pathname || '';
    }
  } catch {
    /* ignore */
  }
  raw = raw.replace(/^\/+/, '');
  if (raw.startsWith('uploads/')) return raw;
  if (raw.startsWith('logos/')) return `uploads/${raw}`;
  if (!raw.includes('/')) return `uploads/logos/${raw}`;
  return raw;
}

async function storagePathToDataUrl(storedPath) {
  const key = normalizeStorageKey(storedPath);
  if (!key) return null;
  try {
    const buffer = await StorageService.readObject(key);
    if (!buffer?.length) return null;
    const mime = mimeFromPath(key);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    // Local/dev fallback
    try {
      let rel = key.startsWith('uploads/') ? key.slice('uploads/'.length) : key;
      const localPath = path.resolve(__dirname, '../../uploads', rel);
      return fileToDataUrl(localPath, mimeFromPath(localPath));
    } catch {
      return null;
    }
  }
}

export function isItscoPacketChromeAgency(agency = {}) {
  const id = Number(agency?.id || 0);
  if (id === 2) return true;
  const slug = String(agency?.slug || agency?.portal_url || '').trim().toLowerCase();
  if (ITSCO_SLUGS.has(slug)) return true;
  const name = String(agency?.name || '').trim().toLowerCase();
  return name === 'itsco' || name.startsWith('itsco ');
}

function itscoCoverDataUrl() {
  return firstExistingDataUrl([path.join(BRAND_DIR, 'cover-page.png')], 'image/png');
}

function itscoHeaderLogoDataUrl() {
  return firstExistingDataUrl(
    [
      path.join(BRAND_DIR, 'header-logo.png'),
      path.join(BRAND_DIR, 'image1.jpg'),
      path.join(BRAND_FALLBACK_ROOT, 'images', 'image1.jpg')
    ],
    'image/png'
  ) || firstExistingDataUrl(
    [path.join(BRAND_DIR, 'image1.jpg'), path.join(BRAND_FALLBACK_ROOT, 'images', 'image1.jpg')],
    'image/jpeg'
  );
}

function itscoFooterMarkDataUrl() {
  return firstExistingDataUrl(
    [
      path.join(BRAND_DIR, 'footer-mark-bw.png'),
      path.join(BRAND_DIR, 'ITSCOpnginvisiblebackgroundBW.png'),
      path.join(BRAND_FALLBACK_ROOT, 'ITSCOpnginvisiblebackgroundBW.png')
    ],
    'image/png'
  );
}

function itscoWatermarkDataUrl() {
  return firstExistingDataUrl(
    [
      path.join(BRAND_DIR, 'ITSCOpnginvisiblebackgroundBW.png'),
      path.join(BRAND_FALLBACK_ROOT, 'ITSCOpnginvisiblebackgroundBW.png')
    ],
    'image/png'
  );
}

export function isNluPacketChromeAgency(agency = {}) {
  const slug = String(agency?.slug || agency?.portal_url || '').trim().toLowerCase();
  if (normalizeTenantBrandKey(slug) === 'nlu') return true;
  const name = String(agency?.official_name || agency?.name || '').trim().toLowerCase();
  const nameKey = name.replace(/[^a-z0-9-]+/g, '');
  if (normalizeTenantBrandKey(nameKey) === 'nlu') return true;
  return /\bnext level up\b/.test(name) || /\bnlu\b/.test(`${slug} ${name}`);
}

function nluAssetDataUrl(filename) {
  return firstExistingDataUrl(
    [path.join(NLU_BRAND_DIR, filename), path.join(NLU_PRINTING_DIR, filename)],
    mimeFromPath(filename)
  );
}

function nluBundledChrome() {
  return {
    coverDataUrl: nluAssetDataUrl('NLULogo.png'),
    headerLogoDataUrl: nluAssetDataUrl('NLULogo.png'),
    headerImageDataUrl: nluAssetDataUrl('NLUHeader.png'),
    footerMarkDataUrl: nluAssetDataUrl('NLUFooter.png'),
    watermarkDataUrl: nluAssetDataUrl('NLUWatermark.png')
  };
}

function montserratRegularDataUrl() {
  return fileToDataUrl(path.join(FONTS_DIR, 'Montserrat-Regular.ttf'), 'font/ttf');
}

function montserratSemiBoldDataUrl() {
  return fileToDataUrl(path.join(FONTS_DIR, 'Montserrat-SemiBold.ttf'), 'font/ttf');
}

/**
 * @returns {Promise<{
 *   useItscoChrome: boolean,
 *   bodyFontFamily: string,
 *   coverDataUrl: string|null,
 *   headerLogoDataUrl: string|null,
 *   headerImageDataUrl: string|null,
 *   footerMarkDataUrl: string|null,
 *   watermarkDataUrl: string|null,
 *   versionLabel: string,
 *   montserratRegularDataUrl: string|null,
 *   montserratSemiBoldDataUrl: string|null
 * }>}
 */
export async function resolvePacketBrandChrome(agency = {}) {
  const useItsco = isItscoPacketChromeAgency(agency);
  const versionLabel = String(
    agency?.packet_version_label || OFFICE_PRINTABLE_PACKET_VERSION || '1.0'
  ).trim() || '1.0';

  if (useItsco) {
    return {
      useItscoChrome: true,
      bodyFontFamily: "'Comfortaa', Arial, sans-serif",
      coverDataUrl: itscoCoverDataUrl(),
      headerLogoDataUrl: itscoHeaderLogoDataUrl(),
      headerImageDataUrl: null,
      footerMarkDataUrl: itscoFooterMarkDataUrl(),
      watermarkDataUrl: itscoWatermarkDataUrl(),
      versionLabel,
      montserratRegularDataUrl: null,
      montserratSemiBoldDataUrl: null
    };
  }

  const [coverDataUrl, headerLogoDataUrl, footerMarkDataUrl, headerImageDataUrl] = await Promise.all([
    storagePathToDataUrl(agency?.packet_cover_path),
    storagePathToDataUrl(agency?.packet_logo_path || agency?.logo_path),
    storagePathToDataUrl(agency?.packet_footer_logo_path),
    storagePathToDataUrl(agency?.packet_header_image_path)
  ]);

  const nlu = isNluPacketChromeAgency(agency) ? nluBundledChrome() : null;

  return {
    useItscoChrome: false,
    bodyFontFamily: "'Montserrat', Arial, Helvetica, sans-serif",
    coverDataUrl: coverDataUrl || nlu?.coverDataUrl || null,
    headerLogoDataUrl: headerLogoDataUrl || nlu?.headerLogoDataUrl || null,
    headerImageDataUrl: headerImageDataUrl || nlu?.headerImageDataUrl || null,
    footerMarkDataUrl: footerMarkDataUrl || nlu?.footerMarkDataUrl || null,
    watermarkDataUrl: nlu?.watermarkDataUrl || null,
    versionLabel,
    montserratRegularDataUrl: montserratRegularDataUrl(),
    montserratSemiBoldDataUrl: montserratSemiBoldDataUrl()
  };
}

export function applyPacketBrandToSpec(spec = {}, brand = null) {
  if (!brand) return spec;
  return {
    ...spec,
    brand,
    coverImageUrl: spec.coverImageUrl || brand.coverDataUrl || null,
    brandLogoUrl: brand.headerImageDataUrl || brand.headerLogoDataUrl || spec.brandLogoUrl || '',
    watermarkUrl: spec.watermarkUrl || brand.watermarkDataUrl || null,
    packetVersionLabel: spec.packetVersionLabel || brand.versionLabel
  };
}

export async function brandedIntakeSummarySpec(spec, agency) {
  const brand = await resolvePacketBrandChrome(agency || {});
  return applyPacketBrandToSpec(spec, brand);
}

export function packetBrandAssetColumn(slot) {
  const map = {
    cover: 'packet_cover_path',
    logo: 'packet_logo_path',
    footer: 'packet_footer_logo_path',
    header: 'packet_header_image_path'
  };
  return map[String(slot || '').trim().toLowerCase()] || null;
}
