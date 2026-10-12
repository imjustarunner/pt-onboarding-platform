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
const styles=['src/views/teamMeeting/JoinTeamMeetingView.vue','src/components/supervision/GroupSupervisionLiveRoom.vue','src/components/supervision/SupervisionVideoRoom.vue'].map(file=>{
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
const scope={'data-v-layout':''};
const video=()=>h('div',{class:'supervision-video-room',...scope},[h(Room,{ref:room,autoConnect:false,allowTileFocus:true,equalTilesWhenRemote:true,tileFocus:focus.value,videoFullscreen:full.value,'onUpdate:tileFocus':v=>focus.value=v,'onUpdate:videoFullscreen':v=>full.value=v})]);
createApp({setup(){return()=>kind.value==='group'
 ? h('div',{class:['gsl',{'gsl--video-fs':full.value}],...scope},[
   h('div',{class:'gsl__top-row',...scope},[
     h('div',{class:['gsl__video-strip',{'gsl__video-strip--collapsed':focus.value==='collapsed'}],...scope},[h('div',{class:'gsl__self-stage',...scope},[video()])]),
     h('aside',{class:'gsl__workspace',...scope},'Agenda and attendance')]),
   h('div',{class:'gsl__presentation-band',...scope},[h('div',{class:'gsl__stage',...scope},'Case presentation')]),
   h(Chat,{eventId:999,startOpen:true,belowVideo:true})])
 : h('main',{class:'join-team-meeting-view',...scope},[
   h('header',{class:'join-header',...scope,style:{height:'64px'}},'Meeting room'),
   h('div',{class:'join-session-layout join-session-layout--chat-only',...scope},[
     h('div',{class:'join-video',...scope},[
       h('div',{class:['join-video__stage',{'join-video__stage--collapsed':focus.value==='collapsed'}],...scope},[video()]),
       h('section',{class:'join-live-activity',...scope},[h(Chat,{eventId:999,startOpen:true,belowVideo:true})])])])]);}}).use(createPinia()).mount('#fixture');
await nextTick();
room.value.remotes.push(...['Alice','Bob','Carol'].map((name,i)=>({name,streamId:'peer'+i,connectionId:'c'+i,hasVideo:true,hasAudio:true})));
window.fixture={set:async(mode,layout='team')=>{focus.value=mode;kind.value=layout;full.value=mode==='fullscreen';if(full.value)focus.value='equal';await nextTick();if(!room.value.remotes.length)room.value.remotes.push(...['Alice','Bob','Carol'].map((name,i)=>({name,streamId:'peer'+i,connectionId:'c'+i,hasVideo:true,hasAudio:true})));await nextTick();},ready:true};
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
  for(const [width,height] of [[375,667],[768,600],[1440,900],[1440,600]]){
    await page.setViewportSize({width,height});
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
      if(parent==='group'){
        const box=await page.locator('.gsl__video-strip').boundingBox();
        assert(box.y+box.height<=controls.y+controls.height+8,`${width}: collapsed group retains a large empty stage (${JSON.stringify({box,strip,controls})})`);
      }
      await page.evaluate(p=>window.fixture.set('equal',p),parent);
      const expanded=await page.locator('.vsr__stage').boundingBox();
      assert(expanded.height>strip.height+20,`${width}/${parent}: expanded stage remains collapsed (${expanded.height}px)`);
    }
    for (const size of ['S','M','L']) {
      await page.evaluate(()=>window.fixture.set('equal'));
      await page.getByRole('group',{name:'Chat panel size'}).getByRole('button',{name:size,exact:true}).click();
      const input=page.getByRole('textbox',{name:'Chat message'});
      await input.fill('Small-screen chat works');
      await input.scrollIntoViewIfNeeded();
      const geometry=await input.evaluate(el=>{
        const a=el.getBoundingClientRect(),p=el.closest('.mlap__panel').getBoundingClientRect();
        const visible=document.elementFromPoint(a.x+a.width/2,a.bottom-2)===el;
        return {left:a.left,right:a.right,bottom:a.bottom,panelBottom:p.bottom,width:a.width,visible};
      });
      assert(geometry.width>=130 && geometry.left>=0 && geometry.right<=width,`${width}x${height}/${size}: input squeezed/offscreen`);
      assert(geometry.bottom<=geometry.panelBottom+1 && geometry.visible,`${width}x${height}/${size}: input clipped by an ancestor`);
      const sent=page.waitForRequest(r=>r.method()==='POST' && r.url().includes('/activity'));
      await page.locator('.mlap__form--rich button[type="submit"]').click();
      assert.equal((await sent).postDataJSON().payload.text,'Small-screen chat works');
    }
    await page.evaluate(()=>window.fixture.set('fullscreen'));
    assert(await page.locator('.vsr__fs-leave').isVisible());
    await page.locator('.vsr__fs-leave').click();
    assert.equal(await page.locator('.vsr--fullscreen').count(),0);
    console.log(`PASS meeting layout and chat geometry: ${width}x${height}`);
  }
  assert.deepEqual(pageErrors,[], 'Browser fixture raised JavaScript errors');
} finally { await browser?.close(); await server.close(); }
