const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('/Users/mendez/PTOnboardingApp/node_modules/playwright');
(async () => {
  const root = path.resolve(__dirname, '../..'), output = path.join(root, 'frontend/public/auricwell/provider-training/screenshots');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api/') ? route.continue() : route.abort();
  });
  const page = await context.newPage(), failures = [];
  page.on('pageerror', error => { failures.push(error.message); console.error('Preview runtime error:',error.message); });
  const manifest = { capturedAt: new Date().toISOString(), source: 'Actual production Vue session-comment/notice/audience components; fixture-only local adapter and clearly labeled synthetic scheduling backdrop', liveAcceptance: false, network: 'Loopback only; all /api and external requests blocked', policy: '250 Unicode codepoints; one comment per author/session/client; own edits with Edited timestamp; all current eligible family audience; first-send acknowledgement', screenshots: [], sourceFiles: {} };
  for (const file of ['frontend/src/sessionCommentsPreview.js','frontend/src/components/session-comments/sessionComments.js','frontend/src/components/session-comments/SecureSessionCommentHistory.vue','frontend/src/components/session-comments/SecureSessionCommentDialog.vue','frontend/src/components/session-comments/SecureSessionCommentsHost.vue','frontend/src/components/session-comments/FamilySharingNotice.vue','frontend/src/components/session-comments/SecureFamilyAudience.vue']) manifest.sourceFiles[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
  try {
    for (const screen of ['thread','edit','today','splash','audience','ack','phone']) {
      const phone = screen === 'phone'; await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 1050 });
      await page.goto(`http://127.0.0.1:5196/secure-session-comments-preview.html?screen=${screen}`, { waitUntil: 'networkidle' });
      if (['edit','phone'].includes(screen)) { await page.getByRole('button',{ name: 'Edit my comment', exact: true }).click(); await page.getByRole('button',{ name: 'Save my edit', exact: true }).waitFor(); }
      if (screen === 'today') await page.getByRole('heading',{name:'Today’s Secure Session Comments',exact:true}).waitFor();
      if (screen === 'splash') await page.getByRole('button',{name:'View secure session comments for today',exact:true}).waitFor();
      if (screen === 'audience') await page.getByText('Automatically shared with',{exact:true}).waitFor();
      if (screen === 'ack') { await page.locator('textarea').fill('Please remind my child to bring their practice chart.'); await page.getByRole('button',{name:'Send secure comment',exact:true}).click(); await page.getByRole('heading',{name:'Understand who can see this communication',exact:true}).waitFor(); }
      await page.mouse.move(0,0); await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) throw new Error(`Horizontal page overflow on ${screen}`);
      const file = `secure-${screen}.png`; await page.screenshot({ path: path.join(output,file) });
      manifest.screenshots.push({ file, screen, viewport: phone ? '390×844' : '1440×1050', horizontalOverflow: false, browser: 'Desktop Chrome; phone width is not actual iPhone Safari acceptance' });
    }
    if (failures.length) throw new Error(failures.join('; '));
    fs.writeFileSync(path.join(output,'SECURE-COMMENTS-CAPTURE-MANIFEST.json'), JSON.stringify(manifest,null,2));
    console.log(JSON.stringify({ output, captured: manifest.screenshots.length, pageErrors: failures.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
