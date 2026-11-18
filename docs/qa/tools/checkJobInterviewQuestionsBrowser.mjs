// Actual Vue components, isolated localhost API fixtures. No login, account,
// interview, calendar event or email is created by this browser check.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from '../../../frontend/node_modules/vite/dist/node/index.js';
import vue from '../../../frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs';
const out=path.resolve(process.argv[2]||'deliverables/plotline-job-questions-2026-11-18');await fs.mkdir(out,{recursive:true});
const server=await createServer({configFile:false,root:fileURLToPath(new URL('../../../frontend',import.meta.url)),publicDir:false,optimizeDeps:{entries:[],noDiscovery:true,include:['vue']},cacheDir:'/private/tmp/pt-plotline-question-vite-cache-20261118',logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[vue(),{
 name:'isolated-question-fixtures',enforce:'pre',
 resolveId(source,importer){if(['virtual:question-qa','/virtual:question-qa'].includes(source))return '\0question-qa';if(source.endsWith('/services/api') && importer?.includes('/components/hiring/'))return '\0question-api';},
 load(id){if(id==='\0question-api')return `const request=async(method,url,body)=>{const response=await fetch('/api'+url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {data:await response.json()}};export default{get:url=>request('GET',url),post:(url,body)=>request('POST',url,body),put:(url,body)=>request('PUT',url,body)};`;
 if(id==='\0question-qa')return `import {createApp,h,ref} from 'vue';import Picker from '/src/components/hiring/InterviewQuestionPicker.vue';import Editor from '/src/components/hiring/JobInterviewGuideEditor.vue';createApp({setup(){const selection=ref(null),ready=ref(false);return()=>h('main',[h('p','Plotline · Synthetic local preview'),h('h1','Operations Coordinator'),h(Editor,{agencyId:6,jobDescriptionId:45,jobTitle:'Operations Coordinator'}),h(Picker,{modelValue:selection.value,'onUpdate:modelValue':value=>selection.value=value,onReady:value=>ready.value=value,agencyId:6,jobDescriptionId:45}),h('button',{id:'book',disabled:!ready.value},'Schedule interview'),h('output',{id:'selection'},JSON.stringify(selection.value))]);}}).mount('#app');`;},
 configureServer(vite){vite.middlewares.use('/__question-qa',async(req,res)=>{const html=await vite.transformIndexHtml('/__question-qa','<html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#faf8f4;font:15px/1.5 system-ui;color:#203c32}main{max-width:780px;padding:24px;margin:auto}main>section{margin:18px 0}h1{font-size:28px}#selection{display:none}#book{padding:12px 18px;background:#205846;color:white;border:0;border-radius:8px}</style><div id="app"></div><script type="module" src="/virtual:question-qa"></script></html>');res.setHeader('content-type','text/html');res.end(html);});}
}]});
await server.listen();const base=server.resolvedUrls.local[0];
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const errors=[],requests=[],checks=[];
const q=(key,text)=>({key,text,fingerprint:`fixture-${key}-${text}`});
const guide={questionSet:{id:4},criteria:[],criteriaSource:'platform',questions:[q('q1','How would you prioritize two competing deadlines?')],starterSource:'platform',starterQuestions:[q('motivation','What drew you to this role and our organization?')],questionSets:[
 {id:4,title:'Operations Coordinator guide',job_description_id:45,questions_json:[q('q1','How would you prioritize two competing deadlines?'),q('q2','Describe a process you improved.')]},
 {id:8,title:'Teamwork',job_description_id:null,questions_json:[q('q1','How do you hand off unfinished work?')]}
]};
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==new URL(base).origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();requests.push({method:route.request().method(),path:url.pathname});let data=guide;if(route.request().method()==='POST'){const body=route.request().postDataJSON();data={id:9,...body,questions_json:body.questions.map(question=>q(question.key,question.text))};}await route.fulfill({json:{data}});});
 await page.goto(base+'__question-qa');const picker=page.locator('section[aria-label="Interview questions"]');await picker.locator('.iqp-switch select').waitFor();
 assert.equal(await picker.locator('.iqp-switch select').inputValue(),'4');checks.push('Applied job guide selected first');
 await picker.getByRole('button',{name:'Next question set',exact:true}).click();assert.equal(await picker.locator('.iqp-switch select').inputValue(),'8');
 await picker.getByRole('button',{name:'Previous question set',exact:true}).click();checks.push('Visible arrows switch whole sets');
 await picker.getByRole('button',{name:'Remove question 1',exact:true}).click();await picker.locator('.iqp-library summary').click();await picker.locator('.iqp-library select').selectOption('8');
 await picker.getByRole('button',{name:'Add question: How do you hand off unfinished work?',exact:true}).click();await picker.getByRole('button',{name:'Move question 2 up',exact:true}).click();
 assert.match(await picker.locator('.iqp-selected li').first().innerText(),/How do you hand off/);checks.push('Individual additions, removal and order preserved');
 for(const width of [1280,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(out,`QUESTIONS-${width}.png`),fullPage:true});checks.push(`${width}px layout without horizontal overflow`);}
 await picker.getByRole('button',{name:'Create a question set',exact:true}).click();assert.equal(await page.locator('#book').isDisabled(),true);
 await picker.getByLabel('New set title',{exact:true}).fill('Second round');await picker.getByLabel('Questions, one per line',{exact:true}).fill('What would you change in your first week?');await picker.getByRole('button',{name:'Save and use set',exact:true}).click();await page.waitForFunction(()=>JSON.parse(document.querySelector('#selection').textContent)?.setId===9);checks.push('New set saved and selected without changing job default');
 await picker.getByRole('button',{name:'Reload questions',exact:true}).click();await page.waitForFunction(()=>JSON.parse(document.querySelector('#selection').textContent)?.setId===4);checks.push('Job default remains selected for the next interview');
 assert.deepEqual(errors,[]);const report={scope:'localhost Vue components with synthetic API responses',productionQa:false,checks,pageErrors:errors,requests,realInterviewsCreated:0,realEmailsSent:0};await fs.writeFile(path.join(out,'LOCAL-BROWSER-VALIDATION.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:checks.length,pageErrors:errors.length,productionQa:false}));
}catch(error){console.error(JSON.stringify({pageErrors:errors,requests}));throw error;}finally{await browser.close();await server.close();}
