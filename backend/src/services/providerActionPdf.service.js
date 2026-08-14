import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatEstimateLabel } from '../utils/providerActionOutreach.js';
import DocumentSigningService from './documentSigning.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const BACKEND_ASSETS = path.join(__dirname, '../assets/providerActionPdf');

/** Careers / school art bundled with the backend so PDF generation works in Docker. */
const BUNDLED_ASSETS = {
  heroItsco: 'hero-itsco-framed.png',
  heroNlu: 'hero-nlu-framed.png',
  schoolGreen: 'school-green.png',
  itscoLogo: 'itsco-logo.png',
  iconTeam: 'icons/team.png',
  iconClock: 'icons/clock.png',
  iconCare: 'icons/care.png',
  iconBadge: 'icons/badge.png',
  iconAlert: 'icons/alert.png',
  iconList: 'icons/list.png'
};

const PUBLIC_ASSET_FALLBACKS = {
  heroItsco: 'public/assets/careers/heroes/itsco-framed.png',
  heroNlu: 'public/assets/careers/heroes/nlu-framed.png',
  schoolGreen: 'frontend/src/assets/schoolReferral/school-logo-green.png',
  itscoLogo: 'src/assets/schoolPrintablePacket/brand/header-logo.png',
  iconTeam: 'public/assets/careers/icons/page1/team.png',
  iconClock: 'public/assets/careers/icons/page1/clock.png',
  iconCare: 'public/assets/careers/icons/page1/care.png',
  iconBadge: 'public/assets/careers/icons/page2/badge.png',
  iconAlert: 'public/assets/careers/icons/page2/alert.png',
  iconList: 'public/assets/careers/icons/page1/list.png'
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

async function fileToDataUri(filePath) {
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.svg'
            ? 'image/svg+xml'
            : 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

async function resolveBundledAsset(key) {
  const bundledName = BUNDLED_ASSETS[key];
  if (!bundledName) return '';
  const bundledPath = path.join(BACKEND_ASSETS, bundledName);
  const uri = await fileToDataUri(bundledPath);
  if (uri) return uri;

  const fallbackRel = PUBLIC_ASSET_FALLBACKS[key];
  if (!fallbackRel) return '';

  const candidates = [
    path.join(process.cwd(), fallbackRel),
    path.join(REPO_ROOT, fallbackRel)
  ];
  for (const candidate of candidates) {
    const fallbackUri = await fileToDataUri(candidate);
    if (fallbackUri) return fallbackUri;
  }
  return '';
}

async function resolveProviderActionPdfAssets({ agency }) {
  const branding = resolveProviderActionBranding(agency);
  const heroKey = branding.heroKey;
  const logoPath = String(agency?.logo_path || '').trim().replace(/^uploads\//, '');
  let logoDataUri = '';
  if (logoPath) {
    logoDataUri = await fileToDataUri(path.join(process.cwd(), 'uploads', logoPath));
    if (!logoDataUri) logoDataUri = await fileToDataUri(path.join(REPO_ROOT, 'backend/uploads', logoPath));
  }
  if (!logoDataUri) logoDataUri = await resolveBundledAsset('itscoLogo');

  return {
    palette: branding.palette,
    heroDataUri: await resolveBundledAsset(heroKey),
    schoolGreenDataUri: await resolveBundledAsset('schoolGreen'),
    logoDataUri,
    iconTeam: await resolveBundledAsset('iconTeam'),
    iconClock: await resolveBundledAsset('iconClock'),
    iconCare: await resolveBundledAsset('iconCare'),
    iconBadge: await resolveBundledAsset('iconBadge'),
    iconAlert: await resolveBundledAsset('iconAlert'),
    iconList: await resolveBundledAsset('iconList')
  };
}

function metricIconHtml(dataUri, fallbackSvg) {
  if (dataUri) return `<img class="metric-icon-img" src="${dataUri}" alt="" />`;
  return fallbackSvg;
}

function buildProviderActionPdfHtml({
  firstName,
  clientCount,
  secondsPerClient,
  estimatedSeconds,
  actionUrl,
  expiresAt,
  googleSsoUrl,
  agency,
  assets
}) {
  const branding = resolveProviderActionBranding(agency);
  const palette = assets?.palette || branding.palette;
  const count = Number(clientCount) || 0;
  const perClient = Number(secondsPerClient) || 15;
  const estimateLabel = formatEstimateLabel(Number(estimatedSeconds) || count * perClient);
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : 'in 24 hours';

  const heroDataUri = assets?.heroDataUri || '';
  const schoolGreenDataUri = assets?.schoolGreenDataUri || '';
  const logoDataUri = assets?.logoDataUri || '';
  const iconTeam = assets?.iconTeam || '';
  const iconClock = assets?.iconClock || '';
  const iconCare = assets?.iconCare || '';
  const iconBadge = assets?.iconBadge || '';
  const iconAlert = assets?.iconAlert || '';
  const iconList = assets?.iconList || '';

  const heroBlock = heroDataUri
    ? `<div class="hero-frame"><img class="hero-photo" src="${heroDataUri}" alt="" /></div>`
    : `<div class="hero-frame hero-fallback" aria-hidden="true"></div>`;

  const logoBlock = logoDataUri
    ? `<img class="brand-logo" src="${logoDataUri}" alt="${escapeHtml(branding.agencyName)}" />`
    : `<div class="brand-wordmark">${escapeHtml(branding.agencyName)}</div>`;

  const schoolArtBlock = schoolGreenDataUri
    ? `<img class="school-art" src="${schoolGreenDataUri}" alt="" />`
    : '';

  const alertIcon = iconAlert
    ? `<img class="kicker-icon" src="${iconAlert}" alt="" />`
    : `<span class="kicker-dot" aria-hidden="true"></span>`;

  const careIcon = iconCare
    ? `<img class="impact-icon" src="${iconCare}" alt="" />`
    : `<span class="impact-star" aria-hidden="true">★</span>`;

  const listIcon = iconList
    ? `<img class="checklist-icon" src="${iconList}" alt="" />`
    : '';

  const teamIcon = metricIconHtml(
    iconTeam,
    '<svg class="metric-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S7.66 5 6 5 3 6.34 3 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 13.17 10.33 12 8 12zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>'
  );
  const clockIcon = metricIconHtml(
    iconClock,
    '<svg class="metric-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm1 11h4v-2h-3V7h-2v6Z"/></svg>'
  );
  const badgeIcon = metricIconHtml(
    iconBadge,
    '<svg class="metric-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.4 4.8L16 8l4.8.7L18 12l.8 4.8L16 16l-2.4 2.4L12 24l-2.4-2.4L8 16l-4.8-.8L4 12l2.8-3.3L4 8l4.8-.7L9.6 2 12 2Z"/></svg>'
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 8.5in 8.5in; margin: 0; }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f1ea;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${palette.text};">
  <div class="sheet" style="width:8.5in;height:8.5in;box-sizing:border-box;padding:0.42in 0.48in 0.38in;position:relative;background:#fff;border:1px solid #e8e4dc;">
    <div class="accent-stripe" style="position:absolute;left:0;top:0;bottom:0;width:6px;background:linear-gradient(180deg,${palette.accent} 0%,${palette.primary} 100%);"></div>

    <header style="text-align:center;margin-bottom:10px;padding-top:2px;">
      ${logoBlock}
    </header>

    <div class="hero-grid" style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:14px;align-items:stretch;margin-bottom:14px;">
      <div class="hero-copy" style="min-width:0;">
        <div class="kicker" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          ${alertIcon}
          <span style="letter-spacing:0.16em;text-transform:uppercase;font-size:10px;font-weight:800;color:${palette.accent};">Action required</span>
        </div>
        <h1 style="font-family:Georgia,Times New Roman,serif;font-size:27px;line-height:1.15;margin:0 0 10px;color:${palette.primary};font-weight:700;">
          ${escapeHtml(firstName || 'there')}, you have
          <span style="color:${palette.accent};">${count}</span>
          client${count === 1 ? '' : 's'} who need${count === 1 ? 's' : ''} your action.
        </h1>
        <p style="margin:0;font-size:13px;line-height:1.55;color:${palette.muted};">
          Review each client and complete the required action. It only takes about
          <strong style="color:${palette.primary};">${perClient} seconds</strong> per client
          — <strong style="color:${palette.primary};">${escapeHtml(estimateLabel)}</strong> total.
        </p>
      </div>
      ${heroBlock}
    </div>

    <div class="metrics" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:${palette.tan};border-radius:16px;padding:14px 10px 12px;margin-bottom:14px;text-align:center;">
      <div class="metric">
        <div class="metric-icon-wrap" style="width:46px;height:46px;margin:0 auto 6px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(20,90,61,0.08);">
          ${teamIcon}
        </div>
        <strong style="display:block;font-size:22px;color:${palette.primary};line-height:1.1;">${count}</strong>
        <span style="display:block;font-size:11px;color:${palette.muted};margin-top:3px;line-height:1.3;">Clients need your action</span>
      </div>
      <div class="metric">
        <div class="metric-icon-wrap" style="width:46px;height:46px;margin:0 auto 6px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(20,90,61,0.08);">
          ${clockIcon}
        </div>
        <strong style="display:block;font-size:22px;color:${palette.primary};line-height:1.1;">${perClient}s</strong>
        <span style="display:block;font-size:11px;color:${palette.muted};margin-top:3px;line-height:1.3;">Per client average</span>
      </div>
      <div class="metric">
        <div class="metric-icon-wrap" style="width:46px;height:46px;margin:0 auto 6px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(20,90,61,0.08);">
          ${badgeIcon}
        </div>
        <strong style="display:block;font-size:22px;color:${palette.primary};line-height:1.1;">${escapeHtml(estimateLabel)}</strong>
        <span style="display:block;font-size:11px;color:${palette.muted};margin-top:3px;line-height:1.3;">Estimated time</span>
      </div>
    </div>

    <div class="impact" style="display:grid;grid-template-columns:1.15fr 0.85fr;gap:10px;align-items:center;background:linear-gradient(135deg,${palette.light} 0%,#f0faf0 100%);border-radius:16px;padding:14px 16px;margin-bottom:16px;border:1px solid rgba(90,155,88,0.18);">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          ${careIcon}
          <strong style="font-size:15px;color:${palette.primary};">Your work makes a difference</strong>
        </div>
        <p style="margin:0;font-size:12px;line-height:1.5;color:${palette.muted};">
          Each quick update keeps schools informed and helps students get the support they need this year.
        </p>
      </div>
      <div style="position:relative;display:flex;align-items:center;justify-content:center;min-height:72px;">
        ${schoolArtBlock}
        ${listIcon}
      </div>
    </div>

    <a href="${escapeHtml(actionUrl)}" style="display:block;text-align:center;background:linear-gradient(135deg,${palette.primary} 0%,#0d4a31 100%);color:#fff;text-decoration:none;border-radius:14px;padding:16px 18px;font-size:17px;font-weight:800;box-shadow:0 8px 22px rgba(20,90,61,0.22);">
      Open my clients
      <span style="display:block;font-size:11px;font-weight:600;opacity:0.9;margin-top:4px;">Secure link · no Google sign-in</span>
    </a>

    <p style="margin:12px 0 6px;font-size:11px;color:${palette.muted};text-align:center;">
      This secure link expires <strong style="color:${palette.primary};">${escapeHtml(expiresLabel)}</strong>.
    </p>
    <div style="background:#f8faf9;border:1px solid #e2e8e4;border-radius:10px;padding:8px 10px;font-size:9px;line-height:1.4;color:#64748b;word-break:break-all;">
      ${escapeHtml(actionUrl)}
    </div>
    ${googleSsoUrl ? `<p style="margin:8px 0 0;font-size:9px;color:#94a3b8;text-align:center;">Or sign in at ${escapeHtml(googleSsoUrl)}</p>` : ''}
  </div>

  <style>
    .brand-logo { max-height: 46px; max-width: 200px; object-fit: contain; }
    .brand-wordmark { font-size: 22px; font-weight: 800; color: ${palette.primary}; }
    .hero-frame {
      border-radius: 18px;
      overflow: hidden;
      border: 3px solid rgba(90,155,88,0.28);
      box-shadow: 0 10px 28px rgba(20,90,61,0.14);
      min-height: 168px;
      background: linear-gradient(145deg, #e8f5e9, #f6f1e6);
    }
    .hero-photo { width: 100%; height: 100%; min-height: 168px; object-fit: cover; display: block; }
    .hero-fallback {
      background: linear-gradient(145deg, ${palette.light}, ${palette.tan});
    }
    .kicker-icon { width: 22px; height: 22px; object-fit: contain; flex-shrink: 0; }
    .kicker-dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: ${palette.accent};
      box-shadow: 0 0 0 4px rgba(90,155,88,0.2);
      flex-shrink: 0;
    }
    .metric-icon-img { width: 28px; height: 28px; object-fit: contain; }
    .metric-icon-svg { width: 26px; height: 26px; color: ${palette.accent}; }
    .impact-icon { width: 26px; height: 26px; object-fit: contain; flex-shrink: 0; }
    .impact-star { color: ${palette.accent}; font-size: 20px; line-height: 1; }
    .school-art {
      max-width: 88%;
      max-height: 78px;
      object-fit: contain;
      opacity: 0.95;
    }
    .checklist-icon {
      position: absolute;
      right: 0;
      bottom: -4px;
      width: 36px;
      height: 36px;
      object-fit: contain;
      background: #fff;
      border-radius: 50%;
      padding: 4px;
      box-shadow: 0 2px 8px rgba(20,90,61,0.12);
    }
  </style>
</body>
</html>`;
}

function isValidPdf(buf) {
  if (!buf || buf.length < 256) return false;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (!b.slice(0, 8).toString('ascii').startsWith('%PDF-')) return false;
  const tail = b.slice(-64).toString('ascii');
  return tail.includes('%%EOF');
}

async function embedPng(pdfDoc, dataUri) {
  if (!dataUri) return null;
  try {
    const commaIdx = dataUri.indexOf(',');
    if (commaIdx === -1) return null;
    const base64 = dataUri.slice(commaIdx + 1);
    const bytes = Buffer.from(base64, 'base64');
    if (dataUri.includes('image/png')) return await pdfDoc.embedPng(bytes);
    if (dataUri.includes('image/jpeg') || dataUri.includes('image/jpg')) return await pdfDoc.embedJpg(bytes);
    return await pdfDoc.embedPng(bytes);
  } catch {
    return null;
  }
}

async function buildFallbackPdf({
  firstName,
  clientCount,
  secondsPerClient,
  estimatedSeconds,
  actionUrl,
  expiresAt,
  googleSsoUrl,
  agency,
  assets
}) {
  const branding = resolveProviderActionBranding(agency);
  const palette = assets?.palette || branding.palette;
  const count = Number(clientCount) || 0;
  const perClient = Number(secondsPerClient) || 15;
  const estimateLabel = formatEstimateLabel(Number(estimatedSeconds) || count * perClient);
  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : 'in 24 hours';

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 612]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const primary = rgb(0.08, 0.35, 0.24);
  const accent = rgb(0.35, 0.61, 0.34);
  const muted = rgb(0.36, 0.44, 0.39);
  const tan = rgb(0.965, 0.945, 0.902);
  const light = rgb(0.91, 0.96, 0.91);

  page.drawRectangle({ x: 0, y: 0, width: 8, height: 612, color: accent });

  const logoImg = await embedPng(pdfDoc, assets?.logoDataUri);
  if (logoImg) {
    const logoW = 120;
    const scale = logoW / logoImg.width;
    const logoH = logoImg.height * scale;
    page.drawImage(logoImg, {
      x: (612 - logoW) / 2,
      y: 562 - logoH,
      width: logoW,
      height: logoH
    });
  }

  const heroImg = await embedPng(pdfDoc, assets?.heroDataUri);
  const heroX = 360;
  const heroY = 318;
  const heroW = 196;
  const heroH = 156;
  if (heroImg) {
    page.drawRectangle({
      x: heroX - 4,
      y: heroY - 4,
      width: heroW + 8,
      height: heroH + 8,
      color: light,
      borderColor: accent,
      borderWidth: 2
    });
    page.drawImage(heroImg, { x: heroX, y: heroY, width: heroW, height: heroH });
  }

  page.drawText('ACTION REQUIRED', {
    x: 36,
    y: 520,
    size: 9,
    font: fontBold,
    color: accent
  });

  const headline = `${firstName || 'there'}, you have ${count} client${count === 1 ? '' : 's'} who need${count === 1 ? 's' : ''} your action.`;
  const headlineLines = headline.match(/.{1,38}(\s|$)/g) || [headline];
  let hy = 500;
  for (const line of headlineLines.slice(0, 3)) {
    page.drawText(line.trim(), { x: 36, y: hy, size: 17, font: fontBold, color: primary });
    hy -= 22;
  }

  page.drawText(
    `About ${perClient} seconds per client — ${estimateLabel} total.`,
    { x: 36, y: hy - 4, size: 10, font, color: muted }
  );

  const metricsY = 248;
  const metricsH = 88;
  page.drawRectangle({
    x: 32,
    y: metricsY,
    width: 548,
    height: metricsH,
    color: tan,
    borderColor: rgb(0.9, 0.88, 0.84),
    borderWidth: 1
  });

  const iconTeam = await embedPng(pdfDoc, assets?.iconTeam);
  const iconClock = await embedPng(pdfDoc, assets?.iconClock);
  const iconBadge = await embedPng(pdfDoc, assets?.iconBadge);

  const drawMetric = (centerX, value, label, iconImg) => {
    if (iconImg) {
      const iconSize = 22;
      page.drawImage(iconImg, {
        x: centerX - iconSize / 2,
        y: metricsY + metricsH - 30,
        width: iconSize,
        height: iconSize
      });
    }
    page.drawText(value, {
      x: centerX - fontBold.widthOfTextAtSize(value, 18) / 2,
      y: metricsY + 38,
      size: 18,
      font: fontBold,
      color: primary
    });
    const labelLines = label.match(/.{1,16}(\s|$)/g) || [label];
    let ly = metricsY + 22;
    for (const ll of labelLines.slice(0, 2)) {
      page.drawText(ll.trim(), {
        x: centerX - font.widthOfTextAtSize(ll.trim(), 8) / 2,
        y: ly,
        size: 8,
        font,
        color: muted
      });
      ly -= 10;
    }
  };

  drawMetric(130, String(count), 'Clients need your action', iconTeam);
  drawMetric(306, `${perClient}s`, 'Per client average', iconClock);
  drawMetric(478, estimateLabel, 'Estimated time', iconBadge);

  const bannerY = 168;
  page.drawRectangle({
    x: 32,
    y: bannerY,
    width: 548,
    height: 68,
    color: light,
    borderColor: accent,
    borderWidth: 1
  });

  const iconCare = await embedPng(pdfDoc, assets?.iconCare);
  if (iconCare) {
    page.drawImage(iconCare, { x: 44, y: bannerY + 36, width: 20, height: 20 });
  }
  page.drawText('Your work makes a difference', {
    x: 68,
    y: bannerY + 48,
    size: 11,
    font: fontBold,
    color: primary
  });
  page.drawText('Each quick update keeps schools informed.', {
    x: 44,
    y: bannerY + 30,
    size: 9,
    font,
    color: muted
  });

  const schoolImg = await embedPng(pdfDoc, assets?.schoolGreenDataUri);
  if (schoolImg) {
    const sW = 100;
    const sScale = sW / schoolImg.width;
    const sH = schoolImg.height * sScale;
    page.drawImage(schoolImg, { x: 460, y: bannerY + 8, width: sW, height: Math.min(sH, 52) });
  }

  const iconList = await embedPng(pdfDoc, assets?.iconList);
  if (iconList) {
    page.drawImage(iconList, { x: 548, y: bannerY + 6, width: 24, height: 24 });
  }

  page.drawRectangle({
    x: 32,
    y: 108,
    width: 548,
    height: 44,
    color: primary
  });
  page.drawText('Open my clients', {
    x: 240,
    y: 128,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1)
  });
  page.drawText('Secure link · no Google sign-in', {
    x: 210,
    y: 114,
    size: 8,
    font,
    color: rgb(0.85, 0.95, 0.88)
  });

  page.drawText(`This secure link expires ${expiresLabel}.`, {
    x: 36,
    y: 88,
    size: 9,
    font,
    color: muted
  });

  const urlLines = actionUrl.match(/.{1,72}/g) || [actionUrl];
  let uy = 72;
  for (const ul of urlLines.slice(0, 2)) {
    page.drawText(ul, { x: 36, y: uy, size: 7, font, color: rgb(0.55, 0.58, 0.6) });
    uy -= 9;
  }

  if (googleSsoUrl) {
    page.drawText(`Or sign in at ${googleSsoUrl}`, {
      x: 36,
      y: 48,
      size: 7,
      font,
      color: rgb(0.55, 0.58, 0.6)
    });
  }

  return Buffer.from(await pdfDoc.save());
}

export async function renderProviderActionPdf(input) {
  const assets = await resolveProviderActionPdfAssets({ agency: input.agency });

  // 1. Try Puppeteer HTML render (rich layout with hero / icons).
  try {
    const html = buildProviderActionPdfHtml({ ...input, assets });
    const pdfBuffer = await DocumentSigningService.convertHTMLToPDF(html, {
      format: 'Letter',
      width: '8.5in',
      height: '8.5in',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    if (isValidPdf(pdfBuffer)) {
      console.log('[providerActionPdf] Puppeteer render ok, size:', pdfBuffer.length);
      return pdfBuffer;
    }
    console.warn('[providerActionPdf] Puppeteer returned invalid PDF bytes — falling back');
  } catch (err) {
    console.warn('[providerActionPdf] HTML render threw — falling back:', err?.message || err);
  }

  // 2. pdf-lib branded fallback (reliable, no Puppeteer).
  const fallback = await buildFallbackPdf({ ...input, assets });
  if (isValidPdf(fallback)) {
    console.log('[providerActionPdf] Fallback pdf-lib render ok, size:', fallback.length);
    return fallback;
  }
  throw new Error('Both PDF render paths failed to produce a valid document.');
}

export { buildProviderActionPdfHtml, resolveProviderActionPdfAssets };
