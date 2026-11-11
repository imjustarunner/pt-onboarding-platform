const path = require('path');
const fs = require('fs');
const { chromium } = require('/Users/mendez/PTOnboardingApp/node_modules/playwright');
(async () => {
 const root = path.resolve(__dirname, '../..');
 const dir = path.join(root, 'frontend/public/auricwell/provider-training/screenshots');
 const browser = await chromium.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true });
 const context=await browser.newContext({viewport:{width:1440,height:1050}});
 await context.route('**/*',route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
 const page=await context.newPage();
 const manifest={capturedAt:new Date().toISOString(),source:'Actual application components rendered with fixture-only API adapter',liveAcceptance:false,network:'Loopback only; external requests blocked',screenshots:[]};
 try {
  for(const screen of ['account','clinical','learning']) {
   await page.goto(`http://127.0.0.1:5196/provider-training-preview.html?screen=${screen}`,{waitUntil:'networkidle'});
   if(screen==='account') { const welcome=page.getByRole('button',{name:/1 · Welcome email/}); if(await welcome.getAttribute('aria-expanded')!=='true')await welcome.click(); await page.locator('#fw-template').waitFor({state:'visible'}); await page.locator('.fw-message-body').first().scrollIntoViewIfNeeded(); }
   await page.mouse.move(0,0);
   await page.waitForTimeout(350);
   await page.screenshot({path:path.join(dir,`${screen}.png`)});
   manifest.screenshots.push({name:screen,file:`${screen}.png`,viewport:'1440×1050',source:'Local actual-component synthetic preview',build:'Source checkout912a48c05 + provider training changes'});
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:5196/provider-training-preview.html?screen=learning',{waitUntil:'networkidle'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  if(overflow)throw new Error('Provider reference has horizontal overflow at390px');
  await page.getByText('Use AuricWell Secure Session Comments',{exact:true}).click();
  await page.screenshot({path:path.join(dir,'learning-phone.png')});
  manifest.phone={viewport:'390×844',horizontalOverflow:false,browser:'Chrome; not iPhone Safari acceptance'};
  fs.writeFileSync(path.join(dir,'LOCAL-CAPTURE-MANIFEST.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify(manifest));
 } finally {await browser.close();}
})();
