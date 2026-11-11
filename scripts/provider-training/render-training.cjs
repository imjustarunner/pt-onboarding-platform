const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('/Users/mendez/PTOnboardingApp/node_modules/playwright');
const { PDFDocument } = require('/Users/mendez/PTOnboardingApp/frontend/node_modules/pdf-lib');
(async () => {
 const root = path.resolve(__dirname, '../..');
 const base = path.join(root, 'frontend/public/auricwell/provider-training');
 const output = '/Users/mendez/PTOnboardingApp/deliverables/secure-session-comments-and-provider-training-2026-11-11';
 const browser = await chromium.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
 const context = await browser.newContext({viewport:{width:1600,height:900}});
 await context.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
 const page=await context.newPage();
 try {
  await page.goto(pathToFileURL(path.join(base,'PROVIDER-FIELD-GUIDE.html')).href,{waitUntil:'load'});
  await page.locator('#search').fill('Family Welcome');
  const searchCount=await page.locator('.topic:visible').count();
  if(searchCount!==1)throw new Error('Standalone manual multi-word search failed: '+searchCount+' topics');
  await page.locator('#search').fill('');
  const missing=await page.locator('img').evaluateAll(images=>images.filter(img=>!img.complete||!img.naturalWidth).map(img=>img.getAttribute('src')));
  if(missing.length)throw new Error('Manual images missing: '+missing.join(', '));
  await page.pdf({path:path.join(base,'PROVIDER-FIELD-GUIDE.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true,tagged:true,outline:true});
  fs.copyFileSync(path.join(base,'PROVIDER-FIELD-GUIDE.pdf'),path.join(output,'PROVIDER-FIELD-GUIDE.pdf'));
  const pdf=await PDFDocument.load(fs.readFileSync(path.join(base,'PROVIDER-FIELD-GUIDE.pdf')));
  await page.goto(pathToFileURL(path.join(base,'PROVIDER-TRAINING-SLIDES.html')).href,{waitUntil:'load'});
  const slideDir=path.join(output,'slide-images');fs.mkdirSync(slideDir,{recursive:true});
  const slides=page.locator('.slide');
  const count=await slides.count();
  for(let i=0;i<count;i++)await slides.nth(i).screenshot({path:path.join(slideDir,`slide-${String(i+1).padStart(2,'0')}.png`)});
  await page.pdf({path:path.join(output,'PROVIDER-TRAINING-SLIDES.pdf'),printBackground:true,preferCSSPageSize:true,tagged:true});
  const evidence={manualPages:pdf.getPageCount(),slides:count,missingImages:missing,multiWordSearch:true,renderer:'Installed Chrome via Playwright; all external requests blocked',manualBytes:fs.statSync(path.join(base,'PROVIDER-FIELD-GUIDE.pdf')).size,powerPointBytes:fs.statSync(path.join(base,'PROVIDER-TRANSITION-TRAINING.pptx')).size};
  fs.writeFileSync(path.join(output,'RENDER-VERIFICATION.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
 } finally{await browser.close();}
})();
