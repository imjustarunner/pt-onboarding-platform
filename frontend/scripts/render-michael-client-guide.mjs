import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const directory=fileURLToPath(new URL('../public/assets/michael/',import.meta.url));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:1100}});
 await page.goto(new URL('client-guide-review.html','file://'+directory).href);
 await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
 const issues=await page.locator('.sheet').evaluateAll(sheets=>sheets.flatMap(sheet=>{
  const footer=sheet.querySelector('footer').getBoundingClientRect();
  return [...sheet.children].filter(child=>!['HEADER','FOOTER'].includes(child.tagName)).filter(child=>child.getBoundingClientRect().bottom>footer.top-8).map(child=>sheet.className+': '+child.tagName+' overlaps footer');
 }));
 assert.deepEqual(issues,[],'Print layout overflow');
 await page.pdf({path:directory+'client-guide-review.pdf',printBackground:true,preferCSSPageSize:true});
 await page.locator('.cover').screenshot({path:'/private/tmp/michael-guide-cover.png'});
 await page.locator('.practice').screenshot({path:'/private/tmp/michael-guide-practice.png'});
 console.log('PASS: all 9 pages fit; generated branded review PDF.');
}finally{await browser.close();}
