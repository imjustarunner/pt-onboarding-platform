// Real-browser geometry checks against the actual meeting components and parent CSS.
// No credentials, backend, camera, microphone or live meetings are used.
// CHROME_PATH may point to an installed Chrome if Playwright browsers are absent.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js';
import { parse, compileStyle } from '../frontend/node_modules/@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js';

const root=fileURLToPath(new URL('../frontend/',import.meta.url));
const styles=['src/views/teamMeeting/JoinTeamMeetingView.vue','src/components/supervision/GroupSupervisionLiveRoom.vue'].map(file=>{
  const {descriptor}=parse(fs.readFileSync(`${root}/${file}`,'utf8'));
  return descriptor.styles.map(s=>compileStyle({source:s.content,filename:file,id:'data-v-layout',scoped:true}).code).join('\n');
}).join('\n');
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*{box-sizing:border-box}${styles}</style></head><body><div id="fixture"></div>
<script type="module">
import {createApp,h,ref,nextTick} from 'vue';
import {createPinia} from 'pinia';
import Room from '/src/components/video/VideoSessionRoom.vue';
import Chat from '/src/components/meetings/MeetingLiveActivityPanel.vue';
const focus=ref('equal'),full=ref(false),kind=ref('team'),room=ref(null);
createApp({setup(){return()=>h('div',{class:kind.value==='team'?'join-video':'gsl__video-strip', 'data-v-layout':'',style:{width:'100%',height:focus.value==='collapsed'?'auto':'560px',minHeight:'0'}},[
 h('div',{class:['join-video__stage',{'join-video__stage--collapsed':focus.value==='collapsed'}],'data-v-layout':'',style:{height:focus.value==='collapsed'?'auto':'430px',flex:'none'}},[
 h('div',{class:'supervision-video-room'},[h(Room,{ref:room,autoConnect:false,allowTileFocus:true,equalTilesWhenRemote:true,tileFocus:focus.value,videoFullscreen:full.value,'onUpdate:tileFocus':v=>focus.value=v,'onUpdate:videoFullscreen':v=>full.value=v})])]),
 h(Chat,{eventId:999,startOpen:true,belowVideo:true})
]);}}).use(createPinia()).mount('#fixture');
await nextTick();
room.value.remotes.push(...['Alice','Bob','Carol'].map((name,i)=>({name,streamId:'peer'+i,connectionId:'c'+i,hasVideo:true,hasAudio:true})));
window.fixture={set:async(mode,layout='team')=>{focus.value=mode;kind.value=layout;full.value=mode==='fullscreen';if(full.value)focus.value='equal';await nextTick();},ready:true};
</script></body></html>`;
const server=await createServer({root,configFile:`${root}/vite.config.js`,server:{host:'127.0.0.1',port:0},plugins:[{name:'meeting-layout-fixture',configureServer(s){s.middlewares.use((req,res,next)=>{
  if(req.url==='/__meeting_layout_test__'){res.setHeader('Content-Type','text/html');s.transformIndexHtml(req.url,html).then(result=>res.end(result)).catch(next);return;}
  if(req.url.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{"activity":[]}');return;}
  next();
});}}]});
let browser;
try {
  await server.listen();
  const port=server.httpServer.address().port;
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const page=await browser.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.setDefaultTimeout(15000);
  for(const width of [375,768,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto(`http://127.0.0.1:${port}/__meeting_layout_test__`);
    await page.waitForFunction(()=>window.fixture?.ready);
    for(const parent of ['team','group']){
      await page.evaluate(p=>window.fixture.set('collapsed',p),parent);
      const strip=await page.locator('.vsr__stage').boundingBox();
      const tile=await page.locator('.vsr__tile--remote').first().boundingBox();
      const controls=await page.locator('.vsr__controls').boundingBox();
      assert(strip.height>=100,`${width}/${parent}: collapsed strip ${strip.height}`);
      assert(tile.height>=80,`${width}/${parent}: collapsed tile ${tile.height}`);
      assert(tile.y+tile.height<=controls.y+1,`${width}/${parent}: controls cover tiles`);
      await page.evaluate(()=>window.fixture.set('equal'));
      assert((await page.locator('.vsr__stage').boundingBox()).height>150,`${width}: expanded stage remains collapsed`);
    }
    await page.evaluate(()=>window.fixture.set('collapsed'));
    await page.locator('.mlap__form--rich input[type="text"]').fill('Small-screen chat works');
    const geometry=await page.locator('.mlap__form--rich input[type="text"]').evaluate(el=>{
      const a=el.getBoundingClientRect(),p=el.closest('.mlap__panel').getBoundingClientRect();
      return {left:a.left,right:a.right,bottom:a.bottom,panelBottom:p.bottom,width:a.width};
    });
    assert(geometry.width>=130 && geometry.left>=0 && geometry.right<=width,`${width}: input squeezed/offscreen`);
    assert(geometry.bottom<=geometry.panelBottom+1,`${width}: input clipped below panel`);
    await page.evaluate(()=>window.fixture.set('fullscreen'));
    assert(await page.locator('.vsr__fs-leave').isVisible());
    await page.locator('.vsr__fs-leave').click();
    assert.equal(await page.locator('.vsr--fullscreen').count(),0);
    console.log(`PASS meeting layout and chat geometry: ${width}px`);
  }
  assert.deepEqual(pageErrors,[], 'Browser fixture raised JavaScript errors');
} finally { await browser?.close(); await server.close(); }
