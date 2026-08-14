import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { PDFDocument, PDFString, StandardFonts, rgb } from 'pdf-lib';
import puppeteer from 'puppeteer';
import { formatEstimateLabel } from '../utils/providerActionOutreach.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_ASSETS = path.join(__dirname, '../assets/providerActionPdf');

/** Phone-first page: 5.5in × 8.5in (fits iMessage / Files without sideways zoom). */
export const PAGE = { widthIn: 5.5, heightIn: 8.5, widthPt: 396, heightPt: 612 };

const BUNDLED_ASSETS = {
  heroItsco: 'hero-itsco-framed.png',
  heroNlu: 'hero-nlu-framed.png',
  schoolGreen: 'school-green.png',
  itscoLogo: 'itsco-logo.png',
  iconTeam: 'icons/team.png',
  iconClock: 'icons/clock.png',
  iconBadge: 'icons/badge.png'
};

const PUBLIC_ASSET_FALLBACKS = {
  heroItsco: 'public/assets/careers/heroes/itsco-framed.png',
  heroNlu: 'public/assets/careers/heroes/nlu-framed.png',
  schoolGreen: 'frontend/src/assets/schoolReferral/school-logo-green.png',
  itscoLogo: 'src/assets/schoolPrintablePacket/brand/header-logo.png',
  iconTeam: 'public/assets/careers/icons/page1/team.png',
  iconClock: 'public/assets/careers/icons/page1/clock.png',
  iconBadge: 'public/assets/careers/icons/page2/badge.png'
};

const DEFAULT_PALETTE = {
  primary: '#145A3D',
  accent: '#5A9B58',
  light: '#E8F5E9',
  tan: '#F6F1E6',
  text: '#1F2937',
  muted: '#5B7164'
};

export const PROVIDER_ACTION_PDF_STATIC_ASSETS = {
  heroItsco: '/assets/careers/heroes/itsco-framed.png',
  heroNlu: '/assets/careers/heroes/nlu-framed.png',
  schoolGreen: '/assets/provider-action/school-green.png',
  fallbackLogo: '/assets/provider-action/itsco-logo.png',
  iconTeam: '/assets/careers/icons/page1/team.png',
  iconClock: '/assets/careers/icons/page1/clock.png',
  iconCare: '/assets/careers/icons/page1/care.png',
  iconBadge: '/assets/careers/icons/page2/badge.png',
  iconAlert: '/assets/careers/icons/page2/alert.png',
  iconList: '/assets/careers/icons/page1/list.png'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parsePalette(agency) {
  const raw = agency?.color_palette ?? agency?.colorPalette;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function resolveProviderActionBranding(agency) {
  const paletteRaw = parsePalette(agency);
  const palette = {
    primary: paletteRaw.primary || paletteRaw.primaryColor || DEFAULT_PALETTE.primary,
    accent: paletteRaw.accent || paletteRaw.accentColor || DEFAULT_PALETTE.accent,
    light: paletteRaw.light || paletteRaw.lightGreen || DEFAULT_PALETTE.light,
    tan: paletteRaw.tan || paletteRaw.cream || DEFAULT_PALETTE.tan,
    text: paletteRaw.text || DEFAULT_PALETTE.text,
    muted: paletteRaw.muted || DEFAULT_PALETTE.muted
  };
  const slug = String(agency?.slug || agency?.portal_url || 'itsco').toLowerCase();
  const isNlu = slug.includes('nlu');
  const logoPath = String(agency?.logo_path || '').trim().replace(/^uploads\//, '');
  const logoUrlRaw = String(agency?.logo_url || '').trim();
  let logoUrl = PROVIDER_ACTION_PDF_STATIC_ASSETS.fallbackLogo;
  if (logoPath) logoUrl = `/uploads/${logoPath}`;
  else if (logoUrlRaw) logoUrl = logoUrlRaw.startsWith('/') ? logoUrlRaw : logoUrlRaw;

  return {
    agencyName: agency?.name || agency?.official_name || 'ITSCO',
    slug,
    palette,
    heroKey: isNlu ? 'heroNlu' : 'heroItsco',
    logoUrl,
    assets: {
      ...PROVIDER_ACTION_PDF_STATIC_ASSETS,
      heroUrl: isNlu
        ? PROVIDER_ACTION_PDF_STATIC_ASSETS.heroNlu
        : PROVIDER_ACTION_PDF_STATIC_ASSETS.heroItsco
    }
  };
}

function copyFromInput(input) {
  const branding = resolveProviderActionBranding(input.agency);
  const count = Number(input.clientCount) || 0;
  const perClient = Number(input.secondsPerClient) || 15;
  const estimateLabel = formatEstimateLabel(Number(input.estimatedSeconds) || count * perClient);
  const expiresLabel = input.expiresAt
    ? new Date(input.expiresAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : 'in 24 hours';
  return { branding, count, perClient, estimateLabel, expiresLabel };
}

async function fileToDataUri(filePath) {
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

async function resolveBundledAsset(key) {
  const bundledName = BUNDLED_ASSETS[key];
  if (!bundledName) return '';
  const uri = await fileToDataUri(path.join(BACKEND_ASSETS, bundledName));
  if (uri) return uri;
  const fallbackRel = PUBLIC_ASSET_FALLBACKS[key];
  if (!fallbackRel) return '';
  for (const candidate of [path.join(process.cwd(), fallbackRel), path.join(REPO_ROOT, fallbackRel)]) {
    const fallbackUri = await fileToDataUri(candidate);
    if (fallbackUri) return fallbackUri;
  }
  return '';
}

async function resolveBundledFilePaths(agency) {
  const branding = resolveProviderActionBranding(agency);
  const heroFile = branding.heroKey === 'heroNlu' ? BUNDLED_ASSETS.heroNlu : BUNDLED_ASSETS.heroItsco;
  const logoRel = String(agency?.logo_path || '').trim().replace(/^uploads\//, '');
  let logo = path.join(BACKEND_ASSETS, BUNDLED_ASSETS.itscoLogo);
  if (logoRel) {
    for (const c of [
      path.join(process.cwd(), 'uploads', logoRel),
      path.join(REPO_ROOT, 'backend/uploads', logoRel)
    ]) {
      try {
        await fs.access(c);
        logo = c;
        break;
      } catch {
        /* keep default */
      }
    }
  }
  return {
    palette: branding.palette,
    hero: path.join(BACKEND_ASSETS, heroFile),
    logo,
    iconTeam: path.join(BACKEND_ASSETS, BUNDLED_ASSETS.iconTeam),
    iconClock: path.join(BACKEND_ASSETS, BUNDLED_ASSETS.iconClock),
    iconBadge: path.join(BACKEND_ASSETS, BUNDLED_ASSETS.iconBadge)
  };
}

async function resolveProviderActionPdfAssets({ agency }) {
  const branding = resolveProviderActionBranding(agency);
  const logoRel = String(agency?.logo_path || '').trim().replace(/^uploads\//, '');
  let logoDataUri = '';
  if (logoRel) {
    logoDataUri = await fileToDataUri(path.join(process.cwd(), 'uploads', logoRel));
    if (!logoDataUri) logoDataUri = await fileToDataUri(path.join(REPO_ROOT, 'backend/uploads', logoRel));
  }
  if (!logoDataUri) logoDataUri = await resolveBundledAsset('itscoLogo');
  return {
    palette: branding.palette,
    heroDataUri: await resolveBundledAsset(branding.heroKey),
    logoDataUri,
    iconTeam: await resolveBundledAsset('iconTeam'),
    iconClock: await resolveBundledAsset('iconClock'),
    iconBadge: await resolveBundledAsset('iconBadge')
  };
}

function fileSrc(p) {
  return p ? `file://${p}` : '';
}

function buildMobileCardHtml({ firstName, actionUrl, googleSsoUrl, paths, copy }) {
  const { branding, count, perClient, estimateLabel, expiresLabel } = copy;
  const palette = paths.palette || branding.palette;
  const logo = fileSrc(paths.logo);
  const hero = fileSrc(paths.hero);
  const team = fileSrc(paths.iconTeam);
  const clock = fileSrc(paths.iconClock);
  const badge = fileSrc(paths.iconBadge);
  const needWord = count === 1 ? 'needs' : 'need';
  const clientWord = count === 1 ? 'client' : 'clients';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: ${PAGE.widthIn}in ${PAGE.heightIn}in; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: ${PAGE.widthIn}in; height: ${PAGE.heightIn}in; }
    body {
      font-family: Inter, Segoe UI, Helvetica, Arial, sans-serif;
      color: ${palette.text};
      background: #fff;
    }
    .card { width: ${PAGE.widthIn}in; height: ${PAGE.heightIn}in; display: flex; flex-direction: column; background: #fff; }
    .brand {
      background: #fff;
      border-top: 8px solid ${palette.primary};
      padding: 14px 22px 12px;
      text-align: center;
    }
    .brand img { max-height: 44px; max-width: 190px; object-fit: contain; }
    .brand-name { color: ${palette.primary}; font-weight: 800; font-size: 18px; }
    .hero { height: 2.15in; overflow: hidden; background: ${palette.light}; }
    .hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .body { flex: 1; padding: 18px 22px 16px; display: flex; flex-direction: column; }
    .kicker {
      letter-spacing: 0.16em; text-transform: uppercase; font-size: 10px; font-weight: 800;
      color: ${palette.accent}; margin: 0 0 8px;
    }
    h1 {
      font-family: Georgia, Times New Roman, serif;
      font-size: 23px; line-height: 1.2; margin: 0 0 8px; color: ${palette.primary}; font-weight: 700;
    }
    h1 .num { color: ${palette.accent}; }
    .lede { margin: 0 0 14px; font-size: 13px; line-height: 1.45; color: ${palette.muted}; }
    .stats {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
      margin: 0 0 16px;
    }
    .stat { text-align: center; }
    .stat img { width: 22px; height: 22px; object-fit: contain; display: block; margin: 0 auto 4px; }
    .stat strong { display: block; font-size: 18px; color: ${palette.primary}; line-height: 1.1; }
    .stat span { display: block; font-size: 9px; color: ${palette.muted}; margin-top: 2px; line-height: 1.25; }
    .cta {
      display: block; text-align: center; text-decoration: none;
      background: ${palette.primary}; color: #fff;
      border-radius: 14px; padding: 16px 12px 14px;
      font-size: 18px; font-weight: 800;
    }
    .cta small { display: block; font-size: 11px; font-weight: 600; opacity: 0.88; margin-top: 4px; }
    .foot { margin-top: auto; padding-top: 12px; text-align: center; }
    .expires { margin: 0 0 6px; font-size: 11px; color: ${palette.muted}; }
    .url {
      display: block; font-size: 9px; line-height: 1.4; color: ${palette.primary};
      word-break: break-all; text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      ${logo ? `<img src="${logo}" alt="${escapeHtml(branding.agencyName)}" />` : `<div class="brand-name">${escapeHtml(branding.agencyName)}</div>`}
    </div>
    <div class="hero">${hero ? `<img src="${hero}" alt="" />` : ''}</div>
    <div class="body">
      <p class="kicker">Action required</p>
      <h1>${escapeHtml(firstName || 'there')}, you have <span class="num">${count}</span> ${clientWord} who ${needWord} your action.</h1>
      <p class="lede">Tap the button — about <strong>${perClient} seconds</strong> per client, ${escapeHtml(estimateLabel)} total. No Google sign-in.</p>
      <div class="stats">
        <div class="stat">${team ? `<img src="${team}" alt="" />` : ''}<strong>${count}</strong><span>Clients</span></div>
        <div class="stat">${clock ? `<img src="${clock}" alt="" />` : ''}<strong>${perClient}s</strong><span>Each</span></div>
        <div class="stat">${badge ? `<img src="${badge}" alt="" />` : ''}<strong>${escapeHtml(estimateLabel)}</strong><span>Total time</span></div>
      </div>
      <a class="cta" href="${escapeHtml(actionUrl)}">Open my clients<small>Secure link · opens in your phone browser</small></a>
      <div class="foot">
        <p class="expires">Expires ${escapeHtml(expiresLabel)}</p>
        <a class="url" href="${escapeHtml(actionUrl)}">${escapeHtml(actionUrl)}</a>
        ${googleSsoUrl ? `<p class="expires">Or sign in at ${escapeHtml(googleSsoUrl)}</p>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}

function isValidPdf(buf) {
  if (!buf || buf.length < 256) return false;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (!b.slice(0, 8).toString('ascii').startsWith('%PDF-')) return false;
  return b.slice(-80).toString('ascii').includes('%%EOF');
}

function addUriLink(page, { x, y, width, height, url }) {
  const annot = page.doc.context.register(
    page.doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      F: 4,
      A: {
        Type: 'Action',
        S: 'URI',
        URI: PDFString.of(String(url || ''))
      }
    })
  );
  page.node.addAnnot(annot);
}

/** Stamp guaranteed tap targets. Phone PDF viewers often ignore HTML <a> tags. */
async function stampActionLinks(pdfBytes, actionUrl) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPages()[0];
  const { width, height } = page.getSize();
  addUriLink(page, {
    x: 0,
    y: 0,
    width,
    height: Math.max(280, height * 0.5),
    url: actionUrl
  });
  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

async function embedPng(pdfDoc, dataUri) {
  if (!dataUri) return null;
  try {
    const commaIdx = dataUri.indexOf(',');
    if (commaIdx === -1) return null;
    const bytes = Buffer.from(dataUri.slice(commaIdx + 1), 'base64');
    if (dataUri.includes('image/jpeg') || dataUri.includes('image/jpg')) {
      return await pdfDoc.embedJpg(bytes);
    }
    return await pdfDoc.embedPng(bytes);
  } catch {
    return null;
  }
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function buildFallbackPdf(input, assets) {
  const { branding, count, perClient, estimateLabel, expiresLabel } = copyFromInput(input);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE.widthPt, PAGE.heightPt]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const primary = rgb(0.08, 0.35, 0.24);
  const accent = rgb(0.35, 0.61, 0.34);
  const muted = rgb(0.36, 0.44, 0.39);
  const cream = rgb(0.97, 0.96, 0.93);
  const white = rgb(1, 1, 1);

  page.drawRectangle({ x: 0, y: 0, width: PAGE.widthPt, height: PAGE.heightPt, color: white });
  page.drawRectangle({ x: 0, y: PAGE.heightPt - 8, width: PAGE.widthPt, height: 8, color: primary });

  const logoImg = await embedPng(pdfDoc, assets?.logoDataUri);
  if (logoImg) {
    const logoW = 132;
    const logoH = (logoImg.height / logoImg.width) * logoW;
    page.drawImage(logoImg, {
      x: (PAGE.widthPt - logoW) / 2,
      y: PAGE.heightPt - 56,
      width: logoW,
      height: Math.min(logoH, 36)
    });
  } else {
    const name = branding.agencyName;
    page.drawText(name, {
      x: (PAGE.widthPt - fontBold.widthOfTextAtSize(name, 16)) / 2,
      y: PAGE.heightPt - 40,
      size: 16,
      font: fontBold,
      color: primary
    });
  }

  const heroImg = await embedPng(pdfDoc, assets?.heroDataUri);
  const heroY = PAGE.heightPt - 64 - 156;
  if (heroImg) {
    page.drawImage(heroImg, { x: 0, y: heroY, width: PAGE.widthPt, height: 156 });
  } else {
    page.drawRectangle({ x: 0, y: heroY, width: PAGE.widthPt, height: 156, color: rgb(0.91, 0.96, 0.91) });
  }

  let y = heroY - 28;
  page.drawText('ACTION REQUIRED', { x: 22, y, size: 9, font: fontBold, color: accent });
  y -= 26;

  const headline = `${input.firstName || 'there'}, you have ${count} client${count === 1 ? '' : 's'} who ${count === 1 ? 'needs' : 'need'} your action.`;
  for (const line of wrapText(headline, fontBold, 16, PAGE.widthPt - 44).slice(0, 3)) {
    page.drawText(line, { x: 22, y, size: 16, font: fontBold, color: primary });
    y -= 20;
  }

  y -= 4;
  const lede = `Tap the button — about ${perClient} seconds per client, ${estimateLabel} total.`;
  for (const line of wrapText(lede, font, 10, PAGE.widthPt - 44).slice(0, 2)) {
    page.drawText(line, { x: 22, y, size: 10, font, color: muted });
    y -= 14;
  }

  y -= 10;
  const iconTeam = await embedPng(pdfDoc, assets?.iconTeam);
  const iconClock = await embedPng(pdfDoc, assets?.iconClock);
  const iconBadge = await embedPng(pdfDoc, assets?.iconBadge);
  const cols = [
    { value: String(count), label: 'Clients', icon: iconTeam },
    { value: `${perClient}s`, label: 'Each', icon: iconClock },
    { value: estimateLabel, label: 'Total time', icon: iconBadge }
  ];
  cols.forEach((col, i) => {
    const cx = 66 + i * 122;
    if (col.icon) page.drawImage(col.icon, { x: cx - 10, y: y - 2, width: 20, height: 20 });
    page.drawText(col.value, {
      x: cx - fontBold.widthOfTextAtSize(col.value, 14) / 2,
      y: y - 22,
      size: 14,
      font: fontBold,
      color: primary
    });
    page.drawText(col.label, {
      x: cx - font.widthOfTextAtSize(col.label, 8) / 2,
      y: y - 34,
      size: 8,
      font,
      color: muted
    });
  });

  const ctaY = 78;
  const ctaH = 64;
  page.drawRectangle({
    x: 22,
    y: ctaY,
    width: PAGE.widthPt - 44,
    height: ctaH,
    color: primary
  });
  const cta = 'Open my clients';
  page.drawText(cta, {
    x: (PAGE.widthPt - fontBold.widthOfTextAtSize(cta, 16)) / 2,
    y: ctaY + 34,
    size: 16,
    font: fontBold,
    color: white
  });
  const sub = 'Secure link  ·  opens in your phone browser';
  page.drawText(sub, {
    x: (PAGE.widthPt - font.widthOfTextAtSize(sub, 8)) / 2,
    y: ctaY + 16,
    size: 8,
    font,
    color: cream
  });

  page.drawText(`Expires ${expiresLabel}`, {
    x: (PAGE.widthPt - font.widthOfTextAtSize(`Expires ${expiresLabel}`, 9)) / 2,
    y: 56,
    size: 9,
    font,
    color: muted
  });
  const url = String(input.actionUrl || '');
  const urlSize = 7;
  const urlLines = wrapText(url, font, urlSize, PAGE.widthPt - 40);
  let uy = 40;
  for (const line of urlLines.slice(0, 2)) {
    page.drawText(line, {
      x: (PAGE.widthPt - font.widthOfTextAtSize(line, urlSize)) / 2,
      y: uy,
      size: urlSize,
      font,
      color: primary
    });
    uy -= 10;
  }

  return Buffer.from(await pdfDoc.save());
}

async function renderWithPuppeteer(html, tmpPath) {
  let browser;
  try {
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (!executablePath) {
      for (const p of [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      ]) {
        try {
          await fs.access(p);
          executablePath = p;
          break;
        } catch {
          /* skip */
        }
      }
    }
    if (!executablePath) throw new Error('No Chromium found');

    browser = await puppeteer.launch({
      executablePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--allow-file-access-from-files'
      ]
    });
    const page = await browser.newPage();
    await fs.writeFile(tmpPath, html, 'utf8');
    await page.goto(`file://${tmpPath}`, { waitUntil: 'networkidle0', timeout: 15000 });
    return await page.pdf({
      width: `${PAGE.widthIn}in`,
      height: `${PAGE.heightIn}in`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      timeout: 25000
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
    await fs.unlink(tmpPath).catch(() => {});
  }
}

export async function renderProviderActionPdf(input) {
  const tmpPath = path.join(os.tmpdir(), `pa-${crypto.randomBytes(8).toString('hex')}.html`);
  const copy = copyFromInput(input);
  let pdfBuffer = null;

  try {
    const filePaths = await resolveBundledFilePaths(input.agency);
    const html = buildMobileCardHtml({
      firstName: input.firstName,
      actionUrl: input.actionUrl,
      googleSsoUrl: input.googleSsoUrl,
      paths: filePaths,
      copy
    });
    const rendered = await renderWithPuppeteer(html, tmpPath);
    if (isValidPdf(rendered)) {
      pdfBuffer = rendered;
      console.log('[providerActionPdf] Puppeteer portrait card ok, size:', rendered.length);
    }
  } catch (err) {
    console.warn('[providerActionPdf] Puppeteer failed — falling back:', err?.message || err);
  }

  if (!pdfBuffer) {
    const assets = await resolveProviderActionPdfAssets({ agency: input.agency });
    pdfBuffer = await buildFallbackPdf(input, assets);
    if (!isValidPdf(pdfBuffer)) {
      throw new Error('Both PDF render paths failed to produce a valid document.');
    }
    console.log('[providerActionPdf] pdf-lib fallback ok, size:', pdfBuffer.length);
  }

  return stampActionLinks(pdfBuffer, input.actionUrl);
}

function buildProviderActionPdfHtml(input) {
  const copy = copyFromInput(input);
  return buildMobileCardHtml({
    firstName: input.firstName,
    actionUrl: input.actionUrl,
    googleSsoUrl: input.googleSsoUrl,
    paths: { palette: copy.branding.palette },
    copy
  });
}

export { buildProviderActionPdfHtml, resolveProviderActionPdfAssets };
