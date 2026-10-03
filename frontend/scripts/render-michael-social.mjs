import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const directory = fileURLToPath(new URL('../public/assets/michael/', import.meta.url));
const portrait = readFileSync(directory + 'michael-mendez.jpg').toString('base64');
const browser = await chromium.launch({channel: 'chrome', headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1200, height: 630}, deviceScaleFactor: 1});
  await page.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;background:#f9f7f1;color:#243e35;font-family:Arial;display:flex;padding:62px;gap:50px;width:1200px;height:630px}.copy{flex:1}.brand{font:italic 42px Georgia;letter-spacing:-4px}.kicker{font-size:13px;letter-spacing:3px;margin:34px 0 18px;color:#b04a2c}h1{font:70px/1.03 Georgia;letter-spacing:-3px;margin:0 0 24px}em{color:#b04a2c}p{font-size:20px;line-height:1.5;max-width:570px}.name{font-size:18px;font-weight:bold;margin-top:30px}small{display:block;font-size:13px;margin-top:8px}.photo{width:370px;position:relative}.photo img{width:100%;height:100%;object-fit:cover;border-radius:160px 160px 4px 4px}.caption{position:absolute;bottom:22px;left:-18px;right:18px;background:#f9f7f1;padding:20px;font:25px Georgia;border:1px solid #ddd}</style></head><body><div class="copy"><div class="brand">mvm.</div><div class="kicker">STRATEGY. SYSTEMS. EXECUTION.</div><h1>Your vision.<br>A real plan.<br><em>Let’s build it.</em></h1><p>Launch & scale your practice. Build useful apps.<br>Grow your business or nonprofit.</p><div class="name">Michael V. Mendez<small>Consulting · Managed by Plot Twist Co.</small></div></div><div class="photo"><img src="data:image/jpeg;base64,${portrait}"><div class="caption">Creator & orchestrator<br>of Plot Twist HQ.</div></div></body></html>`);
  await page.screenshot({path: directory + 'social-card.png'});
} finally { await browser.close(); }
