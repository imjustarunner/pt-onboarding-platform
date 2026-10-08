import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {estimatePlotlinePrice} from '../src/config/plotlineProduct.js';
import {plotlineSolutions,plotlinePages} from '../src/content/plotlineWebsite.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const read=path=>readFileSync(`${root}/${path}`,'utf8');
const provenance=JSON.parse(read('public/assets/plotline/examples/provenance.json'));
test('product examples come from the current real application components',()=>{
  assert.equal(provenance.screens.length,7);
  for(const screen of provenance.screens){
    assert.equal(createHash('sha256').update(readFileSync(`${root}/${screen.source}`)).digest('hex'),screen.sourceSha256,`${screen.source} changed; recapture the product example`);
    const image=readFileSync(`${root}/public/assets/plotline/examples/${screen.image}`);
    assert.equal(image[0],0xff);assert.equal(image[1],0xd8);
  }
});
test('all marketed solutions use captured screens rather than concept artwork',()=>{
  const available=new Set(provenance.screens.map(screen=>screen.screen));
  for(const solution of plotlineSolutions){assert.ok(available.has(solution.screen));assert.ok(solution.screenTitle);}
  assert.doesNotMatch(read('src/views/public/PlotlineWebsite.vue'),/ui-previews|home-dashboard-preview|interface concept|illustrative interface/i);
  assert.equal(existsSync(`${root}/public/assets/plotline/website/ui-previews`),false);
});
test('published plans preserve employee and bundle pricing',()=>{
  assert.equal(estimatePlotlinePrice({employees:25}).monthlyCents,19900);
  assert.equal(estimatePlotlinePrice({employees:25,otherPaidProducts:['auricwell']}).monthlyCents,14900);
  assert.equal(estimatePlotlinePrice({employees:25,otherPaidProducts:['auricwell','conversa']}).monthlyCents,12900);
  assert.equal(estimatePlotlinePrice({employees:50,otherPaidProducts:['auricwell','conversa']}).monthlyCents,22900);
});
test('production packages every page with independent branding and HTTPS canonical URLs',()=>{
  for(const key of Object.keys(plotlinePages)){
    const suffix=key==='home'?'':`/${key}`;
    const html=read(`dist/_public-sites/plotline${suffix}/index.html`);
    assert.ok(html.includes(`https://plottwistco.com/plottline${suffix}`));
    assert.match(html,/<title>.*Plotline by PlotTwistCo<\/title>/);
    assert.match(html,/\/plottline\/assets\/index-/);
  }
  const nginx=read('dist/itsco-public.nginx.conf');
  assert.match(nginx,/location = \/plottline \{/);
  assert.match(nginx,/return 302 https:\/\/plottwistco.com\/plottline\$is_args\$args/);
  assert.doesNotMatch(nginx,/return 302 \/plottline/);
});
