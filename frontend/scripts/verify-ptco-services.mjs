import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const origin = process.env.PTCO_TEST_ORIGIN || 'http://127.0.0.1:5186';
const out = fileURLToPath(new URL('../../deliverables/plottwistco-services/', import.meta.url));
mkdirSync(out, { recursive:true });
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page = await browser.newPage();
const errors = [], results = [], requests = [];
page.on('pageerror', error => errors.push(error.message));
// All API traffic is intercepted: these checks cannot submit a real lead.
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  let data = {};
  if (path.endsWith('/ptco/business/requests')) {
    requests.push(route.request().postDataJSON());
    data = {id:'ptco-qa-only',status:'submitted'};
  } else if (path.endsWith('/marketing-pages/partners')) data = {partners:[]};
  else if (path.endsWith('/marketing-pages/ptco')) data = {page:{slug:'ptco',heroTitle:'Legacy headline',heroImageUrl:'/assets/ptco/about-hero.webp',branding:{logoUrl:'/assets/ptco/logo-flat.webp'},providerDirectories:[]}};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
});
try {
  for (const width of process.env.PTCO_INTERACTIONS_ONLY ? [] : [1440, 390, 320]) {
    await page.setViewportSize({width,height:width===1440?1000:844});
    for (const section of ['', 'services', 'services/medical-billing', 'services/credentialing', 'services/people', 'services/financial', 'services/full-service']) {
      await page.goto(`${origin}/p/ptco${section?'/'+section:''}`,{waitUntil:'networkidle'});
      await page.locator('.ptco-site h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('.ptco-site h1').count(),1,`one heading: ${section}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),false,`overflow: ${section} at ${width}`);
      assert.equal(await page.locator('h1').innerText() === 'Page not found',false,`route: ${section}`);
      assert.equal(await page.locator('#powered-by-plottwistco').count(),0,`no divisions before services: ${section}`);
      if (width===1440 && !section) {
        assert.ok((await page.locator('.ptco-service-hero').boundingBox()).height < 420,'compact desktop hero');
        assert.ok((await page.locator('.ptco-service-card').first().boundingBox()).y < 650,'services visible early');
      }
      if (width!==320 && ['', 'services/medical-billing', 'services/financial'].includes(section)) await page.screenshot({path:`${out}${section.replaceAll('/','-')||'home'}-${width}.png`,fullPage:true});
      results.push({section:section||'home',width,pass:true});
    }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${origin}/p/ptco`);
  await page.locator('.ptco-service-card').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/services/medical-billing');
  await page.locator('.ptco-service-detail').waitFor();
  assert.match(await page.locator('#ptco-main').innerText(),/New contracts starting in 2027/);
  assert.doesNotMatch(await page.locator('#ptco-main').innerText(),/\d+%/);
  await page.locator('.ptco-quote-card .ptco-button').click();
  await page.waitForURL('**/start?path=operations&service=medical-billing');
  for (const [auto,value] of [['organization','Synthetic Example'],['given-name','Test'],['family-name','User'],['email','qa@example.test'],['tel','5550100']]) await page.locator(`input[autocomplete="${auto}"]`).fill(value);
  await page.getByLabel('Business type').selectOption('mental-health');
  await page.getByLabel('Current stage').selectOption('established');
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  assert.equal(await page.getByLabel('Medical Billing & Revenue Cycle',{exact:true}).isChecked(),true);
  await page.getByLabel('What would you like help with?').fill('Synthetic billing inquiry for website verification.');
  await page.getByRole('button',{name:'Continue →',exact:true}).click();
  await page.locator('.ptco-checkbox input').check();
  await page.getByRole('button',{name:'Start my journey →'}).click();
  await page.getByText('Your next chapter is underway.').waitFor();
  assert.equal(requests.length,1);
  assert.deepEqual(requests[0].services,['medical-billing']);
  await page.goto(`${origin}/p/ptco/services`);
  await page.getByRole('button',{name:'Full-service partnership',exact:true}).click();
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.getByRole('button',{name:'Full-service partnership',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Individual services',exact:true}).click();
  await page.locator('.ptco-service-card[href$="/financial"]').click();
  await page.locator('.ptco-option-grid a[href="https://fundtred.com"]').waitFor();
  assert.equal(await page.locator('.ptco-option-grid a[href="https://fundtred.com"]').innerText(),'Explore FundThred');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:/Menu/}).click();
  await page.locator('#ptco-nav').getByRole('link',{name:'Services',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:/Menu/}).getAttribute('aria-expanded'),'false');
  assert.deepEqual(errors,[]);
  writeFileSync(`${out}verification.json`,JSON.stringify({origin,api:'mocked; no real inquiries submitted',results,interactionChecks:['keyboard service navigation','quote-only billing and 2027 availability','service preselection and mocked inquiry submission','partnership toggle and reload','financial management to FundThred','mobile navigation'],errors},null,2));
  console.log(`Passed ${results.length} responsive page checks and 6 interaction checks. Screenshots: ${out}`);
} finally { await browser.close(); }
