import DocumentSigningService from './documentSigning.service.js';
import { PDFDocument, PDFString, rgb, StandardFonts } from 'pdf-lib';
import { formatEstimateLabel } from '../utils/providerActionOutreach.js';

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

export function buildProviderActionPdfHtml({
  firstName,
  clientCount,
  secondsPerClient,
  estimatedSeconds,
  actionUrl,
  expiresAt
}) {
  const count = Number(clientCount) || 0;
  const per = Number(secondsPerClient) || 15;
  const estimate = formatEstimateLabel(estimatedSeconds);
  const expires = formatExpires(expiresAt);
  const name = String(firstName || '').trim();
  const headlineHello = name ? `${esc(name)}, you have` : 'You have';
  const noun = count === 1 ? 'client who needs' : 'clients who need';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: letter; margin: 0.45in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #145A3D;
      background: #f4f1ea;
    }
    .card {
      background: #fff;
      border-radius: 28px;
      padding: 36px 40px 28px;
      max-width: 720px;
      margin: 0 auto;
      box-shadow: 0 10px 40px rgba(20, 90, 61, 0.08);
      position: relative;
      overflow: hidden;
    }
    .blob {
      position: absolute;
      right: -40px;
      top: -30px;
      width: 220px;
      height: 220px;
      border-radius: 50%;
      background: radial-gradient(circle at 40% 40%, #cfe4d4 0%, #e7f3ea 55%, transparent 70%);
    }
    .kicker {
      letter-spacing: 0.14em;
      font-size: 11px;
      font-weight: 800;
      color: #5A9B58;
      text-transform: uppercase;
      margin: 8px 0 10px;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 34px;
      line-height: 1.15;
      margin: 0 0 12px;
      color: #145A3D;
      max-width: 22ch;
    }
    h1 .num { color: #5A9B58; }
    .lede {
      color: #3f5f4c;
      font-size: 15px;
      line-height: 1.45;
      max-width: 46ch;
      margin: 0 0 22px;
    }
    .lede strong { color: #5A9B58; }
    .metrics {
      display: flex;
      background: #f6f1e6;
      border-radius: 18px;
      padding: 18px 8px;
      margin-bottom: 16px;
    }
    .metric { flex: 1; text-align: center; }
    .metric .val {
      font-family: Georgia, serif;
      font-size: 28px;
      font-weight: 700;
      color: #145A3D;
    }
    .metric .lbl { font-size: 12px; color: #5b7164; margin-top: 4px; }
    .banner {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      background: #eef6ef;
      border: 1px solid #cfe4d4;
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 22px;
    }
    .banner h2 { margin: 0 0 4px; font-size: 15px; }
    .banner p { margin: 0; font-size: 13px; color: #3f5f4c; }
    .cta {
      display: inline-block;
      width: 100%;
      text-align: center;
      background: #145A3D;
      color: #fff !important;
      text-decoration: none;
      border-radius: 16px;
      padding: 16px 18px;
      font-weight: 800;
      font-size: 18px;
      position: relative;
      z-index: 2;
    }
    .cta small { display: block; font-weight: 500; font-size: 12px; opacity: 0.85; margin-top: 2px; }
    .foot {
      text-align: center;
      color: #6b7c72;
      font-size: 12px;
      margin-top: 14px;
    }
    .url {
      word-break: break-all;
      font-size: 10px;
      color: #94a3b8;
      text-align: center;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="blob"></div>
    <div class="kicker">Action required</div>
    <h1>${headlineHello} <span class="num">${count}</span> ${noun} your action.</h1>
    <p class="lede">Please review each client and complete the required action. It only takes about <strong>${per} seconds</strong> per client.</p>
    <div class="metrics">
      <div class="metric"><div class="val">${count}</div><div class="lbl">Clients need your action.</div></div>
      <div class="metric"><div class="val">${per}s</div><div class="lbl">Per client (on average).</div></div>
      <div class="metric"><div class="val">${esc(estimate)}</div><div class="lbl">Total estimated time.</div></div>
    </div>
    <div class="banner">
      <div>
        <h2>Your work makes a difference</h2>
        <p>Keeping your client list up to date helps everyone and ensures we're providing the best care possible.</p>
      </div>
    </div>
    <a class="cta" href="${esc(actionUrl)}">Open my clients<small>Secure link · no Google sign-in needed</small></a>
    <p class="foot">Expires ${esc(expires)} · 24-hour link</p>
    <p class="url">${esc(actionUrl)}</p>
  </div>
</body>
</html>`;
}

async function buildFallbackPdf({
  firstName,
  clientCount,
  secondsPerClient,
  estimatedSeconds,
  actionUrl,
  expiresAt
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const green = rgb(0.078, 0.353, 0.239);
  const mint = rgb(0.353, 0.608, 0.345);
  const body = rgb(0.247, 0.373, 0.298);
  const muted = rgb(0.357, 0.443, 0.392);
  const cream = rgb(0.957, 0.945, 0.918);
  const panel = rgb(0.965, 0.945, 0.902);
  const bannerBg = rgb(0.933, 0.965, 0.937);
  const bannerBorder = rgb(0.812, 0.894, 0.831);
  const white = rgb(1, 1, 1);
  const gray = rgb(0.58, 0.64, 0.69);

  const count = Number(clientCount) || 0;
  const per = Number(secondsPerClient) || 15;
  const estimate = formatEstimateLabel(estimatedSeconds);
  const expires = formatExpires(expiresAt);
  const url = String(actionUrl || '');

  const cardX = 40;
  const cardW = 532;
  const cardY = 56;
  const cardH = 680;
  const pad = 36;
  const innerW = cardW - pad * 2;

  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: cream });
  page.drawRectangle({ x: cardX, y: cardY, width: cardW, height: cardH, color: white });
  page.drawCircle({
    x: cardX + cardW - 20,
    y: cardY + cardH - 20,
    size: 90,
    color: rgb(0.91, 0.95, 0.92),
    opacity: 0.9
  });

  let y = cardY + cardH - pad;

  const drawLines = (lines, { font, size, color, lineHeight = size + 5, x = cardX + pad }) => {
    for (const line of lines) {
      page.drawText(line, { x, y, size, font, color });
      y -= lineHeight;
    }
  };

  page.drawText('ACTION REQUIRED', {
    x: cardX + pad,
    y,
    size: 11,
    font: bold,
    color: mint
  });
  y -= 28;

  const titleLines = wrapText(actionHeadline(firstName, count), serif, 28, innerW);
  drawLines(titleLines, { font: serif, size: 28, color: green, lineHeight: 32 });

  y -= 6;
  const lede = `Please review each client and complete the required action. It only takes about ${per} seconds per client.`;
  drawLines(wrapText(lede, helv, 13, innerW - 20), { font: helv, size: 13, color: body, lineHeight: 18 });

  y -= 10;
  const metricsY = y - 58;
  page.drawRectangle({
    x: cardX + pad,
    y: metricsY,
    width: innerW,
    height: 72,
    color: panel
  });

  const metricCols = [
    { val: String(count), lbl: 'Clients need your action.' },
    { val: `${per}s`, lbl: 'Per client (on average).' },
    { val: estimate, lbl: 'Total estimated time.' }
  ];
  const colW = innerW / 3;
  metricCols.forEach((m, i) => {
    const cx = cardX + pad + colW * i + colW / 2;
    const valW = serif.widthOfTextAtSize(m.val, 24);
    page.drawText(m.val, { x: cx - valW / 2, y: metricsY + 42, size: 24, font: serif, color: green });
    const lblLines = wrapText(m.lbl, helv, 10, colW - 12);
    let ly = metricsY + 22;
    for (const lbl of lblLines) {
      const lw = helv.widthOfTextAtSize(lbl, 10);
      page.drawText(lbl, { x: cx - lw / 2, y: ly, size: 10, font: helv, color: muted });
      ly -= 12;
    }
  });
  y = metricsY - 18;

  const bannerH = 58;
  const bannerY = y - bannerH;
  page.drawRectangle({
    x: cardX + pad,
    y: bannerY,
    width: innerW,
    height: bannerH,
    color: bannerBg,
    borderColor: bannerBorder,
    borderWidth: 1
  });
  page.drawText('Your work makes a difference', {
    x: cardX + pad + 14,
    y: bannerY + bannerH - 22,
    size: 13,
    font: bold,
    color: green
  });
  const bannerLines = wrapText(
    'Keeping your client list up to date helps everyone and ensures we\'re providing the best care possible.',
    helv,
    11,
    innerW - 28
  );
  let by = bannerY + bannerH - 38;
  for (const line of bannerLines) {
    page.drawText(line, { x: cardX + pad + 14, y: by, size: 11, font: helv, color: body });
    by -= 13;
  }
  y = bannerY - 22;

  const ctaH = 52;
  const ctaY = y - ctaH;
  page.drawRectangle({
    x: cardX + pad,
    y: ctaY,
    width: innerW,
    height: ctaH,
    color: green
  });
  const ctaTitle = 'Open my clients';
  const ctaSub = 'Tap this button — secure link, no Google sign-in';
  const ctaTitleW = bold.widthOfTextAtSize(ctaTitle, 16);
  const ctaSubW = helv.widthOfTextAtSize(ctaSub, 10);
  page.drawText(ctaTitle, {
    x: cardX + pad + innerW / 2 - ctaTitleW / 2,
    y: ctaY + 28,
    size: 16,
    font: bold,
    color: white
  });
  page.drawText(ctaSub, {
    x: cardX + pad + innerW / 2 - ctaSubW / 2,
    y: ctaY + 12,
    size: 10,
    font: helv,
    color: rgb(0.92, 0.96, 0.94)
  });
  addUriLink(page, {
    x: cardX + pad,
    y: ctaY,
    width: innerW,
    height: ctaH,
    url
  });
  y = ctaY - 18;

  const foot = `Expires ${expires} · 24-hour link`;
  const footW = helv.widthOfTextAtSize(foot, 11);
  page.drawText(foot, {
    x: cardX + pad + innerW / 2 - footW / 2,
    y,
    size: 11,
    font: helv,
    color: muted
  });
  y -= 16;

  page.drawText('Or paste this address in a browser (keep it on one line):', {
    x: cardX + pad,
    y,
    size: 9,
    font: helv,
    color: muted
  });
  y -= 14;

  let urlSize = 8;
  while (urlSize > 6 && helv.widthOfTextAtSize(url, urlSize) > innerW) urlSize -= 0.25;
  const urlFits = helv.widthOfTextAtSize(url, urlSize) <= innerW;
  const urlBlockTop = y + 10;
  if (urlFits) {
    page.drawText(url, {
      x: cardX + pad,
      y,
      size: urlSize,
      font: helv,
      color: gray
    });
    addUriLink(page, {
      x: cardX + pad,
      y: y - 4,
      width: innerW,
      height: 16,
      url
    });
    y -= 14;
  } else {
    const slash = url.lastIndexOf('/');
    const prefix = slash >= 0 ? url.slice(0, slash + 1) : '';
    const tokenPart = slash >= 0 ? url.slice(slash + 1) : url;
    page.drawText(prefix, { x: cardX + pad, y, size: 8, font: helv, color: gray });
    y -= 12;
    page.drawText(tokenPart, { x: cardX + pad, y, size: 8, font: helv, color: gray });
    addUriLink(page, {
      x: cardX + pad,
      y: y - 4,
      width: innerW,
      height: urlBlockTop - (y - 4),
      url
    });
    y -= 14;
  }

  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

export async function renderProviderActionPdf(payload) {
  const html = buildProviderActionPdfHtml(payload);
  try {
    const bytes = await DocumentSigningService.convertHTMLToPDF(html, {
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.35in', right: '0.35in', bottom: '0.35in', left: '0.35in' },
      disableFallback: true
    });
    if (bytes && bytes.length > 500) return Buffer.from(bytes);
  } catch {
    // Local/dev without Chromium — pdf-lib fallback below.
  }
  return buildFallbackPdf(payload);
}
