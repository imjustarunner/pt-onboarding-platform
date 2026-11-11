const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/mendez/PTOnboardingApp/node_modules/playwright');
const checkout = path.resolve(__dirname, '../..');
const output = path.join(checkout, 'frontend/public/auricwell/provider-training/screenshots');
(async () => {
  const credential = JSON.parse(fs.readFileSync('/Users/mendez/PTOnboardingApp/secrets/auricwell-qa/provider.json', 'utf8'));
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Denver' });
  const page = await context.newPage();
  const evidence = { capturedAt: new Date().toISOString(), agencyId: 450, role: 'Provider · Avery QA 1433', syntheticOnly: true, source: 'Actual authenticated application', screenshots: [] };
  try {
    await page.goto(credential.primaryLogin, { waitUntil: 'domcontentloaded' });
    await page.locator('#username').fill(credential.username);
    await page.locator('form button[type=submit]').first().click();
    await page.locator('input[name=password]').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('input[name=password]').fill(credential.password);
    await page.locator('form button[type=submit]').first().click();
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 45000 });
    evidence.identity = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const user = await response.json();
      return { status: response.status, id: user.id || user.user?.id, role: user.role || user.user?.role };
    });
    if (Number(evidence.identity.id) !== 1433) throw new Error('QA identity could not be verified as provider1433. No captures retained.');
    evidence.frontendVersion = await page.evaluate(async () => { try { return await (await fetch('/version.json')).json(); } catch { return null; } });
    evidence.apiVersion = await page.evaluate(async () => { try { return await (await fetch('/api/app-version')).json(); } catch { return null; } });
    for (const [name, route, title] of [
      ['dashboard', '/auricwell-qa-demo/dashboard', 'Provider dashboard'],
      ['schedule', '/auricwell-qa-demo/my-schedule', 'My Schedule'],
      ['messages', '/auricwell-qa-demo/messages', 'Secure communications'],
      ['learning', '/auricwell-qa-demo/my-learning?learning=on-demand', 'My Learning · On-Demand'],
      ['account', '/auricwell-qa-demo/account-info', 'Account information and Family Welcome']
    ]) {
      await page.goto(new URL(route, credential.primaryLogin).href, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const briefing = page.getByRole('button', { name: 'Close login briefing' });
      if (await briefing.isVisible().catch(() => false)) { await briefing.click(); await page.waitForTimeout(1000); }
      const agencyPicker = page.locator('select:visible').filter({ has: page.locator('option[value="450"]') }).first();
      if (await agencyPicker.count()) { await agencyPicker.selectOption('450'); await page.waitForTimeout(3000); }
      await page.waitForFunction(() => !/Opening your workspace/.test(document.body.innerText) && !document.querySelector('.agency-loading-overlay'), { timeout: 60000 }).catch(() => {});
      if (await briefing.isVisible().catch(() => false)) await briefing.click();
      await page.waitForTimeout(2500);
      const contextLabel = await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('currentAgency') || 'null'); return a ? { id: a.id, name: a.name } : null; });
      if (Number(contextLabel?.id) !== 450) { evidence.screenshots.push({ name, title, route, skipped: 'Could not verify QA agency450 context.' }); continue; }
      if (new URL(page.url()).pathname !== new URL(route, credential.primaryLogin).pathname || await page.locator('.agency-loading-overlay, .briefing-overlay').isVisible().catch(() => false)) { evidence.screenshots.push({ name, title, route, skipped: 'Target route remained loading/overlaid or redirected.' }); continue; }
      const accessError = await page.locator('body').innerText();
      if (/access denied|not authorized|page not found/i.test(accessError.slice(0, 1200))) { evidence.screenshots.push({ name, title, route, skipped: 'Access or route unavailable; no screenshot claimed.' }); continue; }
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false });
      evidence.screenshots.push({ name, title, route, file: `${name}.png`, finalPath: new URL(page.url()).pathname, agencyContext: contextLabel, browser: 'Chrome desktop', viewport: '1440×1000' });
    }
    fs.writeFileSync(path.join(output, 'CAPTURE-MANIFEST.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ captured: evidence.screenshots.map(s => ({ name: s.name, file: s.file, skipped: s.skipped })), build: evidence.frontendVersion?.buildSha || evidence.frontendVersion?.commit || evidence.frontendVersion?.gitSha || 'see manifest' }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await browser.close(); }
})();
