import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import DocumentSigningService from './documentSigning.service.js';
import { PDFDocument, PDFString, rgb, StandardFonts } from 'pdf-lib';
import { formatEstimateLabel } from '../utils/providerActionOutreach.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const PAGE_PT = 612;

const ASSET_PATHS = {
  heroItsco: path.join(REPO_ROOT, 'frontend/public/assets/careers/heroes/itsco-framed.png'),
  heroNlu: path.join(REPO_ROOT, 'frontend/public/assets/careers/heroes/nlu-framed.png'),
  schoolGreen: path.join(REPO_ROOT, 'frontend/src/assets/schoolReferral/school-logo-green.png'),
  iconTeam: path.join(REPO_ROOT, 'frontend/public/assets/careers/icons/page1/team.png'),
  iconClock: path.join(REPO_ROOT, 'frontend/public/assets/careers/icons/page1/clock.png'),
  iconCare: path.join(REPO_ROOT, 'frontend/public/assets/careers/icons/page1/care.png'),
  iconBadge: path.join(REPO_ROOT, 'frontend/public/assets/careers/icons/page2/badge.png'),
  itscoLogo: path.join(__dirname, '../assets/schoolPrintablePacket/brand/header-logo.png')
};

const dataUriCache = new Map();

function addUriLink(page, { x, y, width, height, url }) {
  const href = String(url || '').trim();
  if (!href || width <= 0 || height <= 0) return;
  const annot = page.doc.context.register(
    page.doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 2],
      A: {
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(href)
      }
    })
  );
  page.node.addAnnot(annot);
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatExpires(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || !Number.isFinite(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function actionHeadline(firstName, count) {
  const name = String(firstName || '').trim();
  const hello = name ? `${name}, you have` : 'You have';
  const noun = count === 1 ? 'client who needs' : 'clients who need';
  return `${hello} ${count} ${noun} your action.`;
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const probe = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(probe, size) <= maxWidth) {
      current = probe;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function parsePalette(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function hexToRgb(hex, fallback = { r: 0.078, g: 0.353, b: 0.239 }) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255
  };
}

function mimeForPath(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

async function fileToDataUri(absPath) {
  const key = String(absPath || '');
  if (!key) return '';
  if (dataUriCache.has(key)) return dataUriCache.get(key);
  try {
    const buf = await fs.readFile(key);
    const uri = `data:${mimeForPath(key)};base64,${buf.toString('base64')}`;
    dataUriCache.set(key, uri);
    return uri;
  } catch {
    return '';
  }
}

function normalizeStorageKey(value) {
  let rawValue = String(value || '').trim();
  if (!rawValue) return '';
  try {
    if (/^https?:\/\//i.test(rawValue)) {
      rawValue = new URL(rawValue).pathname || '';
    }
  } catch {
    /* ignore */
  }
  rawValue = rawValue.replace(/^\/+/, '');
  if (rawValue.startsWith('uploads/')) return rawValue;
  if (rawValue.startsWith('logos/')) return `uploads/${rawValue}`;
  if (!rawValue.includes('/')) return `uploads/logos/${rawValue}`;
  return rawValue;
}

async function bytesToDataUri(bytes, mime = 'image/png') {
  if (!bytes || !bytes.length) return '';
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

async function resolveAgencyLogoDataUri(agency = null) {
  const raw = String(agency?.logo_url || agency?.logoUrl || agency?.logo_path || agency?.logoPath || '').trim();
  if (/^data:image\//i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const axiosMod = await import('axios');
      const axios = axiosMod.default || axiosMod;
      const response = await axios.get(raw, {
        responseType: 'arraybuffer',
        timeout: 4000,
        maxRedirects: 3
      });
      const mime = String(response.headers?.['content-type'] || 'image/png').split(';')[0];
      return bytesToDataUri(response.data, mime);
    } catch {
      /* fall through */
    }
  }
  if (raw) {
    const key = normalizeStorageKey(raw);
    try {
      const StorageService = (await import('./storage.service.js')).default;
      const buffer = await StorageService.readObject(key);
      return bytesToDataUri(buffer);
    } catch {
      try {
        let rel = key.replace(/^\/+/, '');
        if (rel.startsWith('uploads/')) rel = rel.slice('uploads/'.length);
        const localPath = path.resolve(__dirname, '../../uploads', rel);
        const uri = await fileToDataUri(localPath);
        if (uri) return uri;
      } catch {
        /* ignore */
      }
    }
  }
  const slug = String(agency?.slug || agency?.portal_url || '').toLowerCase();
  if (!agency || slug.includes('itsco')) {
    return fileToDataUri(ASSET_PATHS.itscoLogo);
  }
  return '';
}

export async function resolveProviderActionPdfAssets(agency = null) {
  const slug = String(agency?.slug || agency?.portal_url || '').toLowerCase();
  const palette = parsePalette(agency?.color_palette || agency?.colorPalette);
  const heroPath = slug.includes('nlu') || slug.includes('new-life')
    ? ASSET_PATHS.heroNlu
    : ASSET_PATHS.heroItsco;
  const [agencyLogoDataUri, heroDataUri, schoolArtDataUri, iconTeam, iconClock, iconCare, iconBadge] =
    await Promise.all([
      resolveAgencyLogoDataUri(agency),
      fileToDataUri(heroPath),
      fileToDataUri(ASSET_PATHS.schoolGreen),
      fileToDataUri(ASSET_PATHS.iconTeam),
      fileToDataUri(ASSET_PATHS.iconClock),
      fileToDataUri(ASSET_PATHS.iconCare),
      fileToDataUri(ASSET_PATHS.iconBadge)
    ]);
  return {
    agencyName: String(agency?.official_name || agency?.officialName || agency?.name || '').trim(),
    primaryColor: palette.primary || palette.primaryColor || '#145A3D',
    accentColor: palette.accent || palette.secondary || '#5A9B58',
    agencyLogoDataUri,
    heroDataUri,
    schoolArtDataUri,
    iconTeam,
    iconClock,
    iconCare,
    iconBadge
  };
}

const SVG = {
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4.5h6v3H9z"/><path d="M9 11h6M9 14h4"/><circle cx="16.5" cy="17.5" r="3.2" fill="#145A3D" stroke="#fff" stroke-width="1.2"/><path d="M16.5 16v2.2" stroke="#fff" stroke-width="1.5"/><circle cx="16.5" cy="19.4" r="0.4" fill="#fff" stroke="none"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.2A4.3 4.3 0 0 1 7.8 13.5h2.4A4.3 4.3 0 0 1 14.5 17.8V19"/><circle cx="16.5" cy="8.2" r="2.4"/><path d="M16 13.6a3.8 3.8 0 0 1 4.5 3.6V19"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.4l2.6 1.6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M8.4 12.2 11 14.8l4.8-5.2"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="m12 6.8 1.4 3.4 3.7.3-2.8 2.4.9 3.6L12 14.6 8.8 16.5l.9-3.6-2.8-2.4 3.7-.3z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 14h4"/><path d="M9 9H7.5A3.5 3.5 0 0 0 4 12.5 3.5 3.5 0 0 0 7.5 16H10"/><path d="M15 15h1.5A3.5 3.5 0 0 0 20 11.5 3.5 3.5 0 0 0 16.5 8H14"/><path d="M14 6h4v4"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="11" width="12" height="9" rx="2"/><path d="M8.5 11V8.4a3.5 3.5 0 0 1 7 0V11"/></svg>'
};

function iconImgOrSvg(dataUri, svg, extra = '') {
  if (dataUri) {
    return `<span class="ico ico--photo ${extra}"><img src="${esc(dataUri)}" alt="" /></span>`;
  }
  return `<span class="ico ${extra}">${svg}</span>`;
}

export function buildProviderActionPdfHtml({
  firstName,
  clientCount,
  secondsPerClient,
  estimatedSeconds,
  actionUrl,
  expiresAt,
  agencyName = '',
  primaryColor = '#145A3D',
  accentColor = '#5A9B58',
  agencyLogoDataUri = '',
  heroDataUri = '',
  schoolArtDataUri = '',
  iconTeam = '',
  iconClock = '',
  iconCare = '',
  iconBadge = ''
} = {}) {
  const count = Number(clientCount) || 0;
  const per = Number(secondsPerClient) || 15;
  const estimate = formatEstimateLabel(estimatedSeconds);
  const expires = formatExpires(expiresAt);
  const name = String(firstName || '').trim();
  const headlineHello = name ? `${esc(name)}, you have` : 'You have';
  const noun = count === 1 ? 'client who needs' : 'clients who need';
  const brand = String(agencyName || '').trim();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 8.5in 8.5in; margin: 0.22in; }
    * { box-sizing: border-box; }
    html, body { width: 8.5in; height: 8.5in; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: ${esc(primaryColor)};
      background: #eef3ee;
    }
    .sheet {
      width: 8.06in;
      height: 8.06in;
      background:
        radial-gradient(circle at 88% 8%, #d9eadc 0%, transparent 36%),
        #fff;
      border-radius: 28px;
      padding: 22px 26px 18px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 10px 28px rgba(20, 90, 61, 0.08);
    }
    .brand-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 42px;
      margin-bottom: 10px;
      position: relative;
      z-index: 2;
    }
    .brand-mark { display: flex; align-items: center; gap: 10px; max-width: 58%; }
    .brand-mark img { max-height: 38px; max-width: 210px; object-fit: contain; }
    .brand-name { font-weight: 800; font-size: 13px; letter-spacing: 0.02em; }
    .hero {
      position: absolute;
      top: 10px;
      right: 12px;
      width: 168px;
      height: 132px;
      object-fit: contain;
      z-index: 1;
    }
    .kicker-row { display: flex; align-items: center; gap: 10px; margin: 4px 0 8px; }
    .ico {
      width: 34px; height: 34px; border-radius: 50%;
      background: #e7f3ea; color: ${esc(primaryColor)};
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .ico svg { width: 20px; height: 20px; display: block; }
    .ico--photo { overflow: hidden; background: #eef6ef; }
    .ico--photo img { width: 34px; height: 34px; object-fit: cover; display: block; }
    .kicker {
      letter-spacing: 0.14em;
      font-size: 11px;
      font-weight: 800;
      color: ${esc(accentColor)};
      text-transform: uppercase;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 28px;
      line-height: 1.15;
      margin: 0 0 8px;
      color: ${esc(primaryColor)};
      max-width: 18ch;
    }
    h1 .num { color: ${esc(accentColor)}; }
    .lede {
      color: #3f5f4c;
      font-size: 13px;
      line-height: 1.4;
      max-width: 42ch;
      margin: 0 0 14px;
    }
    .lede strong { color: ${esc(accentColor)}; }
    .metrics {
      display: flex;
      background: #fff;
      border: 1px solid #d7e4d9;
      border-radius: 16px;
      padding: 10px 6px;
      margin-bottom: 12px;
    }
    .metric { flex: 1; text-align: center; border-right: 1px solid #e4eee6; }
    .metric:last-child { border-right: 0; }
    .metric .pic { margin: 0 auto 4px; }
    .metric .val {
      font-family: Georgia, serif;
      font-size: 22px;
      font-weight: 700;
      color: ${esc(primaryColor)};
    }
    .metric .lbl { font-size: 11px; color: #5b7164; margin-top: 2px; }
    .banner {
      display: flex;
      gap: 10px;
      align-items: center;
      background: #eef6ef;
      border: 1px solid #cfe4d4;
      border-radius: 16px;
      padding: 10px 12px;
      margin-bottom: 14px;
    }
    .banner h2 { margin: 0 0 3px; font-size: 14px; }
    .banner p { margin: 0; font-size: 12px; color: #3f5f4c; line-height: 1.35; }
    .school-art {
      width: 86px;
      height: 72px;
      object-fit: contain;
      mix-blend-mode: screen;
      flex-shrink: 0;
    }
    .cta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      text-align: center;
      background: ${esc(primaryColor)};
      color: #fff !important;
      text-decoration: none;
      border-radius: 14px;
      padding: 13px 16px;
      font-weight: 800;
      font-size: 17px;
    }
    .cta svg { width: 20px; height: 20px; stroke: #fff; }
    .cta small { display: block; font-weight: 500; font-size: 11px; opacity: 0.88; margin-top: 1px; }
    .foot {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: #6b7c72;
      font-size: 11px;
      margin-top: 10px;
    }
    .foot svg { width: 13px; height: 13px; }
    .url {
      word-break: break-all;
      font-size: 9px;
      color: #94a3b8;
      text-align: center;
      margin-top: 6px;
    }
  </style>
</head>
<body>
  <div class="sheet">
    ${heroDataUri ? `<img class="hero" src="${esc(heroDataUri)}" alt="" />` : ''}
    <div class="brand-row">
      <div class="brand-mark">
        ${agencyLogoDataUri ? `<img src="${esc(agencyLogoDataUri)}" alt="${esc(brand || 'Agency')}" />` : ''}
        ${!agencyLogoDataUri && brand ? `<div class="brand-name">${esc(brand)}</div>` : ''}
      </div>
    </div>
    <div class="kicker-row">
      <span class="ico">${SVG.clipboard}</span>
      <div class="kicker">Action required</div>
    </div>
    <h1>${headlineHello} <span class="num">${count}</span> ${noun} your action.</h1>
    <p class="lede">Please review each client on your dashboard and complete the required action. It only takes about <strong>${per} seconds</strong> per client.</p>
    <div class="metrics">
      <div class="metric">
        ${iconImgOrSvg(iconTeam, SVG.people, 'pic')}
        <div class="val">${count}</div>
        <div class="lbl">Clients need your action.</div>
      </div>
      <div class="metric">
        ${iconImgOrSvg(iconClock, SVG.clock, 'pic')}
        <div class="val">${per}s</div>
        <div class="lbl">Per client (on average).</div>
      </div>
      <div class="metric">
        ${iconImgOrSvg(iconBadge || iconCare, SVG.check, 'pic')}
        <div class="val">${esc(estimate)}</div>
        <div class="lbl">Total estimated time.</div>
      </div>
    </div>
    <div class="banner">
      <span class="ico">${SVG.star}</span>
      <div>
        <h2>Your work makes a difference</h2>
        <p>Keeping your client list up to date helps everyone and ensures we're providing the best care possible.</p>
      </div>
      ${schoolArtDataUri ? `<img class="school-art" src="${esc(schoolArtDataUri)}" alt="" />` : iconImgOrSvg(iconCare, SVG.check, 'ico')}
    </div>
    <a class="cta" href="${esc(actionUrl)}">${SVG.link}<span>Open my clients<small>Go directly to your clients · no Google sign-in</small></span></a>
    <p class="foot">${SVG.lock}<span>Secure link · No sign-in required · Expires ${esc(expires)}</span></p>
    <p class="url">${esc(actionUrl)}</p>
  </div>
</body>
</html>`;
}

async function embedImage(pdf, dataUri) {
  if (!dataUri || !String(dataUri).startsWith('data:image/')) return null;
  const comma = dataUri.indexOf(',');
  if (comma < 0) return null;
  const bytes = Buffer.from(dataUri.slice(comma + 1), 'base64');
  try {
    return await pdf.embedPng(bytes);
  } catch {
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

function drawPng(page, img, { x, y, maxW, maxH }) {
  if (!img) return;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x, y, width: w, height: h });
}

async function buildFallbackPdf(payload) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_PT, PAGE_PT]);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const primary = hexToRgb(payload.primaryColor);
  const green = rgb(primary.r, primary.g, primary.b);
  const mint = rgb(0.353, 0.608, 0.345);
  const body = rgb(0.247, 0.373, 0.298);
  const muted = rgb(0.357, 0.443, 0.392);
  const cream = rgb(0.933, 0.953, 0.933);
  const white = rgb(1, 1, 1);
  const panel = rgb(0.965, 0.945, 0.902);
  const bannerBg = rgb(0.933, 0.965, 0.937);
  const gray = rgb(0.58, 0.64, 0.69);

  const count = Number(payload.clientCount) || 0;
  const per = Number(payload.secondsPerClient) || 15;
  const estimate = formatEstimateLabel(payload.estimatedSeconds);
  const expires = formatExpires(payload.expiresAt);
  const url = String(payload.actionUrl || '');

  const [logo, hero, school] = await Promise.all([
    embedImage(pdf, payload.agencyLogoDataUri),
    embedImage(pdf, payload.heroDataUri),
    embedImage(pdf, payload.schoolArtDataUri)
  ]);

  page.drawRectangle({ x: 0, y: 0, width: PAGE_PT, height: PAGE_PT, color: cream });
  page.drawRectangle({ x: 22, y: 22, width: 568, height: 568, color: white });
  page.drawCircle({ x: 545, y: 545, size: 70, color: rgb(0.85, 0.92, 0.86), opacity: 0.85 });

  if (hero) drawPng(page, hero, { x: 400, y: 470, maxW: 170, maxH: 108 });
  if (logo) drawPng(page, logo, { x: 42, y: 538, maxW: 200, maxH: 36 });
  else if (payload.agencyName) {
    page.drawText(String(payload.agencyName), { x: 42, y: 548, size: 12, font: bold, color: green });
  }

  let y = 518;
  page.drawText('ACTION REQUIRED', { x: 42, y, size: 10, font: bold, color: mint });
  y -= 26;
  const titleLines = wrapText(actionHeadline(payload.firstName, count), serif, 24, 340);
  for (const line of titleLines) {
    page.drawText(line, { x: 42, y, size: 24, font: serif, color: green });
    y -= 28;
  }
  y -= 4;
  const lede = `Please review each client and complete the required action. It only takes about ${per} seconds per client.`;
  for (const line of wrapText(lede, helv, 12, 360)) {
    page.drawText(line, { x: 42, y, size: 12, font: helv, color: body });
    y -= 16;
  }

  y -= 8;
  const metricsY = y - 70;
  page.drawRectangle({ x: 42, y: metricsY, width: 528, height: 78, color: panel });
  const metricCols = [
    { val: String(count), lbl: 'Clients need your action.' },
    { val: `${per}s`, lbl: 'Per client (on average).' },
    { val: estimate, lbl: 'Total estimated time.' }
  ];
  metricCols.forEach((m, i) => {
    const cx = 42 + 176 * i + 88;
    const valW = serif.widthOfTextAtSize(m.val, 20);
    page.drawText(m.val, { x: cx - valW / 2, y: metricsY + 42, size: 20, font: serif, color: green });
    const lbl = wrapText(m.lbl, helv, 9, 150)[0];
    const lw = helv.widthOfTextAtSize(lbl, 9);
    page.drawText(lbl, { x: cx - lw / 2, y: metricsY + 22, size: 9, font: helv, color: muted });
  });
  y = metricsY - 14;

  const bannerH = 64;
  const bannerY = y - bannerH;
  page.drawRectangle({ x: 42, y: bannerY, width: 528, height: bannerH, color: bannerBg });
  page.drawText('Your work makes a difference', {
    x: 56,
    y: bannerY + bannerH - 22,
    size: 12,
    font: bold,
    color: green
  });
  const bannerLines = wrapText(
    'Keeping your client list up to date helps everyone and ensures we\'re providing the best care possible.',
    helv,
    10,
    school ? 360 : 500
  );
  let by = bannerY + bannerH - 38;
  for (const line of bannerLines) {
    page.drawText(line, { x: 56, y: by, size: 10, font: helv, color: body });
    by -= 12;
  }
  if (school) drawPng(page, school, { x: 470, y: bannerY + 6, maxW: 86, maxH: 52 });
  y = bannerY - 16;

  const ctaH = 48;
  const ctaY = y - ctaH;
  page.drawRectangle({ x: 42, y: ctaY, width: 528, height: ctaH, color: green });
  const ctaTitle = 'Open my clients';
  const ctaSub = 'Secure link · no Google sign-in';
  page.drawText(ctaTitle, {
    x: 42 + 264 - bold.widthOfTextAtSize(ctaTitle, 15) / 2,
    y: ctaY + 26,
    size: 15,
    font: bold,
    color: white
  });
  page.drawText(ctaSub, {
    x: 42 + 264 - helv.widthOfTextAtSize(ctaSub, 9) / 2,
    y: ctaY + 11,
    size: 9,
    font: helv,
    color: rgb(0.92, 0.96, 0.94)
  });
  addUriLink(page, { x: 42, y: ctaY, width: 528, height: ctaH, url });
  y = ctaY - 16;

  const foot = `Secure link · Expires ${expires}`;
  page.drawText(foot, {
    x: 42 + 264 - helv.widthOfTextAtSize(foot, 10) / 2,
    y,
    size: 10,
    font: helv,
    color: muted
  });
  y -= 14;
  let urlSize = 8;
  while (urlSize > 6 && helv.widthOfTextAtSize(url, urlSize) > 528) urlSize -= 0.25;
  page.drawText(url, { x: 42, y, size: urlSize, font: helv, color: gray });
  addUriLink(page, { x: 42, y: y - 3, width: 528, height: 14, url });

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

export async function renderProviderActionPdf(payload = {}) {
  const extras = payload.agency
    ? await resolveProviderActionPdfAssets(payload.agency)
    : {};
  const assets = { ...extras, ...payload };
  const html = buildProviderActionPdfHtml(assets);
  try {
    const bytes = await DocumentSigningService.convertHTMLToPDF(html, {
      width: '8.5in',
      height: '8.5in',
      preferCSSPageSize: true,
      printBackground: true,
      margin: { top: '0.18in', right: '0.18in', bottom: '0.18in', left: '0.18in' },
      disableFallback: true
    });
    if (bytes && bytes.length > 500) return Buffer.from(bytes);
  } catch {
    // Local/dev without Chromium — pdf-lib fallback below.
  }
  return buildFallbackPdf(assets);
}
