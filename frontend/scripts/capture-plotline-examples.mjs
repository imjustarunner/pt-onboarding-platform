import {chromium} from 'playwright';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url));
const out=`${root}/public/assets/plotline/examples`;
mkdirSync(out,{recursive:true});
const screens={hiring:['src/views/admin/HiringDashboardView.vue','Pending Jobs'],onboarding:['src/views/admin/OnboardingAdminView.vue','Avery Brooks'],learning:['src/views/MyLearningView.vue','Working together'],checklist:['src/views/OnboardingChecklistView.vue','Review the employee handbook'],evaluations:['src/components/evaluations/EvaluationRosterPanel.vue','Employee Evaluations'],careers:['src/views/public/PublicCareersView.vue','Redwood Community Care'],organizations:['src/components/admin/opsDashboard/PeopleOpsPipelineCard.vue','Redwood Learning Center']};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const report=[],versions={};
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
 context.setDefaultTimeout(30000);
 await context.addInitScript(()=>localStorage.clear());
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 // No request can leave the local capture server, including an accidental API call.
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:5177/')&&!r.request().url().includes('/api/')?r.continue():r.abort());
 for(const [screen,[source,expected]] of Object.entries(screens)){
  await page.goto(`http://127.0.0.1:5177/scripts/plotline-capture/index.html?screen=${screen}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__plotlineCapture?.fixtureOnly);
  await page.getByText(expected,{exact:false}).first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.deepEqual(errors,[],`${screen}: browser errors`);
  await page.screenshot({path:`${out}/${screen}.jpg`,type:'jpeg',quality:92,fullPage:false});
  versions[screen]=createHash('sha256').update(readFileSync(`${out}/${screen}.jpg`)).digest('hex');
  report.push({screen,source,sourceSha256:createHash('sha256').update(readFileSync(`${root}/${source}`)).digest('hex'),records:'Fictional local fixtures; no customer records or network access',image:`${screen}.jpg`,width:1440,height:1000});
  console.log(`Captured actual ${screen} component.`);
 }
 writeFileSync(`${root}/src/content/plotlineExampleVersions.json`,JSON.stringify(versions,null,2)+'\n');
 writeFileSync(`${out}/provenance.json`,JSON.stringify({method:'Browser capture of unchanged application Vue components with local fictional API responses. No mockup artwork.',screens:report},null,2)+'\n');
}finally{await browser.close();}
