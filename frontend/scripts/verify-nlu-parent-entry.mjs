import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const origin=process.env.NLU_ENTRY_ORIGIN||'http://127.0.0.1:5199';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('This engineering check uses a local synthetic API only.');
const out=process.env.NLU_ENTRY_EVIDENCE||new URL('../../deliverables/nlu-parent-email-hub-2026-11-22',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const id='11111111-2222-4333-8444-555555555555',requests=[],errors=[];
const now=Date.now();
const state={sessionHubV2:true,host:false,appointmentId:9000498,sessionId:9000600,clientId:9002545,agencyId:453,studentName:'Synthetic learner',title:'Math tutoring',modality:'VIRTUAL',status:'scheduled',available:true,roomState:'idle',
 startAt:new Date(now+15*60000).toISOString(),endAt:new Date(now+75*60000).toISOString(),opensAt:new Date(now-15*60000).toISOString(),closesAt:new Date(now+105*60000).toISOString(),timeZone:'America/Denver',
 visit:{id:9,status:'waiting'},visits:[],branding:{agencyName:'Next Level Up · Synthetic engineering preview',agencyLogoUrl:'/assets/nlu/logo.png'}};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.name+': '+error.message));
 await page.route('https://**',route=>route.abort());
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;requests.push({path,method:route.request().method()});
  const body=path.endsWith('/exchange')?{sessionId:id,agencyId:453,expiresAt:state.closesAt}:
   path==='/api/tutoring-guest/'+id?state:path.endsWith('/join')?{visit:state.visit}:{ok:true};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(origin+'/nlu-qa-demo/tutoring/invite#'+'a'.repeat(43));
 await page.getByRole('heading',{name:'Session Hub',exact:true}).waitFor({timeout:30000});
 await page.getByText('You’re in the waiting room for this appointment. Your tutor will admit you.',{exact:true}).waitFor();
 await page.waitForTimeout(5500);
 if(new URL(page.url()).pathname!=='/nlu-qa-demo/tutoring/guest/'+id)throw Error('The invitation left its guest route.');
 if(requests.some(r=>r.path.startsWith('/api/appointments')))throw Error('Guest entry issued a protected staff request.');
 if(!requests.some(r=>r.path.endsWith('/presence')&&r.method==='POST'))throw Error('The waiting browser did not send presence.');
 await page.screenshot({path:out+'/guest-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Mobile overflow.');
 await page.screenshot({path:out+'/guest-mobile.png',fullPage:true});
 if(errors.length)throw Error('Browser runtime errors: '+errors.join('; '));
 const result={evidenceType:'Production frontend with a local synthetic API; no live session, email delivery or media exchange',checks:['Signed-out invitation exchanges its fragment and opens the exact guest route','No employee cancellation-recovery request','Waiting browser sends explicit presence','Desktop and 390px phone layout','No browser runtime exceptions'],requests,errors};
 await writeFile(out+'/guest-preview-checks.json',JSON.stringify(result,null,2));console.log(JSON.stringify({checks:result.checks.length,errors}));
 await context.close();
}finally{await browser.close();}
