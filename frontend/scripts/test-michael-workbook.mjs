import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';

const origin=process.env.MICHAEL_TEST_ORIGIN||'http://127.0.0.1:5197';
const browser=await chromium.launch({channel:'chrome',headless:true});
const directory=mkdtempSync(join(tmpdir(),'michael-workbook-qa-'));
const page=await browser.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',dialog=>dialog.accept());
const exportFile=async(id,name)=>{
 const wait=page.waitForEvent('download');await page.locator(id).click();
 const download=await wait;await download.saveAs(join(directory,name));return readFileSync(join(directory,name),'utf8');
};
try{
 await page.goto(origin+'/assets/michael/profile-workbook.html');
 assert.equal(await page.locator('details').count(),12);
 assert.equal(await page.locator('[data-lesson-target]').count(),5);
 await page.locator('#expand').click();
 const message='My philosophy: people first. <script>window.evil=true</script> & “real results”';
 await page.locator('#q-philosophy_belief').fill(message);
 await page.locator('#q-case_practice').fill('Anonymous practice example — needs evidence and approval.');
 const lesson='Year one\n\nBuild consistency & confidence. <b>Text, not markup.</b>\n'+ 'A lesson in development.\n'.repeat(600);
 await page.locator('[data-lesson-target="lesson_year_1"]').setInputFiles({name:'year-one.md',mimeType:'text/markdown',buffer:Buffer.from(lesson)});
 await page.waitForFunction(expected=>document.querySelector('#q-lesson_year_1').value===expected,lesson);
 for(let year=2;year<=5;year++)await page.locator('#q-lesson_year_'+year).fill('Year '+year+' lesson material.');
 await page.locator('#reviewed').check();
 const json=await exportFile('#download-json','answers.json');
 const parsed=JSON.parse(json);
 assert.equal(parsed.answers.philosophy_belief,message);
 assert.equal(parsed.answers.lesson_year_1,lesson);
 assert.equal(parsed.reviewed,true);
 const html=await exportFile('#download-html','answers.html');
 assert.ok(html.includes('&lt;script&gt;window.evil=true&lt;/script&gt;'));
 assert.ok(html.includes('Year 5 lesson material.'));
 assert.ok(!html.includes('<script>window.evil'));
 await page.locator('#q-philosophy_belief').fill('Changed');
 await page.locator('#import-file').setInputFiles(join(directory,'answers.json'));
 await page.waitForFunction(expected=>document.querySelector('#q-philosophy_belief').value===expected,message);
 await page.locator('#save-draft').click();
 await page.locator('#q-philosophy_belief').fill('Changed again');
 await page.locator('#load-draft').click();
 assert.equal(await page.locator('#q-philosophy_belief').inputValue(),message);
 await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schema":"wrong"}')});
 await page.getByText('This is not a compatible workbook answers file.').waitFor();
 assert.equal(await page.locator('#q-philosophy_belief').inputValue(),message);
 assert.equal(await page.evaluate(()=>window.evil),undefined);
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'workbook overflows at '+width);
 }
 const report=await browser.newPage();await report.goto('file://'+join(directory,'answers.html'));
 assert.equal(await report.locator('script').count(),0);
 assert.match(await report.locator('body').innerText(),/My philosophy: people first/);
 assert.deepEqual(errors,[]);
 console.log('PASS: 12 sections, 5-year text import, large lessons, HTML/JSON export, import round trip, device drafts, malformed file rejection, escaped content, and 4 responsive widths.');
}finally{await browser.close();}
