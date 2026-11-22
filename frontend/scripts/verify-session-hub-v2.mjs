import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const origin=process.env.HUB_PREVIEW_ORIGIN||'http://127.0.0.1:5198';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('This synthetic preview requires an explicit local origin.');
const out=new URL('../../deliverables/nlu-session-hub-2026-11-21/preview/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([612,792]);
page.drawText('SYNTHETIC QA - Fraction practice',{x:40,y:745,size:20,font});page.drawText('1. Add one half and one quarter. Explain your common unit.',{x:40,y:690,size:13,font});page.drawText('2. Draw equal-size wholes to compare one half and one quarter.',{x:40,y:450,size:13,font});
const pdfBytes=Buffer.from(await pdf.save());
const definition={instructions:'Show your thinking. Answers are saved to this synthetic session.',questions:[{id:'q1',page:1,x:8,y:17,width:80,height:13,prompt:'1/2 + 1/4 =',type:'choice',options:['3/4','2/6'],answerKey:'3/4',skill:'Fractions',grade:'5'},{id:'q2',page:1,x:8,y:47,width:80,height:20,prompt:'Draw and explain your comparison.',type:'ink',options:[],answerKey:'',skill:'Fraction models',grade:'5'}]};
const events=[{id:1,actor:'user-90001',role:'provider',type:'share',payload:{mode:'whiteboard',title:'Shared whiteboard'}},{id:2,actor:'user-90001',role:'provider',type:'board_prompt',payload:{shareId:1,x:8,y:12,width:70,prompt:'Which fraction is equal to one half?',format:'choice',options:['2/4','3/4'],skill:'Equivalent fractions',grade:'5'}}];
const attempts=[];let nextId=3;
const errors=[],checks=[];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const tutor=await browser.newPage({viewport:{width:1720,height:1050}}),learner=await browser.newPage({viewport:{width:1365,height:900}});
async function respond(route){
 const u=new URL(route.request().url()),match=u.pathname.match(/^\/__qa\/(tutor|learner)(.*)$/);if(!match)return route.continue();
 const host=match[1]==='tutor',path=match[2],method=route.request().method(),actor=host?'user-90001':'guest:synthetic-one',role=host?'provider':'client';
 let body;try{body=route.request().postDataJSON();}catch{body={};}
 const ok=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 if(path==='/workspace'&&method==='GET')return ok({actor,artifacts:events.filter(e=>e.id>Number(u.searchParams.get('afterId')||0)),nextCursor:events.at(-1)?.id||0,hasMore:false});
 if(path==='/workspace'&&method==='POST'){const artifact={...body,id:nextId++,actor,role,createdAt:new Date().toISOString()};events.push(artifact);return ok({artifact});}
 if(path==='/studio/materials')return ok({materials:[{id:3,title:'Fraction practice.pdf',versions:[{id:9,version:1,status:'approved',shared:true}]}]});
 if(path==='/studio/library')return ok({resources:[],canPublish:false});
 if(path==='/studio/progress')return ok({suggestions:[]});
 if(path==='/studio/versions/9/file')return route.fulfill({status:200,contentType:'application/pdf',body:pdfBytes});
 if(path==='/studio/versions/9')return ok({id:9,materialId:3,version:1,status:'approved',definition:{...definition,questions:definition.questions.map(({answerKey,...q})=>host?{...q,answerKey}:q)}});
 if(path==='/studio/versions/9/attempts'&&method==='GET')return ok({attempts:host?attempts:attempts.filter(a=>a.actor===actor)});
 if(path==='/studio/versions/9/attempts'&&method==='PUT'){let a=attempts.find(a=>a.requestId===body.requestId);if(!a){a={id:1,actor,requestId:body.requestId,revision:0};attempts.push(a);}Object.assign(a,{answers:body.answers,revision:a.revision+1,status:body.submit?'submitted':'draft'});return ok(a);}
 if(path==='/studio/versions/9/share'){events.push({id:nextId++,type:'share',actor,role,payload:{mode:'worksheet',versionId:9,title:'Interactive worksheet'}});return ok({ok:true});}
 if(path==='/review'){events.push({id:nextId++,type:'board_review',actor,role,payload:body});return ok({ok:true});}
 return ok({ok:true});
}
for(const p of [tutor,learner]){p.on('pageerror',e=>errors.push(e.message));await p.route('**/__qa/**',respond);await p.route('https://**',r=>r.abort());}
const check=(value,label)=>{if(!value)throw Error(label);checks.push(label);};
try{
 await tutor.goto(origin+'/previews/session-hub/?view=tutor');await learner.goto(origin+'/previews/session-hub/?view=learner');
 await tutor.getByRole('button',{name:'Unlock student editing',exact:true}).waitFor();
 check(await learner.getByRole('button',{name:'Clear page',exact:true}).count()===0,'Learner has no clear-page control');
 await tutor.getByRole('button',{name:'Unlock student editing',exact:true}).click();
 await learner.getByText('Work together · Student editing on',{exact:true}).waitFor();
 checks.push('Tutor lock changes reach the learner through the session ledger');
 await tutor.screenshot({path:out+'tutor-desktop.png',fullPage:true});
 await learner.screenshot({path:out+'learner-desktop.png',fullPage:true});
 await tutor.getByRole('button',{name:'Materials',exact:true}).first().click();
 await tutor.getByRole('button',{name:'Review / open',exact:true}).click();
 await tutor.getByRole('button',{name:'Share this approved version',exact:true}).waitFor();
 await tutor.getByRole('button',{name:'Share this approved version',exact:true}).click();
 await learner.locator('.worksheet-work canvas').waitFor();
 await learner.locator('#answer-q1').selectOption('3/4');
 await learner.getByRole('button',{name:'Submit answers',exact:true}).click();
 await learner.getByText('Answers submitted. Your tutor will review your work.',{exact:true}).waitFor();
 check(attempts.length===1&&attempts[0].answers.q1==='3/4','Learner submits the displayed version and exact field response');
 check(await learner.getByText('Private answer key',{exact:true}).count()===0,'Learner cannot see tutor key editing');
 await learner.screenshot({path:out+'learner-worksheet.png',fullPage:true});
 await tutor.setViewportSize({width:820,height:1180});await tutor.screenshot({path:out+'tutor-tablet.png',fullPage:true});
 check(await tutor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Tablet layout has no page-level horizontal overflow');
 await learner.setViewportSize({width:390,height:844});await learner.screenshot({path:out+'learner-mobile.png',fullPage:true});
 check(await learner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'390px learner layout has no page-level horizontal overflow');
 check(!errors.length,'No browser runtime exceptions');
 await writeFile(out+'checks.json',JSON.stringify({evidenceType:'Synthetic local engineering preview; not live QA or audio/video proof',checks,errors},null,2));
 console.log(JSON.stringify({checks:checks.length,screenshots:out,errors}));
}finally{await browser.close();}
