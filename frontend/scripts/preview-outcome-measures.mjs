// Local, synthetic-only UI preview. No database, credentials, AI or external requests.
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { outcomeMeasures, measureRights, getOutcomeMeasure } from '../../backend/src/data/outcomeMeasures.js';
import { scoreOutcomeMeasure } from '../../backend/src/services/outcomeMeasureScoring.js';
import { referenceSource, referenceMetadata } from '../../backend/src/services/companyReferenceContent.js';
const catalog = { measures: outcomeMeasures, rights: measureRights, availableCount: outcomeMeasures.length, reviewedCount: measureRights.length, checkedAt: '2026-10-10' };
const records=[];
const root=fileURLToPath(new URL('../',import.meta.url));
const apiId='\0virtual:outcome-preview-api', appId='\0virtual:outcome-preview';
const guides=Object.fromEntries(['itsco','nlu','isi'].map(key=>{const s=referenceSource({slug:key==='isi'?'tisi':key},'provider-guide');return [key,{sections:s.sections,metadata:referenceMetadata(s)}];}));
const server=await createServer({configFile:false,root,plugins:[vue(),{
  name:'outcome-measure-preview',
  resolveId(id,importer){if(id===apiId)return apiId;if(id===appId||id===appId.slice(1))return appId;if(importer?.includes('/components/clinical/')&&id.endsWith('/services/api'))return apiId;},
  load(id){
    if(id===apiId)return `const request=async(path,body)=>{const r=await fetch('/__synthetic'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw{response:{status:r.status,data}};return{data}};export default {get:path=>request(path),post:(path,body)=>request(path,body)};`;
    if(id===appId)return `import {createApp,h} from 'vue';import '/src/styles/brandTypography.css';import Panel from '/src/components/clinical/OutcomeMeasuresPanel.vue';import Book from '/src/components/handbook/WorkplaceHandbookBook.vue';const guides=${JSON.stringify(guides).replace(/</g,'\\u003c')};const query=new URLSearchParams(location.search);const guide=query.get('guide');createApp({render:()=>guide?h(Book,{handbook:guides[guide]}):h(Panel,{clientId:query.has('client')?41:null,initialMeasure:query.get('measure')||''})}).mount('#app');`;
  },
  configureServer(s){
    s.middlewares.use('/__synthetic/outcome-measures',async(req,res)=>{
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      try{
        if(req.method==='GET'){res.end(JSON.stringify(req.url==='/catalog'?catalog:{responses:records.toReversed()}));return;}
        if(req.method!=='POST'||req.headers.origin!=='http://127.0.0.1:5182')throw new Error('Only local synthetic preview requests are accepted.');
        let body='';for await(const chunk of req){body+=chunk;if(body.length>20000)throw new Error('Preview input too long.');}const input=JSON.parse(body);
        if(req.url==='/reset'){records.length=0;res.end(JSON.stringify({reset:true}));return;}
        if(req.url.endsWith('/review')){const row=records.find(r=>r.id===Number(req.url.split('/')[3]));if(!row)throw new Error('Synthetic response not found.');if(row.result.flags.some(f=>f.urgent)&&!input.safetyFollowUpConfirmed)throw new Error('Confirm direct safety follow-up.');row.review=input;row.reviewedAt=new Date().toISOString();res.end(JSON.stringify({reviewed:true}));return;}
        const measure=getOutcomeMeasure(input.measureId);const scored=scoreOutcomeMeasure(measure,input.answers);const response={id:records.length+1,measureId:measure.id,version:measure.version,questionnaire:measure,...scored,administration:input.administration,recordedAt:new Date().toISOString()};records.push(response);res.end(JSON.stringify({response}));
      }catch(e){res.statusCode=400;res.end(JSON.stringify({error:{message:e.message}}));}
    });
    s.middlewares.use(async(req,res,next)=>{if(!['/','/outcome-measures'].includes(req.url.split('?')[0]))return next();const html=await s.transformIndexHtml('/',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clinical outcome measures · Local preview</title><style>*{box-sizing:border-box}body{margin:0;background:#edf0e9;font-family:Montserrat,Arial,sans-serif}main{max-width:1240px;padding:24px;margin:auto}header{max-width:1192px;margin:24px auto 0;padding:0 24px;color:#526b58;font-size:11px;letter-spacing:.05em}@media(max-width:600px){main{padding:10px}header{padding:0 18px}}</style></head><body><header>CLINICAL PRACTICE / LOCAL PREVIEW / SYNTHETIC RESPONSES ONLY</header><main id="app"></main><script type="module" src="/@id/__x00__virtual:outcome-preview"></script></body></html>`);res.setHeader('Content-Type','text/html');res.end(html);});
  }
}],resolve:{alias:[{find:'../../services/api',replacement:apiId}]},optimizeDeps:{entries:[],include:['vue','vue-router','dompurify']},server:{host:'127.0.0.1',port:5182,strictPort:true,hmr:false}});
await server.listen();console.log('Outcome measure preview: http://127.0.0.1:5182/ (add ?client for synthetic recording; ?guide=itsco for Appendix A)');
