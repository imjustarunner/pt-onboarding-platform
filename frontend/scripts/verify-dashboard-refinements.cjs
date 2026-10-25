// Local-only visual checks with fictional data. No live API requests are allowed.
const { chromium } = require('playwright');
const fs = require('node:fs');
const origin = 'http://127.0.0.1:5185';
const artifacts = '/tmp/dashboard-refinements';
fs.mkdirSync(artifacts, { recursive: true });
const agency = {id:2,name:'Example Practice',slug:'example',portal_url:'example',organization_type:'agency',is_active:1,feature_flags:{clinicalChartEnabled:true,schoolPortalsEnabled:true},color_palette:{primary:'#247252',secondary:'#183a37',accent:'#247252'}};
const user = {id:99999,role:'provider',status:'ACTIVE_EMPLOYEE',first_name:'Example',last_name:'Provider',has_provider_access:true,has_supervisor_privileges:true,has_clinical_supervision:true,created_at:'2026-10-01T00:00:00Z',capabilities:{canViewTraining:true,canSignDocuments:true,canViewClients:true},agencies:[agency]};
const work = Array.from({length:60},(_,i)=>({id:`work-${i}`,clientId:i+1,clientName:`Example Client ${i+1}`,agencyId:2,date:'2026-10-25',noteType:'progress',status:i%2?'in_progress':'not_started',docStatus:i%2?'in_progress':'not_started'}));
const notes = Array.from({length:100},(_,i)=>({id:i+1,client_name:`Example Client ${i+1}`,provider_name:'Example Clinician',agency_id:2,date_of_service:'2026-10-24',note_kind:'progress'}));
const assert = (value, message) => {if(!value) throw new Error(message);};
(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',async route=>{
      const p=new URL(route.request().url()).pathname; let data={};
      if(p.includes('auth/me')) data={user,agencies:[agency]};
      else if(p==='/api/users/99999') data=user;
      else if(p.includes('session-lock-config')) data={session:{phase:'active',serverNow:Date.now(),lastActivityAt:Date.now(),lockAt:Date.now()+600000,expiresAt:Date.now()+1200000,activityVersion:1}};
      else if(p.includes('onboarding-checklist')) data={completionPercentage:100};
      else if(p.includes('platform-branding')) data={organization_name:'Example',primary_color:'#247252'};
      else if(p.includes('preferences')) data={};
      else if(p==='/api/agencies'||p.includes('/agencies')&&p.includes('/users/')) data=[agency];
      else if(p==='/api/agencies/2') data=agency;
      else if(p.includes('by-slug')||p.includes('portal')) data={agency,organization:agency,colorPalette:agency.color_palette,portalUrl:'example'};
      else if(p==='/api/clinical-notes/work-queue') data={items:work};
      else if(p==='/api/me/notes-to-sign') data={notes,isSupervisor:true};
      else if(p.includes('my-history-status')) data={hasClinicalSupervision:true};
      else if(p.includes('schedule-summary')) data={scheduleEvents:[],supervisionSessions:[]};
      else if(p.includes('meeting-invitations')) data={prompts:[]};
      else if(p.includes('user-nav/shortcuts')) data={shortcuts:[{page:'note-aid',path:'/note-aid',visit_count:8},{page:'clinical-note-generator',path:'/admin/clinical-note-generator',visit_count:6}]};
      else if(p.includes('/staff/directory')) data={staff:[]};
      else if(/modules|documents|payroll|training|progress|certificates|presence|people|threads|notifications|messages|tickets|tasks|agencies|icons|departments|categories|reviews|programs|users|company-events/.test(p)) data=[];
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(origin+'/login');
    await page.evaluate(({user,agency})=>{localStorage.setItem('user',JSON.stringify(user));localStorage.setItem('userAgencies',JSON.stringify([agency]));localStorage.setItem('currentAgency',JSON.stringify(agency));localStorage.setItem('dashboard.learning.v1:99999',JSON.stringify({firstSeen:Date.now(),understood:['edit-layout','customize','search','focus','work','collapse','notifications','schedule','submit','quicknav']}));},{user,agency});
    await page.goto(origin+'/example/dashboard');
    await page.locator('.overview-work').waitFor({timeout:60000});
    await page.waitForTimeout(700);
    const report={widths:[],errors,artifacts};
    for(const width of [1440,1100,900,390]) {
      await page.setViewportSize({width,height:1000});
      await page.waitForTimeout(250);
      const metrics=await page.evaluate(()=>{
        const home=document.querySelector('.ov-home'),grid=document.querySelector('.ov-mid'),list=document.querySelector('.overview-work .na-wq-list');
        return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,contentWidth:home.getBoundingClientRect().width,columns:getComputedStyle(grid).gridTemplateColumns,
          rows:list?.children.length,listHeight:list?.clientHeight,listScrollHeight:list?.scrollHeight,minRowHeight:list?Math.min(...[...list.children].map(el=>el.getBoundingClientRect().height)):null};
      });
      assert(metrics.documentWidth<=width+2,`Horizontal overflow at ${width}: ${metrics.documentWidth}`);
      assert(metrics.minRowHeight>=50,`Unreadable work rows at ${width}`);
      assert(metrics.listScrollHeight>metrics.listHeight,`Work list must scroll at ${width}`);
      report.widths.push(metrics);
      await page.screenshot({path:`${artifacts}/dashboard-${width}.png`,fullPage:true});
    }
    assert(await page.getByRole('button',{name:'Add work',exact:true}).count()===0,'Providers must not see Add work');
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('tab',{name:/Notes to co-sign/}).click();
    assert(await page.locator('.overview-work .na-wq-item').count()===100,'All co-sign notes remain in the scrollable list');
    await page.getByRole('button',{name:'Collapse My Work to a summary card'}).click();
    assert(await page.getByRole('button',{name:'Expand My Work',exact:true}).isVisible(),'Collapsed work summary must appear at the top');
    await page.getByRole('button',{name:'Expand My Work',exact:true}).click();
    assert(await page.locator('.overview-work').isVisible(),'Work expands again');
    await page.locator('.dashboard-rail-wrap').hover();
    await page.getByRole('button',{name:'Lock open',exact:true}).click();
    for (const width of [1440,1100,900]) {
      await page.setViewportSize({width,height:1000});await page.waitForTimeout(150);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`Expanded navigation overflows at ${width}`);
    }
    await page.setViewportSize({width:1440,height:1000});
    assert(await page.locator('.rail-card[aria-current="page"]').count()===1,'Only the current rail section is active');
    assert(await page.locator('.rail-card').filter({hasText:'AuricWell Office'}).count()===0,'Virtual office is removed from the rail');
    await page.getByRole('button',{name:'Edit layout',exact:true}).click();
    await page.getByRole('button',{name:'Sky highlight for Overview',exact:true}).click();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    assert(!await page.locator('[data-card-id="overview"]').evaluate(el=>el.classList.contains('rail-card--highlighted')),'Cancel restores the prior highlight');
    await page.getByRole('button',{name:'Edit layout',exact:true}).click();
    await page.getByRole('button',{name:'Sky highlight for Overview',exact:true}).click();
    await page.getByRole('button',{name:'Save layout',exact:true}).click();
    await page.waitForTimeout(150);
    assert(await page.evaluate(()=>JSON.parse(localStorage.getItem('dashboard.railHighlights.v1:99999')).overview==='#bfd8f1'),'Saved highlight persists');
    await page.screenshot({path:`${artifacts}/dashboard-expanded-rail.png`,fullPage:true});
    report.roleAudit=await page.evaluate(async()=>{
      const router=(await import('/src/router/index.js')).default;
      const {buildQuickNavContext}=await import('/src/navigation/quickNavCatalog.js');
      const {getRegisteredQuickNavEntries}=await import('/src/navigation/quickNavRuntime.js');
      const roles=['super_admin','admin','support','staff','provider','provider_plus','supervisor','clinical_practice_assistant','intern','intern_plus','facilitator','tutor','clinician','assistant_admin','school_staff','client_guardian','client','kiosk','club_manager','athlete'];
      return roles.map(role=>{
        const person={id:99999,role,status:'ACTIVE_EMPLOYEE',capabilities:{canViewTraining:true,canSignDocuments:true},has_clinical_supervision:['provider','intern','supervisor'].includes(role)};
        const ctx=buildQuickNavContext({user:person,showSchedule:true,showPayroll:true,showClaims:true,showSupervision:role==='supervisor',showMySupervision:person.has_clinical_supervision});
        const entries=getRegisteredQuickNavEntries(router,ctx,{user:person,agency:{id:2,slug:'example',organization_type:'agency',feature_flags:{}},orgSlug:'example'});
        return {role,count:entries.length,destinations:entries.map(e=>({label:e.label,path:e.destination}))};
      });
    });
    fs.writeFileSync(`${artifacts}/report.json`,JSON.stringify(report,null,2));
    assert(!errors.length,`Browser errors: ${errors.join('; ')}`);
    console.log(JSON.stringify({widths:report.widths,roleCounts:report.roleAudit.map(({role,count})=>({role,count})),artifacts},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
