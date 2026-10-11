import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { trainingDefinitionsFor } from '../../backend/src/services/documentTrainingContent.js';
const origin=`http://127.0.0.1:${process.env.HIRE_DEMO_PORT || 5198}`;
const output=fileURLToPath(new URL('../../deliverables/hire-journey-demo/',import.meta.url));await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1512,height:1000}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
const check=(v,label)=>{if(!v)throw new Error(label);checks.push(label);};
const nav=name=>page.getByRole('navigation',{name:'Demo workspace'}).getByRole('button',{name,exact:true}).click();
try{
 await page.goto(`${origin}/prehire`);await page.getByRole('heading',{name:'Welcome, Alex!'}).waitFor();await page.evaluate(()=>document.fonts.ready);
 check((await page.locator('.hire-workspace').evaluate(e=>getComputedStyle(e).fontFamily)).includes('Comfortaa'),'Actual ITSCO portal uses Comfortaa');
 await page.screenshot({path:output+'prehire-desktop.png',fullPage:true});
 await nav('Document library');check(await page.locator('.library-grid article').count()===1,'Prehire library contains handbook only');await page.getByRole('button',{name:'Read & search',exact:true}).click();await page.locator('.handbook-book').waitFor();
 check(await page.locator('a[download]').count()===0,'No handbook download control');
 await page.locator('.handbook-assistant summary').click();
 await page.locator('.handbook-assistant textarea').fill('paid time off');await page.locator('.handbook-assistant form button[type=submit]').click();await page.locator('.answer-policy-links a').first().waitFor();
 check((await page.locator('.handbook-answer').innerText()).includes('Demo passage lookup'),'Question display explicitly labels local excerpt lookup');await page.locator('.answer-policy-links a').first().click();
 check(!!(await page.locator('.book-page').getAttribute('id')),'Answer citation opens a handbook section');
 await nav('Candidate portal');await page.getByRole('button',{name:'Continue your steps',exact:true}).click();
 const sample=async title=>{await page.locator('.steps').getByRole('button',{name:new RegExp(title)}).click();await page.getByLabel('I have reviewed this demo step.').check();await page.getByRole('button',{name:title==='Your professional headshot'?'Use sample avatar':'Save demo acknowledgment',exact:true}).click();await page.getByText('✓ Demo record retained for review.',{exact:true}).waitFor();};
 for(const title of ['Background check authorization','Your job description','Employment agreement','Your professional headshot'])await sample(title);
 await page.locator('.steps').getByRole('button',{name:/Choose your work email/}).click();await page.getByRole('button',{name:'Save preference',exact:true}).click();await page.locator('.current-heading .badge').waitFor();
 await page.locator('.steps').getByRole('button',{name:/Pre-employment information/}).click();await page.getByRole('button',{name:'Save information',exact:true}).click();await page.locator('.current-heading .badge').waitFor();
 await page.locator('.steps').getByRole('button',{name:/Final review/}).click();await page.getByLabel('I confirm that my information is complete and accurate.').check();await page.getByRole('button',{name:'Submit pre-hire for review'}).click();await page.getByText('Prehire awaiting review',{exact:true}).waitFor();check(true,'Fictional prehire completes through actual portal UI');
 await nav('Admin review & test log');await page.getByRole('button',{name:'Approve demo prehire → Onboarding',exact:true}).click();await page.getByText('Onboarding in progress',{exact:true}).waitFor();check(true,'Administrator approval transitions to onboarding');
 await page.screenshot({path:output+'onboarding-desktop.png',fullPage:true});
 await nav('Assigned learning');await page.locator('.guide-course-grid article').first().waitFor();check(await page.locator('.guide-course-grid article').count()===9,'School facilitator receives all nine current required guides');
 const course=page.locator('.guide-course-grid article').filter({hasText:'School Practice Guide'});await course.getByRole('button',{name:'Start required training',exact:true}).click();await page.locator('.handbook-book').waitFor();
 await page.locator('.learning-tabs button').nth(1).click();check(await page.getByRole('button',{name:'Check my answers',exact:true}).isDisabled(),'Reading acknowledgment gates the knowledge check');await page.locator('.learning-tabs button').first().click();
 const def=trainingDefinitionsFor({slug:'itsco'}).find(d=>d.documentKey==='school-practice-guide');
 for(let i=0;i<def.requiredSections.length;i++){await page.locator('.reading-plan li button').nth(i).click();await page.getByRole('button',{name:'I have reviewed this section',exact:true}).click();await page.getByRole('button',{name:'✓ Reviewed',exact:true}).waitFor();}
 await page.locator('.learning-tabs button').nth(1).click();for(const [i,q] of def.questions.entries())await page.locator('.knowledge-check fieldset').nth(i).locator('input').nth((q.correctAnswer+1)%q.options.length).check();
 await page.getByRole('button',{name:'Check my answers',exact:true}).click();await page.getByRole('heading',{name:/Review and try again/}).waitFor();check(await page.locator('.quiz-feedback article').count()===def.questions.length,'Incorrect answers receive source-linked feedback');
 for(const [i,q] of def.questions.entries())await page.locator('.knowledge-check fieldset').nth(i).locator('input').nth(q.correctAnswer).check();await page.getByRole('button',{name:'Check my answers',exact:true}).click();await page.locator('.completion-note').waitFor();check(true,'Correct retry saves required completion');await page.screenshot({path:output+'quiz-completed.png',fullPage:true});
 await nav('On-demand · Unpaid');await page.locator('.guide-course-grid article').first().getByRole('button',{name:'Start optional practice',exact:true}).click();await page.locator('.time-banner').waitFor();check((await page.locator('.time-banner').innerText()).includes('Your own time'),'Optional retake explicitly unpaid');check(await page.getByRole('button',{name:'Pause timer',exact:true}).count()===0,'Optional practice has no paid timer');
 await page.setViewportSize({width:390,height:844});check(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)),'Training fits mobile width');await page.screenshot({path:output+'onboarding-mobile.png',fullPage:true});
 await page.setViewportSize({width:1512,height:1000});await nav('Admin review & test log');check(await page.getByRole('button',{name:'Approve demo onboarding → Employee',exact:true}).isDisabled(),'Incomplete onboarding cannot be approved');
 await page.getByRole('button',{name:'Assign demo refresher',exact:true}).click();await nav('Assigned learning');await page.getByText('Assigned by your supervisor / admin · Paid training',{exact:true}).waitFor();check(true,'Supervisor refresher appears as a separate paid assignment');
 await nav('Candidate portal');await page.getByRole('button',{name:'Continue your steps',exact:true}).click();
 await page.locator('.steps').getByRole('button',{name:/Review the workplace handbook/}).click();await page.locator('.handbook-book').waitFor();
 await page.getByLabel('I have reviewed this information.',{exact:true}).check();await page.getByLabel('Typed signature',{exact:true}).fill('Alex Demo');await page.getByRole('button',{name:'Capture Signature',exact:true}).click();await page.getByRole('button',{name:'Sign acknowledgement',exact:true}).click();await page.locator('.current-heading .badge').waitFor();check(true,'Handbook acknowledgment captures a fictional signature against its assigned edition');
 const defs=trainingDefinitionsFor({slug:'itsco'});
 await page.evaluate(async definitions=>{
  const session=sessionStorage.getItem('hire-demo-session:prehire');
  const req=async(path,body)=>{const r=await fetch('/demo-api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Demo-Session':session},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error(await r.text());return r.json();};
  const state=await req('/state');
  for(const step of state.workflow.steps.onboarding.filter(s=>s.required&&!s.complete)){
   if(step.kind==='guide-training'){
    const def=definitions.find(d=>d.documentKey===step.documentKey);const {id}=await req('/document-learning/courses/'+step.documentKey+'/start',{purpose:'onboarding',requestKey:'verify-'+step.documentKey});
    for(const slug of def.requiredSections)await req('/document-learning/enrollments/'+id+'/reading',{slug});
    await req('/document-learning/enrollments/'+id+'/quiz',{answers:def.questions.map(q=>q.correctAnswer),requestKey:'verify-pass-'+id});
   }else await req('/workflow/'+step.key,{acknowledged:true,complete:true,sample:true});
  }
 },defs);
 await nav('Admin review & test log');await nav('Candidate portal');await page.getByRole('button',{name:'Continue your steps',exact:true}).click();await page.locator('.steps').getByRole('button',{name:/Final review/}).click();await page.getByLabel('I confirm that my information is complete and accurate.').check();await page.getByRole('button',{name:'Submit onboarding for review'}).click();await page.getByText('Onboarding awaiting review',{exact:true}).waitFor();
 await nav('Admin review & test log');await page.getByRole('button',{name:'Approve demo onboarding → Employee',exact:true}).click();await page.getByText('Employee experience',{exact:true}).waitFor();check(true,'Completed onboarding submits and advances to employee library and optional learning');
 await page.getByText('Demo controls',{exact:true}).click();await page.getByLabel('Agency',{exact:true}).selectOption('nlu');await page.getByRole('button',{name:'Start fresh onboarding',exact:true}).click();await nav('Assigned learning');await page.locator('.guide-course-grid article').first().waitFor();check(!(await page.locator('.guide-course-grid').innerText()).includes('School Practice Guide'),'NLU excludes school training');
 await page.reload();await page.getByRole('heading',{name:'Welcome, Alex!'}).waitFor();check((await page.locator('.hire-topbar').innerText()).includes('Next Level Up'),'Refresh preserves the selected company and journey');
 await nav('Clickable form');await page.locator('.mapped-input').first().waitFor();
 await page.locator('.mapped-input[type=text]').first().fill('Alex Demo');
 check(await page.locator('.mapped-input[type=text]').first().inputValue()==='Alex Demo','Answers type directly into the displayed PDF');
 const choice=page.locator('.mapped-choice').first();await choice.check();check(await choice.isChecked(),'PDF checkbox toggles on the document');
 await page.getByRole('button',{name:'Next page',exact:true}).click();await page.getByText('Page 2 of 4',{exact:true}).waitFor();await page.getByRole('button',{name:'Previous page',exact:true}).click();await page.locator('.mapped-input[type=text]').first().waitFor();
 check(await page.locator('.mapped-input[type=text]').first().inputValue()==='Alex Demo','PDF answers survive page navigation');
 await page.getByLabel('Document zoom',{exact:true}).selectOption('1.5');
 await page.screenshot({path:output+'clickable-i9-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});check(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)),'Clickable document is contained on mobile');await page.screenshot({path:output+'clickable-i9-mobile.png',fullPage:true});
 check(errors.length===0,'No browser runtime errors');
 await writeFile(output+'results.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors},null,2));
}catch(e){await page.screenshot({path:output+'failure.png',fullPage:true});await writeFile(output+'results.json',JSON.stringify({passed:false,checks,errors,error:e.message},null,2));console.error(e);process.exitCode=1;}finally{await browser.close();}
