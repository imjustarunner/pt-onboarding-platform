// Local visual smoke test. All API requests are intercepted; no database writes.
import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildFamilySummary} from '../src/services/familyEmailPolicy.js';
import {FAMILY_CUISINES} from '../src/services/familyCuisines.js';
const base = process.env.FAMILY_SMOKE_URL || 'http://localhost:5173';
const now = Date.now();
const iso = delta => new Date(now + delta * 60000).toISOString();
const members = [
  {user_id:1,display_name:'Alex',role:'parent',color:'#9c9dbb'},
  {user_id:2,display_name:'Jordan',role:'parent',color:'#c799a2'},
  {user_id:3,display_name:'Emma',role:'member',color:'#a49bc7'},
  {user_id:4,display_name:'Noah',role:'member',color:'#9cbda7'}
];
const entry=(id,kind,title,memberId,metadata={})=>({id,kind,title,member_user_id:memberId,assigned_user_id:memberId,metadata:{color:'#8fa98d',points:10,recurrence:'none',...metadata},created_at:iso(-100),occurrence:'once'});
const fixture={household:{id:1,name:'The Anderson family',role:'parent',timezone:'America/Denver'},members,work:[],activity:[],balances:[{user_id:3,points:35},{user_id:4,points:20}],entries:[
  {...entry(1,'event','Soccer practice',3,{eventType:'sports',address:'Riverside Park · Field 3',dropoff:'Alex',equipment:'Water bottle, cleats'}),start_at:iso(48),end_at:iso(108)},
  entry(2,'chore','Feed the dog',3),entry(3,'chore','Empty the dishwasher',4),entry(4,'chore','Make your bed',3),
  entry(5,'grocery','Milk & eggs',null,{category:'Kitchen essentials'}),entry(6,'grocery','Strawberries',null,{category:'Produce'}),
  entry(7,'meal','Taco Tuesday',null,{notes:'Everyone’s favorite. Dinner at 6.'}),
  entry(8,'reward','Choose our next movie',3,{points:40}),
  entry(9,'announcement','Bring your water bottles!',null,{notes:'It’s a sunny one out there.'})
]};
const photoBytes=await readFile(new URL('../../frontend/public/assets/family-events/family.jpg',import.meta.url));
const recipe={title:'Lemon pasta',cuisine:'Italian',description:'A bright weeknight dinner.',servings:4,minutes:20,ingredients:[{name:'Pasta',quantity:'1 lb',category:'Pantry'},{name:'Lemons',quantity:'2',category:'Produce'}],steps:['Cook the pasta.','Toss with lemon and serve.']};
const homeTools={cuisines:FAMILY_CUISINES,preferences:{screensaverEnabled:false,idleMinutes:5,slideSeconds:15,showClock:true,decisionOptions:[]},photos:[],calendar:null};
let ingredientRequests=0,emailRequests=[];
const browser=await puppeteer.launch({headless:'new',channel:'chrome',args:['--no-sandbox']});
if(process.argv.includes('--artwork-gallery')){
  try{
    const page=await browser.newPage();
    await page.setViewport({width:1200,height:1000,deviceScaleFactor:1});
    for(let n=1;n<=3;n++){
      await page.goto(new URL(`../../docs/family-artwork/park-review-${n}.html`,import.meta.url).href,{waitUntil:'networkidle0'});
      assert.equal(await page.$$eval('img',imgs=>imgs.filter(i=>i.complete&&i.naturalWidth>0).length),21);
      await page.screenshot({path:`/tmp/family-parks-${n}.png`,fullPage:true});
    }
    console.log('All 63 park illustrations loaded; review sheets saved to /tmp/family-parks-{1,2,3}.png');
  }finally{await browser.close();}
  process.exit(0);
}
try{
  const page=await browser.newPage();
  const failures=[];
  let authenticated=true, unlocks=0;
  page.on('pageerror',e=>failures.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',async req=>{
    const url=new URL(req.url());
    if(url.pathname.startsWith('/api/')){
      let data={};
      if(url.pathname==='/api/family/me'){
        if(!authenticated)return req.respond({status:401,contentType:'application/json',body:JSON.stringify({error:{message:'Sign in'}})});
        data={userId:1,agencyId:1,households:[{id:1,name:'The Anderson family',role:'parent'}]};
      }
      else if(url.pathname==='/api/family/unlock'){
        const body=JSON.parse(req.postData());assert.equal(body.passcode,'123456');assert.equal(body.agencyId,undefined);authenticated=true;unlocks++;data={ok:true};
      }
      else if(url.pathname==='/api/family/households/1')data=fixture;
      else if(url.pathname==='/api/family/households/1/voice/event-draft'){assert.equal(JSON.parse(req.postData()).transcript,'Emma soccer tomorrow from 5 to 6 PM at Riverside Park. Bring cleats.');data={draft:{kind:'event',title:'Emma soccer practice',memberUserId:3,startAt:'2026-10-05T17:00',endAt:'2026-10-05T18:00',metadata:{autoTheme:true,allDay:false,address:'Riverside Park',equipment:'Cleats',reminderMinutes:0}},review:[]};}
      else if(url.pathname==='/api/family/households/1/pocket')data={...buildFamilySummary(fixture),emailAddress:'app@example.com',accountEmail:'alex@example.com',sendEmailAvailable:true,recipients:[{userId:1,name:'Alex',email:'alex@example.com'},{userId:2,name:'Jordan',email:'jordan@example.com'}]};
      else if(url.pathname==='/api/family/households/1/pocket/email'){const body=JSON.parse(req.postData());emailRequests.push(body);assert.match(body.requestId,/^[a-f0-9-]{36}$/);data={sent:true,to:body.to,sections:body.sections};}
      else if(url.pathname==='/api/family/households/1/pocket/items'){
        const body=JSON.parse(req.postData());assert.equal(body.kind,'grocery');assert.deepEqual(body.items,['Coffee','Bananas']);
        for(const title of body.items)fixture.entries.push(entry(500+fixture.entries.length,body.kind,title,null));data={added:body.items.length,skipped:0};
      }
      else if(url.pathname==='/api/family/calendar-sharing/family/1')data={enabled:false,readers:[]};
      else if(url.pathname==='/api/family/calendar-sharing/family/1/subscription')data={url:'https://app.example.com/api/calendar-sharing/feed/test.ics'};
      else if(url.pathname==='/api/family/households/1/calendar-view')data={events:fixture.entries.filter(e=>e.kind==='event').map(e=>({key:`family:${e.id}`,id:e.id,title:e.title,start:e.start_at,end:e.end_at,memberId:e.member_user_id,memberName:members.find(m=>m.user_id===e.member_user_id)?.display_name,color:members.find(m=>m.user_id===e.member_user_id)?.color,metadata:e.metadata})),warnings:[]};
      else if(url.pathname==='/api/family/households/1/tools')data=homeTools;
      else if(url.pathname==='/api/family/households/1/preferences'){homeTools.preferences=JSON.parse(req.postData());data=homeTools.preferences;}
      else if(url.pathname==='/api/family/households/1/decide')data={choice:JSON.parse(req.postData()).options[1]};
      else if(url.pathname==='/api/family/households/1/photos'&&req.method()==='POST'){homeTools.photos.push({id:1,caption:''});data={id:1};}
      else if(url.pathname==='/api/family/households/1/photos/1')return req.respond({status:200,contentType:'image/jpeg',body:photoBytes});
      else if(url.pathname==='/api/family/households/1/recipes/generate'){assert.equal(JSON.parse(req.postData()).cuisine,'Italian');data={recipe};}
      else if(url.pathname==='/api/family/households/1/takeout/choose'){assert.deepEqual(JSON.parse(req.postData()).cuisines,['Thai','Chinese']);data={cuisine:'Chinese'};}
      else if(url.pathname==='/api/family/households/1/recipes'){fixture.entries.push(entry(101,'meal',recipe.title,null,{recipe}));data={id:101};}
      else if(url.pathname==='/api/family/households/1/recipes/101/ingredients'){assert.deepEqual(JSON.parse(req.postData()).ingredientIndexes,[1]);ingredientRequests++;data={added:ingredientRequests===1?1:0,skipped:ingredientRequests===1?0:1};}
      else if(url.pathname==='/api/family/households/1/google/calendars')data=[{id:'family-shared',name:'Our Google family'}];
      else if(url.pathname==='/api/family/households/1/google/connect'){homeTools.calendar={calendar_name:'Our Google family'};data={name:'Our Google family'};}
      else if(url.pathname==='/api/family/households/1/google/events')data={events:[{id:'g1',title:'Google birthday',startAt:iso(60),endAt:iso(120)}]};
      else if(url.pathname==='/api/family/households/1/google/import'){const body=JSON.parse(req.postData());assert.equal(body.artworkVariant,'camping-backyard');fixture.entries.push({...entry(102,'event','Google birthday',3,{eventType:body.eventType,artworkVariant:body.artworkVariant}),start_at:iso(60),end_at:iso(120)});data={id:102};}
      else if(url.pathname==='/api/family/weather')data={status:'ok',current:{temperatureF:72,weatherCode:1},forecastDays:[{date:iso(0).slice(0,10),tempMaxF:78,tempMinF:56}]};
      else if(url.pathname==='/api/family/households/1/entries'&&req.method()==='POST'){
        const body=JSON.parse(req.postData());const id=200+fixture.entries.length;fixture.entries.push({...entry(id,body.kind,body.title,body.memberUserId,body.metadata),start_at:body.startAt,end_at:body.endAt});data={id};
      }
      else if(/^\/api\/family\/households\/1\/entries\/\d+$/.test(url.pathname)&&req.method()==='PUT'){
        const body=JSON.parse(req.postData()),id=Number(url.pathname.split('/').pop());
        Object.assign(fixture.entries.find(e=>e.id===id),{title:body.title,metadata:body.metadata,start_at:body.startAt,end_at:body.endAt});data={id};
      }
      return req.respond({status:200,contentType:'application/json',body:JSON.stringify(data)});
    }
    if(url.origin!==new URL(base).origin && !url.protocol.startsWith('data'))return req.abort();
    return req.continue();
  });
  await page.setViewport({width:1440,height:1100,deviceScaleFactor:1});
  await page.goto(base+'/family',{waitUntil:'networkidle2',timeout:60000});
  await page.waitForSelector('.family-calendar',{timeout:30000});
  assert.equal(await page.$$eval('.day-column',nodes=>nodes.length),7,'Open directly to the weekly schedule');
  assert.ok(await page.$eval('.fcc-sidebar',el=>el.getBoundingClientRect().width)<=84,'Slim desktop navigation');
  assert.ok(await page.$eval('.calendar-scroll',el=>el.getBoundingClientRect().width)>1200,'Calendar uses the screen width');
  await page.screenshot({path:'/tmp/family-calendar-desktop.png',fullPage:true});
  await page.setViewport({width:1194,height:834,deviceScaleFactor:1});
  await page.screenshot({path:'/tmp/family-calendar-ipad.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Calendar fits iPad');
  const beforeVoice=fixture.entries.length;
  await page.click('.fcc-voice-launch');
  await page.waitForSelector('.family-voice textarea');
  await page.type('.family-voice textarea','Emma soccer tomorrow from 5 to 6 PM at Riverside Park. Bring cleats.');
  await page.click('.voice-fill');
  await page.waitForFunction(()=>document.querySelector('.fcc-modal input[placeholder="Give it a name"]')?.value==='Emma soccer practice');
  assert.equal(fixture.entries.length,beforeVoice,'Voice drafting must not create an event');
  assert.equal(await page.$eval('.fcc-modal select',el=>el.value),'3','Matched child is selected');
  assert.deepEqual(await page.$$eval('.fcc-modal input[type="datetime-local"]',els=>els.map(el=>el.value)),['2026-10-05T17:00','2026-10-05T18:00']);
  assert.equal(await page.$eval('.fcc-modal input[placeholder="Where are we headed?"]',el=>el.value),'Riverside Park');
  assert.equal(await page.$eval('.fcc-art-preview',el=>el.getAttribute('src')),'/assets/family-events/sports.jpg');
  await page.screenshot({path:'/tmp/fcc-voice-draft-ipad.png',fullPage:true});
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Voice draft fits a phone');
  await page.screenshot({path:'/tmp/fcc-voice-draft-mobile.png',fullPage:true});
  await page.click('.fcc-modal-close');
  assert.equal(fixture.entries.length,beforeVoice,'Dismissing a draft leaves the calendar untouched');
  await page.setViewport({width:1194,height:834,deviceScaleFactor:1});

  await page.evaluate(()=>[...document.querySelectorAll('.fcc-sidebar nav button')].find(b=>b.textContent.includes('Home')).click());
  await page.waitForSelector('.fcc-upnext');
  assert.equal(await page.$eval('.fcc-hero-copy h2',el=>el.textContent),'Soccer practice');
  assert.equal(await page.$('.navbar'),null);
  await page.screenshot({path:'/tmp/family-command-center-desktop.png',fullPage:true});
  await page.evaluate(()=>{[...document.querySelectorAll('.fcc-card-intro button')].find(b=>b.closest('section')?.textContent.includes('Don’t forget'))?.click();});
  await page.waitForSelector('.fcc-modal input');
  await page.type('.fcc-modal input','Sam’s Club paper towels');
  await page.click('.fcc-modal .fcc-primary');
  await page.waitForFunction(()=>document.body.textContent.includes('Sam’s Club paper towels')&&!document.querySelector('.fcc-modal'));
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await page.screenshot({path:'/tmp/family-command-center-mobile.png',fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  assert.equal(overflow,false,'Mobile layout must not overflow horizontally');
  const clickText=async(selector,text)=>page.evaluate((selector,text)=>{const b=[...document.querySelectorAll(selector)].find(b=>b.textContent.trim().includes(text));if(!b)throw new Error('Missing button: '+text);b.click();},selector,text);
  await clickText('.fcc-sidebar nav button','On the go');
  await page.waitForSelector('.pocket-send select');
  assert.equal(await page.$('.pocket-email a[href^="mailto:"]'),null,'Send does not launch an email client');
  await page.select('.pocket-send select','jordan@example.com');
  await clickText('.pocket-send button','Clear choices');
  assert.equal(await page.$eval('.pocket-send-button',b=>b.disabled),true);
  await page.click('.pocket-send input[value="grocery"]');
  await page.click('.pocket-send-button');
  await page.waitForFunction(()=>document.querySelector('.delivery-success')?.textContent.includes('jordan@example.com'));
  assert.deepEqual(emailRequests[0].sections,['grocery']);
  await page.select('.pocket-send select','custom');
  await page.type('.pocket-send input[type="email"]','family@gmail.com');
  await page.click('.pocket-send input[value="upcoming"]');
  await page.click('.pocket-send-button');
  await page.waitForFunction(()=>document.querySelector('.delivery-success')?.textContent.includes('family@gmail.com'));
  assert.equal(emailRequests[1].to,'family@gmail.com');
  assert.deepEqual(emailRequests[1].sections,['grocery','upcoming']);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Direct email controls fit on mobile');
  await page.screenshot({path:'/tmp/family-pocket-send-mobile.png',fullPage:true});
  await page.click('.pocket-add-wrap summary');
  await page.type('.pocket-add textarea','Coffee\nBananas');
  await page.click('.pocket-add .fcc-primary');
  await page.waitForFunction(()=>[...document.querySelectorAll('.pocket-list strong')].some(e=>e.textContent==='Coffee'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'On the go fits a phone');
  await page.screenshot({path:'/tmp/family-pocket-mobile.png',fullPage:true});
  await page.goto(base+'/family?view=on-the-go&household=1',{waitUntil:'networkidle2'});
  await page.waitForSelector('.pocket-list');
  assert.equal(await page.$eval('.pocket-send input[type="email"]',el=>el.value),'family@gmail.com','Remember the selected family email on this device');
  await page.setViewport({width:1440,height:1100,deviceScaleFactor:1});
  await page.screenshot({path:'/tmp/family-pocket-desktop.png',fullPage:true});
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  await clickText('.fcc-sidebar nav button','Home');
  // The prominent picture browser changes artwork without changing the event type.
  await clickText('.fcc-top-actions button','Add event');
  await page.waitForSelector('.fcc-modal input[placeholder="Give it a name"]');
  await page.type('.fcc-modal input[placeholder="Give it a name"]','Scheels');
  assert.equal(await page.$eval('.event-picture-picker .fcc-art-preview',el=>el.getAttribute('src')),'/assets/family-events/scheels-shopping.jpg');
  assert.equal(await page.$$eval('.image-library-grid img',els=>els.length),0);
  await page.click('.picture-heading button');
  await page.type('.image-library input[type=search]','rooftop');
  await page.waitForFunction(()=>document.querySelectorAll('.image-library-grid button').length===1);
  await page.click('.image-library-grid button');
  assert.equal(await page.$eval('.event-type-picker > label select',el=>el.value),'scheels-shopping');
  assert.equal(await page.$eval('.fcc-art-preview',el=>el.getAttribute('src')),'/assets/family-events/camping-tundra-rooftop.jpg');
  await page.screenshot({path:'/tmp/fcc-picture-search-mobile.png',fullPage:true});
  await page.click('.fcc-modal .fcc-primary');
  await page.waitForFunction(()=>!document.querySelector('.fcc-modal'));
  assert.equal(fixture.entries.find(e=>e.title==='Scheels')?.metadata.artworkType,'camping');
  await clickText('.fcc-top-actions button','Add event');
  await page.waitForSelector('.event-type-picker input');
  await page.type('.event-type-picker input','softball');
  await page.select('.event-type-picker > label select','softball');
  await page.type('.fcc-modal form > label input','Softball practice');
  assert.equal(await page.$eval('.fcc-art-preview',img=>img.getAttribute('src')),'/assets/family-events/baseball.jpg');
  await page.click('.fcc-modal .fcc-primary');
  await page.waitForFunction(()=>!document.querySelector('.fcc-modal'));
  assert.equal(fixture.entries.find(e=>e.title==='Softball practice')?.metadata.eventType,'softball');
  await clickText('.fcc-top-actions button','Add event');
  await page.waitForSelector('.event-type-picker input');
  await page.type('.event-type-picker input','camping');
  await page.select('.event-type-picker > label select','camping');
  await page.type('.fcc-modal form > label input','Our camping trip');
  assert.equal(await page.$$eval('.artwork-options button',buttons=>buttons.length),5);
  await clickText('.artwork-options button','Tundra rooftop tent');
  assert.equal(await page.$eval('.fcc-art-preview',img=>img.getAttribute('src')),'/assets/family-events/camping-tundra-rooftop.jpg');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Picture choices fit mobile');
  await page.$eval('.artwork-picker',el=>el.scrollIntoView());
  await page.screenshot({path:'/tmp/family-camping-picker-mobile.png',fullPage:true});
  await page.click('.fcc-modal .fcc-primary');
  await page.waitForFunction(()=>!document.querySelector('.fcc-modal'));
  assert.equal(fixture.entries.find(e=>e.title==='Our camping trip')?.metadata.artworkVariant,'camping-tundra-rooftop');
  await page.reload({waitUntil:'networkidle2'});
  await clickText('.fcc-agenda-row','Our camping trip');
  await page.waitForSelector('.fcc-details');
  assert.equal(await page.$eval('.fcc-art-preview',img=>img.getAttribute('src')),'/assets/family-events/camping-tundra-rooftop.jpg');
  await clickText('.fcc-details button','Edit');
  await page.waitForSelector('.artwork-options');
  assert.equal(await page.$eval('.artwork-options [aria-pressed=true]',button=>button.textContent.trim()),'Tundra rooftop tent');
  await clickText('.artwork-options button','Coleman trailer');
  await page.click('.fcc-modal .fcc-primary');
  await page.waitForFunction(()=>!document.querySelector('.fcc-modal'));
  assert.equal(fixture.entries.find(e=>e.title==='Our camping trip')?.metadata.artworkVariant,'camping-coleman-trailer');
  await clickText('.fcc-top-actions button','Add event');
  await page.waitForSelector('.event-type-picker input');
  await page.type('.event-type-picker input','Yellowstone');
  await page.select('.event-type-picker > label select','np-yellowstone');
  assert.equal(await page.$eval('.fcc-art-preview',img=>img.getAttribute('src')),'/assets/family-events/national-park-yellowstone.jpg');
  await page.keyboard.press('Escape');
  await clickText('.fcc-quick-actions button','Set a status');
  await page.waitForSelector('.fcc-modal form > label select');
  await page.select('.fcc-modal form > label select','Do Not Disturb');
  await page.select('.fcc-modal .fcc-form-pair select','3');
  await page.click('.fcc-modal .fcc-primary');
  await page.waitForFunction(()=>!document.querySelector('.fcc-modal') && document.body.textContent.includes('Do Not Disturb'));
  // The dashboard clock refreshes every 15 seconds; allow a minute boundary crossed while editing.
  await page.waitForFunction(()=>[...document.querySelectorAll('.fcc-member-row')].some(row=>row.textContent.includes('Emma')&&row.textContent.includes('Do Not Disturb')),{timeout:20000});
  assert(await page.evaluate(()=>[...document.querySelectorAll('.fcc-agenda-row')].some(row=>row.textContent.includes('Do Not Disturb'))),'Status appears on calendar');
  await page.type('.decision-card textarea','Pizza\nTacos\nPasta');
  await clickText('.decision-card button','Pick at random');
  await page.waitForFunction(()=>document.querySelector('.decision-result')?.textContent==='Tacos');
  await clickText('.fcc-sidebar nav button','Meals');
  await page.waitForSelector('.meal-ideas');
  await page.select('.recipe-cuisine','Italian');
  const recipeCuisines=await page.$$eval('.recipe-cuisine option',items=>items.map(i=>i.value).filter(Boolean));
  assert.deepEqual(recipeCuisines,FAMILY_CUISINES);
  await clickText('.meal-ideas button','Surprise me');
  await page.waitForSelector('.recipe');
  await page.click('.recipe input[type=checkbox]');
  await clickText('.recipe button','Add ingredients');
  await page.waitForFunction(()=>document.querySelector('.tool-message')?.textContent.includes('1 ingredients added'));
  await clickText('.recipe button','Add ingredients');
  await page.waitForFunction(()=>document.querySelector('.tool-message')?.textContent.includes('already added'));
  assert.equal(fixture.entries.filter(e=>e.id===101).length,1,'Recipe saved once');
  assert.equal(fixture.entries.find(e=>e.id===101).metadata.recipe.cuisine,'Italian','Saved recipes retain cuisine');
  await page.click('.takeout-picker summary');
  assert.deepEqual(await page.$$eval('.cuisine-choices input',items=>items.map(i=>i.value)),recipeCuisines,'Takeout and recipe cuisines match');
  await clickText('.takeout-picker button','Clear choices');
  assert(await page.$eval('.takeout-random',b=>b.disabled),'Empty takeout choice disables random button');
  await page.click('.cuisine-choices input[value="Thai"]');
  await page.click('.cuisine-choices input[value="Chinese"]');
  await page.click('.takeout-random');
  await page.waitForFunction(()=>document.querySelector('.takeout-result')?.textContent.includes('Chinese'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Cuisine controls fit on mobile');
  await clickText('.fcc-sidebar nav button','Settings');
  assert(await page.$('.fcc-settings-form option[value="pet"]'),'Settings offers a pet profile without a login');
  await page.evaluate(()=>[...document.querySelectorAll('.fcc-sidebar nav button')].find(b=>b.textContent.includes('Calendar')).click());
  await page.waitForSelector('.family-calendar');
  await page.evaluate(()=>[...document.querySelectorAll('.family-calendar button')].find(b=>b.textContent==='Week').click());
  await page.waitForSelector('.family-calendar .calendar-event');
  assert.equal(await page.$$eval('.day-column',nodes=>nodes.length),7);
  await page.screenshot({path:'/tmp/family-calendar-week.png',fullPage:true});
  await page.evaluate(()=>[...document.querySelectorAll('.family-calendar button')].find(b=>b.textContent==='Day').click());
  assert.equal(await page.$$eval('.day-column',nodes=>nodes.length),1);
  await clickText('.fcc-sidebar nav button','Settings');
  await page.waitForFunction(()=>[...document.querySelectorAll('.calendar-sharing button')].some(b=>b.textContent==='Create subscription link'&&!b.disabled));
  await page.evaluate(()=>[...document.querySelectorAll('.calendar-sharing button')].find(b=>b.textContent==='Create subscription link').click());
  await page.waitForSelector('.subscription input');
  assert.match(await page.$eval('.subscription input',el=>el.value),/calendar-sharing\/feed/);

  await clickText('.fcc-sidebar nav button','Settings');
  await page.waitForSelector('.photo-upload input');
  const upload=await page.$('.photo-upload input');
  await upload.uploadFile(new URL('../../frontend/public/assets/family-events/family.jpg',import.meta.url).pathname);
  await page.waitForSelector('.photo-grid img');
  await clickText('.tool-card button','Preview slideshow');
  await page.waitForSelector('.family-photo-frame');
  await page.click('.family-photo-frame');
  await page.waitForFunction(()=>!document.querySelector('.family-photo-frame'));
  await clickText('.calendar-connection button','Find my Google calendars');
  await page.waitForSelector('.calendar-connection select');
  await page.select('.calendar-connection select','family-shared');
  await clickText('.calendar-connection button','Connect calendar');
  await page.waitForSelector('.google-events article');
  await page.click('.calendar-connection .calendar-actions input[type=checkbox]');
  await page.select('.calendar-connection .event-type-picker > label select','camping');
  await clickText('.calendar-connection .artwork-options button','Backyard green tent');
  await clickText('.google-events button','Add to family');
  await page.waitForFunction(()=>document.querySelector('.google-events button')?.textContent.includes('Added'));
  assert.equal(fixture.entries.filter(e=>e.id===102).length,1,'Google event imported once');
  assert.equal(fixture.entries.find(e=>e.id===102).metadata.artworkVariant,'camping-backyard');
  authenticated=false;
  await page.reload({waitUntil:'networkidle2'});
  await page.waitForSelector('.fcc-pin');
  await page.type('.fcc-pin','123456');
  await page.click('.fcc-login .fcc-primary');
  await page.waitForSelector('.family-calendar');
  await page.reload({waitUntil:'networkidle2'});
  await page.waitForSelector('.family-calendar');
  assert.equal(unlocks,1,'Reload must restore the device session without another code');
  assert.deepEqual(failures,[],'No browser runtime errors');
  console.log('Family desktop/mobile smoke passed: On the go deep links, quick add, email buttons, dashboard, isolated shell, saved list entry, responsive layout, PIN-only login, session restore, recipe ingredients, random choices, photo upload/slideshow, shared calendar import with artwork choice, searchable expanded event types and national parks, Camping artwork save/reload/edit, member/calendar status events, recipe cuisine selection, matching takeout choices.');
}finally{await browser.close();}
