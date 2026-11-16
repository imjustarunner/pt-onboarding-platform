// Production-compile the two new panels, then rehearse them with fictional data.
// No application API, credentials, carrier or real record is used.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright';
import { TRANSITION_TASKS, TRANSITION_ROLES, emptyTransitionState } from '../../backend/src/content/transitionWeek.js';
const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw Error('Specify --out for screenshots and verification evidence.');
const destination = path.resolve(values.out), root = fileURLToPath(new URL('..', import.meta.url));
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'nlu-week-browser-'));
let server, browser;
try {
  await fs.mkdir(destination, { recursive: true });
  const providers = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Example provider ${i + 1}` }));
  const fixture = `import {freezeTransitionRanking,validateTransitionState,updateTransitionCohort} from ${JSON.stringify(fileURLToPath(new URL('../../backend/src/utils/transitionWeekPolicy.js', import.meta.url)))};
    let board=${JSON.stringify({ revision: 0, week: '2026-11-16', catalog: TRANSITION_TASKS, roles: TRANSITION_ROLES, state: emptyTransitionState() })};
    const providers=${JSON.stringify(providers)};
    const event={id:1,phoneLastFour:'0101',numberId:7,status:'pending',receivedAt:Date.now(),eligibleForReview:true};
    export default {
      async get(url){window.__transitionFixtureCalls||=[];window.__transitionFixtureCalls.push(url);if(url.endsWith('/transition-week'))return {data:JSON.parse(JSON.stringify(board))};
        if(url.endsWith('/providers'))return {data:providers};
        if(url.endsWith('/evidence'))return {data:{agencyId:2,phone:'+13035550101',numberId:7,messageId:'fictional-start',receivedAt:event.receivedAt,disclosure:{version:'FICTIONAL-1',disclosure:'Fictional test disclosure; no carrier approval is asserted.',purposes:['reminders'],approvalReference:'FICTIONAL'}}};
        return {data:{items:[event],nextBeforeId:null}};},
      async put(url,input){if(input.revision!==board.revision)throw Error('Stale revision');
        if(input.action==='save')board.state=validateTransitionState(input.state,board.state);
        if(input.action==='freeze_ranking')board.state.ranking=freezeTransitionRanking(input.rows,providers,input.sourceReference);
        if(input.action==='cohort')board.state=updateTransitionCohort(board.state,input.cohort,input,999);
        board.revision++;return {data:JSON.parse(JSON.stringify(board))};},
      async post(){return {data:{status:'linked'}};}
    };`;
  const entry = path.join(scratch, 'entry.js');
  await fs.writeFile(entry, `import {createApp,h} from 'vue';
    import Board from ${JSON.stringify(path.join(root,'src/components/admin/TransitionWeekBoard.vue'))};
    import Queue from ${JSON.stringify(path.join(root,'src/components/admin/SmsPhoneEnrollmentQueue.vue'))};
    createApp({render:()=>h('main',[h('p',{id:'fictional-banner',style:'background:#fff0c2;padding:16px;font-weight:700'},'FICTIONAL TRAINING PREVIEW — no real records, API calls, messages or permissions'),h(Board,{agencyId:2}),h(Queue,{agencyId:2})])}).mount('#app');`);
  const bundle = path.join(scratch, 'bundle');
  await build({ root, configFile: false, logLevel: 'error', plugins: [vue(), {
    name: 'fictional-transition-api', enforce: 'pre', resolveId(id) { if (id === 'virtual:fictional-transition-api' || /services\/api(?:\.js)?$/.test(id)) return '\0fictional-transition-api'; },
    load(id) { if (id === '\0fictional-transition-api') return fixture; }
  }], resolve: { alias: [{ find: /^(?:.*\/)?services\/api(?:\.js)?$/, replacement: 'virtual:fictional-transition-api' }, { find: 'vue', replacement: path.join(root,'node_modules/vue/dist/vue.runtime.esm-bundler.js') }] }, define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
    build: { outDir: bundle, emptyOutDir: true, copyPublicDir: false, cssCodeSplit: false, rollupOptions: { input: entry, output: { entryFileNames: 'app.js', format: 'iife' } } } });
  const assets = await fs.readdir(path.join(bundle,'assets'));
  const servedRequests=[];
  const css = assets.filter(file=>file.endsWith('.css')).map(file=>`<link rel="stylesheet" href="/assets/${file}">`).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional transition training</title>${css}<style>body{font:16px/1.5 system-ui;color:#173447;margin:20px auto;max-width:1100px;padding:0 12px}button{background:#eaf2f5;color:#173447;border:1px solid #8da8b5;border-radius:5px}input,textarea,select{border:1px solid #8da8b5;border-radius:4px}textarea{width:100%}</style><div id="app"></div><script src="/app.js"></script></html>`;
  server = http.createServer(async (req,res) => {
    try {
      const url = new URL(req.url,'http://localhost');
      servedRequests.push(url.pathname);
      if (url.pathname === '/') { res.setHeader('Content-Type','text/html'); res.end(html); return; }
      if (!/^\/(?:app\.js|assets\/[a-zA-Z0-9_.-]+\.css)$/.test(url.pathname)) { res.statusCode=404;res.end();return; }
      res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'application/javascript'); res.end(await fs.readFile(path.join(bundle,url.pathname)));
    } catch { res.statusCode=500;res.end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({channel:'chrome',headless:true});
  const errors=[],blockedRequests=[];
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){blockedRequests.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(origin);
  try { await page.getByText('Saved revision 0',{exact:false}).waitFor({timeout:10000}); }
  catch (error) { await page.screenshot({path:path.join(destination,'preview-failure.png'),fullPage:true}); throw Error(`Preview did not load: ${errors.join('; ')} | ${(await page.locator('body').innerText()).slice(0,1000)} | requests=${JSON.stringify(servedRequests)} fixture=${JSON.stringify(await page.evaluate(()=>window.__transitionFixtureCalls))}`, {cause:error}); }
  await page.locator('.transition-task input').first().fill('Fictional transition lead');
  await page.getByRole('button',{name:'Save evidence',exact:true}).first().click();
  await page.getByText('Saved revision 1',{exact:false}).waitFor();
  await page.getByLabel('Verified source reference').fill('Fictional verified source for training');
  await page.getByLabel('Session counts CSV').fill('providerId,completedFourWeeks,upcomingWeek\n'+providers.map(p=>`${p.id},${p.id*4},${p.id}`).join('\n'));
  await page.getByRole('button',{name:'Freeze ranking and create groups'}).click();
  await page.getByRole('heading',{name:'Group 2',exact:true}).waitFor();
  const groups=page.locator('.cohort-section article');assert.equal(await groups.nth(0).locator('li').count(),5);assert.equal(await groups.nth(1).locator('li').count(),1);
  assert.equal(await groups.nth(1).getByRole('button').isDisabled(),true);
  await page.getByText('START enrollment · recipients without an account',{exact:true}).click();
  await page.getByRole('button',{name:'Refresh START queue'}).click();
  await page.getByRole('button',{name:'Review original evidence'}).waitFor();
  assert.equal(await page.locator('.phone-enrollments').innerText().then(t=>t.includes('+13035550101')),false);
  await page.getByRole('button',{name:'Review original evidence'}).click();
  await page.getByText('Fictional test disclosure; no carrier approval is asserted.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Link reviewed consent'}).isDisabled(),true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(destination,'transition-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);assert.equal(noOverflow,true);
  await page.screenshot({path:path.join(destination,'transition-mobile.png')});
  await page.locator('.phone-enrollments form').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(destination,'enrollment-review-mobile.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(blockedRequests,[]);assert.equal(servedRequests.some(url=>url.startsWith('/api')),false);
  await fs.writeFile(path.join(destination,'browser-verification.json'),JSON.stringify({productionComponentsCompiled:true,fictionalDataOnly:true,realApiRequests:0,checks:['revisioned save','groups of five with final remainder','next-cohort hold','masked queue','explicit evidence review','identity-review gate','390px no overflow'],pageErrors:errors},null,2)+'\n');
  console.log('Production component bundles and fictional desktop/mobile rehearsal passed; zero real API requests.');
} finally {
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  await fs.rm(scratch,{recursive:true,force:true});
}
