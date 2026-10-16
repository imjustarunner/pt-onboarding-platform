// Render the existing logos and photography in native HTML/SVG card layouts.
// Run manually when artwork changes; the resulting PNGs are checked in.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { websiteShareCards } from '../src/constants/websiteShareCards.js';
const publicDir = new URL('../public/', import.meta.url);
const asset = path => {
  const mime = path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.webp') ? 'image/webp' : path.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${readFileSync(new URL(path, publicDir)).toString('base64')}`;
};
const cards = [
  {
    id: 'range',
    body: `<img class="scene" src="${asset('assets/range/mountains.webp')}" alt="Mountain landscape"><div class="fade"></div><main><img class="range-logo" src="${asset('assets/range/logo.svg')}" alt="Mental Range Collective"><h1>Expanding mental<br>health. <em>Together.</em></h1><p>Find support. Meet our network.<br>Build stronger partnerships.</p></main><footer>mentalrange.org <span>STRONGER TOGETHER</span></footer>`
  },
  {
    id: 'schoolcarebridge',
    body: `<div class="school-art" aria-label="Schools, care teams, and families connected"><svg viewBox="0 0 400 430" fill="none"><path d="M200 94v210M112 150l176 164M288 150 112 314" stroke="#a5cdd0" stroke-width="3"/><circle cx="200" cy="84" r="69" fill="#fff7dc"/><circle cx="102" cy="300" r="69" fill="#e4f2e3"/><circle cx="298" cy="300" r="69" fill="#e3f2fa"/><g stroke="#197c8b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="m164 78 36-27 36 27v43h-72V78Zm25 43V96h22v25m-42-34h6m50 0h6m-34-16h6"/><path d="M74 283c-14-19 13-30 28-10 15-20 42-9 28 10l-28 30-28-30Z"/><circle cx="298" cy="277" r="14"/><path d="M274 323v-13a24 24 0 0 1 48 0v13m-56-33a11 11 0 0 1-7-19m71 19a11 11 0 0 0 7-19"/></g><g fill="#173957" font-family="Arial" font-size="19" text-anchor="middle"><text x="200" y="179">Schools</text><text x="102" y="395">Care teams</text><text x="298" y="395">Families</text></g></svg></div><main><svg class="school-logo" viewBox="0 300 1448 520" role="img" aria-label="SchoolCareBridge"><image href="${asset('assets/schoolcarebridge/logo.png')}" width="1448" height="1086"/></svg><h1>Schools. Care teams.<br>Families. <em>Connected.</em></h1><p>School portals, enrollment,<br>and care coordination.</p></main><footer>schoolcarebridge.org <span>A PROGRAM OF MH4KIDZ</span></footer>`
  },
  {
    id: 'michael',
    body: `<img class="portrait" src="${asset('assets/michael/michael-mendez.jpg')}" alt="Michael V. Mendez"><main><div class="michael-brand"><img src="${asset('assets/michael/monogram.svg')}" alt=""><div><strong>Michael V. Mendez</strong><small>CONSULTING & COACHING</small></div></div><h1>Your vision.<br>A real plan.<br><em>Let’s build it.</em></h1><p>Business growth. Running coaching.<br>College decisions. Clear next steps.</p></main><footer>michaelvmendez.com <span>PEOPLE. STRATEGY. RESULTS.</span></footer>`
  }
];
const style = `
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;position:relative;overflow:hidden;font-family:Arial,sans-serif;background:#f6f8f3;color:#102c2c}
main{position:relative;z-index:1;width:770px;padding:46px 0 0 58px}h1{font-size:57px;line-height:1.07;letter-spacing:-1.8px;margin:34px 0 20px}h1 em{font-style:normal;color:#125b3d}p{font-size:27px;line-height:1.45;margin:0;color:#35564e}
footer{position:absolute;bottom:0;left:0;right:0;height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 58px;background:#103e32;color:white;font-size:23px;z-index:3}footer span{font-size:15px;letter-spacing:2px}
.range-logo{width:400px;height:89px}.scene{position:absolute;width:630px;height:554px;right:0;top:0;object-fit:cover;object-position:74% center}.fade{position:absolute;inset:0;background:linear-gradient(90deg,#f6f8f3 45%,#f6f8f3ed 53%,#f6f8f34d 68%,transparent 83%)}
.schoolcarebridge{background:#f2f9f9;color:#102e53}.schoolcarebridge main{padding-top:32px}.school-logo{width:435px;height:156px;display:block}.schoolcarebridge h1{font-size:53px;margin-top:22px}.schoolcarebridge h1 em{color:#00899b}.schoolcarebridge p{color:#405e78;font-size:27px}.schoolcarebridge footer{background:#12536b}.school-art{position:absolute;right:20px;top:40px;width:405px;height:470px;display:flex;align-items:center;justify-content:center}.school-art svg{width:100%;height:100%}
.michael{background:#f7f6f2;color:#0b1e31}.michael main{padding-top:42px}.michael-brand{display:flex;gap:17px;align-items:center;height:96px}.michael-brand img{width:70px;height:70px}.michael-brand strong{display:block;font-size:34px;letter-spacing:-.8px}.michael-brand small{display:block;font-size:14px;letter-spacing:3px;margin-top:10px;color:#536171}.michael h1{font:64px/1.04 Georgia,serif;margin:29px 0 22px;letter-spacing:-2px}.michael h1 em{font-style:italic;color:#89602e}.michael p{color:#415364;font-size:25px}.portrait{position:absolute;right:0;top:0;width:440px;height:554px;object-fit:cover;object-position:center 35%}.michael footer{background:#0b1e31}
`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.route(/^https?:/, route => route.abort());
  for (const card of cards) {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${style}</style></head><body class="${card.id}">${card.body}</body></html>`;
    await page.setContent(html);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
    const output = fileURLToPath(new URL(websiteShareCards[card.id].image.slice(1), publicDir));
    await page.screenshot({ path: output, type: 'png' });
    if (process.env.SHARE_CARD_REVIEW_DIR) writeFileSync(`${process.env.SHARE_CARD_REVIEW_DIR}/${card.id}.html`, html);
    console.log(`Created ${card.id}: 1200 × 630`);
  }
} finally { await browser.close(); }
