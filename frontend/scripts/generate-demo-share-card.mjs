// Run manually with Playwright and Chrome installed. The PNG is checked in;
// rendering uses existing brand assets and local fonts, with no network requests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../node_modules/playwright/index.mjs';

const asset = (path, mime) => `data:${mime};base64,${readFileSync(new URL(path, import.meta.url)).toString('base64')}`;
const mark = asset('../public/auricwell/mark.svg', 'image/svg+xml');
const narriva = asset('../src/assets/narriva/logo-navy.png', 'image/png');
const quickSign = asset('../src/assets/narriva/quick-sign.png', 'image/png');
const output = new URL('../public/auricwell/demo-share-20261108.png', import.meta.url);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.route(/^https?:/, route => route.abort());
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;position:relative;font-family:Arial,sans-serif;color:#102c51;background:radial-gradient(ellipse at 97% 7%,#cfdeff 0,transparent 56%),linear-gradient(130deg,#fffdfa,#f2f7ff)}
    .orbit{position:absolute;right:-210px;top:-250px;width:950px;height:950px;border:1px solid #c6d7f3;border-radius:50%}.orbit:after{content:"";position:absolute;inset:60px;border:1px solid #d3dff3;border-radius:50%}
    main{position:relative;padding:45px 0 0 54px;width:640px}.brand{display:flex;align-items:center;gap:14px;height:76px}.brand img{width:76px;height:76px}.brand strong{font-size:46px;letter-spacing:-2px;color:#0a3271}
    .eyebrow{font-size:14px;font-weight:700;letter-spacing:3px;color:#9c7529;margin:32px 0 18px}h1{font-size:57px;line-height:1.08;letter-spacing:-2.6px;margin:0 0 21px;font-weight:750}h1 span{color:#1d5db0}p{font-size:23px;line-height:1.45;color:#526783;margin:0}
    .cta{display:flex;align-items:center;gap:20px;margin-top:29px}.button{display:flex;align-items:center;gap:20px;background:#123e80;color:#fff;padding:17px 22px;border-radius:13px;font-size:18px;font-weight:700;box-shadow:0 6px 14px #17427b18}.button b{font-size:23px;font-weight:400}.no-account{font-size:15px;color:#62738a}
    .workspace{position:absolute;right:46px;top:45px;width:483px;padding:20px;border:1px solid #d2dff2;border-radius:25px;background:#fff;box-shadow:0 24px 55px #19437820;transform:rotate(-2deg)}
    .workspace-header{display:flex;align-items:center;justify-content:space-between;padding-bottom:15px;border-bottom:1px solid #e3eaf5}.workspace-header strong{font-size:24px;letter-spacing:-.6px}.demo{font-size:11px;font-weight:700;letter-spacing:1.5px;color:#866523;background:#fff4d5;padding:8px 10px;border-radius:7px}
    .narriva{display:block;width:202px;height:50px;object-fit:contain;object-position:left;margin:14px 0}.work-label{font-size:12px;letter-spacing:1.8px;font-weight:700;color:#687d99;margin-bottom:12px}.note{border:1px solid #dae5f2;border-left:4px solid #257c68;border-radius:12px;padding:15px 18px;background:linear-gradient(125deg,#fff,#f6faff)}
    .client{font-size:23px;font-weight:700;letter-spacing:-.5px}.session{font-size:13px;color:#62738a;margin-top:7px}.sections{display:flex;gap:7px;margin-top:17px}.sections span{font-size:12px;font-weight:700;color:#4d6c91;border:1px solid #dce6f3;background:#fff;border-radius:6px;padding:6px 9px}.review{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#26725c;margin:17px 0 0}.check{border-radius:50%;width:20px;height:20px;background:#e1f4eb;display:flex;align-items:center;justify-content:center}
    .quick-sign{display:block;width:100%;height:100px;object-fit:contain;margin:4px 0 -7px}.workspace-footer{display:flex;align-items:center;justify-content:space-between;color:#617894;font-size:12px;margin-top:6px}.next{color:#1b568f;font-weight:700}
    footer{position:absolute;bottom:29px;left:55px;right:55px;border-top:1px solid #cedbef;padding-top:17px;display:flex;justify-content:space-between;align-items:center;font-size:17px;color:#2b507b}footer span{font-size:12px;letter-spacing:2px;color:#7889a2;font-weight:700}
  </style></head><body>
    <div class="orbit"></div>
    <main>
      <div class="brand"><img src="${mark}" alt=""><strong>AuricWell</strong></div>
      <div class="eyebrow">EXPLORE THE INTERACTIVE DEMO</div>
      <h1>Less repeat work.<br><span>More time for care.</span></h1>
      <p>Notes. Supervision. Scheduling. Billing.<br>Your practice, connected.</p>
      <div class="cta"><div class="button">Try AuricWell <b>↗</b></div><span class="no-account">No account needed</span></div>
    </main>
    <aside class="workspace" aria-label="Fictional Narriva My Work preview">
      <div class="workspace-header"><strong>My Work</strong><span class="demo">DEMO PREVIEW</span></div>
      <img class="narriva" src="${narriva}" alt="Narriva by AuricWell">
      <div class="work-label">SUPERVISOR REVIEW · NOTES TO CO-SIGN</div>
      <div class="note">
        <div class="client">Emerson Cole</div>
        <div class="session">Avery Lane, LPC · Couples therapy · 60 min</div>
        <div class="sections"><span>Subjective</span><span>Objective</span><span>Interventions</span><span>Plan</span></div>
        <div class="review"><span class="check">✓</span> 5 of 5 example checks complete</div>
      </div>
      <img class="quick-sign" src="${quickSign}" alt="Narriva Quick Sign Approved">
      <div class="workspace-footer"><span>Fictional records. Simulated actions.</span><span class="next">Review &amp; sign →</span></div>
    </aside>
    <footer>auricwell.com/demo <span>BUILT AROUND YOUR WORKDAY</span></footer>
  </body></html>`);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode()));
  });
  const bounds = await page.locator('main, .workspace, footer').evaluateAll(nodes => nodes.map(node => {
    const { x, y, right, bottom } = node.getBoundingClientRect();
    return { x, y, right, bottom };
  }));
  assert(bounds.every(box => box.x >= 0 && box.y >= 0 && box.right <= 1200 && box.bottom <= 630), 'Keep share card content inside the image');
  await page.screenshot({ path: fileURLToPath(output), type: 'png' });
  assert(readFileSync(output).length < 500_000, 'Keep preview downloads small');
  console.log('Created AuricWell demo share card (1200 × 630).');
} finally { await browser.close(); }
