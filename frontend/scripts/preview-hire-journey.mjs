import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { hireFormDefinitions } from '../../backend/src/services/hireFormDefinitions.service.js';
import { createDemo, handleDemo } from './hire-demo/fixture.mjs';
const port = Number(process.env.HIRE_DEMO_PORT || 5198), origin = `http://127.0.0.1:${port}`;
const sessions = new Map();
const formBytes = await readFile(new URL('../../backend/src/assets/hireOnboarding/itsco/i9_2025.pdf', import.meta.url));
const formFields = await hireFormDefinitions(formBytes,'i9');
const server = await createServer({ configFile:false, root:fileURLToPath(new URL('../',import.meta.url)), optimizeDeps:{entries:[], include:['vue','vue-router','pinia','axios','dompurify']}, plugins:[vue(),{
  name:'local-hire-rehearsal',
  configureServer(vite) {
    vite.middlewares.use('/demo-i9.pdf',(_req,res)=>{res.setHeader('Content-Type','application/pdf');res.end(formBytes);});
    vite.middlewares.use('/demo-api',async(req,res)=>{
      res.setHeader('Content-Type','application/json'); res.setHeader('Cache-Control','no-store');
      try {
        if (req.headers.origin && req.headers.origin !== origin) throw new Error('Local requests only.');
        const id = req.headers['x-demo-session']; if (!/^[a-f0-9-]{36}$/.test(id || '')) throw new Error('Open the demo to create a fictional session.');
        let raw=''; for await (const chunk of req) { raw+=chunk; if(raw.length>100000) throw new Error('Demo request too large.'); }
        const url = new URL(req.url,origin), body={...Object.fromEntries(url.searchParams),...(raw ? JSON.parse(raw):{})};
        if (url.pathname === '/reset' && req.method === 'POST') { if(sessions.size>100) sessions.clear(); sessions.set(id,createDemo(body)); }
        if (!sessions.has(id)) sessions.set(id,createDemo({phase:req.headers['x-demo-entry']==='onboarding'?'onboarding':'prehire'}));
        if (url.pathname === '/form') { res.end(JSON.stringify({fields:formFields})); return; }
        const result=handleDemo(sessions.get(id),req.method,url.pathname === '/reset'?'/state':url.pathname,body);
        res.end(JSON.stringify(result));
      } catch(e) { res.statusCode=e.status||400; res.end(JSON.stringify({error:{message:e.message}})); }
    });
    vite.middlewares.use('/api',(_req,res)=>{res.statusCode=403;res.end('Live API unavailable in this demo.');});
    vite.middlewares.use(async(req,res,next)=>{
      const path=new URL(req.url,origin).pathname;
      if(!['/','/prehire','/onboarding'].includes(path)) return next();
      res.setHeader('Content-Security-Policy',"connect-src 'self'; frame-src 'self'; form-action 'self'; object-src 'none'");
      const html=await vite.transformIndexHtml(path,'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prehire & onboarding · Demo</title></head><body><div id="app"></div><script type="module" src="/@id/__x00__hire-demo"></script></body></html>');res.setHeader('Content-Type','text/html');res.end(html);
    });
  },
  resolveId(id){if(['hire-demo','\0hire-demo'].includes(id))return '\0hire-demo';},
  load(id){if(id!=='\0hire-demo')return;return `import {createApp} from 'vue';import {createPinia} from 'pinia';import {createRouter,createWebHistory} from 'vue-router';import App from '/scripts/hire-demo/HireJourneyDemo.vue';import '/src/styles/brandTypography.css';import api from '/src/services/api';api.defaults.baseURL='/demo-api';const router=createRouter({history:createWebHistory(),routes:[{path:'/:pathMatch(.*)*',component:App}]});createApp(App).use(createPinia()).use(router).mount('#app');`;}
}], server:{host:'127.0.0.1',port,strictPort:true,hmr:false} });
await server.listen();console.log(`Prehire: ${origin}/prehire\nOnboarding: ${origin}/onboarding\nLocal memory only. Restart clears all fictional sessions.`);
