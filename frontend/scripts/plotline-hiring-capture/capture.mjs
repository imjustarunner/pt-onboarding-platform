import {question} from './fixtures.js';
import {chromium} from '../../../node_modules/playwright/index.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const frontend=fileURLToPath(new URL('../../',import.meta.url));
const output=frontend+'public/assets/plotline/examples/hiring-showcase/';
const review=process.env.PLOTLINE_CAPTURE_REVIEW_DIR;
if(review)mkdirSync(review,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1080},reducedMotion:'reduce'});
const errors=[],blocked=[];
await context.addInitScript(()=>{
 const reject=()=>Promise.reject(new Error('No media access in a fictional capture'));
 if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:reject});
});
await context.route('**/*',route=>{
 const url=new URL(route.request().url());
 if(url.origin==='http://127.0.0.1:5212'||url.protocol==='data:')return route.continue();
 blocked.push(url.origin+url.pathname);return route.abort();
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const records=[];
async function capture(file,sources,details,clip){
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode().catch(()=>{}))));
 await page.screenshot({path:output+file,...(clip?{clip}:{fullPage:true})});
 if(review)await page.screenshot({path:review+'/'+file,...(clip?{clip}:{fullPage:true})});
 records.push({file,sha256:createHash('sha256').update(readFileSync(output+file)).digest('hex'),sources:sources.map(source=>({path:source,sha256:createHash('sha256').update(readFileSync(frontend+source)).digest('hex')})),details});
}
try{
 for(const clean of [false,true]){
  await page.goto('http://127.0.0.1:5212/?view=interview'+(clean?'&clean=1':''));
  await page.locator('.applicant-question-panel').waitFor();
  if(!clean)await page.getByText(question,{exact:true}).waitFor();
  if(await page.locator('.applicant-interview').getByText('Scorecard',{exact:true}).count())throw Error('Applicant must not see private interviewer scores');
  await capture(clean?'interview-applicant-clean.png':'interview-applicant.png',['src/views/teamMeeting/ApplicantInterviewView.vue','src/components/hiring/InterviewQuestionCard.vue','src/components/hiring/InterviewSharedChat.vue'],{actualApplicantShell:true,simulatedMediaTiles:true,liveMedia:false,cleanQuestion:clean});
 }
 await page.goto('http://127.0.0.1:5212/?view=reference');
 await page.locator('.reference-questionnaire').waitFor();
 await page.getByLabel('Communication, 4 out of 5',{exact:true}).check();
 await page.getByLabel('Reliability, 5 out of 5',{exact:true}).check();
 await page.getByLabel('Collaboration, 4 out of 5',{exact:true}).check();
 await page.getByLabel(/greatest professional strengths/).fill('Sofia explains new concepts clearly, adapts to different learning styles and creates a supportive space for learners to ask questions.');
 await capture('references.png',['src/views/public/HiringReferenceFormView.vue','src/components/hiring/ReferenceQuestionnaire.vue'],{actualPublicForm:true,fictionalReference:true,submitted:false});
 await page.setViewportSize({width:1440,height:2000});await page.evaluate(()=>scrollTo(0,0));
 const detail=await page.locator('.reference-questionnaire').boundingBox();detail.height=Math.min(660,detail.height);
 await capture('references-detail.png',['src/views/public/HiringReferenceFormView.vue','src/components/hiring/ReferenceQuestionnaire.vue'],{actualPublicForm:true,fictionalReference:true,detailCrop:true,submitted:false},detail);
 await page.setViewportSize({width:1440,height:1080});
 await page.goto('http://127.0.0.1:5212/?view=prehire');
 await page.locator('.overview-progress').waitFor();
 await capture('prehire-home.png',['src/components/prehire/HirePortalWorkspace.vue'],{actualWorkspace:true,preview:true,unopenedStepComponentsStubbed:true});
 await page.getByRole('button',{name:'Continue your steps'}).click();
 await page.locator('.steps').getByRole('button',{name:/Review your package/}).click();
 await capture('prehire-review.png',['src/components/prehire/HirePortalWorkspace.vue'],{actualWorkspace:true,preview:true,signatureOrSubmission:false});
 if(errors.length)throw Error(errors.join('\n'));
 if(blocked.length)throw Error('Unexpected remote requests: '+blocked.join(','));
 const provenance={createdAt:new Date().toISOString(),fictional:true,productionAccess:false,realMedia:false,suppliedMockup:{file:'interview-team.png',sourceFilename:'Next Level Up Interview Dashboard.png',sha256:createHash('sha256').update(readFileSync(output+'interview-team.png')).digest('hex'),origin:'User-approved fictional mockup'},suppliedApplicantMockup:{file:'interview-applicant-mockup.png',sourceFilename:'Next Level Up Interview Dashboard (1).png',sha256:createHash('sha256').update(readFileSync(output+'interview-applicant-mockup.png')).digest('hex'),origin:'User-supplied fictional applicant-side mockup'},records};
 writeFileSync(output+'provenance.json',JSON.stringify(provenance,null,2)+'\n');
 if(review)writeFileSync(review+'/CAPTURE.json',JSON.stringify(provenance,null,2)+'\n');
 console.log('Captured six fictional applicant/reference/pre-hire images from current components; no production or media access.');
}finally{await context.close();await browser.close();}
