// Run from the repository with Playwright and Chrome installed. Uses existing
// vector brand assets, embedded locally; no external requests or AI artwork.
import { chromium } from '../../node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const publicDir = new URL('../public/', import.meta.url);
const asset = path => `data:image/svg+xml;base64,${readFileSync(new URL(path, publicDir)).toString('base64')}`;
const cards = [
  {
    file: 'assets/fundthred/share-card.png', background: 'radial-gradient(ellipse at 95% 0%, #c5e9df, transparent 65%), #f6fafc', color: '#0d203d',
    content: `<img class="wordmark" src="${asset('assets/fundthred/wordmark.svg')}"><h1>Follow the thread<br>of every dollar.</h1><p>Funding. Spending. Proof. Connected.</p>`, footer: 'fundthred.com',
  },
  {
    file: 'auricwell/share-card.png', background: 'radial-gradient(ellipse at 90% 15%, #e4edff, transparent 65%), #faf9f4', color: '#0a3271',
    content: `<div class="brand"><img src="${asset('auricwell/mark.svg')}"><strong>AuricWell</strong></div><h1>Less repeat work.<br>More time for care.</h1><p>A focused EHR for therapy practices.</p>`, footer: 'auricwell.com',
  },
  {
    file: 'office/auricwell-kiosk-share.png', background: 'radial-gradient(ellipse at 100% 0%, #1959a1, transparent 75%), #092955', color: '#ffffff',
    content: `<div class="kiosk-copy"><div class="eyebrow">AURICWELL KIOSK</div><h1>A warm welcome<br>starts here.</h1><p>Client check-in. Providers. Office directory.</p></div><img class="kiosk" src="${asset('office/auricwell-kiosk.svg')}">`, footer: 'kiosk.auricwell.com',
  },
];
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.route('http://**/*', route => route.abort());
  await page.route('https://**/*', route => route.abort());
  for (const card of cards) {
    await page.setContent(`<!doctype html><html><head><style>
      *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;padding:58px 72px;font-family:Arial,sans-serif;background:${card.background};color:${card.color};position:relative}
      .wordmark{width:350px;height:115px;object-fit:contain;object-position:left}
      .brand{display:flex;align-items:center;gap:24px;height:115px}.brand img{height:110px;width:110px}.brand strong{font-size:64px;letter-spacing:-3px}
      h1{font-size:66px;line-height:1.06;letter-spacing:-2px;margin:34px 0 18px;font-weight:700}p{font-size:27px;margin:0;opacity:.8}
      footer{position:absolute;bottom:42px;left:72px;right:72px;border-top:1px solid currentColor;padding-top:21px;font-size:23px;letter-spacing:1px;opacity:.75}
      .eyebrow{font-size:25px;letter-spacing:4px;color:#f1d677;font-weight:700}.kiosk-copy{padding-top:48px}.kiosk-copy h1{font-size:63px;margin-top:45px}.kiosk-copy p{font-size:23px}.kiosk{position:absolute;right:55px;top:115px;width:335px;height:335px}
    </style></head><body>${card.content}<footer>${card.footer}</footer></body></html>`);
    await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    await page.screenshot({ path: fileURLToPath(new URL(card.file, publicDir)) });
    console.log(`Created ${card.file} (1200 × 630)`);
  }
} finally { await browser.close(); }
