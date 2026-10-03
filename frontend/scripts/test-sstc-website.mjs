import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {pages} from '../src/sstc/website/render.mjs';
import {SSTC_LINKS} from '../src/sstc/website/routing.mjs';

const origin = process.env.SSTC_TEST_ORIGIN || 'http://127.0.0.1:5197';
const base = process.env.SSTC_TEST_BASE ?? '/p/sstc';
const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome',headless:true});
try {
  const context = await browser.newContext();
  // Never create an account, ticket, workout, or payment during a smoke test.
  await context.route('**/*',route => ['GET','HEAD','OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror',error => failures.push(error.message));
  for (const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    for (const section of Object.keys(pages)) {
      const response = await page.goto(`${origin}${base}/${section}`);
      assert.equal(response.status(),200,section);
      assert.equal(await page.locator('h1').count(),1,section);
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),`https://summitstatstc.com/${section}`);
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,`${section || 'home'} overflows at ${width}px`);
      await page.locator('img').evaluateAll(async images => {await Promise.all(images.map(image=>image.decode().catch(()=>{})));});
      assert.equal(await page.locator('img').evaluateAll(images=>images.every(image=>image.complete && image.naturalWidth>0)),true,`broken image on ${section}`);
      assert.equal(await page.locator('.product-credit').getAttribute('href'),'https://plottwistco.com');
      assert.ok(await page.locator(`a[href="${SSTC_LINKS.signup}"]`).count());
    }
  }
  console.log('PASS: nine pages at five viewport widths; canonical URLs, original logo, app links, no horizontal overflow.');
  await page.goto(`${origin}${base}/`);
  const menu=page.getByRole('button',{name:/Menu/});
  await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await page.goto(`${origin}${base}/tour`);
  await page.locator('[data-tour="activity"]').click();
  assert.equal(await page.locator('[data-panel="activity"]').isVisible(),true);
  assert.equal(await page.locator('[data-panel="standings"]').isVisible(),false);
  await page.locator('[data-tour="weekly"]').click();
  assert.equal(await page.locator('[data-panel="weekly"]').isVisible(),true);
  await page.goto(`${origin}${base}/faq`);
  await page.locator('summary').filter({hasText:'Do participants need a specific watch or device?'}).click();
  assert.match(await page.locator('details[open]').innerText(),/Direct Garmin integration is not currently available/);

  let posts=0,submitted;
  await page.route('**/api/public/agency-support/sstc',route=>route.fulfill({json:{ok:true,recaptchaRequired:false}}));
  await page.route('**/api/public/agency-support/sstc/tickets',route=>{
    posts++;submitted=route.request().postDataJSON();
    return route.fulfill(posts===1 ? {status:400,json:{error:{message:'Please review your message.'}}} : {json:{ok:true,ticketId:98765}});
  });
  await page.goto(`${origin}${base}/contact?topic=pricing`);
  assert.equal(await page.locator('[name="topic"]').inputValue(),'pricing');
  await page.getByLabel('Your name').fill('Website QA');
  await page.getByLabel('Email address').fill('qa@example.com');
  await page.locator('[name="message"]').fill('Please explain the current club trial and setup steps.');
  await page.locator('[name="adult"]').check();
  await page.locator('[name="consent"]').check();
  await page.getByRole('button',{name:'Send message'}).click();
  await page.getByText('Please review your message.',{exact:true}).waitFor();
  assert.match(await page.locator('[name="message"]').inputValue(),/club trial/);
  await page.getByRole('button',{name:'Send message'}).click();
  await page.locator('#sstc-success').waitFor();
  assert.equal(posts,2);assert.equal(submitted.phiAcknowledged,true);assert.equal(submitted.category,'other');
  assert.match(submitted.message,/Contact confirms they are 18 or older/);
  assert.match(submitted.message,/Current pricing and trial questions/);
  assert.match(await page.locator('#sstc-success').innerText(),/98765/);
  assert.equal(await page.locator('#sstc-inquiry').isVisible(),false);

  // Required CAPTCHA missing: fail closed, keep the message, do not POST.
  await page.route('**/api/public/agency-support/sstc',route=>route.fulfill({json:{ok:true,recaptchaRequired:true,recaptchaSiteKey:null}}));
  await page.goto(`${origin}${base}/contact`);
  await page.getByLabel('Your name').fill('Website QA');
  await page.getByLabel('Email address').fill('qa@example.com');
  await page.locator('[name="message"]').fill('This message must stay in the browser during the test.');
  await page.locator('[name="adult"]').check();await page.locator('[name="consent"]').check();
  await page.getByRole('button',{name:'Send message'}).click();
  await page.getByText('This form is temporarily unavailable. Please use the app support link.',{exact:true}).waitFor();
  assert.equal(posts,2);
  assert.equal(await page.getByRole('button',{name:'Send message'}).isEnabled(),true);

  await page.route('**/api/public/agency-support/sstc',route=>route.fulfill({json:{ok:true,recaptchaRequired:true,recaptchaSiteKey:'qa-only',recaptchaUseEnterprise:true}}));
  await page.evaluate(()=>{window.grecaptcha={enterprise:{ready:callback=>callback(),execute:async(key,options)=>{if(key!=='qa-only'||options.action!=='public_agency_support')throw new Error('Wrong CAPTCHA action');return 'test-captcha-token';}}};});
  await page.getByRole('button',{name:'Send message'}).click();await page.locator('#sstc-success').waitFor();
  assert.equal(posts,3);assert.equal(submitted.captchaToken,'test-captcha-token');
  console.log('PASS: mobile menu, walkthrough controls, FAQ, inquiry error/retry/success, CAPTCHA failure/success. All POSTs intercepted.');

  const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
  const plain=await noJs.newPage();
  await plain.goto(`${origin}${base}/tour`);
  assert.equal(await plain.locator('nav').isVisible(),true);
  assert.equal(await plain.locator('[data-panel="activity"]').isVisible(),true);
  assert.equal(await plain.locator('[data-panel="weekly"]').isVisible(),true);
  await noJs.close();
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${origin}${base}/`);await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:'/private/tmp/sstc-home-desktop.png',fullPage:true});
  await page.goto(`${origin}${base}/pricing`);await page.screenshot({path:'/private/tmp/sstc-pricing-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:900});await page.goto(`${origin}${base}/`);
  await page.screenshot({path:'/private/tmp/sstc-home-mobile.png',fullPage:true});
  assert.deepEqual(failures,[]);
  console.log('PASS: JavaScript-free navigation/content and zero browser errors. Screenshots saved in /private/tmp.');
} finally {await browser.close();}
