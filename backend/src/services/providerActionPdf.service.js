import DocumentSigningService from './documentSigning.service.js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { formatEstimateLabel } from '../utils/providerActionOutreach.js';

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
  const hello = name ? `${esc(name)}, you have` : 'You have';
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
      display: block;
      text-align: center;
      background: #145A3D;
      color: #fff !important;
      text-decoration: none;
      border-radius: 16px;
      padding: 16px 18px;
      font-weight: 800;
      font-size: 18px;
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
    <h1>${hello} <span class="num">${count}</span> client${count === 1 ? '' : 's'} who need your action.</h1>
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

async function buildFallbackPdf({ firstName, clientCount, secondsPerClient, estimatedSeconds, actionUrl, expiresAt }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.08, 0.35, 0.24);
  const mint = rgb(0.35, 0.61, 0.35);
  let y = 720;
  page.drawText('ACTION REQUIRED', { x: 56, y, size: 11, font: bold, color: mint });
  y -= 36;
  const name = String(firstName || '').trim();
  const line = name
    ? `${name}, you have ${clientCount} clients who need your action.`
    : `You have ${clientCount} clients who need your action.`;
  page.drawText(line.slice(0, 90), { x: 56, y, size: 18, font: bold, color: green });
  y -= 28;
  page.drawText(`About ${secondsPerClient} seconds per client. Estimated ${formatEstimateLabel(estimatedSeconds)}.`, {
    x: 56, y, size: 12, font: helv, color: green
  });
  y -= 40;
  page.drawText('Open this secure link (no Google sign-in needed):', { x: 56, y, size: 12, font: helv, color: green });
  y -= 18;
  const url = String(actionUrl || '');
  for (let i = 0; i < url.length; i += 80) {
    page.drawText(url.slice(i, i + 80), { x: 56, y, size: 10, font: helv, color: rgb(0.2, 0.2, 0.2) });
    y -= 14;
  }
  y -= 12;
  page.drawText(`Expires ${formatExpires(expiresAt)}`, { x: 56, y, size: 11, font: helv, color: mint });
  return Buffer.from(await pdf.save());
}

export async function renderProviderActionPdf(payload) {
  const html = buildProviderActionPdfHtml(payload);
  try {
    const bytes = await DocumentSigningService.convertHTMLToPDF(html, {
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.35in', right: '0.35in', bottom: '0.35in', left: '0.35in' }
    });
    if (bytes && bytes.length > 500) return Buffer.from(bytes);
  } catch {
    // fall through
  }
  return buildFallbackPdf(payload);
}
