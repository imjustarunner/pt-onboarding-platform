// Run against preview-outcome-measures.mjs on port 5182. Resets only its synthetic in-memory store.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base='http://127.0.0.1:5182',out=fileURLToPath(new URL('../../deliverables/outcome-measures-verification',import.meta.url));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const assert=(yes,message)=>{if(!yes)throw new Error(message);};
const checks=[];
await page.goto(base);await page.locator('.measure-cards button').first().waitFor();
await page.evaluate(()=>fetch('/__synthetic/outcome-measures/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));
assert(await page.locator('.measure-cards button').count()===9,'Nine catalog entries');
await page.screenshot({path:out+'/catalog-desktop.png',fullPage:true});checks.push('Desktop catalog: 9 measures, sources and availability');
await page.getByRole('searchbox').fill('trauma');assert(await page.locator('.measure-cards button').count()===2,'Search clinical area');
await page.getByRole('searchbox').fill('');
for(const id of ['phq-9','gad-7','pcl-5','lec-5','des-b','aware','cage-aid','ftnd','taps']){
 await page.goto(base+'/?measure='+id);await page.locator('.administration').waitFor();
 assert(await page.locator('.administration fieldset:not([disabled])').count()===0,'Blank preview must not collect answers');
 assert(await page.locator('.record-controls').count()===0,'No clinical save in library');
 checks.push(id+' blank preview renders with disabled fields');
}
for(const guide of ['itsco','nlu','isi']){
 await page.goto(base+'/?guide='+guide+'#provider-guide-appendix-a');await page.locator('.book-page').waitFor();
 assert((await page.locator('.book-page').innerText()).includes('9 of the 33'),'Appendix count '+guide);
 await page.locator('.book-page a[href="/outcome-measures"]').click();await page.locator('.measure-cards button').first().waitFor();
 checks.push(guide+' appendix opens the working in-app catalog');
}
await page.goto(base+'/?client&measure=phq-9');await page.locator('.record-controls').waitFor();
for(let n=1;n<=9;n++)await page.locator(`[data-question=q${n}] input[value="${n===9?'1':'0'}"]`).check();
assert((await page.locator('.measure-safety').innerText()).includes('Direct safety follow-up'),'Immediate safety prompt');
await page.locator('.record-controls .confirmation input').check();
await page.getByRole('button',{name:'Save to client record'}).click();await page.locator('.result-card').waitFor();
assert((await page.locator('.result-score').innerText()).startsWith('1'),'PHQ total one');
await page.locator('.review-form summary').click();await page.locator('.review-form textarea').fill('Synthetic scenario only: direct safety assessment completed and next steps recorded.');
await page.getByRole('button',{name:'Save clinical review'}).click();assert(await page.locator('.review-form input:invalid').count()===1,'Safety confirmation required by browser');
await page.locator('.review-form input[type=checkbox]').check();await page.getByRole('button',{name:'Save clinical review'}).click();await page.locator('.review-note').waitFor();
await page.screenshot({path:out+'/clinical-review-desktop.png',fullPage:true});
await page.reload();await page.locator('.review-note').waitFor();checks.push('Synthetic PHQ-9: save, authoritative score, safety flag, required review confirmation, reload history');
await page.goto(base+'/?client&measure=taps');await page.locator('[data-question=alcohol_branch]').waitFor();
await page.locator('[data-question=alcohol_branch] input[value=female]').check();
await page.locator('[data-question=tobacco] input[value="1"]').check();await page.locator('[data-question=tobacco_0] input[value="1"]').check();await page.locator('[data-question=tobacco_1] input[value="1"]').check();
await page.locator('[data-question=tobacco] input[value="0"]').check();assert(await page.locator('[data-question=tobacco_1]').count()===0,'TAPS follow-ups clear');
for(const key of ['alcohol_female','drugs','prescription'])await page.locator(`[data-question=${key}] input[value="0"]`).check();
await page.locator('.record-controls .confirmation input').check();await page.getByRole('button',{name:'Save to client record'}).click();await page.locator('.result-card').first().waitFor();
assert((await page.locator('.result-card').first().innerText()).includes('Complete responses'),'TAPS complete');checks.push('Synthetic TAPS conditional branches clear; negative screen scores by substance');
await page.setViewportSize({width:390,height:844});await page.goto(base);await page.locator('.measure-cards button').first().waitFor();
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No mobile horizontal overflow');await page.screenshot({path:out+'/catalog-mobile.png',fullPage:true});
await page.goto(base+'/?client&measure=ftnd');await page.locator('[data-question=current_smoking]').waitFor();await page.locator('[data-question=current_smoking] input[value="1"]').check();assert(await page.locator('.administration fieldset').count()===7,'FTND gate reveals six scored items');
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile form fits');await page.screenshot({path:out+'/ftnd-mobile.png',fullPage:true});checks.push('390px mobile: catalog and conditional FTND form without horizontal overflow');
assert(errors.length===0,'No browser exceptions: '+errors.join(', '));
await writeFile(out+'/browser-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,scope:'Local UI preview using synthetic in-memory responses; production database and migration not exercised.'},null,2)+'\n');
console.log(JSON.stringify({passed:checks.length,errors}));await browser.close();
