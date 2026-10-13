// Render original HTML/CSS with the existing vector logo, without external assets.
import { chromium } from '../../node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const mark=readFileSync(new URL('../public/auricwell/mark.svg',import.meta.url)).toString('base64');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await page.route(/^https?:/,route=>route.abort());
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;background:#fff;color:#173658;font-family:Arial,sans-serif;padding:56px 72px;position:relative}
    .brand{display:flex;gap:18px;align-items:center;font-size:37px;font-weight:700;letter-spacing:-1.3px}.brand img{height:76px;width:76px}
    .eyebrow{margin:52px 0 14px;font-size:17px;letter-spacing:4px;color:#917746;font-weight:700}h1{font-size:76px;line-height:1.06;letter-spacing:-3px;margin:0 0 24px;font-weight:650}p{font-size:25px;color:#65798d;line-height:1.5;margin:0}
    footer{position:absolute;bottom:44px;left:72px;right:72px;display:flex;align-items:center;gap:18px;font-size:17px;color:#748495}footer:before{content:'';width:36px;height:2px;background:#bda168}
    .orb{position:absolute;right:-110px;top:70px;width:470px;height:470px;border:1px solid #e2e9f0;border-radius:50%;background:radial-gradient(ellipse at 30% 25%,#f1f6fc,#fbfcfe 65%);z-index:-1}.orb:before,.orb:after{content:'';position:absolute;border:1px solid #d9c9a8;border-radius:50%;inset:38px}.orb:after{inset:76px;border-color:#e0e8f1}body{isolation:isolate}.symbol{position:absolute;right:68px;top:270px;width:120px;height:80px}.symbol:before{content:'';position:absolute;width:26px;height:34px;right:-27px;top:17px;background:#f8fbff;border:2px solid #9bb1c8;border-left:0;clip-path:polygon(0 25%,100% 0,100% 100%,0 75%)}.dot{position:absolute;right:55px;top:382px;width:10px;height:10px;border-radius:50%;background:#c4a562}
  </style></head><body><div class="orb"></div><svg class="symbol" viewBox="0 0 120 80" fill="none" stroke="#9bb1c8" stroke-width="2.5"><rect x="3" y="8" width="78" height="64" rx="16"/><path d="M81 28 115 13v54L81 52Z" fill="#f8fbff"/></svg><div class="dot"></div><div class="brand"><img src="data:image/svg+xml;base64,${mark}" alt="">AuricWell</div><div class="eyebrow">YOUR SPACE FOR CARE</div><h1>Virtual Office</h1><p>Check in. Get comfortable.<br>Your provider will welcome you in.</p><footer>auricwell.com</footer></body></html>`);
  await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
  await page.screenshot({path:fileURLToPath(new URL('../public/auricwell/virtual-office-share.png',import.meta.url))});
} finally {await browser.close();}
